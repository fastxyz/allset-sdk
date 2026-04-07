import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FastError as SdkFastError } from '@fastxyz/sdk';
import { encodeFunctionData } from 'viem';

import * as browserEntry from '../src/browser/index.ts';
import * as coreEntry from '../src/index.ts';
import { DEFAULT_NETWORKS_CONFIG } from '../src/default-config.ts';
import {
  IntentAction,
  buildDepositTransaction,
  encodeDepositCalldata,
  fastAddressToBytes32,
  resolveDepositRoute,
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
  buildRevokeIntent,
} from '../src/index.ts';
import {
  createEvmExecutor,
  createEvmWallet,
  AllSetProvider,
  executeBridge,
  evmSign,
  smartDeposit,
} from '../src/node/index.ts';

const FAST_ADDRESS = 'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv';
const EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
const TX_HASH = `0x${'11'.repeat(32)}`;

// Mock transaction for cross-sign responses: 64 bytes with transferFastTxId at bytes 32-64
const MOCK_CROSS_SIGN_TX = [
  ...Array(32).fill(0),  // First 32 bytes (padding)
  ...Array(32).fill(0x11),  // Bytes 32-64: transferFastTxId (matches TX_HASH)
];

// ---------------------------------------------------------------------------
// Entrypoint Tests
// ---------------------------------------------------------------------------

test('root entrypoint only exposes pure helpers', () => {
  assert.equal(typeof coreEntry.buildDepositTransaction, 'function');
  assert.equal(typeof coreEntry.buildTransferIntent, 'function');
  assert.equal('AllSetProvider' in coreEntry, false);
  assert.equal('createEvmExecutor' in coreEntry, false);
});

test('browser entrypoint exposes pure helpers without node APIs', () => {
  assert.equal(typeof browserEntry.buildDepositTransaction, 'function');
  assert.equal(typeof browserEntry.buildTransferIntent, 'function');
  assert.equal('AllSetProvider' in browserEntry, false);
  assert.equal('createEvmExecutor' in browserEntry, false);
});

test('package metadata requires the claim-scoped Fast SDK release', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.peerDependencies?.['@fastxyz/sdk'], '>=0.2.4');
  assert.equal(packageJson.devDependencies?.['@fastxyz/sdk'], '^0.2.5');
});

// ---------------------------------------------------------------------------
// Deposit Planning Tests
// ---------------------------------------------------------------------------

test('fastAddressToBytes32 converts a Fast receiver into bytes32', () => {
  assert.equal(
    fastAddressToBytes32(FAST_ADDRESS),
    '0x1c0c991ea4bc21608f48a7fea5b7c1b5a2d9fe0977db0df5d8ed4aa502716818',
  );
});

test('fastAddressToBytes32 wraps invalid bech32 payloads in a Fast-address error', () => {
  assert.throws(
    () => fastAddressToBytes32('fast1invalid'),
    /Invalid Fast address "fast1invalid"/,
  );
});

test('encodeDepositCalldata matches deposit(address,uint256,bytes32) encoding', () => {
  const receiverBytes32 = fastAddressToBytes32(FAST_ADDRESS);
  const tokenAddress = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';

  const expected = encodeFunctionData({
    abi: [{
      type: 'function' as const,
      name: 'deposit' as const,
      inputs: [
        { name: 'token', type: 'address' as const },
        { name: 'amount', type: 'uint256' as const },
        { name: 'receiver', type: 'bytes32' as const },
      ],
      outputs: [],
      stateMutability: 'payable' as const,
    }],
    functionName: 'deposit',
    args: [tokenAddress as `0x${string}`, 1_000_000n, receiverBytes32],
  });

  assert.equal(
    encodeDepositCalldata({
      tokenAddress,
      amount: 1_000_000n,
      receiverBytes32,
    }),
    expected,
  );
});

test('resolveDepositRoute returns the configured testnet arbitrum route', () => {
  const route = resolveDepositRoute({
    network: 'testnet',
    chain: 'arbitrum-sepolia',
    token: 'fastUSDC',
  });

  assert.equal(route.chainId, 421614);
  assert.equal(route.bridgeAddress, '0xb53600976275D6f541a3B929328d07714EFA581F');
  assert.equal(route.tokenAddress, '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d');
  assert.equal(route.token, 'USDC');
  assert.equal(route.isNative, false);
});

test('buildDepositTransaction applies route overrides', () => {
  const plan = buildDepositTransaction({
    network: 'testnet',
    chain: 'arbitrum-sepolia',
    token: 'USDC',
    amount: 1_000_000n,
    receiver: FAST_ADDRESS,
    overrides: {
      bridgeAddress: '0x9999999999999999999999999999999999999999',
    },
  });

  assert.equal(plan.to, '0x9999999999999999999999999999999999999999');
  assert.equal(plan.value, 0n);
  assert.ok(plan.data.startsWith('0x'));
});

test('buildDepositTransaction supports caller-supplied mainnet config for unbundled deployments', () => {
  const plan = buildDepositTransaction({
    network: 'mainnet',
    chain: 'base',
    token: 'fastUSDC',
    amount: 1_000_000n,
    receiver: FAST_ADDRESS,
    networkConfig: {
      chains: {
        base: {
          chainId: 8453,
          bridgeContract: '0x9999999999999999999999999999999999999999',
          tokens: {
            USDC: {
              evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              decimals: 6,
            },
          },
        },
      },
    },
  });

  assert.equal(plan.chainId, 8453);
  assert.equal(plan.to, '0x9999999999999999999999999999999999999999');
  assert.equal(plan.route.token, 'USDC');
  assert.equal(plan.route.tokenAddress, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(plan.value, 0n);
});

test('bundled testnet endpoints match the current manifest', () => {
  const { testnet } = DEFAULT_NETWORKS_CONFIG;

  assert.equal(testnet.crossSignUrl, 'https://testnet.cross-sign.allset.fast.xyz');

  assert.deepEqual(testnet.chains['ethereum-sepolia'], {
    chainId: 11155111,
    bridgeContract: '0xb53600976275D6f541a3B929328d07714EFA581F',
    fastBridgeAddress: 'fast1fxtkgpwcy7hnakw96gg7relph4wxx7ghrukm723p3l9adxuxljzsc6f958',
    relayerUrl: 'https://testnet.allset.fast.xyz/ethereum-sepolia/relayer',
    tokens: {
      USDC: {
        evmAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        fastTokenId: 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46',
        decimals: 6,
      },
    },
  });

  assert.deepEqual(testnet.chains['arbitrum-sepolia'], {
    chainId: 421614,
    bridgeContract: '0xb53600976275D6f541a3B929328d07714EFA581F',
    fastBridgeAddress: 'fast1tkmtqxulhnzeeg9zhuwxy3x95wr7waytm9cq40ndf7tkuwwcc6jseg24j8',
    relayerUrl: 'https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer',
    tokens: {
      USDC: {
        evmAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
        fastTokenId: 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46',
        decimals: 6,
      },
    },
  });

});

test('bundled mainnet endpoints match the current manifest', () => {
  const { mainnet } = DEFAULT_NETWORKS_CONFIG;

  assert.equal(mainnet.crossSignUrl, 'https://cross-sign.allset.fast.xyz');

  assert.deepEqual(mainnet.chains.base, {
    chainId: 8453,
    bridgeContract: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
    fastBridgeAddress: 'fast1aq2hlz8t3ex0vke7056zraxzetmxmpaw84ws9lljdhpqtqkctu4spty8l6',
    relayerUrl: 'https://allset.fast.xyz/base/relayer',
    tokens: {
      USDC: {
        evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        fastTokenId: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130',
        decimals: 6,
      },
    },
  });

  assert.deepEqual(mainnet.chains.arbitrum, {
    chainId: 42161,
    bridgeContract: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
    fastBridgeAddress: 'fast1xzuzv3p3zl8pljk5cyq3xn0vpjj9jmhk53zlcv56mu04gwkg256s6ewung',
    relayerUrl: 'https://allset.fast.xyz/arbitrum/relayer',
    tokens: {
      USDC: {
        evmAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        fastTokenId: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130',
        decimals: 6,
      },
    },
  });
});

test('resolveDepositRoute rejects unsupported routes', () => {
  assert.throws(
    () => resolveDepositRoute({
      network: 'mainnet',
      chain: 'arbitrum-sepolia',
      token: 'USDC',
    }),
    /does not support EVM chain/,
  );
});

// ---------------------------------------------------------------------------
// AllSetProvider Tests
// ---------------------------------------------------------------------------

test('AllSetProvider exposes expected properties', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  assert.equal(allset.network, 'testnet');
  assert.ok(allset.chains.includes('arbitrum-sepolia'));
  assert.ok(allset.chains.includes('ethereum-sepolia'));
  assert.ok(allset.crossSignUrl.length > 0);
});

test('AllSetProvider exposes mainnet properties', () => {
  const allset = new AllSetProvider({ network: 'mainnet' });
  assert.equal(allset.network, 'mainnet');
  assert.ok(allset.chains.includes('base'));
  assert.ok(allset.chains.includes('arbitrum'));
  assert.ok(allset.crossSignUrl.length > 0);
});

test('AllSetProvider.getChainConfig returns config for supported chains', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  const arbConfig = allset.getChainConfig('arbitrum-sepolia');
  assert.ok(arbConfig);
  assert.equal(arbConfig.chainId, 421614);
  assert.ok(arbConfig.bridgeContract.startsWith('0x'));
  
  const ethConfig = allset.getChainConfig('ethereum-sepolia');
  assert.ok(ethConfig);
  assert.equal(ethConfig.chainId, 11155111);
});

test('AllSetProvider.getChainConfig returns null for unsupported chains', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const config = allset.getChainConfig('unsupported');
  assert.equal(config, null);
});

test('AllSetProvider.getTokenConfig returns config and normalizes Fast token aliases', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  const usdcConfig = allset.getTokenConfig('arbitrum-sepolia', 'USDC');
  assert.ok(usdcConfig);
  assert.equal(usdcConfig.decimals, 6);
  
  // fastUSDC should normalize to USDC config
  const fastUsdcConfig = allset.getTokenConfig('arbitrum-sepolia', 'fastUSDC');
  assert.ok(fastUsdcConfig);
  assert.deepEqual(fastUsdcConfig, usdcConfig);

});

test('AllSetProvider.getTokenConfig works for mainnet chains', () => {
  const allset = new AllSetProvider({ network: 'mainnet' });
  
  const baseUsdcConfig = allset.getTokenConfig('base', 'USDC');
  assert.ok(baseUsdcConfig);
  assert.equal(baseUsdcConfig.evmAddress, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(baseUsdcConfig.decimals, 6);
  
  const arbUsdcConfig = allset.getTokenConfig('arbitrum', 'USDC');
  assert.ok(arbUsdcConfig);
  assert.equal(arbUsdcConfig.evmAddress, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
  assert.equal(arbUsdcConfig.decimals, 6);
});

test('AllSetProvider configPath drives sendToFast execution', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-config-'));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const configPath = join(tempDir, 'networks.json');
  writeFileSync(configPath, JSON.stringify({
    testnet: {
      crossSignUrl: 'https://example.invalid/cross-sign',
      chains: {
        customchain: {
          chainId: 31337,
          bridgeContract: '0x1111111111111111111111111111111111111111',
          fastBridgeAddress: FAST_ADDRESS,
          relayerUrl: 'https://example.invalid/relayer',
          tokens: {
            USDC: {
              evmAddress: '0x2222222222222222222222222222222222222222',
              fastTokenId: '9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8', // testUSDC
              decimals: 6,
            },
          },
        },
      },
    },
    mainnet: {
      crossSignUrl: 'https://example.invalid/mainnet',
      chains: {},
    },
  }, null, 2));

  const allset = new AllSetProvider({ network: 'testnet', configPath });
  let sentTx: { to: string; data: string; value: string } | undefined;

  const mockClients = {
    walletClient: {
      sendTransaction: async (tx: { to: string; data: string; value: bigint }) => {
        sentTx = { to: tx.to, data: tx.data, value: tx.value.toString() };
        return '0xcustom';
      },
    },
    publicClient: {
      waitForTransactionReceipt: async () => ({ status: 'success' }),
      readContract: async () => 1_000_000n,
    },
  };

  const result = await allset.sendToFast({
    chain: 'customchain',
    token: 'USDC',
    amount: '1000000',
    from: EVM_ADDRESS,
    to: FAST_ADDRESS,
    evmClients: mockClients as any,
  });

  assert.equal(result.txHash, '0xcustom');
  assert.equal(sentTx?.to, '0x1111111111111111111111111111111111111111');
  assert.equal(sentTx?.value, '0');
});

test('AllSetProvider sendToFast matches the public deposit builder output', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const expectedPlan = buildDepositTransaction({
    network: 'testnet',
    chain: 'arbitrum-sepolia',
    token: 'USDC',
    amount: 1_000_000n,
    receiver: FAST_ADDRESS,
  });

  let sentTx: { to: string; data: string; value: string } | undefined;
  const mockClients = {
    walletClient: {
      sendTransaction: async (tx: { to: string; data: string; value: bigint }) => {
        sentTx = { to: tx.to, data: tx.data, value: tx.value.toString() };
        return '0xplanned';
      },
    },
    publicClient: {
      waitForTransactionReceipt: async () => ({ status: 'success' }),
      readContract: async () => 1_000_000n,
    },
  };

  const result = await allset.sendToFast({
    chain: 'arbitrum-sepolia',
    token: 'USDC',
    amount: '1000000',
    from: EVM_ADDRESS,
    to: FAST_ADDRESS,
    evmClients: mockClients as any,
  });

  assert.equal(result.txHash, '0xplanned');
  assert.deepEqual(sentTx, {
    to: expectedPlan.to,
    data: expectedPlan.data,
    value: expectedPlan.value.toString(),
  });
});

// ---------------------------------------------------------------------------
// sendToFast Tests
// ---------------------------------------------------------------------------

test('sendToFast without evmClients is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.sendToFast({
      chain: 'arbitrum-sepolia',
      token: 'USDC',
      amount: '1000000',
      from: '0xsender',
      to: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
      evmClients: undefined as any,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SdkFastError);
      assert.equal((error as { name?: string }).name, 'FastError');
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

test('executeBridge preserves upstream FastError instances', async () => {
  const upstreamError = new SdkFastError('TX_FAILED', 'upstream failure', { note: 'keep identity' });
  const fastWallet = {
    address: FAST_ADDRESS,
    submit: async () => {
      throw upstreamError;
    },
  };

  await assert.rejects(
    () => executeBridge({
      fromChain: 'fast',
      toChain: 'arbitrum-sepolia',
      fromToken: 'fastUSDC',
      toToken: 'USDC',
      fromDecimals: 6,
      amount: '1000000',
      senderAddress: FAST_ADDRESS,
      receiverAddress: EVM_ADDRESS,
      fastWallet,
    }),
    (error: unknown) => {
      assert.equal(error, upstreamError);
      return true;
    },
  );
});

test('sendToFast with unsupported chain is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  const mockClients = {
    walletClient: {
      sendTransaction: async () => '0x123',
    },
    publicClient: {
      waitForTransactionReceipt: async () => ({ status: 'success' }),
      readContract: async () => 0n,
    },
  };
  
  await assert.rejects(
    () => allset.sendToFast({
      chain: 'unsupported',
      token: 'USDC',
      amount: '1000000',
      from: '0xsender',
      to: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
      evmClients: mockClients as any,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'UNSUPPORTED_OPERATION');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// sendToExternal Tests
// ---------------------------------------------------------------------------

test('sendToExternal without fastWallet is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.sendToExternal({
      chain: 'arbitrum-sepolia',
      token: 'fastUSDC',
      amount: '1000000',
      from: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
      to: '0xreceiver',
      fastWallet: undefined as any,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Intent Builder Tests
// ---------------------------------------------------------------------------

test('buildTransferIntent creates correct intent', () => {
  const intent = buildTransferIntent(
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    '0x1234567890123456789012345678901234567890',
  );
  
  assert.equal(intent.action, IntentAction.DynamicTransfer);
  assert.ok(intent.payload.startsWith('0x'));
  assert.equal(intent.value, 0n);
});

test('buildExecuteIntent creates correct intent', () => {
  const intent = buildExecuteIntent(
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    '0xabcdef',
    100n,
  );
  
  assert.equal(intent.action, IntentAction.Execute);
  assert.ok(intent.payload.startsWith('0x'));
  assert.equal(intent.value, 100n);
});

test('buildExecuteIntent defaults value to 0', () => {
  const intent = buildExecuteIntent(
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    '0xabcdef',
  );
  
  assert.equal(intent.value, 0n);
});

test('buildDepositBackIntent creates correct intent', () => {
  const intent = buildDepositBackIntent(
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv',
  );
  
  assert.equal(intent.action, IntentAction.DynamicDeposit);
  assert.ok(intent.payload.startsWith('0x'));
  assert.equal(intent.value, 0n);
});

test('buildRevokeIntent creates correct intent', () => {
  const intent = buildRevokeIntent();
  
  assert.equal(intent.action, IntentAction.Revoke);
  assert.equal(intent.payload, '0x');
  assert.equal(intent.value, 0n);
});

test('executeIntent without fastWallet is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.executeIntent({
      chain: 'arbitrum-sepolia',
      token: 'fastUSDC',
      amount: '1000000',
      intents: [buildTransferIntent('0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', '0x1234567890123456789012345678901234567890')],
      fastWallet: undefined as any,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

test('executeIntent infers external_address from execute target', async (t) => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const originalFetch = globalThis.fetch;
  let relayerBody: Record<string, unknown> | undefined;
  const contractAddress = '0x1111111111111111111111111111111111111111';

  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/relayer/relay')) {
      relayerBody = JSON.parse(String(init?.body));
      return Response.json({ ok: true });
    }

    return Response.json({
      result: {
        transaction: MOCK_CROSS_SIGN_TX,
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await allset.executeIntent({
    chain: 'arbitrum-sepolia',
    fastWallet: {
      address: FAST_ADDRESS,
      async submit() {
        return { txHash: TX_HASH, certificate: { ok: true } };
      },
    } as any,
    token: 'fastUSDC',
    amount: '1000000',
    intents: [buildExecuteIntent(contractAddress, '0xabcdef')],
  });

  assert.equal(relayerBody?.external_address, contractAddress);
});

test('executeIntent uses claim-scoped Fast recipients for bridge transfer and external claims', async (t) => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const originalFetch = globalThis.fetch;
  const submitCalls: Array<Record<string, unknown>> = [];

  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/relayer/relay')) {
      return Response.json({ ok: true });
    }

    return Response.json({
      result: {
        transaction: MOCK_CROSS_SIGN_TX,
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await allset.executeIntent({
    chain: 'arbitrum-sepolia',
    fastWallet: {
      address: FAST_ADDRESS,
      async submit(params) {
        submitCalls.push(params as Record<string, unknown>);
        return { txHash: TX_HASH, certificate: { ok: true } };
      },
    } as any,
    token: 'fastUSDC',
    amount: '1000000',
    intents: [buildTransferIntent('0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', EVM_ADDRESS)],
  });

  assert.equal(submitCalls.length, 2);

  const expectedRecipient = new Uint8Array(
    Buffer.from(
      fastAddressToBytes32(DEFAULT_NETWORKS_CONFIG.testnet.chains['arbitrum-sepolia'].fastBridgeAddress).slice(2),
      'hex',
    ),
  );

  const transferCall = submitCalls[0] as {
    recipient?: unknown;
    claim?: {
      TokenTransfer?: {
        recipient?: Uint8Array;
      };
    };
  };
  assert.equal('recipient' in transferCall, false);
  assert.deepEqual(
    Array.from(transferCall.claim?.TokenTransfer?.recipient ?? []),
    Array.from(expectedRecipient),
  );

  const intentCall = submitCalls[1] as {
    recipient?: unknown;
    claim?: {
      ExternalClaim?: unknown;
    };
  };
  assert.equal('recipient' in intentCall, false);
  assert.ok(intentCall.claim?.ExternalClaim);
});

test('executeIntent rejects intents without an EVM target unless externalAddress is provided', async (t) => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return Response.json({
      result: {
        transaction: MOCK_CROSS_SIGN_TX,
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => allset.executeIntent({
      chain: 'arbitrum-sepolia',
      fastWallet: {
        address: FAST_ADDRESS,
        async submit() {
          return { txHash: TX_HASH, certificate: { ok: true } };
        },
      } as any,
      token: 'fastUSDC',
      amount: '1000000',
      intents: [buildRevokeIntent()],
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// EVM Executor Tests
// ---------------------------------------------------------------------------

test('createEvmExecutor rejects unsupported chain ids', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ privateKey: '11'.repeat(32) }));

  const account = createEvmWallet(keyfile);
  assert.throws(
    () => createEvmExecutor(account, 'http://localhost:8545', 999),
    /Unsupported EVM chain ID/,
  );
});

test('createEvmExecutor returns walletClient and publicClient', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ privateKey: '22'.repeat(32) }));

  const account = createEvmWallet(keyfile);

  // Should not throw when passing Account
  const clients = createEvmExecutor(account, 'http://localhost:8545', 421614);

  // Verify clients were created
  assert.ok(clients.walletClient, 'should have walletClient');
  assert.ok(clients.publicClient, 'should have publicClient');
  assert.ok(typeof clients.walletClient.sendTransaction === 'function', 'walletClient should have sendTransaction');
  assert.ok(typeof clients.publicClient.readContract === 'function', 'publicClient should have readContract');
});

// ---------------------------------------------------------------------------
// EVM Wallet Tests
// ---------------------------------------------------------------------------

test('createEvmWallet generates new wallet when no args', () => {
  const account = createEvmWallet();
  
  // Should return an Account-compatible object with privateKey
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  assert.ok(typeof account.signMessage === 'function', 'should have signMessage method');
  assert.ok(account.privateKey.startsWith('0x'), 'privateKey should start with 0x');
  assert.equal(account.privateKey.length, 66, 'privateKey should be 66 chars');
  assert.equal(createEvmWallet(account.privateKey).address, account.address, 'privateKey should recreate the same address');
  
  // Two calls should generate different wallets
  const account2 = createEvmWallet();
  assert.notEqual(account.address, account2.address, 'should generate unique addresses');
  assert.notEqual(account.privateKey, account2.privateKey, 'should generate unique private keys');
});

test('createEvmWallet derives account from private key', () => {
  const privateKey = `0x${'55'.repeat(32)}`;
  const account = createEvmWallet(privateKey);
  
  // Should return an Account-compatible object with derived address
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  assert.equal(account.privateKey, privateKey, 'privateKey should be preserved');
  
  // Same key should produce same address
  const account2 = createEvmWallet(privateKey);
  assert.equal(account.address, account2.address, 'same key should produce same address');
  
  // Also works without 0x prefix
  const account3 = createEvmWallet('55'.repeat(32));
  assert.equal(account.address, account3.address, 'should work without 0x prefix');
});

test('createEvmWallet loads account from keyfile', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const privateKey = '33'.repeat(32);
  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ privateKey, address: '0xOptionalReference' }));

  const account = createEvmWallet(keyfile);

  // Should return an Account-compatible object
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  assert.ok(typeof account.signMessage === 'function', 'should have signMessage method');
  assert.ok(typeof account.signTransaction === 'function', 'should have signTransaction method');
  assert.equal(account.privateKey, `0x${privateKey}`, 'privateKey should be normalized from keyfile');
});

test('createEvmWallet handles 0x-prefixed privateKey in keyfile', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const privateKey = `0x${'44'.repeat(32)}`;
  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ privateKey }));

  const account = createEvmWallet(keyfile);

  assert.ok(account.address.startsWith('0x'), 'should derive address');
  assert.equal(account.privateKey, privateKey, 'should preserve 0x-prefixed privateKey');
});

test('createEvmWallet throws for missing keyfile', () => {
  assert.throws(
    () => createEvmWallet('/nonexistent/path/wallet.json'),
    /Wallet file not found/,
  );
});

test('createEvmWallet throws for missing privateKey in keyfile', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ address: '0x123' })); // no privateKey

  assert.throws(
    () => createEvmWallet(keyfile),
    /missing privateKey/,
  );
});

// ---------------------------------------------------------------------------
// evmSign Tests
// ---------------------------------------------------------------------------

test('evmSign rejects invalid certificates', async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return Response.json({
      error: { message: 'Invalid certificate format' },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => evmSign({ envelope: { transaction: {} } }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'TX_FAILED');
      assert.match((error as Error).message, /Cross-sign error/);
      return true;
    },
  );
});

test('evmSign returns transaction and signature on success', async (t) => {
  const originalFetch = globalThis.fetch;

  const mockResult = {
    transaction: MOCK_CROSS_SIGN_TX,
    signature: '0xabcdef',
  };

  globalThis.fetch = async () => {
    return Response.json({
      result: mockResult,
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await evmSign({ envelope: { transaction: {} } });
  
  assert.deepEqual(result.transaction, mockResult.transaction);
  assert.equal(result.signature, mockResult.signature);
});

test('executeBridge withdrawal uses the default cross-sign URL without a provider', async (t) => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (url) => {
    urls.push(String(url));

    if (String(url).includes('/relayer/relay')) {
      return Response.json({ ok: true });
    }

    return Response.json({
      result: {
        transaction: MOCK_CROSS_SIGN_TX,
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await executeBridge({
    fromChain: 'fast',
    toChain: 'arbitrum-sepolia',
    fromToken: 'fastUSDC',
    toToken: 'USDC',
    fromDecimals: 6,
    amount: '1000000',
    senderAddress: FAST_ADDRESS,
    receiverAddress: EVM_ADDRESS,
    fastWallet: {
      address: FAST_ADDRESS,
      async submit() {
        return { txHash: TX_HASH, certificate: { ok: true } };
      },
    } as any,
  });

  assert.equal(urls[0], 'https://testnet.cross-sign.allset.fast.xyz');
  assert.equal(urls[1], 'https://testnet.cross-sign.allset.fast.xyz');
  assert.equal(urls[2], 'https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer/relay');
});

test('executeBridge uses the exact bundled base relayer URL (mainnet)', async (t) => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (url) => {
    urls.push(String(url));

    if (String(url) === 'https://allset.fast.xyz/base/relayer/relay') {
      return Response.json({ ok: true });
    }

    return Response.json({
      result: {
        transaction: MOCK_CROSS_SIGN_TX,
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const allset = new AllSetProvider({ network: 'mainnet' });

  await executeBridge({
    fromChain: 'fast',
    toChain: 'base',
    fromToken: 'USDC',
    toToken: 'USDC',
    fromDecimals: 6,
    amount: '1000000',
    senderAddress: FAST_ADDRESS,
    receiverAddress: EVM_ADDRESS,
    fastWallet: {
      address: FAST_ADDRESS,
      async submit() {
        return { txHash: TX_HASH, certificate: { ok: true } };
      },
    } as any,
  }, allset);

  assert.equal(urls[2], 'https://allset.fast.xyz/base/relayer/relay');
});

// ---------------------------------------------------------------------------
// EIP-7702 smartDeposit Tests
// ---------------------------------------------------------------------------

test('smartDeposit is exported from node entry', () => {
  assert.equal(typeof smartDeposit, 'function');
});

test('smartDeposit rejects when balance timeout expires before minimum is met', async () => {
  const PRIVATE_KEY = '0x31c269fb59cf298908f57189aa5418e724f3513ae69d21bbafe78210a09712e6';
  const originalFetch = globalThis.fetch;

  // Return valid uint256(0) for every RPC call — balance stays 0, poll loop times out
  globalThis.fetch = async () => {
    return Response.json({
      jsonrpc: '2.0',
      id: 1,
      result: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
  };

  try {
    await assert.rejects(
      () => smartDeposit({
        privateKey: PRIVATE_KEY,
        rpcUrl: 'https://mainnet.base.org',
        allsetApiUrl: 'http://localhost:9999',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        minAmount: 1_000_000n,
        bridgeAddress: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
        depositCalldata: '0xdeadbeef',
        pollIntervalMs: 10,
        timeoutMs: 50,
      }),
      (err: unknown) => {
        assert.match(String(err), /timed out/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('smartDeposit rejects with prepare error when backend returns 500', async () => {
  const PRIVATE_KEY = '0x31c269fb59cf298908f57189aa5418e724f3513ae69d21bbafe78210a09712e6';
  const originalFetch = globalThis.fetch;

  // Return 10 USDC balance for RPC calls, 500 for prepare
  globalThis.fetch = async (url) => {
    const urlStr = String(url instanceof Request ? url.url : url);
    if (urlStr.includes('/userop/prepare')) {
      return new Response(JSON.stringify({ error: 'backend offline' }), { status: 500 });
    }
    // Valid uint256(10_000_000) = 10 USDC
    return Response.json({
      jsonrpc: '2.0',
      id: 1,
      result: '0x0000000000000000000000000000000000000000000000000000000000989680',
    });
  };

  try {
    await assert.rejects(
      () => smartDeposit({
        privateKey: PRIVATE_KEY,
        rpcUrl: 'https://mainnet.base.org',
        allsetApiUrl: 'http://localhost:9999',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        minAmount: 1_000_000n,
        bridgeAddress: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
        depositCalldata: '0xdeadbeef',
        pollIntervalMs: 10,
      }),
      (err: unknown) => {
        assert.match(String(err), /prepare failed/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

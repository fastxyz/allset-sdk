import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createEvmExecutor,
  createEvmWallet,
  AllSetProvider,
  executeBridge,
  evmSign,
  IntentAction,
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
  buildRevokeIntent,
} from '../src/index.ts';

const FAST_ADDRESS = 'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv';
const EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
const TX_HASH = `0x${'11'.repeat(32)}`;

// ---------------------------------------------------------------------------
// AllSetProvider Tests
// ---------------------------------------------------------------------------

test('AllSetProvider exposes expected properties', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  assert.equal(allset.network, 'testnet');
  assert.ok(allset.chains.includes('arbitrum'));
  assert.ok(allset.chains.includes('ethereum'));
  assert.ok(allset.crossSignUrl.length > 0);
});

test('AllSetProvider.getChainConfig returns config for supported chains', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  const arbConfig = allset.getChainConfig('arbitrum');
  assert.ok(arbConfig);
  assert.equal(arbConfig.chainId, 421614);
  assert.ok(arbConfig.bridgeContract.startsWith('0x'));
  
  const ethConfig = allset.getChainConfig('ethereum');
  assert.ok(ethConfig);
  assert.equal(ethConfig.chainId, 11155111);
});

test('AllSetProvider.getChainConfig returns null for unsupported chains', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const config = allset.getChainConfig('unsupported');
  assert.equal(config, null);
});

test('AllSetProvider.getTokenConfig returns config and normalizes fastUSDC', () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  const usdcConfig = allset.getTokenConfig('arbitrum', 'USDC');
  assert.ok(usdcConfig);
  assert.equal(usdcConfig.decimals, 6);
  
  // fastUSDC should normalize to USDC config
  const fastUsdcConfig = allset.getTokenConfig('arbitrum', 'fastUSDC');
  assert.ok(fastUsdcConfig);
  assert.deepEqual(fastUsdcConfig, usdcConfig);
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
          relayerUrl: 'https://example.invalid/relay',
          tokens: {
            USDC: {
              evmAddress: '0x2222222222222222222222222222222222222222',
              fastTokenId: 'b4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5',
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

// ---------------------------------------------------------------------------
// sendToFast Tests
// ---------------------------------------------------------------------------

test('sendToFast without evmClients is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.sendToFast({
      chain: 'arbitrum',
      token: 'USDC',
      amount: '1000000',
      from: '0xsender',
      to: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
      evmClients: undefined as any,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
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
      chain: 'arbitrum',
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
      chain: 'arbitrum',
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
        transaction: [1, 2, 3],
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await allset.executeIntent({
    chain: 'arbitrum',
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

test('executeIntent rejects intents without an EVM target unless externalAddress is provided', async (t) => {
  const allset = new AllSetProvider({ network: 'testnet' });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return Response.json({
      result: {
        transaction: [1, 2, 3],
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => allset.executeIntent({
      chain: 'arbitrum',
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
    () => createEvmExecutor(account, 'http://localhost:8545', 1),
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
  
  // Should return a viem Account
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  assert.ok(typeof account.signMessage === 'function', 'should have signMessage method');
  
  // Two calls should generate different wallets
  const account2 = createEvmWallet();
  assert.notEqual(account.address, account2.address, 'should generate unique addresses');
});

test('createEvmWallet derives account from private key', () => {
  const privateKey = `0x${'55'.repeat(32)}`;
  const account = createEvmWallet(privateKey);
  
  // Should return a viem Account with derived address
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  
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

  // Should return a viem Account
  assert.ok(account.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(account.address.length, 42, 'address should be 42 chars');
  assert.ok(typeof account.signMessage === 'function', 'should have signMessage method');
  assert.ok(typeof account.signTransaction === 'function', 'should have signTransaction method');
});

test('createEvmWallet handles 0x-prefixed privateKey in keyfile', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'allset-sdk-evm-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const privateKey = `0x${'44'.repeat(32)}`;
  const keyfile = join(tempDir, 'wallet.json');
  writeFileSync(keyfile, JSON.stringify({ privateKey }));

  const account = createEvmWallet(keyfile);

  assert.ok(account.address.startsWith('0x'), 'should derive address');
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
    transaction: [1, 2, 3, 4],
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
        transaction: [1, 2, 3],
        signature: '0xsig',
      },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await executeBridge({
    fromChain: 'fast',
    toChain: 'arbitrum',
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

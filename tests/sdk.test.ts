import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEvmExecutor,
  createEvmWallet,
  AllSetProvider,
  evmSign,
} from '../src/index.ts';

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

test('unsupported route is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.bridge({
      fromChain: 'ethereum',
      toChain: 'arbitrum',
      fromToken: 'USDC',
      toToken: 'USDC',
      fromDecimals: 6,
      amount: '1000000',
      senderAddress: '0xsender',
      receiverAddress: '0xreceiver',
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'UNSUPPORTED_OPERATION');
      return true;
    },
  );
});

test('deposit without evmExecutor is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.bridge({
      fromChain: 'arbitrum',
      toChain: 'fast',
      fromToken: 'USDC',
      toToken: 'fastUSDC',
      fromDecimals: 6,
      amount: '1000000',
      senderAddress: '0xsender',
      receiverAddress: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

test('withdrawal without fastWallet is rejected', async () => {
  const allset = new AllSetProvider({ network: 'testnet' });
  
  await assert.rejects(
    () => allset.bridge({
      fromChain: 'fast',
      toChain: 'arbitrum',
      fromToken: 'fastUSDC',
      toToken: 'USDC',
      fromDecimals: 6,
      amount: '1000000',
      senderAddress: 'fast1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr',
      receiverAddress: '0xreceiver',
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_PARAMS');
      return true;
    },
  );
});

test('createEvmExecutor rejects unsupported chain ids', () => {
  assert.throws(
    () => createEvmExecutor(`0x${'11'.repeat(32)}`, 'http://localhost:8545', 1),
    /Unsupported EVM chain ID/,
  );
});

test('createEvmWallet generates valid wallet', () => {
  const wallet = createEvmWallet();
  
  // Check privateKey format
  assert.ok(wallet.privateKey.startsWith('0x'), 'privateKey should start with 0x');
  assert.equal(wallet.privateKey.length, 66, 'privateKey should be 66 chars (0x + 64 hex)');
  
  // Check address format
  assert.ok(wallet.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(wallet.address.length, 42, 'address should be 42 chars (0x + 40 hex)');
  
  // Check that two wallets are different
  const wallet2 = createEvmWallet();
  assert.notEqual(wallet.privateKey, wallet2.privateKey, 'should generate unique keys');
  assert.notEqual(wallet.address, wallet2.address, 'should generate unique addresses');
});

test('createEvmWallet derives address from provided privateKey', () => {
  // Generate a wallet first
  const original = createEvmWallet();
  
  // Derive from the same private key
  const derived = createEvmWallet(original.privateKey);
  
  // Should produce the same address
  assert.equal(derived.privateKey, original.privateKey, 'privateKey should match');
  assert.equal(derived.address, original.address, 'address should match');
  
  // Also works without 0x prefix
  const derivedWithoutPrefix = createEvmWallet(original.privateKey.slice(2));
  assert.equal(derivedWithoutPrefix.address, original.address, 'address should match without 0x prefix');
});

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

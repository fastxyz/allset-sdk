import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvmExecutor, createEvmWallet, allsetProvider } from '../src/index.ts';

test('allsetProvider exposes expected metadata', () => {
  assert.equal(allsetProvider.name, 'allset');
  assert.deepEqual(allsetProvider.chains, ['fast', 'ethereum', 'arbitrum']);
  assert.deepEqual(allsetProvider.networks, ['testnet']);
});

test('unsupported route is rejected', async () => {
  await assert.rejects(
    () => allsetProvider.bridge({
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
  await assert.rejects(
    () => allsetProvider.bridge({
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

test('withdrawal without fastClient is rejected', async () => {
  await assert.rejects(
    () => allsetProvider.bridge({
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

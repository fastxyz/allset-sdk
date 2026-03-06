import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvmExecutor, omnisetProvider } from '../src/index.ts';

test('omnisetProvider exposes expected metadata', () => {
  assert.equal(omnisetProvider.name, 'omniset');
  assert.deepEqual(omnisetProvider.chains, ['fast', 'ethereum', 'arbitrum']);
  assert.deepEqual(omnisetProvider.networks, ['testnet']);
});

test('unsupported route is rejected', async () => {
  await assert.rejects(
    () => omnisetProvider.bridge({
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
    () => omnisetProvider.bridge({
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
    () => omnisetProvider.bridge({
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

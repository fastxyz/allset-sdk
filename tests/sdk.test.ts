import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEvmExecutor,
  createEvmWallet,
  createFastClient,
  createFastWallet,
  allsetProvider,
} from '../src/index.ts';

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

test('createFastWallet generates a usable Fast wallet', () => {
  const wallet = createFastWallet();

  assert.match(wallet.privateKey, /^[0-9a-f]{64}$/i);
  assert.match(wallet.publicKey, /^[0-9a-f]{64}$/i);
  assert.ok(wallet.address.startsWith('fast1'), 'address should be a Fast bech32m address');

  const fastClient = createFastClient({
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
  });
  assert.equal(fastClient.address, wallet.address, 'client address should match generated address');

  const wallet2 = createFastWallet();
  assert.notEqual(wallet.privateKey, wallet2.privateKey, 'should generate unique private keys');
  assert.notEqual(wallet.publicKey, wallet2.publicKey, 'should generate unique public keys');
  assert.notEqual(wallet.address, wallet2.address, 'should generate unique addresses');
});

test('createFastClient rejects mismatched Fast keypairs', () => {
  const wallet = createFastWallet();
  const otherWallet = createFastWallet();

  assert.throws(
    () => createFastClient({
      privateKey: wallet.privateKey,
      publicKey: otherWallet.publicKey,
    }),
    /publicKey does not match/,
  );
});

test('createFastClient preserves exact timestamp_nanos in submit and evmSign payloads', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;

  let submitBody = '';
  let crossSignBody = '';

  const expectedTimestamp = 1_730_000_000_123_000_000n;
  const tokenIdBytes = new Array(32).fill(0x07);
  const wallet = createFastWallet();
  const senderBytes = Array.from(Buffer.from(wallet.publicKey, 'hex'));

  Date.now = () => 1_730_000_000_123;

  globalThis.fetch = async (_input, init) => {
    const body = String(init?.body ?? '');

    if (body.includes('"method":"proxy_getAccountInfo"')) {
      return new Response('{"result":{"next_nonce":7}}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.includes('"method":"proxy_submitTransaction"')) {
      submitBody = body;
      return new Response(
        `{"result":{"Success":{"envelope":{"transaction":{"sender":[${senderBytes.join(',')}],"recipient":[${senderBytes.join(',')}],"nonce":7,"timestamp_nanos":${expectedTimestamp.toString()},"claim":{"TokenTransfer":{"token_id":[${tokenIdBytes.join(',')}],"amount":"f4240","user_data":null}},"archival":false}}}}}`,
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (body.includes('"method":"crossSign_evmSignCertificate"')) {
      crossSignBody = body;
      return Response.json({
        result: {
          transaction: [1, 2, 3],
          signature: '0xabc',
        },
      });
    }

    throw new Error(`Unexpected fetch body: ${body}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
  });

  const client = createFastClient({
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
  });

  const submitResult = await client.submit({
    recipient: client.address!,
    claim: {
      TokenTransfer: {
        token_id: Uint8Array.from(tokenIdBytes),
        amount: '1000000',
        user_data: null,
      },
    },
  });

  await client.evmSign({ certificate: submitResult.certificate });

  assert.match(submitBody, new RegExp(`"timestamp_nanos":${expectedTimestamp.toString()}`));
  assert.doesNotMatch(submitBody, /"timestamp_nanos":"\d+"/);
  assert.match(crossSignBody, new RegExp(`"timestamp_nanos":${expectedTimestamp.toString()}`));

  const certificate = submitResult.certificate as {
    envelope: { transaction: { timestamp_nanos: bigint } };
  };
  assert.equal(certificate.envelope.transaction.timestamp_nanos, expectedTimestamp);
});

# AllSet SDK

Standalone AllSet SDK extracted from `/Users/chris/Documents/Workspace/money`.

This repo contains only `@fast/allset-sdk`. It does not include the Fast SDK package or the old workspace wiring from the `money` monorepo.

## Install

```bash
npm install @fast/allset-sdk
```

## Development

```bash
npm install
```

## Scripts

```bash
npm run build
npm test
npm run pack:dry-run
npm run pack:smoke
```

## Usage

### Deposit (EVM → Fast)

```ts
import { createEvmExecutor, allsetProvider } from '@fast/allset-sdk';

const evmExecutor = createEvmExecutor(
  process.env.EVM_PRIVATE_KEY!,
  process.env.ARBITRUM_SEPOLIA_RPC_URL!,
  421614,
);

const result = await allsetProvider.bridge({
  fromChain: 'arbitrum',
  toChain: 'fast',
  fromToken: 'USDC',
  toToken: 'fastUSDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: '0xYourEvmAddress',
  receiverAddress: 'fast1yourfastaddress',
  evmExecutor,
});

console.log(result);
```

### Withdraw (Fast → EVM)

```ts
import { createFastClient, allsetProvider } from '@fast/allset-sdk';

// Create FastClient with your wallet keys
const fastClient = createFastClient({
  privateKey: process.env.FAST_PRIVATE_KEY!, // 32 bytes as hex
  publicKey: process.env.FAST_PUBLIC_KEY!,   // 32 bytes as hex
});

const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000', // 1 USDC (6 decimals)
  senderAddress: fastClient.address!,
  receiverAddress: '0xYourEvmAddress',
  fastClient,
});

console.log(result);
// { txHash: '0x...', orderId: '0x...', estimatedTime: '1-5 minutes' }
```

## ⚠️ Important: timestamp_nanos Precision

The `createFastClient()` implementation properly handles JavaScript's integer precision limits.
The `timestamp_nanos` field can exceed `Number.MAX_SAFE_INTEGER` (9007199254740991), causing
precision loss when parsed with `JSON.parse()`.

If you implement your own `FastClient`, you MUST extract `timestamp_nanos` from the raw
response text BEFORE JSON parsing to compute correct transaction hashes. Incorrect hashes
cause on-chain verification failure (error `0x36289cf3`).

## Current Scope

- Testnet only (staging environment)
- Fast ↔ EVM flows (deposit and withdraw)
- Supported chains: Ethereum Sepolia (`11155111`), Arbitrum Sepolia (`421614`)
- Supported tokens: `USDC`, `fastUSDC`

## Releasing

See `RELEASING.md` for the tag-driven npm release flow and the npm trusted publishing setup this repo expects.

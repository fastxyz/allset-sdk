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

```ts
import { createEvmExecutor, omnisetProvider } from '@fast/allset-sdk';

const evmExecutor = createEvmExecutor(
  process.env.EVM_PRIVATE_KEY!,
  process.env.ARBITRUM_SEPOLIA_RPC_URL!,
  421614,
);

const result = await omnisetProvider.bridge({
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

## Current Scope

- Testnet only
- Fast to EVM and EVM to Fast flows only
- EVM executor support for Ethereum Sepolia (`11155111`) and Arbitrum Sepolia (`421614`)
- Current token registry maps Arbitrum Sepolia `USDC` and `fastUSDC`

For Fast to EVM withdrawals, provide a compatible Fast client. In most integrations that will come from `@fast/sdk`, but this package does not bundle it.

## Releasing

See `RELEASING.md` for the tag-driven npm release flow and the npm trusted publishing setup this repo expects.

# allset-sdk

Standalone AllSet SDK for OmniSet bridge flows between Fast and EVM testnets.

This repo intentionally contains only the AllSet SDK. The Fast SDK was split out and is not bundled here.

## What It Exports

```ts
import { omnisetProvider, createEvmExecutor } from '@pi2labs/allset-sdk';
```

- `omnisetProvider`: bridge provider with `bridge(...)`
- `createEvmExecutor(...)`: minimal viem-based executor for EVM approvals and bridge transactions

## Current Scope

- Network: `testnet` only
- EVM executor chain support: Ethereum Sepolia (`11155111`) and Arbitrum Sepolia (`421614`)
- Bridge provider chain config exists for `ethereum` and `arbitrum`
- Current token registry in this package is only Arbitrum Sepolia `USDC` / `fastUSDC`

That last point matters: the package has Ethereum Sepolia bridge config, but the shipped token resolver currently only maps Arbitrum Sepolia tokens. If you call `bridge(...)` with an unsupported token/route, it will fail with `TOKEN_NOT_FOUND`.

## Install

This package is set up as a normal Node package, but if you are consuming it locally before publishing:

```bash
npm install /absolute/path/to/allset-sdk
```

To work on the package in this repo:

```bash
npm install
npm run build
```

## Deposit Example

EVM to Fast deposits require an EVM executor and a Fast bech32m receiver address.

```ts
import { omnisetProvider, createEvmExecutor } from '@pi2labs/allset-sdk';

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

## Withdrawal Example

Fast to EVM withdrawals require a compatible Fast client. This repo does not include the Fast SDK implementation; it only depends on a minimal interface:

```ts
type FastClient = {
  submit(params: {
    recipient: string;
    claim: Record<string, unknown>;
  }): Promise<{ txHash: string; certificate: unknown }>;
  evmSign(params: {
    certificate: unknown;
  }): Promise<{ transaction: number[]; signature: string }>;
  readonly address: string | null;
};
```

Example:

```ts
import { omnisetProvider } from '@pi2labs/allset-sdk';

const result = await omnisetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: 'fast1yourfastaddress',
  receiverAddress: '0xYourEvmAddress',
  fastClient,
});

console.log(result);
```

## Errors

The SDK throws `FastError`-style errors with:

- `code`
- `message`
- `note`

Current codes:

- `INSUFFICIENT_BALANCE`
- `CHAIN_NOT_CONFIGURED`
- `TX_FAILED`
- `INVALID_ADDRESS`
- `TOKEN_NOT_FOUND`
- `INVALID_PARAMS`
- `UNSUPPORTED_OPERATION`

## Package Layout

```text
src/
  bridge.ts         OmniSet bridge provider
  evm-executor.ts   viem-based EVM transaction executor
  fast-compat.ts    local FastError compatibility layer
  index.ts          public exports
  types.ts          public interfaces
```

## Development

```bash
npm install
npm run build
```

Build output goes to `dist/`.

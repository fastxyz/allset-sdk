# AllSet SDK

Official TypeScript SDK for the AllSet bridge. Bridge tokens between Fast chain and EVM chains (Arbitrum Sepolia, Ethereum Sepolia).

## Install

```bash
npm install @fastxyz/allset-sdk
```

## Quick Start

### Deposit (EVM → Fast)

```ts
import { createEvmExecutor, allsetProvider } from '@fastxyz/allset-sdk';

const evmExecutor = createEvmExecutor(
  process.env.EVM_PRIVATE_KEY!,
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614
);

const result = await allsetProvider.bridge({
  fromChain: 'arbitrum',
  toChain: 'fast',
  fromToken: 'USDC',
  toToken: 'fastUSDC',
  amount: '1000000', // 1 USDC (6 decimals)
  senderAddress: '0xYourEvmAddress',
  receiverAddress: 'fast1yourfastaddress',
  evmExecutor,
});

console.log(result.txHash);
```

### Withdraw (Fast → EVM)

```ts
import { createFastWallet } from '@fastxyz/allset-sdk';

const wallet = createFastWallet();
console.log(wallet);
// {
//   privateKey: '...',
//   publicKey: '...',
//   address: 'fast1...'
// }
```

Store that keypair securely, then use it with `createFastClient()`:

```ts
import { createFastClient, allsetProvider } from '@fastxyz/allset-sdk';

const fastClient = createFastClient({
  privateKey: process.env.FAST_PRIVATE_KEY!, // 32-byte hex
  publicKey: process.env.FAST_PUBLIC_KEY!,   // 32-byte hex
});

const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  amount: '1000000', // 1 USDC (6 decimals)
  senderAddress: fastClient.address!,
  receiverAddress: '0xYourEvmAddress',
  fastClient,
});

console.log(result.txHash);
// { txHash: '0x...', orderId: '0x...', estimatedTime: '1-5 minutes' }
```

Best practice: generate the Fast wallet once, store the private/public keys in your secret manager or environment, and pass those stored values into `createFastClient()`. Do not generate a fresh wallet on every app start unless that is explicitly what you want.

## Features

- **Deposit** - Bridge USDC from EVM chains to fastUSDC on Fast
- **Withdraw** - Bridge fastUSDC from Fast to USDC on EVM chains
- **EVM Executor** - Built-in viem-based transaction executor
- **Fast Client** - Built-in Fast chain client for withdrawals
- **Fast Wallet Generator** - Generate a Fast keypair and address without another SDK

## Supported Networks

| Chain | Network | Chain ID |
|-------|---------|----------|
| Arbitrum | Sepolia | 421614 |
| Ethereum | Sepolia | 11155111 |
| Fast | Testnet | - |

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation and troubleshooting.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT

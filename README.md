# AllSet SDK

Official TypeScript SDK for the AllSet bridge. Bridge tokens between Fast network and supported EVM routes, with the current branch focused on Arbitrum Sepolia and Fast testnet flows.

## Prerequisites

Install both the Fast SDK and AllSet SDK:

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

### Deposit (EVM → Fast)

```ts
import { createEvmExecutor, allsetProvider } from '@fastxyz/allset-sdk';

// Your EVM wallet that holds USDC
const evmExecutor = createEvmExecutor(
  '<senderEvmPrivateKey>',  // Private key of the sender wallet
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614
);

const result = await allsetProvider.bridge({
  fromChain: 'arbitrum',
  toChain: 'fast',
  fromToken: 'USDC',
  toToken: 'fastUSDC',
  fromDecimals: 6,
  amount: '1000000', // 1 USDC (6 decimals)
  senderAddress: '0xYourEvmAddress',
  receiverAddress: 'fast1yourfastaddress',
  evmExecutor,
});

console.log(result.txHash);
```

### Withdraw (Fast → EVM)

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider } from '@fastxyz/allset-sdk';

// Create Fast wallet
const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Bridge Fast → EVM
const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000', // 1 fastUSDC (6 decimals)
  senderAddress: fastWallet.address,
  receiverAddress: '0xYourEvmAddress',
  fastWallet,
});

console.log(result.txHash);
// { txHash: '0x...', orderId: '0x...', estimatedTime: '1-5 minutes' }
```

## Same-Key Pattern

You can derive an EVM wallet from the same private key as your Fast wallet. This is useful when you want a single keypair for both networks:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Derive EVM wallet from the same private key
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);

console.log('Fast address:', fastWallet.address);
console.log('EVM address:', evmWallet.address);
```

## Features

- **Deposit** - Bridge USDC from EVM chains to fastUSDC on Fast
- **Withdraw** - Bridge fastUSDC from Fast to USDC on EVM chains
- **EVM Executor** - Built-in viem-based transaction executor
- **evmSign** - AllSet-specific cross-signing for bridge verification
- **Same-key EVM wallet** - Derive EVM address from Fast private key

## API Reference

### `allsetProvider.bridge(params)`

Bridge tokens between Fast network and EVM chains.

**Parameters:**
- `fromChain` - Source chain: `'fast'`, `'ethereum'`, or `'arbitrum'`
- `toChain` - Destination chain: `'fast'`, `'ethereum'`, or `'arbitrum'`
- `fromToken` - Source token symbol or address
- `toToken` - Destination token symbol or address
- `fromDecimals` - Token decimals
- `amount` - Amount in smallest units (string)
- `senderAddress` - Sender's address on source chain
- `receiverAddress` - Receiver's address on destination chain
- `evmExecutor` - (Deposits only) EVM executor from `createEvmExecutor()`
- `fastWallet` - (Withdrawals only) FastWallet from `@fastxyz/sdk`

### `createEvmExecutor(privateKey, rpcUrl, chainId)`

Create an EVM transaction executor.

### `createEvmWallet(privateKey?)`

Create or derive an EVM wallet. If `privateKey` is provided, derives the address from it. Otherwise generates a new random wallet.

### `evmSign(certificate, crossSignUrl?)`

Request EVM cross-signing for a Fast network certificate. Used internally by the bridge but exposed for advanced use cases.

## Supported Networks

Current SDK implementation:

- Testnet-only bridge flows
- Arbitrum Sepolia (`421614`) + Fast testnet
- Token mapping for `USDC` ↔ `fastUSDC`

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

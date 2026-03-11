# AllSet SDK

Official TypeScript SDK for the AllSet bridge. Bridge tokens between Fast network and supported EVM chains.

## Installation

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

### Withdraw (Fast → EVM)

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });

const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

const result = await allset.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: fastWallet.address,
  receiverAddress: '0xYourEvmAddress',
  fastWallet,
});
```

### Deposit (EVM → Fast)

```ts
import { AllSetProvider, createEvmExecutor } from '@fastxyz/allset-sdk';

const allset = new AllSetProvider({ network: 'testnet' });

const evmExecutor = createEvmExecutor(
  '<yourPrivateKey>',
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614
);

const result = await allset.bridge({
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
```

## Supported Networks

| Network | Chain | Status |
|---------|-------|--------|
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Mainnet | Coming soon | 🔜 |

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation, configuration options, and troubleshooting.

## License

MIT

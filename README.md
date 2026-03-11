# AllSet SDK

Official TypeScript SDK for the AllSet bridge. Bridge tokens between Fast network and supported EVM chains.

## Installation

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

### Deposit (EVM → Fast)

```ts
import { allsetProvider, createEvmExecutor } from '@fastxyz/allset-sdk';

const evmExecutor = createEvmExecutor(
  '<yourPrivateKey>',
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614
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
```

### Withdraw (Fast → EVM)

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

const result = await allsetProvider.bridge({
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

# AllSet SDK

Official TypeScript SDK for the AllSet bridge. Bridge tokens between Fast network and supported EVM chains.

## Installation

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

### Setup

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider, createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

// Create providers
const fastProvider = new FastProvider({ network: 'testnet' });
const allsetProvider = new AllSetProvider({ network: 'testnet' });

// Create or load wallets
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');
```

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
  amount: '1000000', // 1 USDC
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
  amount: '1000000', // 1 fastUSDC
  senderAddress: fastWallet.address,
  receiverAddress: '0xYourEvmAddress',
  fastWallet,
});
```

## Directory Structure

```
~/.allset/
├── networks.json          # Custom network config (optional)
└── .evm/
    └── keys/
        └── default.json   # EVM wallet keyfiles
```

## Configuration

### Using AllSetProvider

```ts
import { AllSetProvider } from '@fastxyz/allset-sdk';

// Default (testnet)
const provider = new AllSetProvider();

// Mainnet
const provider = new AllSetProvider({ network: 'mainnet' });

// Custom config file
const provider = new AllSetProvider({ configPath: './my-config.json' });

// Access config
console.log(provider.chains);           // ['ethereum', 'arbitrum']
console.log(provider.crossSignUrl);     // 'https://...'
provider.getChainConfig('arbitrum');    // { chainId, bridgeContract, ... }
provider.getTokenConfig('arbitrum', 'USDC'); // { evmAddress, fastTokenId, ... }
```

### Custom Configuration

Copy the default config to your home directory:

```ts
import { initUserConfig } from '@fastxyz/allset-sdk';

initUserConfig(); // Creates ~/.allset/networks.json
```

Then edit `~/.allset/networks.json` with your custom URLs or contract addresses.

## EVM Wallets

```ts
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

// Generate new wallet
const wallet = createEvmWallet();
saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');

// Load from file
const loaded = createEvmWallet('~/.allset/.evm/keys/default.json');

// Derive from private key
const derived = createEvmWallet('0x1234...');

// Same-key pattern (from Fast wallet)
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);
```

## Supported Networks

| Network | Chain | Status |
|---------|-------|--------|
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Mainnet | Coming soon | 🔜 |

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation and troubleshooting.

## License

MIT

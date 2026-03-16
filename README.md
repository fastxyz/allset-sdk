# AllSet SDK

Bridge tokens between Fast network and EVM chains.

## Installation

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk';

// Setup
const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// Deposit: EVM → Fast
// createEvmExecutor accepts either EvmWallet or raw private key
const evmExecutor = createEvmExecutor(evmWallet, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
// Alternative: createEvmExecutor('0xprivateKey...', rpcUrl, chainId);
await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: evmWallet.address,
  to: fastWallet.address,
  evmExecutor,
});

// Withdraw: Fast → EVM
await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: evmWallet.address,
  fastWallet,
});
```

## Advanced: Custom Intents

```ts
import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';

// Execute custom intents on EVM chain
await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [
    buildTransferIntent(USDC_ADDRESS, '0xRecipient'),
    // Add more intents: swaps, protocol calls, etc.
  ],
});
```

For intents without a transfer recipient or execute target, pass `externalAddress` so the relayer has an explicit EVM target.

## Supported Networks

| Network | Chain | Status |
|---------|-------|--------|
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Mainnet | Coming soon | 🔜 |

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

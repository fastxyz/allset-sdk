# AllSet SDK

Bridge tokens between Fast network and EVM chains.

## Installation

Pure helpers only:

```bash
npm install @fastxyz/allset-sdk
```

Node execution APIs:

```bash
npm install @fastxyz/allset-sdk @fastxyz/sdk
```

## Entrypoints

| Entrypoint | Use for | Browser-safe |
| --- | --- | --- |
| `@fastxyz/allset-sdk` | Pure deposit planners, intent builders, Fast address conversion | Yes |
| `@fastxyz/allset-sdk/core` | Explicit alias of the root pure helper surface | Yes |
| `@fastxyz/allset-sdk/browser` | Browser-safe frontend import path for pure helpers | Yes |
| `@fastxyz/allset-sdk/node` | Provider, executor, wallet, bridge execution, file-backed config | No |

## Quick Start

### Pure deposit planning

```ts
import { buildDepositTransaction } from '@fastxyz/allset-sdk';

const plan = buildDepositTransaction({
  network: 'testnet',
  chain: 'arbitrum',
  token: 'USDC',
  amount: 1_000_000n,
  receiver: 'fast1receiveraddress...',
});

console.log(plan.to);
console.log(plan.data);
console.log(plan.value);
```

### Node execution

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import {
  AllSetProvider,
  createEvmExecutor,
  createEvmWallet,
} from '@fastxyz/allset-sdk/node';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');

const evmExecutor = createEvmExecutor(
  evmWallet.privateKey,
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614,
);

await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: evmWallet.address,
  to: fastWallet.address,
  evmExecutor,
});
```

### Pure intent builders

```ts
import {
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
} from '@fastxyz/allset-sdk/browser';

const intents = [
  buildTransferIntent('0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', '0xRecipient'),
  buildExecuteIntent('0xContractAddress', '0xabcdef'),
  buildDepositBackIntent('0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', 'fast1receiveraddress...'),
];
```

## Supported Networks

| Network | Chain | Status |
| --- | --- | --- |
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Mainnet | Coming soon | 🔜 |

## Migration

- Root imports are now pure-helper only.
- Move provider, executor, wallet, and config imports to `@fastxyz/allset-sdk/node`.
- Use the root, `core`, or `browser` entrypoints for deposit planning and intent building.

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

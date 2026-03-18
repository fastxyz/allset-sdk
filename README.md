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

For deployments that are not bundled in the SDK yet, pass your own route config:

```ts
const plan = buildDepositTransaction({
  network: 'mainnet',
  chain: 'base',
  token: 'fastUSDC',
  amount: 1_000_000n,
  receiver: 'fast1receiveraddress...',
  networkConfig: {
    chains: {
      base: {
        chainId: 8453,
        bridgeContract: '0xYourAllSetBridge',
        tokens: {
          USDC: {
            evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            decimals: 6,
          },
        },
      },
    },
  },
});
```

This is the intended temporary path for Base mainnet until the authoritative deployment config is published in the SDK defaults.

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

// Create EVM account
const account = createEvmWallet('~/.evm/keys/default.json');
// Or: const account = createEvmWallet('0xprivateKey...');
// Or: const account = createEvmWallet(); // persist account.privateKey if generated

// Create EVM clients
const evmClients = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);

// Deposit: EVM → Fast
await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: account.address,
  to: fastWallet.address,
  evmClients,
});

// Withdraw: Fast → EVM
await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: account.address,
  fastWallet,
});
```

## createEvmWallet

Returns an Account-compatible object with viem signing methods and `privateKey`.

```ts
// Generate new wallet
const generatedAccount = createEvmWallet();
console.log(generatedAccount.privateKey); // persist this if you generated it

// Derive from private key
const derivedAccount = createEvmWallet('0x1234...64hexchars');

// Load from keyfile
const keyfileAccount = createEvmWallet('~/.evm/keys/default.json');
```

**Keyfile format:**
```json
{
  "privateKey": "abc123...64hexchars",
  "address": "0x..." // optional, for reference
}
```

## createEvmExecutor

Returns `{ walletClient, publicClient }` for EVM operations.

```ts
const { walletClient, publicClient } = createEvmExecutor(account, rpcUrl, chainId);
```

Accepts viem `Account` values, including the objects returned by `createEvmWallet()`.

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

## Advanced: Custom Intents

```ts
import { buildExecuteIntent, buildTransferIntent } from '@fastxyz/allset-sdk';

await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [
    buildTransferIntent(USDC_ADDRESS, '0xRecipient'),
    buildExecuteIntent(CONTRACT_ADDRESS, '0xabcdef'),
  ],
});
```

## Supported Networks

| Network | Chain | Status |
| --- | --- | --- |
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Testnet | Base (mainnet chain) | ✅ |
| Mainnet | Coming soon | 🔜 |

## Migration

- Root imports are now pure-helper only.
- Move provider, executor, wallet, and config imports to `@fastxyz/allset-sdk/node`.
- Use the root, `core`, or `browser` entrypoints for deposit planning and intent building.

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

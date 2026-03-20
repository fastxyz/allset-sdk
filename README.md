# AllSet SDK

Bridge tokens between Fast network and EVM chains.

## Installation

Pure helpers only:

```bash
npm install @fastxyz/allset-sdk
```

FastWallet-backed withdrawals and intent execution:

```bash
npm install @fastxyz/allset-sdk @fastxyz/sdk@^0.2.1
```

`@fastxyz/sdk` is optional for pure helpers and EVM -> Fast deposits. Install `@fastxyz/sdk` 0.2.1 or newer when you use `FastWallet` flows such as `sendToExternal(...)` or `executeIntent(...)`.

Compatible Fast wallets must implement the current `submit({ claim })` contract from `@fastxyz/sdk` 0.2.1+. Claims that need a recipient, such as `TokenTransfer`, must include it inside the claim payload.

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

Use this path for deployments that are not bundled in the SDK defaults yet.

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
| Testnet | Base (chain ID 8453) | ✅ |
| Mainnet | Coming soon | 🔜 |

## Bundled SDK Endpoints

These are the testnet deployment values currently embedded in the SDK defaults:

- Cross-sign: `https://testnet.cross-sign.allset.fast.xyz`
- `fastUSDC` and `testUSDC` are accepted SDK aliases; both normalize to the configured USDC route for the selected EVM chain.

Bundled testnet chain routes:

- Ethereum Sepolia
  - Bridge contract: `0xb53600976275D6f541a3B929328d07714EFA581F`
  - Fast bridge: `fast1fxtkgpwcy7hnakw96gg7relph4wxx7ghrukm723p3l9adxuxljzsc6f958`
  - Bundled relayer URL: `https://testnet.allset.fast.xyz/ethereum-sepolia/relayer/relay`
  - Bundled Fast token id
    - Base64: `1zoGeaK+RpgeKort7NlRyLZpDn1fhQKzTtP/TMIWO0Y=`
    - Hex: `d73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46`
- Arbitrum Sepolia
  - Bridge contract: `0xb53600976275D6f541a3B929328d07714EFA581F`
  - Fast bridge: `fast1tkmtqxulhnzeeg9zhuwxy3x95wr7waytm9cq40ndf7tkuwwcc6jseg24j8`
  - Bundled relayer URL: `https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer/relay`
  - Bundled Fast token id
    - Base64: `1zoGeaK+RpgeKort7NlRyLZpDn1fhQKzTtP/TMIWO0Y=`
    - Hex: `d73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46`
- Base
  - Bridge contract: `0x83f0644FF860423539Dc6b6cA6d3b05a6F03337B`
  - Fast bridge: `fast1a4fza9xc8jcm7jp64a0ugtuyw3hkkmje02e8af9aaer4r0je4dpqz4uf58`
  - Bundled relayer URL: `https://testnet.allset.fast.xyz/base/relayer/relay`
  - Bundled Fast token id
    - Base64: `h05gNlCWQLUt1eqN9xhob4g/UE7CrkL7BSVMhmuqfWU=`
    - Hex: `874e6036509640b52dd5ea8df718686f883f504ec2ae42fb05254c866baa7d65`

## Migration

- Root imports are now pure-helper only.
- Move provider, executor, wallet, and config imports to `@fastxyz/allset-sdk/node`.
- Use the root, `core`, or `browser` entrypoints for deposit planning and intent building.

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

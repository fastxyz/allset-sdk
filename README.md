# AllSet SDK

Bridge tokens between Fast network and EVM chains.

## Installation

Pure helpers only:

```bash
npm install @fastxyz/allset-sdk
```

FastWallet-backed withdrawals and intent execution:

```bash
npm install @fastxyz/allset-sdk @fastxyz/sdk
```

`@fastxyz/sdk` is optional for pure helpers and EVM -> Fast deposits. Install it when you use `FastWallet` flows such as `sendToExternal(...)` or `executeIntent(...)`.

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

## Current Hosted Endpoints

These are the currently used hosted endpoints and token IDs for the public testnet environment:

- Portal: `https://testnet.allset.fast.xyz`
- Fast proxy: `https://testnet.api.fast.xyz/proxy`
- Cross-sign: `https://testnet.cross-sign.allset.fast.xyz`

Current Fast token IDs:

- `testUSDC` testnet token id
  - Base64: `nFL+lGX1e8UmwRqgwEj9hwmqRqvAbRXIDL7ZJj1NTfg=`
  - Hex: `9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8`
- `fastUSDC` mainnet token id
  - Base64: `tP2rhGNydA90frS2SsDCLqoVkRPy01sHUCcGX7pBk2U=`
  - Hex: `b4fdab846372740f747eb4b64ac0c22eaa159113f2d35b075027065fba419365`

Bundled testnet chain routes:

- Ethereum Sepolia
  - Bridge contract: `0x67C5f02df93f2144C6a4e4Fb48D92cE91Cfbc3A6`
  - Fast bridge: `fast1fxtkgpwcy7hnakw96gg7relph4wxx7ghrukm723p3l9adxuxljzsc6f958`
  - Relayer base URL: `https://testnet.allset.fast.xyz/ethereum-sepolia/relayer`
  - Bundled relayer submit URL: `https://testnet.allset.fast.xyz/ethereum-sepolia/relayer/relay`
  - Fast token id: `testUSDC`
- Arbitrum Sepolia
  - Bridge contract: `0x67C5f02df93f2144C6a4e4Fb48D92cE91Cfbc3A6`
  - Fast bridge: `fast1tkmtqxulhnzeeg9zhuwxy3x95wr7waytm9cq40ndf7tkuwwcc6jseg24j8`
  - Relayer base URL: `https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer`
  - Bundled relayer submit URL: `https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer/relay`
  - Fast token id: `testUSDC`
- Base
  - Bridge contract: `0x41cE437493f2a9DDA9214aE7b3662175bBe54a6c`
  - Fast bridge: `fast1a4fza9xc8jcm7jp64a0ugtuyw3hkkmje02e8af9aaer4r0je4dpqz4uf58`
  - Relayer base URL: `https://testnet.allset.fast.xyz/base/relayer`
  - Bundled relayer submit URL: `https://testnet.allset.fast.xyz/base/relayer/relay`
  - Bundled Fast token id: `fastUSDC`

Note: the SDK currently posts to the explicit `/relay` endpoint. The plain `/relayer` URL above is included as a reference base URL.

## Migration

- Root imports are now pure-helper only.
- Move provider, executor, wallet, and config imports to `@fastxyz/allset-sdk/node`.
- Use the root, `core`, or `browser` entrypoints for deposit planning and intent building.

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

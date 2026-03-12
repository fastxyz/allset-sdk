---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum, use sendToFast for deposits (EVM→Fast),
  use sendToExternal for withdrawals (Fast→EVM), or debug bridge errors such as TOKEN_NOT_FOUND,
  INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION, and relayer or transaction failures.
metadata:
  version: 0.1.3
---

# AllSet SDK

Use this skill for work in this repository or in another codebase that needs to consume this package.

It assumes Node.js 20+ and network access to EVM RPC endpoints and AllSet relayer URLs.

## Prerequisites

This SDK requires `@fastxyz/sdk` as a peer dependency:

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## What This SDK Does

This package exports:

- `AllSetProvider`: configurable provider for network/chain settings and bridging
- `createEvmExecutor(privateKey, rpcUrl, chainId)`: a viem-based EVM transaction executor
- `createEvmWallet(keyOrPath?)`: generate, derive, or load EVM wallets
- `saveEvmWallet(wallet, path)`: persist EVM wallets to disk
- `evmSign(certificate, crossSignUrl?)`: AllSet-specific cross-signing

**Directory Structure:**

```
~/.allset/
├── networks.json          # Custom network config (overrides bundled defaults)
└── .evm/
    └── keys/
        └── default.json   # EVM wallet keyfiles
```

**Important:** This SDK no longer exports Fast wallet/client utilities. Use `FastWallet` and `FastProvider` from `@fastxyz/sdk` instead.

## Current Support Matrix

- Network support is `testnet` only (mainnet config is placeholder).
- Configured EVM chains are `ethereum` (Sepolia) and `arbitrum` (Sepolia).
- Token: USDC on EVM chains, fastUSDC on Fast network.
- Users can override config by creating `~/.allset/networks.json`.

## Files To Read

Read only what you need:

- `src/index.ts` for public exports
- `src/provider.ts` for AllSetProvider class and directory utilities
- `src/config.ts` for network configuration loading
- `src/bridge.ts` for bridge logic, deposit/withdrawal flows, and relayer behavior
- `src/evm-executor.ts` for the viem transaction executor
- `src/types.ts` for type definitions
- `data/networks.json` for network/chain/token configuration

## Workflow

### 1. Confirm the requested flow

Classify the task first:

- **Deposit**: EVM to Fast → use `sendToFast()`
- **Withdrawal**: Fast to EVM → use `sendToExternal()`
- SDK integration or debugging

### 2. Setting up AllSetProvider

```ts
import { AllSetProvider } from '@fastxyz/allset-sdk';

// Default testnet
const allset = new AllSetProvider();

// Mainnet
const allset = new AllSetProvider({ network: 'mainnet' });

// Custom config file
const allset = new AllSetProvider({ configPath: './my-networks.json' });
```

**Configuration loading order:**

1. Custom path (if `configPath` provided)
2. `~/.allset/networks.json` (user override)
3. Bundled `data/networks.json` (package default)

### 3. Creating EVM Wallets

```ts
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

// Generate new wallet
const wallet = createEvmWallet();

// Derive from existing private key
const wallet = createEvmWallet('0x1234...64hexchars...');

// Load from file (auto-detected by path)
const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// Save wallet
saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');
```

### 4. Deposit (EVM → Fast)

Use `sendToFast()` to deposit tokens from an EVM chain to Fast network.

**Example: Deposit to your own Fast address**

```ts
import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk';

const allset = new AllSetProvider({ network: 'testnet' });
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');

const evmExecutor = createEvmExecutor(
  evmWallet.privateKey,
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614,
);

const result = await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',  // 1 USDC (6 decimals)
  from: evmWallet.address,
  to: 'fast1youraddress',
  evmExecutor,
});

console.log('TX Hash:', result.txHash);
```

**Example: Deposit to a different Fast address**

```ts
const result = await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: evmWallet.address,
  to: 'fast1recipientaddress',  // Any valid Fast address
  evmExecutor,
});
```

### 5. Withdraw (Fast → EVM)

Use `sendToExternal()` to withdraw tokens from Fast network to an EVM chain.

**Example: Withdraw to your own EVM address**

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

const result = await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',  // 1 fastUSDC (6 decimals)
  from: fastWallet.address,
  to: '0xYourEvmAddress',
  fastWallet,
});

console.log('TX Hash:', result.txHash);
```

**Example: Withdraw to a different EVM address**

```ts
const result = await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: '0xRecipientEvmAddress',  // Any valid EVM address
  fastWallet,
});
```

### 6. Same-Key Pattern

Use the same private key for both Fast and EVM wallets:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

// Derive EVM wallet from Fast private key
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);

console.log('Fast address:', fastWallet.address);
console.log('EVM address:', evmWallet.address);
```

## API Reference

### `AllSetProvider`

Configurable provider for AllSet bridge operations.

**Constructor:**

```ts
new AllSetProvider(options?: AllSetProviderOptions)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network` | `'testnet' \| 'mainnet'` | `'testnet'` | Network to use |
| `configPath` | `string?` | — | Custom path to networks.json |
| `crossSignUrl` | `string?` | — | Override cross-sign service URL |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `network` | `string` | Current network name |
| `crossSignUrl` | `string` | Cross-sign service URL |
| `chains` | `string[]` | List of supported chain names |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `sendToFast(params)` | `Promise<BridgeResult>` | Deposit EVM → Fast |
| `sendToExternal(params)` | `Promise<BridgeResult>` | Withdraw Fast → EVM |
| `getChainConfig(chain)` | `ChainConfig \| null` | Get chain configuration |
| `getTokenConfig(chain, token)` | `TokenConfig \| null` | Get token configuration |
| `getNetworkConfig()` | `NetworkConfig` | Get full network config |

### `sendToFast(params)`

Deposit tokens from EVM chain to Fast network.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | `string` | Yes | EVM chain: `'ethereum'` or `'arbitrum'` |
| `token` | `string` | Yes | Token symbol (e.g., `'USDC'`) |
| `amount` | `string` | Yes | Amount in smallest units |
| `from` | `string` | Yes | Sender's EVM address (0x...) |
| `to` | `string` | Yes | Receiver's Fast address (fast1...) |
| `evmExecutor` | `EvmTxExecutor` | Yes | From `createEvmExecutor()` |

**Returns:** `Promise<{ txHash: string; orderId: string; estimatedTime?: string }>`

### `sendToExternal(params)`

Withdraw tokens from Fast network to EVM chain.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | `string` | Yes | EVM chain: `'ethereum'` or `'arbitrum'` |
| `token` | `string` | Yes | Token symbol (e.g., `'fastUSDC'`) |
| `amount` | `string` | Yes | Amount in smallest units |
| `from` | `string` | Yes | Sender's Fast address (fast1...) |
| `to` | `string` | Yes | Receiver's EVM address (0x...) |
| `fastWallet` | `FastWallet` | Yes | From `@fastxyz/sdk` |

**Returns:** `Promise<{ txHash: string; orderId: string; estimatedTime?: string }>`

### `createEvmExecutor(privateKey, rpcUrl, chainId)`

Create an EVM transaction executor for deposit operations.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `privateKey` | `string` | EVM private key (hex, with or without `0x` prefix) |
| `rpcUrl` | `string` | EVM RPC endpoint URL |
| `chainId` | `number` | Chain ID (`421614` for Arbitrum Sepolia, `11155111` for Ethereum Sepolia) |

**Returns:** `EvmTxExecutor`

### `createEvmWallet(keyOrPath?)`

Create, derive, or load an EVM wallet.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyOrPath` | `string?` | Optional. Private key (64 hex chars) or file path |

**Path detection:** Contains `/` or `~`, or ends with `.json` → file path. Otherwise → private key.

**Returns:** `{ privateKey: string; address: string }`

### `saveEvmWallet(wallet, path)`

Save an EVM wallet to a JSON file.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `EvmWallet` | Wallet with `privateKey` and `address` |
| `path` | `string` | File path (supports `~` expansion) |

### `evmSign(certificate, crossSignUrl?)`

Request EVM cross-signing for a Fast network certificate. Used internally by `sendToExternal()`.

**Returns:** `Promise<{ transaction: number[]; signature: string }>`

## Troubleshooting

### `INVALID_PARAMS`

- `sendToFast`: Missing `evmExecutor`
- `sendToExternal`: Missing `fastWallet`

### `INVALID_ADDRESS`

- Deposit: Receiver must be valid Fast address (fast1...)
- Withdraw: Receiver must be valid EVM address (0x...)

### `TOKEN_NOT_FOUND`

- Token not configured in `data/networks.json`
- Supported: USDC, fastUSDC

### `UNSUPPORTED_OPERATION`

- Chain not supported (use `ethereum` or `arbitrum`)

### `TX_FAILED`

- Transaction reverted
- Insufficient balance
- Check allowance for ERC-20 deposits

## Common Requests This Skill Should Trigger On

- "Deposit USDC from Arbitrum to Fast"
- "Withdraw fastUSDC to Arbitrum"
- "Bridge tokens between Fast and EVM"
- "Use sendToFast / sendToExternal"
- "Why do I get TOKEN_NOT_FOUND?"
- "Derive EVM wallet from Fast private key"

## Requests This Skill Should Not Own

- Generic EVM wallet work unrelated to bridging
- Full Fast wallet implementation (use `@fastxyz/sdk`)
- Mainnet operations (testnet only for now)

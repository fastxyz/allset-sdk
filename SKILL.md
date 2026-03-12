---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum, use sendToFast for deposits (EVM→Fast),
  use sendToExternal for withdrawals (Fast→EVM), use executeIntent for advanced custom operations,
  or debug bridge errors such as TOKEN_NOT_FOUND, INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION.
metadata:
  version: 0.1.3
---

# AllSet SDK

Use this skill for work in this repository or in another codebase that needs to consume this package.

## Prerequisites

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## What This SDK Does

**Core Functions:**
- `sendToFast()` — Deposit tokens from EVM to Fast
- `sendToExternal()` — Withdraw tokens from Fast to EVM
- `executeIntent()` — Advanced: execute custom intents on EVM

**Intent Builders:**
- `buildTransferIntent(token, receiver)` — ERC-20 transfer
- `buildExecuteIntent(target, calldata, value?)` — Generic contract call
- `buildDepositBackIntent(token, fastReceiver)` — Deposit back to Fast
- `buildRevokeIntent()` — Cancel pending intent

**Utilities:**
- `createEvmExecutor(privateKey, rpcUrl, chainId)` — EVM transaction executor
- `createEvmWallet(keyOrPath?)` — Generate/load EVM wallet
- `saveEvmWallet(wallet, path)` — Save wallet to file

## Workflow

### 1. Confirm the requested flow

Classify the task first:

- **Deposit**: EVM to Fast → use `sendToFast()`
- **Withdrawal**: Fast to EVM → use `sendToExternal()`
- **Advanced**: Custom intents (swap, protocol calls) → use `executeIntent()`
- **SDK integration**: importing package, wiring executors/wallets
- **Debugging**: interpreting thrown `FastError`

Do not start coding until you confirm the requested chain, token, and direction are actually supported.

### 2. Setting up AllSetProvider

```ts
import { AllSetProvider } from '@fastxyz/allset-sdk';

// Default testnet
const allset = new AllSetProvider();

// Mainnet (when available)
const allset = new AllSetProvider({ network: 'mainnet' });

// Custom config file
const allset = new AllSetProvider({ configPath: './my-networks.json' });
```

**Configuration loading order:**

1. Custom path (if `configPath` provided)
2. `~/.allset/networks.json` (user override)
3. Bundled `data/networks.json` (package default)

### 3. (Optional) Setting up EVM Wallet

If you need to manage EVM wallets, the SDK provides utilities. This is optional — you can also pass a private key directly to `createEvmExecutor()`.

```ts
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

// Generate new wallet
const wallet = createEvmWallet();

// Load from file
const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// Derive from existing private key
const wallet = createEvmWallet('0x1234...privateKey...');

// Save wallet for later use
saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');
```

**Same-key pattern:** Use the same private key for both Fast and EVM:

```ts
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);
// Now fastWallet.address and evmWallet.address share the same key
```

### 4. Use the correct execution path

- **Deposit** requires `evmExecutor` from `createEvmExecutor()`
- **Withdrawal** requires `fastWallet` from `@fastxyz/sdk`
- **Advanced intents** require `fastWallet` + array of `Intent` objects

> **See the [Examples](#examples) section below for complete code samples of each execution path.**

### 5. Respect implementation details

- Network/chain/token config is in `data/networks.json`
- Token resolution handles `fastUSDC` → `USDC` normalization
- The package throws `FastError` from `@fastxyz/sdk`

Do not invent additional token aliases, chain IDs, or mainnet support unless added to config.

### 6. Validate after edits

If you change code in this repo:

1. Update the implementation in `src/`
2. Keep `README.md` and this `SKILL.md` aligned
3. Run `npm run build`
4. Run `npm test`
5. Report any remaining gaps

## Directory Structure

```
~/.allset/
├── networks.json          # Custom network config (overrides bundled)
└── .evm/
    └── keys/
        └── default.json   # EVM wallet keyfiles
```

## Current Support Matrix

- Networks: `testnet` only (mainnet placeholder)
- Chains: `ethereum` (Sepolia), `arbitrum` (Sepolia)
- Tokens: USDC, fastUSDC

## API Reference

### AllSetProvider

```ts
const allset = new AllSetProvider({ network: 'testnet' });
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network` | `'testnet' \| 'mainnet'` | `'testnet'` | Network |
| `configPath` | `string?` | — | Custom config path |
| `crossSignUrl` | `string?` | — | Override cross-sign URL |

**Methods:**

| Method | Description |
|--------|-------------|
| `sendToFast(params)` | Deposit EVM → Fast |
| `sendToExternal(params)` | Withdraw Fast → EVM |
| `executeIntent(params)` | Execute custom intents |
| `getChainConfig(chain)` | Get chain configuration |
| `getTokenConfig(chain, token)` | Get token configuration |

### sendToFast(params)

Deposit tokens from EVM chain to Fast network.

```ts
await allset.sendToFast({
  chain: 'arbitrum',           // EVM chain
  token: 'USDC',               // Token symbol
  amount: '1000000',           // Amount (smallest units)
  from: '0xEvmAddress',        // Sender EVM address
  to: 'fast1ReceiverAddress',  // Receiver Fast address
  evmExecutor,                 // From createEvmExecutor()
});
```

### sendToExternal(params)

Withdraw tokens from Fast network to EVM chain.

```ts
await allset.sendToExternal({
  chain: 'arbitrum',           // EVM chain
  token: 'fastUSDC',           // Token symbol
  amount: '1000000',           // Amount (smallest units)
  from: fastWallet.address,    // Sender Fast address
  to: '0xEvmAddress',          // Receiver EVM address
  fastWallet,                  // From @fastxyz/sdk
});
```

### executeIntent(params)

Execute custom intents on EVM chain. This is the advanced API for composing operations like swaps, multi-step transactions, or protocol integrations.

```ts
import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';

// Simple transfer (equivalent to sendToExternal)
await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [buildTransferIntent(USDC_ADDRESS, '0xRecipient')],
});

// Custom contract call
await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [buildExecuteIntent(CONTRACT_ADDRESS, encodedCalldata)],
  deadlineSeconds: 7200,  // Optional: 2 hours (default: 1 hour)
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | `string` | Yes | EVM chain: `'ethereum'` or `'arbitrum'` |
| `fastWallet` | `FastWallet` | Yes | From `@fastxyz/sdk` |
| `token` | `string` | Yes | Token to transfer to bridge |
| `amount` | `string` | Yes | Amount in smallest units |
| `intents` | `Intent[]` | Yes | Array of intents to execute |
| `deadlineSeconds` | `number` | No | Deadline (default: 3600) |

## Intent Builders

### buildTransferIntent(token, receiver)

Build intent to transfer ERC-20 tokens to an address.

```ts
const intent = buildTransferIntent(
  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC address
  '0xRecipientAddress'
);
```

### buildExecuteIntent(target, calldata, value?)

Build intent for generic contract calls.

```ts
import { encodeFunctionData } from 'viem';

const calldata = encodeFunctionData({
  abi: contractAbi,
  functionName: 'someFunction',
  args: [arg1, arg2],
});

const intent = buildExecuteIntent(
  '0xContractAddress',
  calldata,
  0n  // Optional: ETH value to send
);
```

### buildDepositBackIntent(token, fastReceiver)

Build intent to deposit tokens back to Fast network.

```ts
const intent = buildDepositBackIntent(
  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC
  'fast1recipientaddress...'
);
```

### buildRevokeIntent()

Build intent to cancel/revoke pending operations.

```ts
const intent = buildRevokeIntent();
```

## Intent Action Types

```ts
enum IntentAction {
  Execute = 0,         // Generic contract call
  DynamicTransfer = 1, // ERC-20 transfer
  DynamicDeposit = 2,  // Deposit back to Fast
  Revoke = 3,          // Cancel intent
}
```

## Examples

### Deposit to your own Fast address

```ts
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

### Deposit to a different Fast address

```ts
await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: evmWallet.address,
  to: 'fast1recipientaddress',  // Different receiver
  evmExecutor,
});
```

### Withdraw to your own EVM address

```ts
await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: evmWallet.address,
  fastWallet,
});
```

### Withdraw to a different EVM address

```ts
await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: '0xRecipientAddress',  // Different receiver
  fastWallet,
});
```

## Troubleshooting

### `INVALID_PARAMS`

- `sendToFast`: Missing `evmExecutor`
- `sendToExternal`: Missing `fastWallet`
- `executeIntent`: Missing `fastWallet` or empty `intents`

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
- Relayer rejected the request

## Files To Read

- `src/index.ts` — Public exports
- `src/provider.ts` — AllSetProvider class
- `src/bridge.ts` — Bridge logic, executeIntent
- `src/intents.ts` — Intent builders
- `src/types.ts` — Type definitions
- `data/networks.json` — Network configuration

## Common Requests

- "Deposit USDC from Arbitrum to Fast" → `sendToFast`
- "Withdraw fastUSDC to Arbitrum" → `sendToExternal`
- "Execute custom intent" → `executeIntent`
- "Build a swap intent" → `buildExecuteIntent` with swap calldata

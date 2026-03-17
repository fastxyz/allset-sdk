---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and supported EVM chains, use sendToFast for deposits (EVM→Fast),
  use sendToExternal for withdrawals (Fast→EVM), use executeIntent for advanced custom operations,
  or debug bridge errors such as TOKEN_NOT_FOUND, INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION.
metadata:
  version: 0.1.2
---

# AllSet SDK

Use this skill for work in this repository or in another codebase that needs to consume this package.

## Prerequisites

```bash
npm install @fastxyz/allset-sdk
```

For the Node bridge runtime APIs (`AllSetProvider`, `sendToFast`, `sendToExternal`, `executeIntent`, `evmSign`), also install:

```bash
npm install @fastxyz/sdk
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
- `createEvmWallet(keyOrPath?)` — Generate, derive, or load EVM account
- `createEvmExecutor(account, rpcUrl, chainId)` — Create viem clients for EVM operations

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
import { AllSetProvider } from '@fastxyz/allset-sdk/node';

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
3. Embedded package defaults from `src/default-config.ts`

### 3. Setting up EVM Wallet

The `createEvmWallet()` function returns an Account-compatible object with viem signing methods and `privateKey`.

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk/node';

// Generate new wallet
const generatedAccount = createEvmWallet();
console.log(generatedAccount.privateKey); // persist this if you generated it

// Derive from private key
const derivedAccount = createEvmWallet('0x1234...64hexchars');

// Load from keyfile
const keyfileAccount = createEvmWallet('~/.evm/keys/default.json');

// Access the address
console.log(keyfileAccount.address); // 0x...
```

**Keyfile format:**
```json
{
  "privateKey": "abc123...64hexchars",
  "address": "0x..." // optional, for reference
}
```

It is the user's responsibility to create and manage keyfiles.

**Using viem directly:** You can also use viem's `privateKeyToAccount()`:

```ts
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount('0xabc...');
```

### 4. Setting up EVM Executor

The `createEvmExecutor()` function returns `{ walletClient, publicClient }` for EVM operations.

```ts
import { createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk/node';

const account = createEvmWallet('~/.evm/keys/default.json');
const evmClients = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);

// evmClients contains { walletClient, publicClient }
```

**Important:** `createEvmExecutor` accepts viem `Account` values, including the objects returned by `createEvmWallet()`.

### 5. Use the correct execution path

- **Deposit** requires `evmClients` from `createEvmExecutor()`
- **Withdrawal** requires `fastWallet` from `@fastxyz/sdk`
- **Advanced intents** require `fastWallet` + array of `Intent` objects

> **See the [Examples](#examples) section below for complete code samples of each execution path.**

### 6. Respect implementation details

- Network/chain/token defaults are in `src/default-config.ts`
- Token resolution handles `fastUSDC` / `testUSDC` → `USDC` normalization
- The package throws `FastError` from `@fastxyz/sdk`

Do not invent additional token aliases, chain IDs, or mainnet support unless added to config.

### 7. Validate after edits

If you change code in this repo:

1. Update the implementation in `src/`
2. Keep `README.md` and this `SKILL.md` aligned
3. Run `npm run build`
4. Run `npm test`
5. Report any remaining gaps

## Directory Structure

```
~/.evm/
└── keys/
    └── default.json   # EVM wallet keyfiles (user-managed)

~/.allset/
└── networks.json      # Custom network config (overrides embedded defaults)
```

## Current Support Matrix

- Networks: `testnet` only (mainnet placeholder)
- Chains: `ethereum` (Sepolia), `arbitrum` (Sepolia), `base` (mainnet, connected to testnet)
- Tokens: USDC, fastUSDC, testUSDC

## API Reference

### createEvmWallet

Create or load an EVM account.

```ts
function createEvmWallet(keyOrPath?: string): Account
```

**Parameters:**
- `keyOrPath` (optional):
  - Omitted: generates new random wallet
  - Private key string (64 hex chars, with/without 0x): derives account
  - File path (contains `/`, `~`, or ends with `.json`): loads from keyfile

**Returns:** viem `Account` object

### createEvmExecutor

Create viem clients for EVM operations.

```ts
function createEvmExecutor(account: Account, rpcUrl: string, chainId: number): EvmClients
```

**Parameters:**
- `account` — viem Account from `createEvmWallet()` or `privateKeyToAccount()`
- `rpcUrl` — RPC endpoint URL
- `chainId` — Chain ID (11155111 for Sepolia, 421614 for Arbitrum Sepolia)

**Returns:** `{ walletClient, publicClient }`

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
  from: account.address,       // Sender EVM address
  to: 'fast1ReceiverAddress',  // Receiver Fast address
  evmClients,                  // From createEvmExecutor()
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
  to: account.address,         // Receiver EVM address
  fastWallet,                  // From @fastxyz/sdk
});
```

### executeIntent(params)

Execute custom intents on EVM chain.

```ts
import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';

await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [buildTransferIntent(USDC_ADDRESS, '0xRecipient')],
});
```

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

## Examples

### Deposit to Fast

```ts
const account = createEvmWallet('~/.evm/keys/default.json');
const evmClients = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);

await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: account.address,
  to: fastWallet.address,
  evmClients,
});
```

### Withdraw to EVM

```ts
await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: account.address,
  fastWallet,
});
```

## Troubleshooting

### `INVALID_PARAMS`

- `sendToFast`: Missing `evmClients`
- `sendToExternal`: Missing `fastWallet`
- `executeIntent`: Missing `fastWallet` or empty `intents`

### `INVALID_ADDRESS`

- Deposit: Receiver must be valid Fast address (fast1...)
- Withdraw: Receiver must be valid EVM address (0x...)

### `TOKEN_NOT_FOUND`

- Token not configured in `src/default-config.ts` or the active custom config
- Supported: USDC, fastUSDC

### `UNSUPPORTED_OPERATION`

- Chain not supported (use `ethereum` or `arbitrum`)

### `TX_FAILED`

- Transaction reverted
- Insufficient balance
- Relayer rejected the request

## Files To Read

- `src/index.ts` — Pure helper exports
- `src/node/index.ts` — Node runtime exports
- `src/provider.ts` — AllSetProvider class
- `src/bridge.ts` — Bridge logic, executeIntent
- `src/evm-executor.ts` — EVM wallet and client utilities
- `src/intents.ts` — Intent builders
- `src/types.ts` — Type definitions
- `src/default-config.ts` — Bundled default network configuration

## Common Requests

- "Deposit USDC from Arbitrum to Fast" → `sendToFast`
- "Withdraw fastUSDC to Arbitrum" → `sendToExternal`
- "Execute custom intent" → `executeIntent`
- "Generate new EVM wallet" → `createEvmWallet()`
- "Load wallet from keyfile" → `createEvmWallet(path)`

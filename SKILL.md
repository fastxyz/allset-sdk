---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum Sepolia, wire createEvmExecutor with FastWallet,
  add examples or scripts around allsetProvider.bridge, or debug bridge errors such as TOKEN_NOT_FOUND,
  INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION, and relayer or transaction failures.
metadata:
  version: 0.1.2
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

- `allsetProvider`: the bridge provider with `bridge(...)`
- `createEvmExecutor(privateKey, rpcUrl, chainId)`: a viem-based EVM transaction executor
- `createEvmWallet(privateKey?)`: utility to generate or derive EVM wallets
- `evmSign(certificate, crossSignUrl?)`: AllSet-specific cross-signing

**Important:** This SDK no longer exports Fast wallet/client utilities. Use `FastWallet` and `FastProvider` from `@fastxyz/sdk` instead. Refer to the [fast-sdk repository](https://github.com/fastxyz/fast-sdk) or the `@fastxyz/sdk` package documentation for the different ways to set up the provider and wallet.

## Current Support Matrix

Before writing code or telling the user a route is supported, check these constraints:

- Network support is `testnet` only.
- The bridge provider handles Fast to EVM and EVM to Fast flows only.
- Configured EVM chains are `ethereum` and `arbitrum`.
- `createEvmExecutor(...)` only supports chain IDs `11155111` (Ethereum Sepolia) and `421614` (Arbitrum Sepolia).
- The live token registry in `src/bridge.ts` currently maps only Arbitrum Sepolia `USDC` and `fastUSDC`.
- Ethereum Sepolia has bridge config, but no shipped token mapping yet. Do not claim Ethereum token bridging works unless you add the missing token definitions.

If the user asks for unsupported routes, say so clearly and point to the exact limit in `src/bridge.ts`.

## Files To Read

Read only what you need:

- `src/index.ts` for public exports
- `src/bridge.ts` for chain config, token resolution, deposit flow, withdrawal flow, and relayer behavior
- `src/evm-executor.ts` for the viem transaction executor
- `src/types.ts` for the `EvmTxExecutor` and `BridgeProvider` interfaces
- `README.md` for human-facing usage examples

## Workflow

### 1. Confirm the requested flow

Classify the task first:

- Deposit: EVM to Fast
- Withdrawal: Fast to EVM
- SDK integration: importing package, wiring executor, or passing a `fastWallet`
- SDK extension: adding chains, tokens, examples, or scripts
- Debugging: interpreting a thrown `FastError`

Do not start coding until you confirm the requested chain, token, and direction are actually supported by the current implementation.

### 2. Use the correct execution path

#### Deposit (EVM → Fast)

- Require `evmExecutor`
- Require a Fast bech32m receiver address (`fast1...`)
- Use `createEvmExecutor(...)` unless the user already has a compatible executor
- Call `allsetProvider.bridge(...)` with `fromChain` set to the EVM chain and `toChain: 'fast'`

Example:

```ts
import { createEvmExecutor, allsetProvider } from '@fastxyz/allset-sdk';

// Your EVM wallet that holds USDC
const evmExecutor = createEvmExecutor(
  '<senderEvmPrivateKey>',  // Private key of the sender wallet
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614,
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

#### Withdraw (Fast → EVM)

- Require `fastWallet` from `@fastxyz/sdk`
- Refer to the [fast-sdk repository](https://github.com/fastxyz/fast-sdk) or `@fastxyz/sdk` package for the different ways to set up the provider and wallet (e.g., `fromKeyfile`, `fromPrivateKey`, `generate`)
- Use an EVM receiver address (`0x...`)
- Call `allsetProvider.bridge(...)` with `fromChain: 'fast'`

**Example: Withdraw to your own EVM address**

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider } from '@fastxyz/allset-sdk';

// Create Fast wallet (see @fastxyz/sdk for setup options)
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

**Example: Withdraw to a different receiver**

You can withdraw to any EVM address, not just your own:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Withdraw to a different EVM address (e.g., another user, merchant, exchange)
const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: fastWallet.address,
  receiverAddress: '0xRecipientEvmAddress',  // Any valid EVM address
  fastWallet,
});
```

### 3. Creating EVM Wallets

The `createEvmWallet()` function supports multiple patterns:

#### Generate a new random wallet

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk';

const wallet = createEvmWallet();
console.log('Private key:', wallet.privateKey);
console.log('Address:', wallet.address);
// Store privateKey securely!
```

#### Derive from an existing private key

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk';

// Use an existing private key (with or without 0x prefix)
const wallet = createEvmWallet('0x1234...your64hexchars...');
console.log('Address:', wallet.address);
```

#### Same-key pattern (derive from Fast wallet)

Use the same private key for both Fast and EVM networks:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Derive EVM address from Fast private key
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);

console.log('Fast address:', fastWallet.address);
console.log('EVM address:', evmWallet.address);
```

### 4. Respect implementation details

When reasoning about behavior, use the code as the source of truth:

- Token resolution is driven by `CHAIN_TOKENS` in `src/bridge.ts`
- Supported bridge routes are enforced in `allsetProvider.bridge(...)`
- Withdrawal posts to the relayer URL from `CHAIN_CONFIGS`
- The package throws `FastError` from `@fastxyz/sdk`

Do not invent additional token aliases, chain IDs, or mainnet support.

### 5. Validate after edits

If you change code in this repo:

1. Update the implementation in `src/`
2. Keep `README.md` and this `SKILL.md` aligned with any capability changes
3. Run `npm run build`
4. Run `npm test`
5. Report any remaining gaps explicitly

## API Reference

### `allsetProvider.bridge(params)`

Bridge tokens between Fast network and EVM chains.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromChain` | `string` | Yes | Source chain: `'fast'`, `'ethereum'`, or `'arbitrum'` |
| `toChain` | `string` | Yes | Destination chain: `'fast'`, `'ethereum'`, or `'arbitrum'` |
| `fromToken` | `string` | Yes | Source token symbol or address |
| `toToken` | `string` | Yes | Destination token symbol or address |
| `fromDecimals` | `number` | Yes | Token decimals (e.g., `6` for USDC) |
| `amount` | `string` | Yes | Amount in smallest units (e.g., `'1000000'` for 1 USDC) |
| `senderAddress` | `string` | Yes | Sender's address on source chain |
| `receiverAddress` | `string` | Yes | Receiver's address on destination chain |
| `evmExecutor` | `EvmTxExecutor` | Deposits only | EVM executor from `createEvmExecutor()` |
| `fastWallet` | `FastWallet` | Withdrawals only | FastWallet from `@fastxyz/sdk` |

**Returns:** `Promise<{ txHash: string; orderId: string; estimatedTime?: string }>`

**Example:**

```ts
const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: fastWallet.address,
  receiverAddress: '0xReceiverAddress',
  fastWallet,
});

console.log('TX Hash:', result.txHash);
console.log('Order ID:', result.orderId);
```

### `createEvmExecutor(privateKey, rpcUrl, chainId)`

Create an EVM transaction executor for deposit operations.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `privateKey` | `string` | EVM private key (hex, with or without `0x` prefix) |
| `rpcUrl` | `string` | EVM RPC endpoint URL |
| `chainId` | `number` | Chain ID (`421614` for Arbitrum Sepolia, `11155111` for Ethereum Sepolia) |

**Returns:** `EvmTxExecutor`

**Example:**

```ts
const evmExecutor = createEvmExecutor(
  '<yourPrivateKey>',
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614,
);
```

### `createEvmWallet(privateKey?)`

Create or derive an EVM wallet.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `privateKey` | `string?` | Optional. If provided, derives address from it. If omitted, generates a new random wallet. |

**Returns:** `{ privateKey: string; address: string }`

**Example:**

```ts
// Generate new wallet
const newWallet = createEvmWallet();

// Derive from existing key
const derivedWallet = createEvmWallet('<existingPrivateKey>');
```

### `evmSign(certificate, crossSignUrl?)`

Request EVM cross-signing for a Fast network certificate. This is used internally by the bridge for withdrawal operations, but is exposed for advanced use cases where you need manual control over the cross-signing process.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `certificate` | `unknown` | The certificate from a `FastWallet.submit()` call |
| `crossSignUrl` | `string?` | Optional. Custom cross-sign service URL. Defaults to AllSet staging. |

**Returns:** `Promise<{ transaction: number[]; signature: string }>`

**When to use:**

- Building custom bridge flows outside of `allsetProvider.bridge()`
- Debugging cross-sign failures
- Implementing multi-step transactions where you need the signed payload before submitting to the relayer

**Example:**

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { evmSign } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Submit a transaction and get the certificate
const submitResult = await fastWallet.submit({
  recipient: 'fast1bridgeaddress...',
  claim: {
    TokenTransfer: {
      token_id: tokenIdBytes,
      amount: '1000000',
      user_data: null,
    },
  },
});

// Cross-sign the certificate for EVM verification
const crossSignResult = await evmSign(submitResult.certificate);

console.log('Signed transaction bytes:', crossSignResult.transaction);
console.log('Signature:', crossSignResult.signature);

// Use these values with the AllSet relayer...
```

## Troubleshooting

### `INVALID_PARAMS`

Common causes:

- Deposit call missing `evmExecutor`
- Withdrawal call missing `fastWallet`

Fix:

- For deposits, create an executor with `createEvmExecutor(...)`
- For withdrawals, provide a `FastWallet` from `@fastxyz/sdk`

### `INVALID_ADDRESS`

Common cause:

- Deposit receiver is not a valid Fast bech32m address

Fix:

- Use a `fast1...` address for EVM to Fast deposits
- Use a `0x...` EVM address for Fast to EVM withdrawals

### `TOKEN_NOT_FOUND`

Common causes:

- Unsupported token symbol
- Unsupported EVM chain token mapping
- Attempting an Ethereum Sepolia bridge without adding token definitions

Fix:

- Inspect `CHAIN_TOKENS` in `src/bridge.ts`
- Add the missing token mapping if the user wants to extend support
- Otherwise tell the user the requested route is not implemented yet

### `UNSUPPORTED_OPERATION`

Common cause:

- Route is not Fast to EVM or EVM to Fast

Fix:

- Restrict usage to Fast-to-EVM or EVM-to-Fast workflows

### `TX_FAILED`

Common causes:

- ERC-20 approval or deposit transaction reverted
- Insufficient balance
- Relayer rejected the withdrawal payload

Fix:

- Check token balance, allowance path, and RPC correctness
- For withdrawals, inspect the relayer response text from the thrown error

## Migration from v0.1.1

If upgrading from a previous version that used `createFastClient`:

**Before (v0.1.1 and earlier):**
```ts
import { createFastClient, createFastWallet, allsetProvider } from '@fastxyz/allset-sdk';

const wallet = createFastWallet();
const fastClient = createFastClient({
  privateKey: wallet.privateKey,
  publicKey: wallet.publicKey,
});

await allsetProvider.bridge({ ..., fastClient });
```

**After (v0.1.2+):**
```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

await allsetProvider.bridge({ ..., fastWallet });
```

## Common Requests This Skill Should Trigger On

- "Use the AllSet SDK to bridge USDC from Arbitrum Sepolia to Fast"
- "Add a Node script that deposits through allsetProvider"
- "Wire createEvmExecutor into this backend"
- "Use a FastWallet to withdraw fastUSDC to Arbitrum"
- "Withdraw fastUSDC to a different EVM address"
- "Why do I get TOKEN_NOT_FOUND from allset-sdk?"
- "Extend this SDK to support another token or chain"
- "Derive an EVM wallet from my Fast private key"
- "How do I use evmSign manually?"

## Requests This Skill Should Not Own

- Generic EVM wallet work unrelated to AllSet bridging
- Full Fast wallet implementation (use `@fastxyz/sdk`)
- Mainnet bridge guidance when the code only supports testnet
- Claims that Ethereum Sepolia token bridging already works without code changes

---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum Sepolia, wire createEvmExecutor with FastWallet,
  add examples or scripts around allsetProvider.bridge, or debug bridge errors such as TOKEN_NOT_FOUND,
  INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION, and relayer or transaction failures.
metadata:
  version: 0.2.0
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

**Important:** This SDK no longer exports Fast wallet/client utilities. Use `FastWallet` and `FastProvider` from `@fastxyz/sdk` instead.

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

For EVM to Fast deposits:

- Require `evmExecutor`
- Require a Fast bech32m receiver address (`fast1...`)
- Use `createEvmExecutor(...)` unless the user already has a compatible executor
- Call `allsetProvider.bridge(...)` with `fromChain` set to the EVM chain and `toChain: 'fast'`

Example:

```ts
import { createEvmExecutor, allsetProvider } from '@fastxyz/allset-sdk';

const evmExecutor = createEvmExecutor(
  process.env.EVM_PRIVATE_KEY!,
  process.env.ARBITRUM_SEPOLIA_RPC_URL!,
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

For Fast to EVM withdrawals:

- Require `fastWallet` from `@fastxyz/sdk`
- Use an EVM receiver address (`0x...`)
- Call `allsetProvider.bridge(...)` with `fromChain: 'fast'`

Example:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { allsetProvider, createEvmWallet } from '@fastxyz/allset-sdk';

// Create Fast wallet
const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Derive EVM wallet from same key
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);

const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: fastWallet.address,
  receiverAddress: evmWallet.address,
  fastWallet,
});
```

### 3. Same-Key Pattern

For convenience, you can derive an EVM wallet from the same private key as your Fast wallet:

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

## Migration from v0.1.x

If upgrading from a previous version that used `createFastClient`:

**Before (v0.1.x):**
```ts
import { createFastClient, createFastWallet, allsetProvider } from '@fastxyz/allset-sdk';

const wallet = createFastWallet();
const fastClient = createFastClient({
  privateKey: wallet.privateKey,
  publicKey: wallet.publicKey,
});

await allsetProvider.bridge({ ..., fastClient });
```

**After (v0.2.x):**
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
- "Why do I get TOKEN_NOT_FOUND from allset-sdk?"
- "Extend this SDK to support another token or chain"
- "Derive an EVM wallet from my Fast private key"

## Requests This Skill Should Not Own

- Generic EVM wallet work unrelated to AllSet bridging
- Full Fast wallet implementation (use `@fastxyz/sdk`)
- Mainnet bridge guidance when the code only supports testnet
- Claims that Ethereum Sepolia token bridging already works without code changes

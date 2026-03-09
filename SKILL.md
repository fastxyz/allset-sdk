---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast chain and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum Sepolia, wire createEvmExecutor or createFastClient,
  add examples or scripts around allsetProvider.bridge, or debug bridge errors such as TOKEN_NOT_FOUND,
  INVALID_ADDRESS, INVALID_PARAMS, UNSUPPORTED_OPERATION, and relayer or transaction failures.
metadata:
  version: 0.1.0
---

# AllSet SDK

Use this skill for work in this repository or in another codebase that needs to consume this package.

It assumes Node.js 18+ and network access to EVM RPC endpoints and AllSet relayer URLs.

## What This SDK Does

This package exports:

- `allsetProvider`: the bridge provider with `bridge(...)`
- `createEvmExecutor(privateKey, rpcUrl, chainId)`: a viem-based EVM transaction executor
- `createFastClient(options)`: a Fast chain client for withdrawals
- `createEvmWallet()`: utility to generate new EVM wallets

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
- `src/types.ts` for the `FastClient`, `EvmTxExecutor`, and `BridgeProvider` interfaces
- `README.md` for human-facing usage examples

## Workflow

### 1. Confirm the requested flow

Classify the task first:

- Deposit: EVM to Fast
- Withdrawal: Fast to EVM
- SDK integration: importing package, wiring executor, or passing a `fastClient`
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

- Require `fastClient`
- `fastClient` must implement `submit(...)`, `evmSign(...)`, and `address`
- Use an EVM receiver address (`0x...`)
- Call `allsetProvider.bridge(...)` with `fromChain: 'fast'`

Example:

```ts
import { allsetProvider } from '@fastxyz/allset-sdk';

const result = await allsetProvider.bridge({
  fromChain: 'fast',
  toChain: 'arbitrum',
  fromToken: 'fastUSDC',
  toToken: 'USDC',
  fromDecimals: 6,
  amount: '1000000',
  senderAddress: 'fast1yourfastaddress',
  receiverAddress: '0xYourEvmAddress',
  fastClient,
});
```

### 3. Respect implementation details

When reasoning about behavior, use the code as the source of truth:

- Token resolution is driven by `CHAIN_TOKENS` in `src/bridge.ts`
- Supported bridge routes are enforced in `allsetProvider.bridge(...)`
- Withdrawal posts to the relayer URL from `CHAIN_CONFIGS`
- The package throws `FastError`-style errors from `src/fast-compat.ts`

Do not invent additional token aliases, chain IDs, or mainnet support.

### 4. Validate after edits

If you change code in this repo:

1. Update the implementation in `src/`
2. Keep `README.md` and this `SKILL.md` aligned with any capability changes
3. Run `npm run build`
4. Report any remaining gaps explicitly

## Troubleshooting

### `INVALID_PARAMS`

Common causes:

- Deposit call missing `evmExecutor`
- Withdrawal call missing `fastClient`

Fix:

- For deposits, create an executor with `createEvmExecutor(...)`
- For withdrawals, provide a compatible `fastClient`

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

## Common Requests This Skill Should Trigger On

- "Use the AllSet SDK to bridge USDC from Arbitrum Sepolia to Fast"
- "Add a Node script that deposits through allsetProvider"
- "Wire createEvmExecutor into this backend"
- "Use a Fast client to withdraw fastUSDC to Arbitrum"
- "Why do I get TOKEN_NOT_FOUND from allset-sdk?"
- "Extend this SDK to support another token or chain"

## Requests This Skill Should Not Own

- Generic EVM wallet work unrelated to AllSet bridging
- Full Fast wallet implementation
- Mainnet bridge guidance when the code only supports testnet
- Claims that Ethereum Sepolia token bridging already works without code changes

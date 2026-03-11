---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use when the user asks to bridge
  USDC or fastUSDC between Fast and Arbitrum/Ethereum Sepolia, wire createEvmExecutor with FastWallet,
  add examples or scripts around AllSetProvider.bridge, or debug bridge errors such as TOKEN_NOT_FOUND,
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

- `AllSetProvider`: configurable provider for network/chain settings and bridging
- `createEvmExecutor(privateKey, rpcUrl, chainId)`: a viem-based EVM transaction executor
- `createEvmWallet(keyOrPath?)`: generate, derive, or load EVM wallets
- `saveEvmWallet(wallet, path)`: persist EVM wallets to disk
- `evmSign(certificate, crossSignUrl?)`: AllSet-specific cross-signing
- `initUserConfig()`: initialize `~/.allset/networks.json` from defaults

**Directory Structure:**

```
~/.allset/
├── networks.json          # Custom network config (overrides bundled defaults)
└── .evm/
    └── keys/
        └── default.json   # EVM wallet keyfiles
```

**Important:** This SDK no longer exports Fast wallet/client utilities. Use `FastWallet` and `FastProvider` from `@fastxyz/sdk` instead. Refer to the [fast-sdk repository](https://github.com/fastxyz/fast-sdk) or the `@fastxyz/sdk` package documentation for the different ways to set up the provider and wallet.

## Current Support Matrix

Before writing code or telling the user a route is supported, check these constraints:

- Network support is `testnet` only (mainnet config is placeholder).
- The bridge provider handles Fast to EVM and EVM to Fast flows only.
- Configured EVM chains are `ethereum` and `arbitrum` (see `data/networks.json`).
- `createEvmExecutor(...)` only supports chain IDs `11155111` (Ethereum Sepolia) and `421614` (Arbitrum Sepolia).
- Token configuration is in `data/networks.json` — currently USDC on both chains.
- Users can override config by creating `~/.allset/networks.json`.

If the user asks for unsupported routes, say so clearly and point to `data/networks.json`.

## Files To Read

Read only what you need:

- `src/index.ts` for public exports
- `src/provider.ts` for AllSetProvider class and directory utilities
- `src/config.ts` for network configuration loading
- `src/bridge.ts` for bridge logic, deposit/withdrawal flows, and relayer behavior
- `src/evm-executor.ts` for the viem transaction executor
- `src/types.ts` for the `EvmTxExecutor` and `BridgeProvider` interfaces
- `data/networks.json` for network/chain/token configuration
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

### 2. Setting up AllSetProvider

The `AllSetProvider` manages network configuration and provides the `bridge()` method.

#### Default setup (testnet)

```ts
import { AllSetProvider } from '@fastxyz/allset-sdk';

const allset = new AllSetProvider();
// Uses bundled data/networks.json with testnet config
```

#### Mainnet setup

```ts
const allset = new AllSetProvider({ network: 'mainnet' });
```

#### Custom config file

```ts
const allset = new AllSetProvider({ 
  configPath: './my-networks.json' 
});
```

#### Override cross-sign URL

```ts
const allset = new AllSetProvider({ 
  network: 'testnet',
  crossSignUrl: 'https://my-custom-cross-sign.example.com' 
});
```

#### Configuration loading order

The SDK loads configuration in this priority order (first found wins):

1. **Custom path** — If `configPath` is provided in options
2. **User override** — `~/.allset/networks.json` (if exists)
3. **Bundled default** — `data/networks.json` in the package

This allows users to customize config without modifying the package:

```ts
import { initUserConfig } from '@fastxyz/allset-sdk';

// Copy bundled config to ~/.allset/networks.json for customization
initUserConfig();
// Then edit ~/.allset/networks.json with your custom values
```

#### Accessing configuration

```ts
const allset = new AllSetProvider();

// List supported chains
console.log(allset.chains); // ['ethereum', 'arbitrum']

// Get cross-sign URL
console.log(allset.crossSignUrl);

// Get chain config
const arbConfig = allset.getChainConfig('arbitrum');
// { chainId: 421614, bridgeContract: '0x...', fastBridgeAddress: 'fast1...', relayerUrl: '...' }

// Get token config (handles fastUSDC → USDC normalization)
const usdcConfig = allset.getTokenConfig('arbitrum', 'USDC');
// { evmAddress: '0x...', fastTokenId: '...', decimals: 6 }
```

### 3. Creating EVM Wallets

The `createEvmWallet()` function supports multiple patterns — generate, derive from key, or load from file:

#### Generate a new random wallet

```ts
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

const wallet = createEvmWallet();
console.log('Address:', wallet.address);

// Save to file for later use
saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');
```

#### Derive from an existing private key

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk';

// Use an existing private key (with or without 0x prefix)
const wallet = createEvmWallet('0x1234...your64hexchars...');
console.log('Address:', wallet.address);
```

#### Load from a keyfile

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk';

// Load from JSON file (auto-detected by path)
const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');
console.log('Address:', wallet.address);
```

The function auto-detects file paths vs private keys:
- Contains `/` or `~`, or ends with `.json` → loads from file
- Otherwise → treats as private key

#### Same-key pattern (derive from Fast wallet)

Use the same private key for both Fast and EVM networks:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet, saveEvmWallet } from '@fastxyz/allset-sdk';

const provider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// Derive EVM address from Fast private key
const keys = await fastWallet.exportKeys();
const evmWallet = createEvmWallet(keys.privateKey);

console.log('Fast address:', fastWallet.address);
console.log('EVM address:', evmWallet.address);

// Optionally save the derived EVM wallet
saveEvmWallet(evmWallet, '~/.allset/.evm/keys/same-key.json');
```

### 4. Use the correct execution path

#### Deposit (EVM → Fast)

- Require `evmExecutor`
- Require a Fast bech32m receiver address (`fast1...`)
- Use `createEvmExecutor(...)` unless the user already has a compatible executor
- Call `allset.bridge(...)` with `fromChain` set to the EVM chain and `toChain: 'fast'`

Example:

```ts
import { AllSetProvider, createEvmExecutor } from '@fastxyz/allset-sdk';

const allset = new AllSetProvider({ network: 'testnet' });

// Your EVM wallet that holds USDC
const evmExecutor = createEvmExecutor(
  '<senderEvmPrivateKey>',  // Private key of the sender wallet
  'https://sepolia-rollup.arbitrum.io/rpc',
  421614,
);

const result = await allset.bridge({
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
- Call `allset.bridge(...)` with `fromChain: 'fast'`

**Example: Withdraw to your own EVM address**

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });

const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

const result = await allset.bridge({
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
import { AllSetProvider } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });

const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

// Withdraw to a different EVM address (e.g., another user, merchant, exchange)
const result = await allset.bridge({
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

### 5. Respect implementation details

When reasoning about behavior, use the code as the source of truth:

- Network/chain/token config is in `data/networks.json` (or user override at `~/.allset/networks.json`)
- Token resolution handles `fastUSDC` → `USDC` normalization automatically
- Supported bridge routes are enforced by the chain configs in networks.json
- Withdrawal posts to the relayer URL from chain config
- The package throws `FastError` from `@fastxyz/sdk`

Do not invent additional token aliases, chain IDs, or mainnet support unless added to networks.json.

### 6. Validate after edits

If you change code in this repo:

1. Update the implementation in `src/`
2. Keep `README.md` and this `SKILL.md` aligned with any capability changes
3. Run `npm run build`
4. Run `npm test`
5. Report any remaining gaps explicitly

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
| `bridge(params)` | `Promise<BridgeResult>` | Bridge tokens between chains |
| `getChainConfig(chain)` | `ChainConfig \| null` | Get chain configuration |
| `getTokenConfig(chain, token)` | `TokenConfig \| null` | Get token configuration |
| `getNetworkConfig()` | `NetworkConfig` | Get full network config |

### `AllSetProvider.bridge(params)`

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
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });

const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

const result = await allset.bridge({
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

### `createEvmWallet(keyOrPath?)`

Create, derive, or load an EVM wallet.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyOrPath` | `string?` | Optional. Can be: (1) omitted to generate new wallet, (2) private key (64 hex chars) to derive from, or (3) file path to load from JSON |

**Path detection:** If the string contains `/` or `~`, or ends with `.json`, it's treated as a file path. Otherwise it's treated as a private key.

**Returns:** `{ privateKey: string; address: string }`

**Example:**

```ts
// Generate new wallet
const newWallet = createEvmWallet();

// Derive from existing key
const derivedWallet = createEvmWallet('0x1234...64hexchars...');

// Load from file
const loadedWallet = createEvmWallet('~/.allset/.evm/keys/default.json');
```

### `saveEvmWallet(wallet, path)`

Save an EVM wallet to a JSON file.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `EvmWallet` | The wallet object with `privateKey` and `address` |
| `path` | `string` | File path to save to (supports `~` expansion) |

Creates parent directories if they don't exist. File permissions are set to `0600` (owner read/write only).

**Example:**

```ts
const wallet = createEvmWallet();
saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');

// Later, load it back
const loaded = createEvmWallet('~/.allset/.evm/keys/default.json');
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

- Building custom bridge flows outside of `AllSetProvider.bridge()`
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

- Inspect token config in `data/networks.json`
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

If upgrading from a previous version:

**Before (v0.1.x with singleton):**
```ts
import { allsetProvider } from '@fastxyz/allset-sdk';

await allsetProvider.bridge({ ... });
```

**After (v0.2.0+ with AllSetProvider class):**
```ts
import { AllSetProvider } from '@fastxyz/allset-sdk';

const allset = new AllSetProvider({ network: 'testnet' });
await allset.bridge({ ... });
```

**If upgrading from createFastClient (v0.1.1 and earlier):**
```ts
// Before
import { createFastClient, createFastWallet, allsetProvider } from '@fastxyz/allset-sdk';
const wallet = createFastWallet();
const fastClient = createFastClient({ privateKey: wallet.privateKey, publicKey: wallet.publicKey });
await allsetProvider.bridge({ ..., fastClient });

// After
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';
const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
await allset.bridge({ ..., fastWallet });
```

## Common Requests This Skill Should Trigger On

- "Use the AllSet SDK to bridge USDC from Arbitrum Sepolia to Fast"
- "Add a Node script that deposits through AllSetProvider"
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

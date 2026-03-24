# AllSet SDK

Bridge tokens between Fast network and EVM chains.

| Entrypoint | Use Case |
|------------|----------|
| `@fastxyz/allset-sdk` | Pure helpers (deposit planning, intent builders) |
| `@fastxyz/allset-sdk/node` | Full bridge execution (deposits, withdrawals) |
| `@fastxyz/allset-sdk/browser` | Browser-safe pure helpers |

## Install

Pure helpers only:

```bash
npm install @fastxyz/allset-sdk
```

Full bridge execution (requires [`@fastxyz/sdk`](https://github.com/fastxyz/fast-sdk)):

```bash
npm install @fastxyz/allset-sdk @fastxyz/sdk
```

## Quick Start

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider, createEvmWallet, createEvmExecutor } from '@fastxyz/allset-sdk/node';

// 1. Setup providers and wallets
const fastProvider = new FastProvider({ network: 'testnet' });
const allset = new AllSetProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmAccount = createEvmWallet('~/.allset/.evm/keys/default.json');
const evmClients = createEvmExecutor(evmAccount, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);

// 2. Deposit: EVM → Fast
await allset.sendToFast({
  chain: 'arbitrum-sepolia',
  token: 'USDC',
  amount: '1000000',
  from: evmAccount.address,
  to: fastWallet.address,
  evmClients,
});

// 3. Withdraw: Fast → EVM
await allset.sendToExternal({
  chain: 'arbitrum-sepolia',
  token: 'USDC',
  amount: '1000000',
  from: fastWallet.address,
  to: evmAccount.address,
  fastWallet,
});
```

---

## AllSetProvider Setup

AllSetProvider connects to AllSet bridge infrastructure.

### Default (testnet)

```ts
import { AllSetProvider } from '@fastxyz/allset-sdk/node';

const allset = new AllSetProvider();
```

### Specify Network

```ts
const allset = new AllSetProvider({ network: 'testnet' });
// or when available:
const allset = new AllSetProvider({ network: 'mainnet' });
```

### Custom Config

```ts
const allset = new AllSetProvider({
  configPath: './my-networks.json',
  crossSignUrl: 'https://custom.cross-sign.example.com',
});
```

### Provider Options

```ts
interface AllSetProviderOptions {
  network?: 'testnet' | 'mainnet';
  configPath?: string;      // Custom config file path
  crossSignUrl?: string;    // Override cross-sign endpoint
}
```

### Network Config Resolution Order

1. Custom `configPath` (if provided, highest priority)
2. `~/.allset/networks.json` (user override)
3. Bundled defaults from `src/default-config.ts`

---

## Fast Wallet Setup

Fast wallet is required for withdrawals (Fast → EVM).

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
```

See [`@fastxyz/sdk` documentation](https://github.com/fastxyz/fast-sdk) for wallet setup details.

---

## EVM Wallet Setup

EVM wallet is required for deposits (EVM → Fast).

### Generate New Wallet

```ts
import { createEvmWallet } from '@fastxyz/allset-sdk/node';

const account = createEvmWallet();
console.log('Address:', account.address);
console.log('Private Key:', account.privateKey);  // Save this!
```

### From Private Key

```ts
const account = createEvmWallet('0x1234...64hexchars');
// or without 0x prefix
const account = createEvmWallet('1234...64hexchars');
```

### From Keyfile

```ts
const account = createEvmWallet('~/.allset/.evm/keys/default.json');
```

**Keyfile format:**
```json
{
  "privateKey": "abc123...64hexchars",
  "address": "0x..."
}
```

### Create EVM Executor

EVM executor provides viem clients for blockchain operations:

```ts
import { createEvmExecutor } from '@fastxyz/allset-sdk/node';

const evmClients = createEvmExecutor(
  account,                                    // From createEvmWallet()
  'https://sepolia-rollup.arbitrum.io/rpc',  // RPC URL
  421614                                      // Chain ID
);
// Returns { walletClient, publicClient }
```

### EVM Wallet Resolution

`createEvmWallet(keyOrPath?)` resolves the parameter as:
1. Omitted → Generate new random wallet
2. Starts with `0x` or 64 hex chars → Derive from private key
3. Contains `/`, `~`, or ends with `.json` → Load from keyfile

### viem Interoperability

`createEvmWallet()` returns a standard viem account (from `privateKeyToAccount`), so it's **fully interoperable**:

```ts
import { privateKeyToAccount } from 'viem/accounts';

// These are equivalent:
const account1 = createEvmWallet('0xabc123...');
const account2 = privateKeyToAccount('0xabc123...');

// Both work with createEvmExecutor:
createEvmExecutor(account1, rpcUrl, chainId);
createEvmExecutor(account2, rpcUrl, chainId);
```

You can use existing viem accounts directly — no need to re-wrap them.

---

## Common Operations

### Deposit: EVM → Fast

Send tokens from an EVM chain to Fast network:

```ts
await allset.sendToFast({
  chain: 'arbitrum-sepolia',   // EVM chain
  token: 'USDC',               // Token symbol
  amount: '1000000',           // Amount in smallest units (6 decimals for USDC)
  from: evmAccount.address,    // Sender EVM address
  to: fastWallet.address,      // Receiver Fast address
  evmClients,                  // From createEvmExecutor()
});
```

### Withdraw: Fast → EVM

Send tokens from Fast network to an EVM chain:

```ts
await allset.sendToExternal({
  chain: 'arbitrum-sepolia',   // Target EVM chain
  token: 'USDC',               // Token symbol
  amount: '1000000',           // Amount in smallest units
  from: fastWallet.address,    // Sender Fast address
  to: evmAccount.address,      // Receiver EVM address
  fastWallet,                  // From @fastxyz/sdk
});
```

---

## Advanced: Custom Intents

Execute custom operations on EVM via intents:

```ts
import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';

await allset.executeIntent({
  chain: 'arbitrum-sepolia',
  fastWallet,
  token: 'USDC',
  amount: '1000000',
  intents: [
    buildTransferIntent(USDC_ADDRESS, '0xRecipient'),
    buildExecuteIntent(CONTRACT_ADDRESS, calldata),
  ],
});
```

### Intent Builders

| Builder | Purpose |
|---------|---------|
| `buildTransferIntent(token, receiver)` | ERC-20 transfer |
| `buildExecuteIntent(target, calldata, value?)` | Generic contract call |
| `buildDepositBackIntent(token, fastReceiver)` | Deposit back to Fast |
| `buildRevokeIntent()` | Cancel pending intent |

---

## Pure Helpers (Browser-Safe)

Use for deposit planning without execution:

```ts
import { buildDepositTransaction } from '@fastxyz/allset-sdk';

const plan = buildDepositTransaction({
  network: 'testnet',
  chain: 'arbitrum-sepolia',
  token: 'USDC',
  amount: 1_000_000n,
  receiver: 'fast1receiveraddress...',
});

console.log(plan.to);    // Bridge contract
console.log(plan.data);  // Calldata
console.log(plan.value); // ETH value (usually 0n)
```

---

## Configuration

### Token Parameter

The `token` field in `sendToFast`/`sendToExternal` accepts:

| Format | Example |
|--------|---------|
| Symbol | `'USDC'` (mainnet), `'testUSDC'` (testnet) |
| EVM Address | `'0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'` |

**Symbol aliases:** `testUSDC` normalizes to `USDC` for testnet chains.

### Finding Supported Assets

Supported tokens are configured in [`src/default-config.ts`](./src/default-config.ts).

**Testnet tokens:**

| Chain | Token | EVM Address |
|-------|-------|-------------|
| `arbitrum-sepolia` | USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| `ethereum-sepolia` | USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

**Mainnet tokens:**

| Chain | Token | EVM Address |
|-------|-------|-------------|
| `base` | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `arbitrum` | USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

To add custom tokens, create `~/.allset/networks.json` with your token config.

### Config Files

```
~/.allset/
├── networks.json      # Custom network config (overrides defaults)
└── .evm/
    └── keys/
        └── default.json   # EVM wallet keyfiles
```

### Custom Network Config

Create `~/.allset/networks.json` to override bundled defaults.

---

## API Reference

### AllSetProvider Methods

| Method | Description |
|--------|-------------|
| `sendToFast(params)` | Deposit EVM → Fast |
| `sendToExternal(params)` | Withdraw Fast → EVM |
| `executeIntent(params)` | Execute custom intents |
| `getChainConfig(chain)` | Get chain configuration |
| `getTokenConfig(chain, token)` | Get token configuration |

### Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_PARAMS` | Missing required parameter |
| `INVALID_ADDRESS` | Bad address format |
| `TOKEN_NOT_FOUND` | Unknown token symbol |
| `UNSUPPORTED_OPERATION` | Chain not supported |
| `TX_FAILED` | Transaction rejected |

---

## Supported Networks

| Network | Chain | Chain ID | Status |
|---------|-------|----------|--------|
| Testnet | Arbitrum Sepolia | 421614 | ✅ |
| Testnet | Ethereum Sepolia | 11155111 | ✅ |
| Testnet | Base | 8453 | ✅ |
| Mainnet | Coming soon | — | 🔜 |

---

## Development

```bash
npm install
npm run build
npm test
```

See [SKILL.md](./SKILL.md) for detailed workflows.

## License

MIT

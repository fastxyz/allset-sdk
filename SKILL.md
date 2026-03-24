---
name: allset-sdk
description: >
  AllSet SDK for bridging tokens between Fast network and EVM chains. Use sendToFast for deposits
  (EVM → Fast), sendToExternal for withdrawals (Fast → EVM), executeIntent for custom operations.
metadata:
  short-description: Bridge tokens between Fast and EVM chains.
  compatibility: Node.js 20+ for @fastxyz/allset-sdk/node; browsers for pure helpers.
---

# AllSet SDK Skill

## When to Use This Skill

**USE this skill when the user wants to:**
- Bridge tokens from EVM to Fast (deposit)
- Bridge tokens from Fast to EVM (withdraw)
- Execute custom intents on EVM via AllSet
- Plan deposit transactions (pure helpers)
- Set up EVM wallets for bridging

**DO NOT use this skill for:**
- Fast-only operations (balance, send, sign) → use [`fast-sdk`](https://github.com/fastxyz/fast-sdk)
- EVM-only operations without bridging
- Swaps, lending, staking, or yield strategies
- Unsupported chains or mainnet (not yet available)

---

## Decision Tree: Which Entrypoint?

```
Need to execute bridge transactions?
├── YES → Use @fastxyz/allset-sdk/node
│         (Full execution: sendToFast, sendToExternal, executeIntent)
│
└── NO → Just planning or building intents?
         ├── YES → Use @fastxyz/allset-sdk (pure helpers)
         │         (Browser-safe: buildDepositTransaction, intent builders)
         │
         └── NO → Use @fastxyz/allset-sdk/browser
                  (Explicit browser entrypoint)
```

**Default choice:** `@fastxyz/allset-sdk/node` — covers most agent use cases.

---

## Workflows

### 1. Setup AllSetProvider

**When:** Always. Required for all bridge operations.

**Prerequisites:** None.

**Steps:**

1. Import AllSetProvider:
   ```ts
   import { AllSetProvider } from '@fastxyz/allset-sdk/node';
   ```

2. Create provider:

   **Option A: Default testnet**
   ```ts
   const allset = new AllSetProvider();
   ```

   **Option B: Specify network**
   ```ts
   const allset = new AllSetProvider({ network: 'testnet' });
   ```

   **Option C: Custom config**
   ```ts
   const allset = new AllSetProvider({
     configPath: './my-networks.json',
     crossSignUrl: 'https://custom.cross-sign.example.com',
   });
   ```

3. Provider is ready for bridge operations.

**Network config resolution order:**
1. Custom `configPath` (if provided, highest priority)
2. `~/.allset/networks.json` (user override)
3. Bundled defaults from `src/default-config.ts`

---

### 2. Setup Fast Wallet

**When:** Need to withdraw from Fast to EVM.

**Prerequisites:** None.

**Steps:**

1. Import from fast-sdk:
   ```ts
   import { FastProvider, FastWallet } from '@fastxyz/sdk';
   ```

2. Create provider and wallet:
   ```ts
   const fastProvider = new FastProvider({ network: 'testnet' });
   const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
   ```

3. Fast wallet is ready.

See [`fast-sdk` SKILL.md](https://github.com/fastxyz/fast-sdk/blob/main/SKILL.md) for detailed wallet setup.

---

### 3. Setup EVM Wallet

**When:** Need to deposit from EVM to Fast.

**Prerequisites:** None.

**Steps:**

1. Import createEvmWallet:
   ```ts
   import { createEvmWallet } from '@fastxyz/allset-sdk/node';
   ```

2. Create or load wallet:

   **Option A: Generate new (persist the privateKey!)**
   ```ts
   const account = createEvmWallet();
   console.log('Save this:', account.privateKey);
   ```

   **Option B: From private key**
   ```ts
   const account = createEvmWallet('0x1234...64hexchars');
   ```

   **Option C: From keyfile**
   ```ts
   const account = createEvmWallet('~/.allset/.evm/keys/default.json');
   ```

3. Create executor for blockchain operations:
   ```ts
   import { createEvmExecutor } from '@fastxyz/allset-sdk/node';
   
   const evmClients = createEvmExecutor(
     account,
     'https://sepolia-rollup.arbitrum.io/rpc',  // RPC URL
     421614                                       // Chain ID
   );
   ```

4. Wallet and executor are ready.

**Wallet resolution order:**
1. Omitted → Generate new random wallet
2. Starts with `0x` or 64 hex chars → Derive from private key
3. Contains `/`, `~`, or ends with `.json` → Load from keyfile

**Keyfile format:**
```json
{
  "privateKey": "abc123...64hexchars",
  "address": "0x..."
}
```

**viem interoperability:** `createEvmWallet()` returns a standard viem account. You can use existing viem accounts directly:
```ts
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount('0xabc123...');
createEvmExecutor(account, rpcUrl, chainId);  // Works!
```

---

### 4. Deposit: EVM → Fast

**When:** User wants to bridge tokens from EVM chain to Fast network.

**Prerequisites:** AllSetProvider + EVM Wallet + EVM Executor.

**Steps:**

1. Ensure setup is complete:
   ```ts
   const allset = new AllSetProvider({ network: 'testnet' });
   const account = createEvmWallet('~/.allset/.evm/keys/default.json');
   const evmClients = createEvmExecutor(account, RPC_URL, CHAIN_ID);
   ```

2. Call sendToFast:
   ```ts
   const result = await allset.sendToFast({
     chain: 'arbitrum-sepolia',   // EVM chain name
     token: 'USDC',               // Token symbol
     amount: '1000000',           // Amount in smallest units
     from: account.address,       // Sender EVM address
     to: 'fast1receiver...',      // Receiver Fast address
     evmClients,                  // From createEvmExecutor()
   });
   ```

3. Return result to user:
   ```ts
   console.log('Deposit complete:', result);
   ```

**Chain IDs:**
- `arbitrum-sepolia` → 421614
- `ethereum-sepolia` → 11155111
- `base` → 8453

---

### 5. Withdraw: Fast → EVM

**When:** User wants to bridge tokens from Fast network to EVM chain.

**Prerequisites:** AllSetProvider + Fast Wallet.

**Steps:**

1. Ensure setup is complete:
   ```ts
   const allset = new AllSetProvider({ network: 'testnet' });
   const fastProvider = new FastProvider({ network: 'testnet' });
   const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
   ```

2. Call sendToExternal:
   ```ts
   const result = await allset.sendToExternal({
     chain: 'arbitrum-sepolia',   // Target EVM chain
     token: 'USDC',               // Token symbol
     amount: '1000000',           // Amount in smallest units
     from: fastWallet.address,    // Sender Fast address
     to: '0xReceiverAddress',     // Receiver EVM address
     fastWallet,                  // From @fastxyz/sdk
   });
   ```

3. Return result to user:
   ```ts
   console.log('Withdrawal complete:', result);
   ```

---

### 6. Execute Custom Intent

**When:** User wants advanced operations (transfers, contract calls) via AllSet.

**Prerequisites:** AllSetProvider + Fast Wallet.

**Steps:**

1. Import intent builders:
   ```ts
   import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';
   ```

2. Build intents:
   ```ts
   const intents = [
     buildTransferIntent(USDC_ADDRESS, '0xRecipient'),
     // Or for contract calls:
     buildExecuteIntent(CONTRACT_ADDRESS, calldata, value),
   ];
   ```

3. Execute:
   ```ts
   const result = await allset.executeIntent({
     chain: 'arbitrum-sepolia',
     fastWallet,
     token: 'USDC',
     amount: '1000000',
     intents,
   });
   ```

**Available intent builders:**
- `buildTransferIntent(token, receiver)` — ERC-20 transfer
- `buildExecuteIntent(target, calldata, value?)` — Contract call
- `buildDepositBackIntent(token, fastReceiver)` — Deposit back to Fast
- `buildRevokeIntent()` — Cancel pending intent

---

### 7. Plan Deposit (Pure Helper)

**When:** Need deposit transaction data without executing.

**Prerequisites:** None (browser-safe).

**Steps:**

1. Import pure helper:
   ```ts
   import { buildDepositTransaction } from '@fastxyz/allset-sdk';
   ```

2. Build transaction:
   ```ts
   const plan = buildDepositTransaction({
     network: 'testnet',
     chain: 'arbitrum-sepolia',
     token: 'USDC',
     amount: 1_000_000n,
     receiver: 'fast1receiveraddress...',
   });
   ```

3. Use the plan:
   ```ts
   console.log('To:', plan.to);       // Bridge contract
   console.log('Data:', plan.data);   // Calldata
   console.log('Value:', plan.value); // ETH value
   ```

---

## Token Resolution

The `token` field accepts symbols OR EVM addresses:

```
Is token a hex address (0x...)?
├── YES → Match by EVM address in config
│
└── NO → Is token 'USDC'?
         ├── YES → Use USDC config for the chain
         │
         └── NO → Is token 'fastUSDC' or 'testUSDC'?
                  ├── YES → Normalize to 'USDC'
                  │
                  └── NO → Throw TOKEN_NOT_FOUND
```

**Token formats:**
- Symbol: `'USDC'`, `'fastUSDC'`, `'testUSDC'`
- EVM Address: `'0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'`

### Finding Supported Assets

Check [`src/default-config.ts`](./src/default-config.ts) for bundled tokens.

**Current testnet tokens:**

| Chain | Token | EVM Address |
|-------|-------|-------------|
| `arbitrum-sepolia` | USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| `ethereum-sepolia` | USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| `base` | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

For custom tokens, add them to `~/.allset/networks.json`.

---

## Error Handling

| Error Code | Meaning | Agent Response |
|------------|---------|----------------|
| `INVALID_PARAMS` | Missing required param | Check: evmClients for deposit, fastWallet for withdraw |
| `INVALID_ADDRESS` | Bad address format | Deposit receiver must be fast1..., withdraw receiver must be 0x... |
| `TOKEN_NOT_FOUND` | Unknown token | Use USDC, fastUSDC, or testUSDC |
| `UNSUPPORTED_OPERATION` | Chain not supported | Use arbitrum-sepolia, ethereum-sepolia, or base |
| `TX_FAILED` | Transaction rejected | Check balance, retry, or report error |

**Error handling pattern:**
```ts
import { FastError } from '@fastxyz/sdk';

try {
  await allset.sendToFast({ ... });
} catch (err) {
  if (err instanceof FastError) {
    console.error(err.code, err.message);
  }
}
```

---

## Common Mistakes (DO NOT)

1. **DO NOT** use this SDK for Fast-only operations — use [`fast-sdk`](https://github.com/fastxyz/fast-sdk)

2. **DO NOT** forget evmClients for deposits:
   ```ts
   // WRONG
   await allset.sendToFast({ chain, token, amount, from, to });
   
   // CORRECT
   await allset.sendToFast({ chain, token, amount, from, to, evmClients });
   ```

3. **DO NOT** forget fastWallet for withdrawals:
   ```ts
   // WRONG
   await allset.sendToExternal({ chain, token, amount, from, to });
   
   // CORRECT
   await allset.sendToExternal({ chain, token, amount, from, to, fastWallet });
   ```

4. **DO NOT** mix up address formats:
   - Deposit `to` → Fast address (fast1...)
   - Withdraw `to` → EVM address (0x...)

5. **DO NOT** use unsupported chains:
   ```ts
   // WRONG
   await allset.sendToFast({ chain: 'polygon', ... });
   
   // CORRECT (supported chains)
   await allset.sendToFast({ chain: 'arbitrum-sepolia', ... });
   ```

6. **DO NOT** assume mainnet support — only testnet is currently available.

---

## Configuration Paths

| Path | Purpose |
|------|---------|
| `~/.allset/networks.json` | Custom network config |
| `~/.allset/.evm/keys/` | EVM wallet keyfiles |
| `~/.fast/keys/` | Fast wallet keyfiles (via fast-sdk) |

---

## Supported Chains

| Network | Chain | Chain ID | RPC Example |
|---------|-------|----------|-------------|
| Testnet | `arbitrum-sepolia` | 421614 | `https://sepolia-rollup.arbitrum.io/rpc` |
| Testnet | `ethereum-sepolia` | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| Testnet | `base` | 8453 | `https://mainnet.base.org` |

---

## Quick Reference

### Imports

```ts
// Node execution (full bridge)
import {
  AllSetProvider,
  createEvmWallet,
  createEvmExecutor,
} from '@fastxyz/allset-sdk/node';

// Pure helpers (browser-safe)
import {
  buildDepositTransaction,
  buildTransferIntent,
  buildExecuteIntent,
} from '@fastxyz/allset-sdk';

// Fast wallet (required for withdrawals)
import { FastProvider, FastWallet } from '@fastxyz/sdk';
```

### Common Patterns

```ts
// Setup
const allset = new AllSetProvider({ network: 'testnet' });
const account = createEvmWallet('~/.allset/.evm/keys/default.json');
const evmClients = createEvmExecutor(account, RPC_URL, CHAIN_ID);
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

// Deposit (EVM → Fast)
await allset.sendToFast({ chain, token, amount, from: account.address, to: fastWallet.address, evmClients });

// Withdraw (Fast → EVM)
await allset.sendToExternal({ chain, token, amount, from: fastWallet.address, to: account.address, fastWallet });
```

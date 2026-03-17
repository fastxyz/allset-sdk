# AllSet SDK

Bridge tokens between Fast network and EVM chains.

## Installation

```bash
npm install @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk';

// Setup
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

## Advanced: Custom Intents

```ts
import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';

// Execute custom intents on EVM chain
await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [
    buildTransferIntent(USDC_ADDRESS, '0xRecipient'),
    // Add more intents: swaps, protocol calls, etc.
  ],
});
```

## Supported Networks

| Network | Chain | Status |
|---------|-------|--------|
| Testnet | Arbitrum Sepolia | ✅ |
| Testnet | Ethereum Sepolia | ✅ |
| Testnet | Base (mainnet chain) | ✅ |
| Mainnet | Coming soon | 🔜 |

## Documentation

See [SKILL.md](./SKILL.md) for detailed API documentation.

## License

MIT

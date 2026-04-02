/**
 * evm-executor.ts — EVM client utilities using viem
 *
 * Provides createEvmExecutor() to create viem wallet and public clients,
 * and createEvmWallet() to generate or load EVM wallets.
 *
 * Wallet keyfiles are managed by the user at ~/.evm/keys/ or custom paths.
 * Expected format: { "privateKey": "...", "address": "..." (optional) }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumSepolia, base, mainnet as ethereum, sepolia } from 'viem/chains';

/**
 * Account-compatible wallet returned by createEvmWallet().
 *
 * Includes the normalized private key so generated accounts can be persisted
 * or reconstructed by the caller.
 */
export type EvmAccount = Account & {
  privateKey: `0x${string}`;
};

// Default EVM keys directory
const DEFAULT_EVM_KEYS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.evm',
  'keys'
);

/**
 * Get the default EVM keys directory (~/.evm/keys).
 */
export function getEvmKeysDir(): string {
  return DEFAULT_EVM_KEYS_DIR;
}

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.replace('~', home);
  }
  return path;
}

/**
 * Detect if a string is a file path (vs a private key)
 */
function isFilePath(input: string): boolean {
  return input.includes('/') || input.startsWith('~') || input.endsWith('.json');
}

function normalizePrivateKey(privateKey: string): `0x${string}` {
  return (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
}

/**
 * Create or load an EVM wallet and return an Account-compatible object.
 *
 * @param keyOrPath - Optional. Can be:
 *   - Omitted: generates a new random wallet
 *   - Private key (64 hex chars, with or without 0x): derives account from it
 *   - File path (contains `/` or `~`, or ends with `.json`): loads from JSON keyfile
 *
 * The keyfile must be a JSON file containing:
 * - `privateKey` (required): hex string, with or without 0x prefix
 * - `address` (optional): for user reference only
 *
 * It is the user's responsibility to create and manage keyfiles.
 * Generated accounts expose `privateKey` so callers can persist them.
 *
 * @returns Account-compatible object with viem signing methods and `privateKey`
 *
 * @example
 * ```ts
 * // Generate new wallet
 * const account = createEvmWallet();
 * console.log(account.address); // 0x...
 * console.log(account.privateKey); // persist this if you generated the wallet
 * 
 * // Derive from private key
 * const account = createEvmWallet('0x1234...64hexchars');
 * 
 * // Load from keyfile
 * const account = createEvmWallet('~/.evm/keys/default.json');
 * 
 * // Use with createEvmExecutor
 * const { walletClient, publicClient } = createEvmExecutor(account, rpcUrl, chainId);
 * ```
 *
 * @example Keyfile format
 * ```json
 * {
 *   "privateKey": "abc123...64hexchars",
 *   "address": "0x..." // optional, for reference
 * }
 * ```
 */
export function createEvmWallet(keyOrPath?: string): EvmAccount {
  let key: `0x${string}`;

  if (!keyOrPath) {
    // Generate new wallet
    key = generatePrivateKey();
  } else if (isFilePath(keyOrPath)) {
    // Load from file
    const fullPath = expandPath(keyOrPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Wallet file not found: ${keyOrPath}`);
    }
    const content = readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(content) as { privateKey: string; address?: string };
    if (!data.privateKey) {
      throw new Error(`Invalid wallet file: missing privateKey`);
    }
    key = normalizePrivateKey(data.privateKey);
  } else {
    // Treat as private key
    key = normalizePrivateKey(keyOrPath);
  }

  return Object.assign(privateKeyToAccount(key), { privateKey: key });
}

/** ERC20 ABI for allowance and approve */
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

/** Bundled supported chain mappings */
export const CHAIN_MAP: Record<number, Chain> = {
  1: ethereum,
  11155111: sepolia,
  421614: arbitrumSepolia,
  42161: arbitrum,
  8453: base,
};

/**
 * EVM clients returned by createEvmExecutor.
 */
export interface EvmClients {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

/**
 * Create viem wallet and public clients for EVM operations.
 *
 * @param account - viem Account from createEvmWallet() or privateKeyToAccount()
 * @param rpcUrl - RPC endpoint URL
 * @param chainId - Chain ID (11155111 for Sepolia, 421614 for Arbitrum Sepolia, 8453 for Base)
 * @returns Object with walletClient and publicClient
 *
 * @example
 * ```ts
 * // Using Account from createEvmWallet (loads from keyfile)
 * const account = createEvmWallet('~/.evm/keys/default.json');
 * const { walletClient, publicClient } = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * 
 * // Using viem's privateKeyToAccount directly
 * import { privateKeyToAccount } from 'viem/accounts';
 * const account = privateKeyToAccount('0xabc123...');
 * const { walletClient, publicClient } = createEvmExecutor(account, rpcUrl, chainId);
 * 
 * // Use clients for bridge deposit
 * await allset.sendToFast({ ..., evmClients: { walletClient, publicClient } });
 * ```
 */
export function createEvmExecutor(
  account: Account,
  rpcUrl: string,
  chainId: number,
): EvmClients {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported EVM chain ID: ${chainId}. Supported: ${Object.keys(CHAIN_MAP).join(', ')}`,
    );
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return { walletClient, publicClient };
}

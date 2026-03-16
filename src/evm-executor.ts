/**
 * evm-executor.ts — EVM client utilities using viem
 *
 * Provides createEvmExecutor() to create viem wallet and public clients,
 * and createEvmWallet() to load EVM wallets from keyfiles.
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
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia } from 'viem/chains';

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
 * Load an EVM wallet from a keyfile and return a viem Account.
 *
 * The keyfile must be a JSON file containing:
 * - `privateKey` (required): hex string, with or without 0x prefix
 * - `address` (optional): for user reference only
 *
 * It is the user's responsibility to create and manage the keyfile.
 *
 * @param path - Path to the keyfile (supports ~ expansion)
 * @returns viem Account object
 *
 * @example
 * ```ts
 * // Load from keyfile
 * const account = createEvmWallet('~/.evm/keys/default.json');
 * 
 * // Use with createEvmExecutor
 * const { walletClient, publicClient } = createEvmExecutor(account, rpcUrl, chainId);
 * 
 * // Access address
 * console.log(account.address);
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
export function createEvmWallet(path: string): Account {
  const fullPath = expandPath(path);
  if (!existsSync(fullPath)) {
    throw new Error(`Wallet file not found: ${path}`);
  }
  const content = readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(content) as { privateKey: string; address?: string };
  if (!data.privateKey) {
    throw new Error(`Invalid wallet file: missing privateKey`);
  }
  const key = (data.privateKey.startsWith('0x') ? data.privateKey : `0x${data.privateKey}`) as `0x${string}`;
  return privateKeyToAccount(key);
}

/** ERC20 ABI for allowance and approve */
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

/** Supported chain mappings */
export const CHAIN_MAP: Record<number, Chain> = {
  11155111: sepolia,
  421614: arbitrumSepolia,
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
 * @param chainId - Chain ID (11155111 for Sepolia, 421614 for Arbitrum Sepolia)
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

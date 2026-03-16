/**
 * evm-executor.ts — Minimal EVM transaction executor using viem
 *
 * Provides sendTx, checkAllowance, and approveErc20 for bridge operations.
 * Also provides createEvmWallet() to generate, derive, or load EVM wallets,
 * and saveEvmWallet() to persist them to disk.
 *
 * Default wallet path: ~/.allset/.evm/keys/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Account,
  type Chain,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia } from 'viem/chains';
import type { EvmTxExecutor } from './types.js';

/**
 * EVM wallet containing private key, address, and derived account.
 * 
 * The `account` field holds the viem Account object, avoiding repeated
 * derivation when creating executors or signing transactions.
 */
export interface EvmWallet {
  /** Private key with 0x prefix */
  privateKey: `0x${string}`;
  /** EVM address */
  address: `0x${string}`;
  /** Viem Account object (derived from privateKey) */
  account: Account;
}

// Default EVM keys directory
const DEFAULT_EVM_KEYS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.allset',
  '.evm',
  'keys'
);

/**
 * Get the default EVM keys directory (~/.allset/.evm/keys).
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

/**
 * Create, derive, or load an EVM wallet.
 *
 * Returns an EvmWallet with the derived `account` object, avoiding repeated
 * calls to `privateKeyToAccount()` when using the wallet.
 *
 * @param keyOrPath - Optional. Can be:
 *   - Omitted: generates a new random wallet
 *   - Private key (64 hex chars, with or without 0x): derives address from it
 *   - File path (contains `/` or `~`, or ends with `.json`): loads from JSON file
 *
 * @example
 * ```ts
 * // Generate new wallet
 * const wallet = createEvmWallet();
 *
 * // Derive from private key
 * const wallet = createEvmWallet('0x1234...64hexchars...');
 *
 * // Load from file
 * const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');
 *
 * // Create executor using wallet (no re-derivation needed)
 * const executor = createEvmExecutor(wallet, rpcUrl, chainId);
 * ```
 *
 * @returns EvmWallet with privateKey, address, and account
 */
export function createEvmWallet(keyOrPath?: string): EvmWallet {
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
    key = (data.privateKey.startsWith('0x') ? data.privateKey : `0x${data.privateKey}`) as `0x${string}`;
  } else {
    // Treat as private key
    key = (keyOrPath.startsWith('0x') ? keyOrPath : `0x${keyOrPath}`) as `0x${string}`;
  }

  const account = privateKeyToAccount(key);
  return {
    privateKey: key,
    address: account.address,
    account,
  };
}

/**
 * Save an EVM wallet to a JSON file.
 *
 * Creates parent directories if they don't exist.
 * The file format matches Fast wallet keyfiles for consistency.
 * Only saves privateKey and address (account is derived at load time).
 *
 * @param wallet - The wallet object with privateKey and address
 * @param path - File path to save to (supports ~ expansion)
 *
 * @example
 * ```ts
 * const wallet = createEvmWallet();
 * saveEvmWallet(wallet, '~/.allset/.evm/keys/default.json');
 * ```
 */
export function saveEvmWallet(wallet: EvmWallet, path: string): void {
  const fullPath = expandPath(path);
  const dir = dirname(fullPath);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Only save privateKey and address (account is runtime-only)
  const data = {
    privateKey: wallet.privateKey.replace('0x', ''), // Store without 0x prefix like Fast wallet
    address: wallet.address,
  };

  writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const CHAIN_MAP: Record<number, Chain> = {
  11155111: sepolia,
  421614: arbitrumSepolia,
};

/**
 * Input type for createEvmExecutor: either an EvmWallet object or a raw private key.
 * 
 * When a private key string is provided, the account is derived internally.
 */
export type EvmWalletInput = EvmWallet | `0x${string}`;

/**
 * Create an EVM transaction executor for bridge operations.
 *
 * Accepts either an EvmWallet object or a raw private key string for convenience.
 * When a private key is provided, the account is derived internally using viem's
 * privateKeyToAccount().
 *
 * @param walletOrKey - Either:
 *   - EvmWallet from createEvmWallet()
 *   - Private key string (0x-prefixed, 66 chars total)
 * @param rpcUrl - RPC endpoint URL
 * @param chainId - Chain ID (11155111 for Sepolia, 421614 for Arbitrum Sepolia)
 *
 * @example
 * ```ts
 * // Using EvmWallet (recommended for reuse)
 * const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');
 * const executor = createEvmExecutor(wallet, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * 
 * // Using raw private key (quick start)
 * const executor = createEvmExecutor('0xabc123...', 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * 
 * // Use executor for bridge deposit
 * await allset.sendToFast({ ..., evmExecutor: executor });
 * ```
 */
export function createEvmExecutor(
  walletOrKey: EvmWalletInput,
  rpcUrl: string,
  chainId: number,
): EvmTxExecutor {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported EVM chain ID: ${chainId}. Supported: ${Object.keys(CHAIN_MAP).join(', ')}`,
    );
  }

  // Normalize: if string (private key), derive account; otherwise use wallet.account
  const account = typeof walletOrKey === 'string'
    ? privateKeyToAccount(walletOrKey)
    : walletOrKey.account;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return {
    async sendTx(tx): Promise<{ txHash: string; status: 'success' | 'reverted' }> {
      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        txHash: hash,
        status: receipt.status === 'success' ? 'success' : 'reverted',
      };
    },

    async checkAllowance(token, spender, owner): Promise<bigint> {
      const allowance = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner as `0x${string}`, spender as `0x${string}`],
      });
      return allowance;
    },

    async approveErc20(token, spender, amount): Promise<string> {
      const hash = await walletClient.writeContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, BigInt(amount)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}

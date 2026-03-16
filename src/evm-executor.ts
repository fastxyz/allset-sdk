/**
 * evm-executor.ts — Minimal EVM transaction executor using viem
 *
 * Provides sendTx, checkAllowance, and approveErc20 for bridge operations.
 * Also provides createEvmWallet() to load EVM wallets from keyfiles.
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
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia } from 'viem/chains';
import type { EvmTxExecutor } from './types.js';

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
 * const executor = createEvmExecutor(account, rpcUrl, chainId);
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

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const CHAIN_MAP: Record<number, Chain> = {
  11155111: sepolia,
  421614: arbitrumSepolia,
};

/**
 * Create an EVM transaction executor for bridge operations.
 *
 * @param account - viem Account from createEvmWallet() or privateKeyToAccount()
 * @param rpcUrl - RPC endpoint URL
 * @param chainId - Chain ID (11155111 for Sepolia, 421614 for Arbitrum Sepolia)
 *
 * @example
 * ```ts
 * // Using Account from createEvmWallet (loads from keyfile)
 * const account = createEvmWallet('~/.evm/keys/default.json');
 * const executor = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * 
 * // Using viem's privateKeyToAccount directly
 * import { privateKeyToAccount } from 'viem/accounts';
 * const account = privateKeyToAccount('0xabc123...');
 * const executor = createEvmExecutor(account, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * 
 * // Use executor for bridge deposit
 * await allset.sendToFast({ ..., evmExecutor: executor });
 * ```
 */
export function createEvmExecutor(
  account: Account,
  rpcUrl: string,
  chainId: number,
): EvmTxExecutor {
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

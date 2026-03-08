/**
 * evm-executor.ts — Minimal EVM transaction executor using viem
 *
 * Provides sendTx, checkAllowance, and approveErc20 for bridge operations.
 * Also provides createEvmWallet() to generate a new EVM wallet.
 */

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
 * Generate a new EVM wallet (private key + address).
 *
 * @example
 * ```ts
 * const wallet = createEvmWallet();
 * console.log(wallet.address);    // 0x...
 * console.log(wallet.privateKey); // 0x... (keep secret!)
 *
 * // Use with createEvmExecutor
 * const executor = createEvmExecutor(wallet.privateKey, rpcUrl, chainId);
 * ```
 *
 * @returns Object containing privateKey and address
 */
export function createEvmWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
  };
}

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const CHAIN_MAP: Record<number, Chain> = {
  11155111: sepolia,
  421614: arbitrumSepolia,
};

export function createEvmExecutor(
  privateKey: string,
  rpcUrl: string,
  chainId: number,
): EvmTxExecutor {
  const key = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account: Account = privateKeyToAccount(key);
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

/**
 * types.ts — AllSet SDK types
 */

import type { EvmClients } from './evm-executor.js';

export interface FastWalletLike {
  /** Sender Fast address (fast1...) */
  readonly address: string;
  submit(params: {
    claim: Record<string, unknown>;
  }): Promise<{
    txHash: string;
    certificate: unknown;
  }>;
}

export interface BridgeProvider {
  name: string;
  chains: string[];
  networks?: Array<'testnet' | 'mainnet'>;
  bridge(params: BridgeParams): Promise<BridgeResult>;
}

export interface BridgeParams {
  fromChain: string;
  fromChainId?: number;
  toChain: string;
  toChainId?: number;
  fromToken: string;
  toToken: string;
  fromDecimals: number;
  amount: string;
  senderAddress: string;
  receiverAddress: string;
  /** EVM clients from createEvmExecutor() — required for deposits (EVM → Fast) */
  evmClients?: EvmClients;
  /** Compatible Fast wallet — required for withdrawals (Fast → EVM) */
  fastWallet?: FastWalletLike;
}

export interface BridgeResult {
  txHash: string;
  orderId: string;
  estimatedTime?: string;
}

/**
 * Parameters for sendToFast (EVM → Fast deposit)
 */
export interface SendToFastParams {
  /** Source EVM chain, for example 'ethereum-sepolia', 'arbitrum-sepolia', or 'base' */
  chain: string;
  /** Token symbol (e.g., 'USDC') */
  token: string;
  /** Amount in smallest units (e.g., '1000000' for 1 USDC) */
  amount: string;
  /** Sender's EVM address (0x...) */
  from: string;
  /** Receiver's Fast address (fast1...) */
  to: string;
  /** EVM clients from createEvmExecutor() */
  evmClients: EvmClients;
}

/**
 * Parameters for sendToExternal (Fast → EVM withdrawal)
 */
export interface SendToExternalParams {
  /** Destination EVM chain, for example 'ethereum-sepolia', 'arbitrum-sepolia', or 'base' */
  chain: string;
  /** Token symbol (e.g., 'fastUSDC' or 'USDC') */
  token: string;
  /** Amount in smallest units (e.g., '1000000' for 1 USDC) */
  amount: string;
  /** Sender's Fast address (fast1...) */
  from: string;
  /** Receiver's EVM address (0x...) */
  to: string;
  /** Compatible Fast wallet, for example FastWallet from @fastxyz/sdk */
  fastWallet: FastWalletLike;
}

/**
 * Parameters for executeIntent (advanced intent execution)
 */
export interface ExecuteIntentParams {
  /** Destination EVM chain, for example 'ethereum-sepolia', 'arbitrum-sepolia', or 'base' */
  chain: string;
  /** Compatible Fast wallet, for example FastWallet from @fastxyz/sdk */
  fastWallet: FastWalletLike;
  /** Token to transfer to bridge (e.g., 'fastUSDC') */
  token: string;
  /** Amount in smallest units */
  amount: string;
  /** Array of intents to execute on EVM chain */
  intents: import('../intents.js').Intent[];
  /**
   * Optional EVM address for the relayer target.
   * Required when intents do not include a transfer recipient or execute target.
   */
  externalAddress?: string;
  /** Deadline in seconds from now (default: 3600 = 1 hour) */
  deadlineSeconds?: number;
}

export interface AllSetChainConfig {
  chainId: number;
  bridgeContract: string;
  fastsetBridgeAddress: string;
  relayerUrl: string;
}

export interface AllSetTokenInfo {
  evmAddress: string;
  fastsetTokenId: Uint8Array;
  decimals: number;
  isNative: boolean;
}

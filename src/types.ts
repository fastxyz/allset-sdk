/**
 * types.ts — AllSet SDK types
 */

export interface EvmTxExecutor {
  sendTx(tx: {
    to: string;
    data: string;
    value: string;
    gas?: string;
  }): Promise<{ txHash: string; status: 'success' | 'reverted' }>;
  checkAllowance(token: string, spender: string, owner: string): Promise<bigint>;
  approveErc20(token: string, spender: string, amount: string): Promise<string>;
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
  evmExecutor?: EvmTxExecutor;
  /** FastWallet from @fastxyz/sdk — required for withdrawals (Fast → EVM) */
  fastWallet?: import('@fastxyz/sdk').FastWallet;
}

export interface BridgeResult {
  txHash: string;
  orderId: string;
  estimatedTime?: string;
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

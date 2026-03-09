/**
 * types.ts — AllSet SDK types
 */

export interface FastClient {
  submit(params: {
    recipient: string;
    claim: Record<string, unknown>;
  }): Promise<{ txHash: string; certificate: unknown }>;
  evmSign(params: {
    certificate: unknown;
  }): Promise<{ transaction: number[]; signature: string }>;
  readonly address: string | null;
}

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
  bridge(params: {
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
    fastClient?: FastClient;
  }): Promise<{
    txHash: string;
    orderId: string;
    estimatedTime?: string;
  }>;
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

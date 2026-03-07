/**
 * @fast/allset-sdk — AllSet bridge SDK
 *
 * Bridges assets between Fast chain and EVM chains (Arbitrum Sepolia, Ethereum Sepolia).
 */

export { allsetProvider } from './bridge.js';
export { createEvmExecutor } from './evm-executor.js';

export type {
  BridgeProvider,
  EvmTxExecutor,
  FastClient,
  AllSetChainConfig,
  AllSetTokenInfo,
} from './types.js';

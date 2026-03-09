/**
 * @fastxyz/allset-sdk — AllSet bridge SDK
 *
 * Bridges assets between Fast chain and EVM chains (Arbitrum Sepolia, Ethereum Sepolia).
 */

export { allsetProvider } from './bridge.js';
export { createEvmExecutor, createEvmWallet } from './evm-executor.js';
export { createFastClient } from './fast-client.js';

export type {
  BridgeProvider,
  EvmTxExecutor,
  FastClient,
  AllSetChainConfig,
  AllSetTokenInfo,
} from './types.js';

export type { FastClientOptions } from './fast-client.js';

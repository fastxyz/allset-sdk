/**
 * @fastxyz/allset-sdk — AllSet bridge SDK
 *
 * Bridges assets between Fast chain and supported EVM routes.
 */

export { allsetProvider } from './bridge.js';
export { createEvmExecutor, createEvmWallet } from './evm-executor.js';
export { createFastClient, createFastWallet } from './fast-client.js';

export type {
  BridgeProvider,
  EvmTxExecutor,
  FastClient,
  AllSetChainConfig,
  AllSetTokenInfo,
} from './types.js';

export type { FastClientOptions, FastWallet } from './fast-client.js';

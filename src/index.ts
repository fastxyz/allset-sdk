/**
 * @pi2labs/allset-sdk — OmniSet bridge SDK
 *
 * Bridges assets between Fast chain and EVM chains (Arbitrum Sepolia, Ethereum Sepolia).
 */

export { omnisetProvider } from './bridge.js';
export { createEvmExecutor } from './evm-executor.js';

export type {
  BridgeProvider,
  EvmTxExecutor,
  FastClient,
  OmnisetChainConfig,
  OmnisetTokenInfo,
} from './types.js';

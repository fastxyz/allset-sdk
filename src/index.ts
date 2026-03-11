/**
 * @fastxyz/allset-sdk — AllSet bridge SDK
 *
 * Bridges assets between Fast network and supported EVM routes.
 *
 * Prerequisites: Install @fastxyz/sdk for FastWallet support.
 *   npm install @fastxyz/sdk @fastxyz/allset-sdk
 *
 * @example
 * ```ts
 * import { FastProvider, FastWallet } from '@fastxyz/sdk';
 * import { AllSetProvider, createEvmWallet } from '@fastxyz/allset-sdk';
 *
 * // Create providers
 * const fastProvider = new FastProvider({ network: 'testnet' });
 * const allsetProvider = new AllSetProvider({ network: 'testnet' });
 *
 * // Create wallets
 * const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
 * const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');
 *
 * // Bridge Fast → EVM
 * await allsetProvider.bridge({
 *   fromChain: 'fast',
 *   toChain: 'arbitrum',
 *   fromToken: 'fastUSDC',
 *   toToken: 'USDC',
 *   amount: '1000000',
 *   senderAddress: fastWallet.address,
 *   receiverAddress: evmWallet.address,
 *   fastWallet,
 * });
 * ```
 */

// Bridge provider (singleton for backwards compatibility)
export { allsetProvider, evmSign } from './bridge.js';

// AllSetProvider class (configurable)
export {
  AllSetProvider,
  getAllSetDir,
  getEvmKeysDir as getAllSetEvmKeysDir,
  ensureAllSetDirs,
  initUserConfig,
} from './provider.js';

// EVM utilities
export { createEvmExecutor, createEvmWallet, saveEvmWallet, getEvmKeysDir } from './evm-executor.js';

// Config utilities (lower-level)
export {
  loadNetworksConfig,
  getNetworkConfig,
  getChainConfig,
  getTokenConfig,
  clearConfigCache,
} from './config.js';

// Types
export type {
  BridgeProvider,
  BridgeParams,
  BridgeResult,
  EvmTxExecutor,
  AllSetChainConfig,
  AllSetTokenInfo,
} from './types.js';

export type { EvmSignResult } from './bridge.js';
export type { EvmWallet } from './evm-executor.js';
export type { NetworkConfig, ChainConfig, TokenConfig, AllNetworksConfig } from './config.js';
export type { AllSetProviderOptions } from './provider.js';

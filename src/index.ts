/**
 * @fastxyz/allset-sdk — AllSet bridge SDK
 *
 * Bridge tokens between Fast network and EVM chains.
 *
 * Prerequisites: Install @fastxyz/sdk for FastWallet support.
 *   npm install @fastxyz/sdk @fastxyz/allset-sdk
 *
 * @example
 * ```ts
 * import { FastProvider, FastWallet } from '@fastxyz/sdk';
 * import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk';
 *
 * // Setup
 * const fastProvider = new FastProvider({ network: 'testnet' });
 * const allset = new AllSetProvider({ network: 'testnet' });
 * const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
 * const evmAccount = createEvmWallet('~/.evm/keys/default.json'); // returns viem Account
 *
 * // Deposit: EVM → Fast
 * const evmExecutor = createEvmExecutor(evmAccount, 'https://sepolia-rollup.arbitrum.io/rpc', 421614);
 * await allset.sendToFast({
 *   chain: 'arbitrum',
 *   token: 'USDC',
 *   amount: '1000000',
 *   from: evmAccount.address,
 *   to: fastWallet.address,
 *   evmExecutor,
 * });
 *
 * // Withdraw: Fast → EVM
 * await allset.sendToExternal({
 *   chain: 'arbitrum',
 *   token: 'fastUSDC',
 *   amount: '1000000',
 *   from: fastWallet.address,
 *   to: evmAccount.address,
 *   fastWallet,
 * });
 * ```
 */

// Bridge functions
export { evmSign, executeBridge, executeIntent } from './bridge.js';

// Intent builders
export {
  IntentAction,
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
  buildRevokeIntent,
} from './intents.js';

// AllSetProvider class (configurable)
export {
  AllSetProvider,
  getAllSetDir,
  getEvmKeysDir as getAllSetEvmKeysDir,
  ensureAllSetDirs,
  initUserConfig,
} from './provider.js';

// EVM utilities
export { createEvmExecutor, createEvmWallet, getEvmKeysDir } from './evm-executor.js';

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
  SendToFastParams,
  SendToExternalParams,
  ExecuteIntentParams,
} from './types.js';

export type { Intent } from './intents.js';

export type { EvmSignResult } from './bridge.js';
export type { NetworkConfig, ChainConfig, TokenConfig, AllNetworksConfig } from './config.js';
export type { AllSetProviderOptions } from './provider.js';

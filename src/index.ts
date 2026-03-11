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
 * import { allsetProvider, createEvmWallet } from '@fastxyz/allset-sdk';
 *
 * // Create Fast wallet
 * const provider = new FastProvider({ network: 'testnet' });
 * const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);
 *
 * // Optionally create EVM wallet with same private key
 * const keys = await fastWallet.exportKeys();
 * const evmWallet = createEvmWallet(keys.privateKey);
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

export { allsetProvider, evmSign } from './bridge.js';
export { createEvmExecutor, createEvmWallet, saveEvmWallet } from './evm-executor.js';
export {
  loadNetworksConfig,
  getNetworkConfig,
  getChainConfig,
  getTokenConfig,
  clearConfigCache,
} from './config.js';

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

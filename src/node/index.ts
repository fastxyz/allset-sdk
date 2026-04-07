export * from '../core/index.js';
export * from './eip7702.js';

export {
  AllSetProvider,
  getAllSetDir,
  getEvmKeysDir as getAllSetEvmKeysDir,
  ensureAllSetDirs,
  initUserConfig,
} from './provider.js';

export {
  createEvmExecutor,
  createEvmWallet,
  getEvmKeysDir,
} from './evm-executor.js';

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
  FastWalletLike,
  AllSetChainConfig,
  AllSetTokenInfo,
  SendToFastParams,
  SendToExternalParams,
  ExecuteIntentParams,
} from './types.js';

export type { Intent } from '../intents.js';
export type { EvmSignResult } from './bridge.js';
export type { EvmAccount, EvmClients } from './evm-executor.js';
export type { NetworkConfig, ChainConfig, TokenConfig, AllNetworksConfig } from './config.js';
export type { AllSetProviderOptions } from './provider.js';

export async function evmSign(
  ...args: Parameters<typeof import('./bridge.js').evmSign>
): ReturnType<typeof import('./bridge.js').evmSign> {
  const mod = await import('./bridge.js');
  return mod.evmSign(...args);
}

export async function executeBridge(
  ...args: Parameters<typeof import('./bridge.js').executeBridge>
): ReturnType<typeof import('./bridge.js').executeBridge> {
  const mod = await import('./bridge.js');
  return mod.executeBridge(...args);
}

export async function executeIntent(
  ...args: Parameters<typeof import('./bridge.js').executeIntent>
): ReturnType<typeof import('./bridge.js').executeIntent> {
  const mod = await import('./bridge.js');
  return mod.executeIntent(...args);
}

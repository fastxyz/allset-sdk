/**
 * provider.ts — AllSetProvider for bridge configuration and operations
 *
 * Similar to FastProvider, AllSetProvider manages network configuration
 * and provides the bridge() method for bridging tokens.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_NETWORKS_CONFIG } from './default-config.js';
import type { NetworkConfig, ChainConfig, TokenConfig, AllNetworksConfig } from './config.js';
import type { BridgeResult, SendToFastParams, SendToExternalParams, ExecuteIntentParams } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLSET_DIR = join(process.env.HOME || process.env.USERPROFILE || '', '.allset');
const EVM_KEYS_DIR = join(ALLSET_DIR, '.evm', 'keys');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllSetProviderOptions {
  /**
   * Network to use: 'testnet' or 'mainnet'
   * @default 'testnet'
   */
  network?: 'testnet' | 'mainnet';

  /**
   * Custom path to networks.json config file.
   * If not provided, loads from:
   * 1. ~/.allset/networks.json (user override)
   * 2. Embedded package defaults
   */
  configPath?: string;

  /**
   * Custom cross-sign URL (overrides config)
   */
  crossSignUrl?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.replace('~', home);
  }
  return path;
}

function getUserConfigPath(): string {
  return join(ALLSET_DIR, 'networks.json');
}

function loadConfig(customPath?: string): AllNetworksConfig {
  // Priority: customPath > ~/.allset/networks.json > embedded default config
  const paths = [
    customPath,
    getUserConfigPath(),
  ].filter((p): p is string => !!p);

  for (const configPath of paths) {
    const resolved = expandHome(configPath);
    if (existsSync(resolved)) {
      try {
        const raw = readFileSync(resolved, 'utf-8');
        return JSON.parse(raw) as AllNetworksConfig;
      } catch {
        // Continue to next path
      }
    }
  }

  return structuredClone(DEFAULT_NETWORKS_CONFIG);
}

// ---------------------------------------------------------------------------
// AllSetProvider Class
// ---------------------------------------------------------------------------

/**
 * AllSetProvider manages AllSet bridge configuration.
 *
 * @example
 * ```ts
 * // Default testnet configuration
 * const provider = new AllSetProvider();
 *
 * // Mainnet configuration
 * const provider = new AllSetProvider({ network: 'mainnet' });
 *
 * // Custom config file
 * const provider = new AllSetProvider({ configPath: './my-config.json' });
 *
 * // Access configuration
 * const chainConfig = provider.getChainConfig('arbitrum');
 * const tokenConfig = provider.getTokenConfig('arbitrum', 'USDC');
 * ```
 */
export class AllSetProvider {
  private readonly _network: 'testnet' | 'mainnet';
  private readonly _config: AllNetworksConfig;
  private readonly _networkConfig: NetworkConfig;
  private readonly _crossSignUrl: string;

  constructor(options: AllSetProviderOptions = {}) {
    this._network = options.network ?? 'testnet';
    this._config = loadConfig(options.configPath);
    this._networkConfig = this._config[this._network];

    if (!this._networkConfig) {
      throw new Error(`Network "${this._network}" not found in config`);
    }

    this._crossSignUrl = options.crossSignUrl ?? this._networkConfig.crossSignUrl;
  }

  /**
   * Get the current network name.
   */
  get network(): 'testnet' | 'mainnet' {
    return this._network;
  }

  /**
   * Get the cross-sign service URL.
   */
  get crossSignUrl(): string {
    return this._crossSignUrl;
  }

  /**
   * Get list of supported chain names.
   */
  get chains(): string[] {
    return Object.keys(this._networkConfig.chains);
  }

  /**
   * Get configuration for a specific chain.
   */
  getChainConfig(chain: string): ChainConfig | null {
    return this._networkConfig.chains[chain] ?? null;
  }

  /**
   * Get token configuration for a chain.
   * Handles fastUSDC -> USDC normalization.
   */
  getTokenConfig(chain: string, token: string): TokenConfig | null {
    const chainConfig = this.getChainConfig(chain);
    if (!chainConfig) return null;

    // Normalize: fastUSDC on Fast maps to USDC on EVM
    const normalizedToken = token.toLowerCase() === 'fastusdc' ? 'USDC' : token;

    return (
      chainConfig.tokens[normalizedToken] ??
      chainConfig.tokens[normalizedToken.toUpperCase()] ??
      null
    );
  }

  /**
   * Get the full network configuration.
   */
  getNetworkConfig(): NetworkConfig {
    return this._networkConfig;
  }

  /**
   * Get the raw config (both testnet and mainnet).
   */
  getRawConfig(): AllNetworksConfig {
    return this._config;
  }

  /**
   * Deposit tokens from EVM chain to Fast network.
   * 
   * @example
   * ```ts
   * const result = await allset.sendToFast({
   *   chain: 'arbitrum',
   *   token: 'USDC',
   *   amount: '1000000',
   *   from: '0xYourEvmAddress',
   *   to: 'fast1receiveraddress',
   *   evmExecutor,
   * });
   * ```
   */
  async sendToFast(params: SendToFastParams): Promise<BridgeResult> {
    const { executeBridge } = await import('./bridge.js');
    return executeBridge({
      fromChain: params.chain,
      toChain: 'fast',
      fromToken: params.token,
      toToken: params.token === 'USDC' ? 'fastUSDC' : params.token,
      fromDecimals: 6,
      amount: params.amount,
      senderAddress: params.from,
      receiverAddress: params.to,
      evmExecutor: params.evmExecutor,
    }, this);
  }

  /**
   * Withdraw tokens from Fast network to EVM chain.
   * 
   * @example
   * ```ts
   * const result = await allset.sendToExternal({
   *   chain: 'arbitrum',
   *   token: 'fastUSDC',
   *   amount: '1000000',
   *   from: fastWallet.address,
   *   to: '0xReceiverEvmAddress',
   *   fastWallet,
   * });
   * ```
   */
  async sendToExternal(params: SendToExternalParams): Promise<BridgeResult> {
    const { executeBridge } = await import('./bridge.js');
    return executeBridge({
      fromChain: 'fast',
      toChain: params.chain,
      fromToken: params.token,
      toToken: params.token === 'fastUSDC' ? 'USDC' : params.token,
      fromDecimals: 6,
      amount: params.amount,
      senderAddress: params.from,
      receiverAddress: params.to,
      fastWallet: params.fastWallet,
    }, this);
  }

  /**
   * Execute custom intents on an EVM chain.
   * 
   * This is the advanced API for composing custom operations like swaps,
   * multi-step transactions, or protocol integrations.
   * 
   * @example
   * ```ts
   * import { buildTransferIntent, buildExecuteIntent } from '@fastxyz/allset-sdk';
   * 
   * // Simple transfer
   * const result = await allset.executeIntent({
   *   chain: 'arbitrum',
   *   fastWallet, // Compatible Fast wallet, e.g. FastWallet from @fastxyz/sdk
   *   token: 'fastUSDC',
   *   amount: '1000000',
   *   intents: [buildTransferIntent(USDC_ADDRESS, '0xRecipient')],
   * });
   * 
   * // Custom contract call
   * const result = await allset.executeIntent({
   *   chain: 'arbitrum',
   *   fastWallet, // Compatible Fast wallet, e.g. FastWallet from @fastxyz/sdk
   *   token: 'fastUSDC',
   *   amount: '1000000',
   *   intents: [buildExecuteIntent(CONTRACT, calldata)],
   *   externalAddress: CONTRACT,
   * });
   * ```
   */
  async executeIntent(params: ExecuteIntentParams): Promise<BridgeResult> {
    const { executeIntent: execIntent } = await import('./bridge.js');
    return execIntent(params, this);
  }

}

// ---------------------------------------------------------------------------
// Directory Utilities
// ---------------------------------------------------------------------------

/**
 * Get the AllSet home directory (~/.allset).
 */
export function getAllSetDir(): string {
  return ALLSET_DIR;
}

/**
 * Get the EVM keys directory (~/.allset/.evm/keys).
 */
export function getEvmKeysDir(): string {
  return EVM_KEYS_DIR;
}

/**
 * Ensure the AllSet directory structure exists.
 */
export function ensureAllSetDirs(): void {
  if (!existsSync(ALLSET_DIR)) {
    mkdirSync(ALLSET_DIR, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(EVM_KEYS_DIR)) {
    mkdirSync(EVM_KEYS_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Initialize user config by writing the embedded defaults to ~/.allset/.
 * Does nothing if user config already exists.
 */
export function initUserConfig(): string {
  ensureAllSetDirs();
  
  const userConfigPath = getUserConfigPath();
  if (existsSync(userConfigPath)) {
    return userConfigPath;
  }

  writeFileSync(
    userConfigPath,
    `${JSON.stringify(DEFAULT_NETWORKS_CONFIG, null, 2)}\n`,
    { mode: 0o600 },
  );

  return userConfigPath;
}

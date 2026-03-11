/**
 * provider.ts — AllSetProvider for bridge configuration
 *
 * Similar to FastProvider, AllSetProvider manages network configuration
 * and provides access to bridge functionality.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NetworkConfig, ChainConfig, TokenConfig, AllNetworksConfig } from './config.js';

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
   * 2. Bundled data/networks.json (package default)
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

function getPackageDataDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', 'data');
}

function getUserConfigPath(): string {
  return join(ALLSET_DIR, 'networks.json');
}

function loadConfig(customPath?: string): AllNetworksConfig {
  // Priority: customPath > ~/.allset/networks.json > bundled data/networks.json
  const paths = [
    customPath,
    getUserConfigPath(),
    join(getPackageDataDir(), 'networks.json'),
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

  throw new Error(
    'Failed to load AllSet networks config. Ensure data/networks.json exists in the package.'
  );
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
 * Initialize user config by copying bundled networks.json to ~/.allset/.
 * Does nothing if user config already exists.
 */
export function initUserConfig(): string {
  ensureAllSetDirs();
  
  const userConfigPath = getUserConfigPath();
  if (existsSync(userConfigPath)) {
    return userConfigPath;
  }

  const bundledPath = join(getPackageDataDir(), 'networks.json');
  if (existsSync(bundledPath)) {
    const content = readFileSync(bundledPath, 'utf-8');
    writeFileSync(userConfigPath, content, { mode: 0o600 });
  }

  return userConfigPath;
}

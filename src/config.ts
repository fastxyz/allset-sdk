/**
 * config.ts — Network configuration loader
 *
 * Loads bridge configuration from data/networks.json.
 * Supports testnet and mainnet configurations.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenConfig {
  evmAddress: string;
  fastTokenId: string;
  decimals: number;
}

export interface ChainConfig {
  chainId: number;
  bridgeContract: string;
  fastBridgeAddress: string;
  relayerUrl: string;
  tokens: Record<string, TokenConfig>;
}

export interface NetworkConfig {
  crossSignUrl: string;
  chains: Record<string, ChainConfig>;
}

export interface AllNetworksConfig {
  testnet: NetworkConfig;
  mainnet: NetworkConfig;
}

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------

let cachedConfig: AllNetworksConfig | null = null;

function getDataDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // In dist/, go up one level to find data/
  return join(__dirname, '..', 'data');
}

/**
 * Load the networks configuration.
 * Caches the result after first load.
 */
export function loadNetworksConfig(): AllNetworksConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = join(getDataDir(), 'networks.json');
  
  try {
    const raw = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as AllNetworksConfig;
    return cachedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load networks config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Get configuration for a specific network (testnet or mainnet).
 */
export function getNetworkConfig(network: 'testnet' | 'mainnet' = 'testnet'): NetworkConfig {
  const config = loadNetworksConfig();
  return config[network];
}

/**
 * Get configuration for a specific chain within a network.
 */
export function getChainConfig(
  chain: string,
  network: 'testnet' | 'mainnet' = 'testnet'
): ChainConfig | null {
  const networkConfig = getNetworkConfig(network);
  return networkConfig.chains[chain] ?? null;
}

/**
 * Get token configuration for a chain.
 */
export function getTokenConfig(
  chain: string,
  token: string,
  network: 'testnet' | 'mainnet' = 'testnet'
): TokenConfig | null {
  const chainConfig = getChainConfig(chain, network);
  if (!chainConfig) return null;
  return chainConfig.tokens[token] ?? chainConfig.tokens[token.toUpperCase()] ?? null;
}

/**
 * Clear the cached config (useful for testing).
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

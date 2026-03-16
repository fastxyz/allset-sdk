/**
 * config.ts — Embedded network configuration accessors
 */

import { DEFAULT_NETWORKS_CONFIG } from './default-config.js';

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

/**
 * Load the networks configuration.
 * Caches a clone of the embedded default config after first load.
 */
export function loadNetworksConfig(): AllNetworksConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = structuredClone(DEFAULT_NETWORKS_CONFIG);
  return cachedConfig;
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

import bundledNetworksConfig from '../data/networks.json' with { type: 'json' };

import type { AllNetworksConfig } from './config.js';

// Single source of truth for the SDK's bundled default network support matrix.
export const DEFAULT_NETWORKS_CONFIG = bundledNetworksConfig as AllNetworksConfig;

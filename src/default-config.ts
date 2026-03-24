import type { AllNetworksConfig } from './node/config.js';

// Single source of truth for the SDK's bundled default network support matrix.
export const DEFAULT_NETWORKS_CONFIG = {
  testnet: {
    crossSignUrl: 'https://testnet.cross-sign.allset.fast.xyz',
    chains: {
      'ethereum-sepolia': {
        chainId: 11155111,
        bridgeContract: '0xb53600976275D6f541a3B929328d07714EFA581F',
        fastBridgeAddress: 'fast1fxtkgpwcy7hnakw96gg7relph4wxx7ghrukm723p3l9adxuxljzsc6f958',
        relayerUrl: 'https://testnet.allset.fast.xyz/ethereum-sepolia/relayer',
        tokens: {
          USDC: {
            evmAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            fastTokenId: 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46',
            decimals: 6,
          },
        },
      },
      'arbitrum-sepolia': {
        chainId: 421614,
        bridgeContract: '0xb53600976275D6f541a3B929328d07714EFA581F',
        fastBridgeAddress: 'fast1tkmtqxulhnzeeg9zhuwxy3x95wr7waytm9cq40ndf7tkuwwcc6jseg24j8',
        relayerUrl: 'https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer',
        tokens: {
          USDC: {
            evmAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
            fastTokenId: 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46',
            decimals: 6,
          },
        },
      },
    },
  },
  mainnet: {
    crossSignUrl: 'https://cross-sign.allset.fast.xyz',
    chains: {
      base: {
        chainId: 8453,
        bridgeContract: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
        fastBridgeAddress: 'fast1aq2hlz8t3ex0vke7056zraxzetmxmpaw84ws9lljdhpqtqkctu4spty8l6',
        relayerUrl: 'https://allset.fast.xyz/base/relayer',
        tokens: {
          USDC: {
            evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            fastTokenId: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130',
            decimals: 6,
          },
        },
      },
      arbitrum: {
        chainId: 42161,
        bridgeContract: '0x8677EdAA374b7A47ff0093947AABE4aCbB2D4538',
        fastBridgeAddress: 'fast1xzuzv3p3zl8pljk5cyq3xn0vpjj9jmhk53zlcv56mu04gwkg256s6ewung',
        relayerUrl: 'https://allset.fast.xyz/arbitrum/relayer',
        tokens: {
          USDC: {
            evmAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            fastTokenId: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130',
            decimals: 6,
          },
        },
      },
    },
  },
} satisfies AllNetworksConfig;

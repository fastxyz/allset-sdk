import type { AllNetworksConfig } from './node/config.js';

// Single source of truth for the SDK's bundled default network support matrix.
export const DEFAULT_NETWORKS_CONFIG = {
  testnet: {
    crossSignUrl: 'https://testnet.cross-sign.allset.fast.xyz',
    chains: {
      ethereum: {
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
      arbitrum: {
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
      base: {
        chainId: 8453,
        bridgeContract: '0x83f0644FF860423539Dc6b6cA6d3b05a6F03337B',
        fastBridgeAddress: 'fast1a4fza9xc8jcm7jp64a0ugtuyw3hkkmje02e8af9aaer4r0je4dpqz4uf58',
        relayerUrl: 'https://testnet.allset.fast.xyz/base/relayer',
        tokens: {
          USDC: {
            evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            fastTokenId: '874e6036509640b52dd5ea8df718686f883f504ec2ae42fb05254c866baa7d65',
            decimals: 6,
          },
        },
      },
    },
  },
  mainnet: {
    crossSignUrl: 'https://cross-sign.allset.fast.xyz',
    chains: {},
  },
} satisfies AllNetworksConfig;

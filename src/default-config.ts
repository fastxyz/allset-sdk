import type { AllNetworksConfig } from './node/config.js';

// Single source of truth for the SDK's bundled default network support matrix.
export const DEFAULT_NETWORKS_CONFIG = {
  testnet: {
    crossSignUrl: 'https://testnet.cross-sign.allset.fast.xyz',
    chains: {
      ethereum: {
        chainId: 11155111,
        bridgeContract: '0x67C5f02df93f2144C6a4e4Fb48D92cE91Cfbc3A6',
        fastBridgeAddress: 'fast1fxtkgpwcy7hnakw96gg7relph4wxx7ghrukm723p3l9adxuxljzsc6f958',
        relayerUrl: 'https://testnet.allset.fast.xyz/ethereum-sepolia/relayer/relay',
        tokens: {
          USDC: {
            evmAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            fastTokenId: '9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8',
            decimals: 6,
          },
        },
      },
      arbitrum: {
        chainId: 421614,
        bridgeContract: '0x67C5f02df93f2144C6a4e4Fb48D92cE91Cfbc3A6',
        fastBridgeAddress: 'fast1tkmtqxulhnzeeg9zhuwxy3x95wr7waytm9cq40ndf7tkuwwcc6jseg24j8',
        relayerUrl: 'https://testnet.allset.fast.xyz/arbitrum-sepolia/relayer/relay',
        tokens: {
          USDC: {
            evmAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
            fastTokenId: '9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8',
            decimals: 6,
          },
        },
      },
      base: {
        chainId: 8453,
        bridgeContract: '0x41cE437493f2a9DDA9214aE7b3662175bBe54a6c',
        fastBridgeAddress: 'fast1a4fza9xc8jcm7jp64a0ugtuyw3hkkmje02e8af9aaer4r0je4dpqz4uf58',
        relayerUrl: 'https://testnet.allset.fast.xyz/base/relayer/relay',
        tokens: {
          USDC: {
            evmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            fastTokenId: 'b4fdab846372740f747eb4b64ac0c22eaa159113f2d35b075027065fba419365',
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

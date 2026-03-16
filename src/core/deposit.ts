import { encodeFunctionData } from 'viem';
import { DEFAULT_NETWORKS_CONFIG } from '../default-config.js';
import { fastAddressToBytes32 } from './address.js';

export interface DepositPlanningTokenConfig {
  evmAddress: string;
  decimals: number;
  isNative?: boolean;
}

export interface DepositPlanningChainConfig {
  chainId: number;
  bridgeContract: string;
  tokens: Record<string, DepositPlanningTokenConfig>;
}

export interface DepositPlanningNetworkConfig {
  chains: Record<string, DepositPlanningChainConfig>;
}

export interface DepositRouteOverrides {
  bridgeAddress?: string;
  tokenAddress?: string;
  chainId?: number;
  decimals?: number;
  isNative?: boolean;
}

export interface ResolveDepositRouteParams {
  network?: 'testnet' | 'mainnet';
  chain: string;
  token: string;
  overrides?: DepositRouteOverrides;
  networkConfig?: DepositPlanningNetworkConfig;
}

export interface DepositRoute {
  network: 'testnet' | 'mainnet';
  chain: string;
  token: string;
  chainId: number;
  bridgeAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  decimals: number;
  isNative: boolean;
}

export interface EncodeDepositCalldataParams {
  tokenAddress: string;
  amount: bigint;
  receiverBytes32: `0x${string}`;
}

export interface BuildDepositTransactionParams extends ResolveDepositRouteParams {
  amount: bigint;
  receiver: string;
}

export interface DepositTransactionPlan {
  chainId: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  receiverBytes32: `0x${string}`;
  route: DepositRoute;
}

const BRIDGE_DEPOSIT_ABI = [{
  type: 'function' as const,
  name: 'deposit' as const,
  inputs: [
    { name: 'token', type: 'address' as const },
    { name: 'amount', type: 'uint256' as const },
    { name: 'receiver', type: 'bytes32' as const },
  ],
  outputs: [],
  stateMutability: 'payable' as const,
}];

function normalizeDepositToken(token: string): string {
  const lowerToken = token.toLowerCase();
  if (lowerToken === 'fastusdc' || lowerToken === 'testusdc') {
    return 'USDC';
  }
  return token;
}

function resolveTokenEntry(
  chainConfig: DepositPlanningChainConfig,
  token: string,
): { tokenKey: string; tokenConfig: DepositPlanningTokenConfig } | null {
  const normalizedToken = normalizeDepositToken(token);

  const exactConfig = chainConfig.tokens[normalizedToken];
  if (exactConfig) {
    return { tokenKey: normalizedToken, tokenConfig: exactConfig };
  }

  const upperToken = normalizedToken.toUpperCase();
  const upperConfig = chainConfig.tokens[upperToken];
  if (upperConfig) {
    return { tokenKey: upperToken, tokenConfig: upperConfig };
  }

  const loweredAddress = token.toLowerCase();
  for (const [tokenKey, tokenConfig] of Object.entries(chainConfig.tokens)) {
    if (tokenConfig.evmAddress.toLowerCase() === loweredAddress) {
      return { tokenKey, tokenConfig };
    }
  }

  return null;
}

export function resolveDepositRoute(params: ResolveDepositRouteParams): DepositRoute {
  const network = params.network ?? 'testnet';
  const networkConfig: DepositPlanningNetworkConfig =
    params.networkConfig ?? DEFAULT_NETWORKS_CONFIG[network];
  const chainConfig = networkConfig.chains[params.chain];

  if (!chainConfig) {
    throw new Error(
      `AllSet does not support EVM chain "${params.chain}" on ${network}. Supported: ${Object.keys(networkConfig.chains).join(', ') || 'none'}`,
    );
  }

  const tokenEntry = resolveTokenEntry(chainConfig, params.token);
  if (!tokenEntry) {
    throw new Error(
      `Cannot resolve token "${params.token}" on AllSet for chain "${params.chain}".`,
    );
  }

  return {
    network,
    chain: params.chain,
    token: tokenEntry.tokenKey,
    chainId: params.overrides?.chainId ?? chainConfig.chainId,
    bridgeAddress: (params.overrides?.bridgeAddress ?? chainConfig.bridgeContract) as `0x${string}`,
    tokenAddress: (params.overrides?.tokenAddress ?? tokenEntry.tokenConfig.evmAddress) as `0x${string}`,
    decimals: params.overrides?.decimals ?? tokenEntry.tokenConfig.decimals,
    isNative: params.overrides?.isNative ?? tokenEntry.tokenConfig.isNative ?? false,
  };
}

export function encodeDepositCalldata(params: EncodeDepositCalldataParams): `0x${string}` {
  return encodeFunctionData({
    abi: BRIDGE_DEPOSIT_ABI,
    functionName: 'deposit',
    args: [
      params.tokenAddress as `0x${string}`,
      params.amount,
      params.receiverBytes32,
    ],
  });
}

export function buildDepositTransactionFromRoute(
  route: DepositRoute,
  amount: bigint,
  receiver: string,
): DepositTransactionPlan {
  const receiverBytes32 = fastAddressToBytes32(receiver);
  return {
    chainId: route.chainId,
    to: route.bridgeAddress,
    data: encodeDepositCalldata({
      tokenAddress: route.tokenAddress,
      amount,
      receiverBytes32,
    }),
    value: route.isNative ? amount : 0n,
    receiverBytes32,
    route,
  };
}

export function buildDepositTransaction(
  params: BuildDepositTransactionParams,
): DepositTransactionPlan {
  const route = resolveDepositRoute(params);
  return buildDepositTransactionFromRoute(route, params.amount, params.receiver);
}

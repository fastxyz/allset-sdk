/**
 * bridge.ts — AllSet bridge provider
 *
 * Bridges between Fast network and the SDK's supported EVM routes.
 *
 * Two directions:
 *   Deposit  (EVM → Fast): call bridge.deposit(token, amount, receiver) on the EVM bridge contract
 *   Withdraw (Fast → EVM): transfer on Fast network + submit ExternalClaim intent + POST to relayer
 */

import { bech32m } from 'bech32';
import { encodeAbiParameters, encodeFunctionData } from 'viem';
import { FastError, type FastWallet } from '@fastxyz/sdk';
import type { BridgeProvider, BridgeParams, BridgeResult, AllSetChainConfig, AllSetTokenInfo } from './types.js';
import { getNetworkConfig, getChainConfig, getTokenConfig, type ChainConfig, type TokenConfig } from './config.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// Default network (can be overridden via environment variable)
const DEFAULT_NETWORK = (process.env.ALLSET_NETWORK as 'testnet' | 'mainnet') || 'testnet';

/**
 * Convert decimal amount string to hex for BCS serialization.
 * The Fast network BCS expects amounts as hex strings.
 */
function amountToHex(amount: string): string {
  return BigInt(amount).toString(16);
}

/**
 * Convert ChainConfig from config.ts to AllSetChainConfig used internally.
 */
function toAllSetChainConfig(config: ChainConfig): AllSetChainConfig {
  return {
    chainId: config.chainId,
    bridgeContract: config.bridgeContract,
    fastsetBridgeAddress: config.fastBridgeAddress,
    relayerUrl: config.relayerUrl,
  };
}

/**
 * Convert TokenConfig from config.ts to AllSetTokenInfo used internally.
 */
function toAllSetTokenInfo(config: TokenConfig): AllSetTokenInfo {
  return {
    evmAddress: config.evmAddress,
    fastsetTokenId: hexToUint8Array(config.fastTokenId),
    decimals: config.decimals,
    isNative: false,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAllSetToken(token: string, evmChain: string, network: 'testnet' | 'mainnet' = DEFAULT_NETWORK): AllSetTokenInfo | null {
  // Normalize token name - fastUSDC on Fast maps to USDC on EVM
  const normalizedToken = token.toLowerCase() === 'fastusdc' ? 'USDC' : token;

  // Try exact match first
  const tokenConfig = getTokenConfig(evmChain, normalizedToken, network);
  if (tokenConfig) {
    return toAllSetTokenInfo(tokenConfig);
  }

  // Try uppercase
  const upperConfig = getTokenConfig(evmChain, normalizedToken.toUpperCase(), network);
  if (upperConfig) {
    return toAllSetTokenInfo(upperConfig);
  }

  // Try matching by EVM address
  const chainConfig = getChainConfig(evmChain, network);
  if (chainConfig) {
    for (const [, info] of Object.entries(chainConfig.tokens)) {
      if (info.evmAddress.toLowerCase() === token.toLowerCase()) {
        return toAllSetTokenInfo(info);
      }
    }
  }

  return null;
}

function fastAddressToBytes32(address: string): `0x${string}` {
  const { words } = bech32m.decode(address, 90);
  const bytes = new Uint8Array(bech32m.fromWords(words));
  return `0x${Buffer.from(bytes).toString('hex')}` as `0x${string}`;
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
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

// ─── evmSign (AllSet cross-signing) ───────────────────────────────────────────

export interface EvmSignResult {
  transaction: number[];
  signature: string;
}

/**
 * Request EVM cross-signing for a Fast network certificate.
 *
 * This is an AllSet-specific operation that requests the AllSet committee
 * to sign a certificate for verification on EVM chains.
 *
 * @param certificate - The certificate from a FastWallet.send() or FastWallet.submit() call
 * @param crossSignUrl - Optional custom cross-sign service URL
 * @returns The signed transaction bytes and signature for relayer submission
 *
 * @example
 * ```ts
 * const result = await fastWallet.send({ to: bridgeAddress, amount: '1000000', token: 'fastUSDC' });
 * const signed = await evmSign(result.certificate);
 * // Use signed.transaction and signed.signature with the relayer
 * ```
 */
export async function evmSign(
  certificate: unknown,
  crossSignUrl?: string,
): Promise<EvmSignResult> {
  const url = crossSignUrl ?? getNetworkConfig(DEFAULT_NETWORK).crossSignUrl;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'crossSign_evmSignCertificate',
      params: { certificate },
    }),
  });

  if (!res.ok) {
    throw new FastError(
      'TX_FAILED',
      `Cross-sign request failed: ${res.status}`,
      { note: 'The AllSet cross-sign service rejected the request.' },
    );
  }

  const json = await res.json() as {
    result?: { transaction: number[]; signature: string };
    error?: { message: string };
  };

  if (json.error) {
    throw new FastError(
      'TX_FAILED',
      `Cross-sign error: ${json.error.message}`,
      { note: 'The certificate could not be cross-signed.' },
    );
  }

  if (!json.result?.transaction || !json.result?.signature) {
    throw new FastError(
      'TX_FAILED',
      'Cross-sign returned invalid response',
      { note: 'Missing transaction or signature in response.' },
    );
  }

  return json.result;
}

// ─── Bridge Execution ─────────────────────────────────────────────────────────

/**
 * Provider interface for bridge configuration.
 * Matches AllSetProvider from provider.ts (defined here to avoid circular import).
 */
interface BridgeProviderConfig {
  network: 'testnet' | 'mainnet';
  crossSignUrl: string;
  getChainConfig(chain: string): { chainId: number; bridgeContract: string; fastBridgeAddress: string; relayerUrl: string; tokens: Record<string, { evmAddress: string; fastTokenId: string; decimals: number }> } | null;
  getTokenConfig(chain: string, token: string): { evmAddress: string; fastTokenId: string; decimals: number } | null;
}

/**
 * Execute a bridge operation with optional provider configuration.
 * Called by AllSetProvider.bridge() or directly via allsetProvider singleton.
 */
export async function executeBridge(params: BridgeParams, provider?: BridgeProviderConfig): Promise<BridgeResult> {
  const network = provider?.network ?? DEFAULT_NETWORK;
  
  try {
    const isDeposit = params.fromChain !== 'fast' && params.toChain === 'fast';
    const isWithdraw = params.fromChain === 'fast';

    if (!isDeposit && !isWithdraw) {
      throw new FastError(
        'UNSUPPORTED_OPERATION',
        `AllSet only supports bridging between Fast network and EVM chains (ethereum, arbitrum). Got: ${params.fromChain} → ${params.toChain}`,
        {
          note: 'Use fromChain: "fast" for withdrawals, or toChain: "fast" for deposits.\n  Example: await allset.bridge({ fromChain: "ethereum", toChain: "fast", fromToken: "USDC", toToken: "fastUSDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
        },
      );
    }

    if (isDeposit) {
      return await handleDeposit(params, network, provider?.crossSignUrl);
    }

    return await handleWithdraw(params, network, provider?.crossSignUrl);
  } catch (err: unknown) {
    if (err instanceof FastError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new FastError(
      'TX_FAILED',
      `AllSet bridge failed: ${msg}`,
      {
        note: 'Check that both chains are configured and have sufficient balance.',
      },
    );
  }
}

// ─── Backwards Compatible Singleton ───────────────────────────────────────────

/**
 * Default bridge provider singleton (backwards compatible).
 * For configurable usage, use AllSetProvider instead.
 */
export const allsetProvider: BridgeProvider = {
  name: 'allset',
  chains: ['fast', 'ethereum', 'arbitrum'],
  networks: ['testnet'],

  async bridge(params: BridgeParams): Promise<BridgeResult> {
    return executeBridge(params);
  },
};

// ─── Deposit (EVM → Fast) ─────────────────────────────────────────────────────

async function handleDeposit(params: BridgeParams, network: 'testnet' | 'mainnet' = DEFAULT_NETWORK, crossSignUrl?: string): Promise<BridgeResult> {
  if (!params.evmExecutor) {
    throw new FastError(
      'INVALID_PARAMS',
      'AllSet deposit (EVM → Fast) requires evmExecutor',
      {
        note: 'Provide an evmExecutor created with createEvmExecutor().\n  Example: const executor = createEvmExecutor(privateKey, rpcUrl, chainId)',
      },
    );
  }

  const chainConfigRaw = getChainConfig(params.fromChain, network);
  if (!chainConfigRaw) {
    const networkConfig = getNetworkConfig(network);
    throw new FastError(
      'UNSUPPORTED_OPERATION',
      `AllSet does not support EVM chain "${params.fromChain}". Supported: ${Object.keys(networkConfig.chains).join(', ')}`,
      {
        note: 'Use "ethereum" or "arbitrum" as the source chain for AllSet deposits.',
      },
    );
  }
  const chainConfig = toAllSetChainConfig(chainConfigRaw);

  let tokenInfo = resolveAllSetToken(params.fromToken, params.fromChain, network);
  if (!tokenInfo) {
    tokenInfo = resolveAllSetToken(params.toToken, params.fromChain, network);
  }
  if (!tokenInfo) {
    throw new FastError(
      'TOKEN_NOT_FOUND',
      `Cannot resolve token "${params.fromToken}" on AllSet for chain "${params.fromChain}".`,
      {
        note: 'Supported tokens: USDC, fastUSDC.\n  Example: await allset.bridge({ fromChain: "arbitrum", toChain: "fast", fromToken: "USDC", toToken: "fastUSDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
      },
    );
  }

  let receiverBytes32: `0x${string}`;
  try {
    receiverBytes32 = fastAddressToBytes32(params.receiverAddress);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FastError(
      'INVALID_ADDRESS',
      `Failed to decode Fast network receiver address "${params.receiverAddress}": ${msg}`,
      {
        note: 'The receiver address must be a valid Fast network bech32m address (fast1...).\n  Example: fast1abc...',
      },
    );
  }

  const calldata = encodeFunctionData({
    abi: BRIDGE_DEPOSIT_ABI,
    functionName: 'deposit',
    args: [
      tokenInfo.evmAddress as `0x${string}`,
      BigInt(params.amount),
      receiverBytes32,
    ],
  });

  let txHash: string;

  if (tokenInfo.isNative) {
    const receipt = await params.evmExecutor.sendTx({
      to: chainConfig.bridgeContract,
      data: calldata,
      value: params.amount,
    });
    if (receipt.status === 'reverted') {
      throw new FastError(
        'TX_FAILED',
        `AllSet deposit transaction reverted: ${receipt.txHash}`,
        {
          note: 'The deposit transaction was reverted. Check that you have sufficient ETH balance.',
        },
      );
    }
    txHash = receipt.txHash;
  } else {
    const requiredAmount = BigInt(params.amount);
    const currentAllowance = await params.evmExecutor.checkAllowance(
      tokenInfo.evmAddress,
      chainConfig.bridgeContract,
      params.senderAddress,
    );
    if (currentAllowance < requiredAmount) {
      await params.evmExecutor.approveErc20(
        tokenInfo.evmAddress,
        chainConfig.bridgeContract,
        params.amount,
      );
    }

    const receipt = await params.evmExecutor.sendTx({
      to: chainConfig.bridgeContract,
      data: calldata,
      value: '0',
    });
    if (receipt.status === 'reverted') {
      throw new FastError(
        'TX_FAILED',
        `AllSet deposit transaction reverted: ${receipt.txHash}`,
        {
          note: 'The deposit transaction was reverted. Check that you have sufficient token balance and the approval succeeded.',
        },
      );
    }
    txHash = receipt.txHash;
  }

  return {
    txHash,
    orderId: txHash,
    estimatedTime: '1-5 minutes',
  };
}

// ─── Withdraw (Fast → EVM) ────────────────────────────────────────────────────

async function handleWithdraw(params: BridgeParams, network: 'testnet' | 'mainnet' = DEFAULT_NETWORK, crossSignUrl?: string): Promise<BridgeResult> {
  if (!params.fastWallet) {
    throw new FastError(
      'INVALID_PARAMS',
      'AllSet withdrawal (Fast → EVM) requires fastWallet',
      {
        note: 'Provide a FastWallet from @fastxyz/sdk.\n  Example: const wallet = await FastWallet.fromKeyfile("~/.fast/keys/default.json", provider)',
      },
    );
  }

  const chainConfigRaw = getChainConfig(params.toChain, network);
  if (!chainConfigRaw) {
    const networkConfig = getNetworkConfig(network);
    throw new FastError(
      'UNSUPPORTED_OPERATION',
      `AllSet does not support EVM destination chain "${params.toChain}". Supported: ${Object.keys(networkConfig.chains).join(', ')}`,
      {
        note: 'Use "ethereum" or "arbitrum" as the destination chain for AllSet withdrawals.',
      },
    );
  }
  const chainConfig = toAllSetChainConfig(chainConfigRaw);

  let tokenInfo = resolveAllSetToken(params.fromToken, params.toChain, network);
  if (!tokenInfo) {
    tokenInfo = resolveAllSetToken(params.toToken, params.toChain, network);
  }
  if (!tokenInfo) {
    throw new FastError(
      'TOKEN_NOT_FOUND',
      `Cannot resolve token "${params.fromToken}" on AllSet for destination chain "${params.toChain}".`,
      {
        note: 'Supported tokens: USDC, fastUSDC.\n  Example: await allset.bridge({ fromChain: "fast", toChain: "arbitrum", fromToken: "fastUSDC", toToken: "USDC", amount: "1000000", senderAddress: "fast1...", receiverAddress: "0x..." })',
      },
    );
  }

  const evmTokenAddress = tokenInfo.evmAddress;
  const fastWallet = params.fastWallet;

  // Step 1: Transfer tokens to bridge address on Fast network
  const transferResult = await fastWallet.submit({
    recipient: chainConfig.fastsetBridgeAddress,
    claim: {
      TokenTransfer: {
        token_id: tokenInfo.fastsetTokenId,
        amount: amountToHex(params.amount),
        user_data: null,
      },
    },
  });

  // Step 2: Cross-sign the transfer certificate
  const transferCrossSign = await evmSign(transferResult.certificate, crossSignUrl);

  // Use the transaction hash directly (keccak256 of BCS-serialized transaction)
  const transferFastTxId = transferResult.txHash as `0x${string}`;

  // Step 3: Build intent claim
  const dynamicTransferPayload = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }],
    [
      evmTokenAddress as `0x${string}`,
      params.receiverAddress as `0x${string}`,
    ],
  );

  // Deadline: 1 hour from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const intentClaimEncoded = encodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { name: 'transferFastTxId', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
        {
          name: 'intents',
          type: 'tuple[]',
          components: [
            { name: 'action', type: 'uint8' },
            { name: 'payload', type: 'bytes' },
            { name: 'value', type: 'uint256' },
          ],
        },
      ],
    }],
    [{
      transferFastTxId,
      deadline,
      intents: [{
        action: 1,
        payload: dynamicTransferPayload,
        value: 0n,
      }],
    }],
  );

  const intentBytes = hexToUint8Array(intentClaimEncoded);

  // Step 4: Submit intent claim to self
  const intentResult = await fastWallet.submit({
    recipient: fastWallet.address,
    claim: {
      ExternalClaim: {
        claim: {
          verifier_committee: [] as Uint8Array[],
          verifier_quorum: 0,
          claim_data: Array.from(intentBytes),
        },
        signatures: [] as Array<[Uint8Array, Uint8Array]>,
      },
    },
  });

  // Step 5: Cross-sign the intent certificate
  const intentCrossSign = await evmSign(intentResult.certificate, crossSignUrl);

  // Step 6: Submit to relayer
  const relayerBody = {
    encoded_transfer_claim: Array.from(new Uint8Array(transferCrossSign.transaction.map(Number))),
    transfer_proof: transferCrossSign.signature,
    transfer_fast_tx_id: transferResult.txHash,
    transfer_claim_id: transferResult.txHash,
    fastset_address: params.senderAddress,
    external_address: params.receiverAddress,
    encoded_intent_claim: Array.from(new Uint8Array(intentCrossSign.transaction.map(Number))),
    intent_proof: intentCrossSign.signature,
    intent_fast_tx_id: intentResult.txHash,
    intent_claim_id: intentResult.txHash,
    external_token_address: evmTokenAddress,
  };

  const relayRes = await fetch(chainConfig.relayerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relayerBody),
  });

  if (!relayRes.ok) {
    const text = await relayRes.text();
    throw new FastError(
      'TX_FAILED',
      `AllSet relayer request failed (${relayRes.status}): ${text}`,
      {
        note: 'The withdrawal was submitted to Fast network but the relayer rejected it. Try again.',
      },
    );
  }

  return {
    txHash: transferResult.txHash,
    orderId: transferFastTxId,
    estimatedTime: '1-5 minutes',
  };
}

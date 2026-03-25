/**
 * bridge.ts — AllSet bridge provider
 *
 * Bridges between Fast network and the SDK's supported EVM routes.
 *
 * Two directions:
 *   Deposit  (EVM → Fast): call bridge.deposit(token, amount, receiver) on the EVM bridge contract
 *   Withdraw (Fast → EVM): transfer on Fast network + submit ExternalClaim intent + POST to relayer
 */

import { bytesToHex, decodeAbiParameters, encodeAbiParameters } from 'viem';
import type { BridgeParams, BridgeResult, AllSetChainConfig, AllSetTokenInfo, ExecuteIntentParams } from './types.js';
import { fastAddressToBytes } from '../core/address.js';
import { getNetworkConfig, getChainConfig, getTokenConfig, type ChainConfig, type TokenConfig } from './config.js';
import { buildDepositTransactionFromRoute } from '../core/deposit.js';
import { IntentAction, type Intent, buildTransferIntent } from '../intents.js';
import { ERC20_ABI, type EvmClients } from './evm-executor.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// Default network (can be overridden via environment variable)
const DEFAULT_NETWORK = (process.env.ALLSET_NETWORK as 'testnet' | 'mainnet') || 'testnet';

type FastErrorInstance = Error & {
  code: string;
  note: string;
  toJSON(): Record<string, unknown>;
};

type FastErrorConstructor = new (
  code: string,
  message: string,
  opts?: { note?: string },
) => FastErrorInstance;

class LocalFastError extends Error {
  code: string;
  note: string;

  constructor(code: string, message: string, opts?: { note?: string }) {
    super(message);
    this.name = 'FastError';
    this.code = code;
    this.note = opts?.note ?? '';
  }

  toJSON() {
    return {
      error: true as const,
      code: this.code,
      message: this.message,
      note: this.note,
    };
  }
}

let sdkFastErrorPromise: Promise<FastErrorConstructor | null> | null = null;

// Keep @fastxyz/sdk runtime-optional for deposit-only consumers.
async function loadFastErrorConstructor(): Promise<FastErrorConstructor | null> {
  sdkFastErrorPromise ??= import('@fastxyz/sdk')
    .then((mod) => (typeof mod.FastError === 'function' ? mod.FastError as FastErrorConstructor : null))
    .catch(() => null);

  return sdkFastErrorPromise;
}

async function createFastError(
  code: string,
  message: string,
  opts?: { note?: string },
): Promise<FastErrorInstance> {
  const FastError = await loadFastErrorConstructor();
  return FastError ? new FastError(code, message, opts) : new LocalFastError(code, message, opts);
}

function isFastError(err: unknown): err is FastErrorInstance {
  return (
    err instanceof Error &&
    err.name === 'FastError' &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { note?: unknown }).note === 'string'
  );
}

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

interface BridgeProviderConfig {
  network: 'testnet' | 'mainnet';
  crossSignUrl?: string;
  getChainConfig(chain: string): ChainConfig | null;
  getTokenConfig(chain: string, token: string): TokenConfig | null;
  getNetworkConfig?(): { chains: Record<string, ChainConfig> };
}

function resolveChainConfig(
  chain: string,
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): ChainConfig | null {
  return provider?.getChainConfig(chain) ?? getChainConfig(chain, network);
}

function resolveTokenConfig(
  chain: string,
  token: string,
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): TokenConfig | null {
  return provider?.getTokenConfig(chain, token) ?? getTokenConfig(chain, token, network);
}

function getSupportedChains(
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): string[] {
  return Object.keys(provider?.getNetworkConfig?.().chains ?? getNetworkConfig(network).chains);
}

function resolveAllSetToken(
  token: string,
  evmChain: string,
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): AllSetTokenInfo | null {
  // Normalize token name - testUSDC on Fast testnet maps to USDC on EVM
  const lowerToken = token.toLowerCase();
  const normalizedToken = (lowerToken === 'fastusdc' || lowerToken === 'testusdc') ? 'USDC' : token;

  // Try exact match first
  const tokenConfig = resolveTokenConfig(evmChain, normalizedToken, network, provider);
  if (tokenConfig) {
    return toAllSetTokenInfo(tokenConfig);
  }

  // Try uppercase
  const upperConfig = resolveTokenConfig(evmChain, normalizedToken.toUpperCase(), network, provider);
  if (upperConfig) {
    return toAllSetTokenInfo(upperConfig);
  }

  // Try matching by EVM address
  const chainConfig = resolveChainConfig(evmChain, network, provider);
  if (chainConfig) {
    for (const [, info] of Object.entries(chainConfig.tokens)) {
      if (info.evmAddress.toLowerCase() === token.toLowerCase()) {
        return toAllSetTokenInfo(info);
      }
    }
  }

  return null;
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── EVM Transaction Helpers ──────────────────────────────────────────────────
async function sendTx(
  clients: EvmClients,
  tx: { to: string; data: string; value: string; gas?: string },
): Promise<{ txHash: string; status: 'success' | 'reverted' }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletClient = clients.walletClient as any;
  const hash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value),
    gas: tx.gas ? BigInt(tx.gas) : undefined,
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  return {
    txHash: hash,
    status: receipt.status === 'success' ? 'success' : 'reverted',
  };
}

async function checkAllowance(
  clients: EvmClients,
  token: string,
  spender: string,
  owner: string,
): Promise<bigint> {
  const allowance = await clients.publicClient.readContract({
    address: token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`],
  });
  return allowance;
}

async function approveErc20(
  clients: EvmClients,
  token: string,
  spender: string,
  amount: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletClient = clients.walletClient as any;
  const hash = await walletClient.writeContract({
    address: token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as `0x${string}`, BigInt(amount)],
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
function resolveExternalAddress(
  intents: Intent[],
  externalAddressOverride?: string,
): `0x${string}` | null {
  if (externalAddressOverride) {
    return externalAddressOverride as `0x${string}`;
  }

  for (const intent of intents) {
    if (intent.action === IntentAction.DynamicTransfer) {
      try {
        const [, receiver] = decodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }],
          intent.payload,
        );
        return receiver;
      } catch {
        continue;
      }
    }

    if (intent.action === IntentAction.Execute) {
      try {
        const [target] = decodeAbiParameters(
          [{ type: 'address' }, { type: 'bytes' }],
          intent.payload,
        );
        return target;
      } catch {
        continue;
      }
    }
  }

  return null;
}

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
 * const result = await fastWallet.send({ to: bridgeAddress, amount: '1000000', token: 'USDC' });
 * const signed = await evmSign(result.certificate);
 * // Use signed.transaction and signed.signature with the relayer
 * ```
 */
/**
 * Convert BigInt values to numbers recursively for JSON serialization.
 * The cross-sign service expects numbers, not BigInt strings.
 */
function bigIntToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(bigIntToNumber);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = bigIntToNumber(value);
    }
    return result;
  }
  return obj;
}

export async function evmSign(
  certificate: unknown,
  crossSignUrl?: string,
): Promise<EvmSignResult> {
  const url = crossSignUrl ?? getNetworkConfig(DEFAULT_NETWORK).crossSignUrl;
  // Convert BigInt values to numbers for cross-sign compatibility
  const serializedCertificate = bigIntToNumber(certificate);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'crossSign_evmSignCertificate',
      params: { certificate: serializedCertificate },
    }),
  });

  if (!res.ok) {
    throw await createFastError(
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
    throw await createFastError(
      'TX_FAILED',
      `Cross-sign error: ${json.error.message}`,
      { note: 'The certificate could not be cross-signed.' },
    );
  }

  if (!json.result?.transaction || !json.result?.signature) {
    throw await createFastError(
      'TX_FAILED',
      'Cross-sign returned invalid response',
      { note: 'Missing transaction or signature in response.' },
    );
  }

  return json.result;
}

// ─── Bridge Execution ─────────────────────────────────────────────────────────

/**
 * Execute a bridge operation with optional provider configuration.
 * Called by AllSetProvider.bridge() or directly for low-level usage.
 */
export async function executeBridge(params: BridgeParams, provider?: BridgeProviderConfig): Promise<BridgeResult> {
  const network = provider?.network ?? DEFAULT_NETWORK;
  
  try {
    const isDeposit = params.fromChain !== 'fast' && params.toChain === 'fast';
    const isWithdraw = params.fromChain === 'fast';

    if (!isDeposit && !isWithdraw) {
      throw await createFastError(
        'UNSUPPORTED_OPERATION',
        `AllSet only supports bridging between Fast network and configured EVM chains (${getSupportedChains(network, provider).join(', ') || 'none'}). Got: ${params.fromChain} → ${params.toChain}`,
        {
          note: 'Use fromChain: "fast" for withdrawals, or toChain: "fast" for deposits.\n  Example: await allset.bridge({ fromChain: "base", toChain: "fast", fromToken: "USDC", toToken: "USDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
        },
      );
    }

    if (isDeposit) {
      return await handleDeposit(params, network, provider);
    }

    return await handleWithdraw(params, network, provider);
  } catch (err: unknown) {
    if (isFastError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw await createFastError(
      'TX_FAILED',
      `AllSet bridge failed: ${msg}`,
      {
        note: 'Check that both chains are configured and have sufficient balance.',
      },
    );
  }
}

// ─── Deposit (EVM → Fast) ─────────────────────────────────────────────────────

async function handleDeposit(
  params: BridgeParams,
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): Promise<BridgeResult> {
  if (!params.evmClients) {
    throw await createFastError(
      'INVALID_PARAMS',
      'AllSet deposit (EVM → Fast) requires evmClients',
      {
        note: 'Provide evmClients created with createEvmExecutor().\n  Example: const account = createEvmWallet(path); const clients = createEvmExecutor(account, rpcUrl, chainId)',
      },
    );
  }

  const chainConfigRaw = resolveChainConfig(params.fromChain, network, provider);
  if (!chainConfigRaw) {
    throw await createFastError(
      'UNSUPPORTED_OPERATION',
      `AllSet does not support EVM chain "${params.fromChain}". Supported: ${getSupportedChains(network, provider).join(', ')}`,
      {
        note: 'Use one of the configured EVM chains as the source chain for AllSet deposits.',
      },
    );
  }
  const chainConfig = toAllSetChainConfig(chainConfigRaw);

  let tokenInfo = resolveAllSetToken(params.fromToken, params.fromChain, network, provider);
  if (!tokenInfo) {
    tokenInfo = resolveAllSetToken(params.toToken, params.fromChain, network, provider);
  }
  if (!tokenInfo) {
    throw await createFastError(
      'TOKEN_NOT_FOUND',
      `Cannot resolve token "${params.fromToken}" on AllSet for chain "${params.fromChain}".`,
      {
        note: 'Supported tokens: USDC (mainnet), testUSDC (testnet).\n  Example: await allset.bridge({ fromChain: "base", toChain: "fast", fromToken: "USDC", toToken: "USDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
      },
    );
  }

  let depositPlan: ReturnType<typeof buildDepositTransactionFromRoute>;
  try {
    depositPlan = buildDepositTransactionFromRoute(
      {
        network,
        chain: params.fromChain,
        token: params.fromToken,
        chainId: chainConfig.chainId,
        bridgeAddress: chainConfig.bridgeContract as `0x${string}`,
        tokenAddress: tokenInfo.evmAddress as `0x${string}`,
        decimals: tokenInfo.decimals,
        isNative: tokenInfo.isNative,
      },
      BigInt(params.amount),
      params.receiverAddress,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw await createFastError(
      'INVALID_ADDRESS',
      `Failed to decode Fast network receiver address "${params.receiverAddress}": ${msg}`,
      {
        note: 'The receiver address must be a valid Fast network bech32m address (fast1...).\n  Example: fast1abc...',
      },
    );
  }

  let txHash: string;

  if (depositPlan.route.isNative) {
    const receipt = await sendTx(params.evmClients, {
      to: depositPlan.to,
      data: depositPlan.data,
      value: depositPlan.value.toString(),
    });
    if (receipt.status === 'reverted') {
      throw await createFastError(
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
    const currentAllowance = await checkAllowance(
      params.evmClients,
      depositPlan.route.tokenAddress,
      depositPlan.to,
      params.senderAddress,
    );
    if (currentAllowance < requiredAmount) {
      await approveErc20(
        params.evmClients,
        depositPlan.route.tokenAddress,
        depositPlan.to,
        params.amount,
      );
    }

    const receipt = await sendTx(params.evmClients, {
      to: depositPlan.to,
      data: depositPlan.data,
      value: depositPlan.value.toString(),
    });
    if (receipt.status === 'reverted') {
      throw await createFastError(
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

// ─── Execute Intent (Core) ────────────────────────────────────────────────────

/**
 * Execute intents on an EVM chain after transferring tokens from Fast network.
 * This is the core function used by sendToExternal and can be used directly for
 * advanced use cases like swaps, multi-step operations, etc.
 */
export async function executeIntent(
  params: ExecuteIntentParams,
  provider?: BridgeProviderConfig,
): Promise<BridgeResult> {
  const network = provider?.network ?? DEFAULT_NETWORK;
  const crossSignUrl = provider?.crossSignUrl;
  const {
    fastWallet,
    chain,
    token,
    amount,
    intents,
    externalAddress: externalAddressOverride,
    deadlineSeconds = 3600,
  } = params;

  if (!fastWallet) {
    throw await createFastError(
      'INVALID_PARAMS',
      'executeIntent requires fastWallet',
      {
        note: 'Provide a compatible Fast wallet.\n  Example: const wallet = await FastWallet.fromKeyfile("~/.fast/keys/default.json", provider)',
      },
    );
  }

  if (!intents || intents.length === 0) {
    throw await createFastError(
      'INVALID_PARAMS',
      'executeIntent requires at least one intent',
      {
        note: 'Use intent builders like buildTransferIntent(), buildExecuteIntent(), etc.',
      },
    );
  }

  if (externalAddressOverride && !externalAddressOverride.startsWith('0x')) {
    throw await createFastError(
      'INVALID_PARAMS',
      'executeIntent externalAddress must be an EVM address',
      {
        note: 'Pass a 0x-prefixed address for the relayer target.',
      },
    );
  }

  const chainConfigRaw = resolveChainConfig(chain, network, provider);
  if (!chainConfigRaw) {
    throw await createFastError(
      'UNSUPPORTED_OPERATION',
      `AllSet does not support EVM chain "${chain}". Supported: ${getSupportedChains(network, provider).join(', ')}`,
      {
        note: 'Use one of the configured EVM chains.',
      },
    );
  }
  const chainConfig = toAllSetChainConfig(chainConfigRaw);

  const tokenInfo = resolveAllSetToken(token, chain, network, provider);
  if (!tokenInfo) {
    throw await createFastError(
      'TOKEN_NOT_FOUND',
      `Cannot resolve token "${token}" on AllSet for chain "${chain}".`,
      {
        note: 'Supported tokens: USDC (mainnet), testUSDC (testnet).',
      },
    );
  }

  // Step 1: Transfer tokens to bridge address on Fast network
  const transferResult = await fastWallet.submit({
    claim: {
      TokenTransfer: {
        token_id: tokenInfo.fastsetTokenId,
        recipient: fastAddressToBytes(chainConfig.fastsetBridgeAddress),
        amount: amountToHex(amount),
        user_data: null,
      },
    },
  });

  // Step 2: Cross-sign the transfer certificate
  const transferCrossSign = await evmSign(transferResult.certificate, crossSignUrl);
  const transferFastTxId = bytesToHex(
    new Uint8Array(transferCrossSign.transaction).slice(32, 64),
  ) as `0x${string}`;

  // Step 3: Build intent claim with provided intents
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

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
      intents: intents.map(i => ({
        action: i.action,
        payload: i.payload,
        value: i.value,
      })),
    }],
  );

  const intentBytes = hexToUint8Array(intentClaimEncoded);

  // Step 4: Submit intent claim on Fast
  const intentResult = await fastWallet.submit({
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
  const externalAddress = resolveExternalAddress(intents, externalAddressOverride);
  if (!externalAddress) {
    throw await createFastError(
      'INVALID_PARAMS',
      'executeIntent requires externalAddress when intents do not include a transfer recipient or execute target',
      {
        note: 'Pass externalAddress for flows like buildDepositBackIntent() or buildRevokeIntent().',
      },
    );
  }

  const relayerBody = {
    encoded_transfer_claim: Array.from(new Uint8Array(transferCrossSign.transaction.map(Number))),
    transfer_proof: transferCrossSign.signature,
    transfer_fast_tx_id: transferResult.txHash,
    transfer_claim_id: transferResult.txHash,
    fastset_address: fastWallet.address,
    external_address: externalAddress,
    encoded_intent_claim: Array.from(new Uint8Array(intentCrossSign.transaction.map(Number))),
    intent_proof: intentCrossSign.signature,
    intent_fast_tx_id: intentResult.txHash,
    intent_claim_id: intentResult.txHash,
    external_token_address: tokenInfo.evmAddress,
  };

  const relayRes = await fetch(`${chainConfig.relayerUrl}/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relayerBody),
  });

  if (!relayRes.ok) {
    const text = await relayRes.text();
    throw await createFastError(
      'TX_FAILED',
      `AllSet relayer request failed (${relayRes.status}): ${text}`,
      {
        note: 'The intent was submitted to Fast network but the relayer rejected it. Try again.',
      },
    );
  }

  return {
    txHash: transferResult.txHash,
    orderId: transferFastTxId,
    estimatedTime: '1-5 minutes',
  };
}

// ─── Withdraw (Fast → EVM) ────────────────────────────────────────────────────

async function handleWithdraw(
  params: BridgeParams,
  network: 'testnet' | 'mainnet' = DEFAULT_NETWORK,
  provider?: BridgeProviderConfig,
): Promise<BridgeResult> {
  if (!params.fastWallet) {
    throw await createFastError(
      'INVALID_PARAMS',
      'AllSet withdrawal (Fast → EVM) requires fastWallet',
      {
        note: 'Provide a compatible Fast wallet.\n  Example: const wallet = await FastWallet.fromKeyfile("~/.fast/keys/default.json", provider)',
      },
    );
  }

  // Resolve token to get EVM address for the transfer intent
  const tokenInfo = resolveAllSetToken(params.fromToken, params.toChain, network, provider)
    ?? resolveAllSetToken(params.toToken, params.toChain, network, provider);

  if (!tokenInfo) {
    throw await createFastError(
      'TOKEN_NOT_FOUND',
      `Cannot resolve token "${params.fromToken}" on AllSet for destination chain "${params.toChain}".`,
      {
        note: 'Supported tokens: USDC (mainnet), testUSDC (testnet).',
      },
    );
  }

  // Build a simple transfer intent
  const transferIntent = buildTransferIntent(tokenInfo.evmAddress, params.receiverAddress);

  // Execute the intent
  return executeIntent(
    {
      chain: params.toChain,
      fastWallet: params.fastWallet,
      token: params.fromToken,
      amount: params.amount,
      intents: [transferIntent],
    },
    provider,
  );
}

/**
 * eip7702.ts — EIP-7702 smartDeposit via AllSet Portal relay
 *
 * Flow:
 *   1. Poll ERC-20 balance until >= minAmount
 *   2. POST /userop/prepare  → backend assembles UserOp + paymasterData
 *   3. Sign EIP-7702 authorization (re-delegate EOA to v0.8 impl)
 *   4. Sign UserOperation (EIP-712, v0.8)
 *   5. POST /userop/submit  → backend calls Pimlico eth_sendUserOperation
 *
 * Private key never leaves the SDK.
 * Pimlico API key never touches the SDK.
 * Gas is paid in USDC via ERC-20 Paymaster.
 * Chain is inferred from rpcUrl (backend calls eth_chainId) — no hardcoded chain list.
 */

import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getUserOperationTypedData, type UserOperation } from 'viem/account-abstraction';

const ENTRY_POINT_V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as Address;

const ERC20_BALANCEOF_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encode a number/bigint as an even-length 0x-prefixed hex string.
 * JSON-RPC "quantity" spec allows "0x0", but some strict bundler parsers
 * (and EIP-7702 auth tuple consumers) expect byte-aligned hex — so we pad
 * to at least 2 hex chars and always an even length.
 */
function toEvenHex(n: number | bigint): Hex {
  let h = n.toString(16);
  if (h.length % 2 !== 0) h = `0${h}`;
  return `0x${h}` as Hex;
}

/**
 * POST JSON with a hard timeout via AbortController.
 * Node's global fetch has no default timeout — without this a hung
 * backend (or stalled proxy/LB/TLS handshake) would hang smartDeposit
 * indefinitely. Throws a descriptive error on timeout or non-2xx.
 */
async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`POST ${url} failed (${res.status}): ${err}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error(`POST ${url} timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartDepositParams {
  /** EOA private key — stays local, never sent to backend */
  privateKey: Hex;
  /** EVM JSON-RPC URL — used for balance polling and forwarded to backend for chainId detection */
  rpcUrl: string;
  /** AllSet Portal backend base URL, e.g. https://api.allset.xyz */
  allsetApiUrl: string;
  /** ERC-20 token to watch (e.g. USDC on Base) */
  tokenAddress: Address;
  /** Minimum token balance (raw, with decimals) that triggers deposit */
  minAmount: bigint;
  /** AllSet bridge contract address */
  bridgeAddress: Address;
  /** Encoded bridge.deposit(...) calldata from encodeDepositCalldata() */
  depositCalldata: Hex;
  /** Balance poll interval in ms (default: 3000) */
  pollIntervalMs?: number;
  /** Total timeout in ms waiting for balance (default: no timeout) */
  timeoutMs?: number;
  /** Per-request HTTP timeout in ms for backend POSTs (default: 60000) */
  requestTimeoutMs?: number;
  /** Called on each balance check */
  onBalanceCheck?: (balance: bigint) => void;
}

export interface SmartDepositResult {
  txHash: Hash;
  userOpHash: Hash;
  userAddress: Address;
  /** Token balance at the time of deposit */
  tokenBalance: bigint;
}

// ─── Backend API shapes ───────────────────────────────────────────────────────

// Raw shapes as returned by the Go backend (numeric fields as hex strings)
interface RawUserOp {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: string;
  factory?: string;
  factoryData?: string;
}

interface PrepareRequest {
  rpcUrl: string;
  from: Address;
  tokenAddress: Address;
  amount: string;
  bridgeAddress: Address;
  depositCalldata: Hex;
  chainId: number;
  nonce: Hex;
  timestamp: number;
  authSig: Hex;
}

interface PrepareResponse {
  unsignedUserOp: RawUserOp;
  delegate7702Address: Address;
  needsAuthorization: boolean;
}

// eip7702Auth format expected by Pimlico bundler (all numerics as 0x hex strings)
interface Eip7702Auth {
  address: Address;
  chainId: Hex;
  nonce: Hex;
  yParity: Hex;
  r: Hex;
  s: Hex;
}

interface RawUserOpWithAuth extends RawUserOp {
  eip7702Auth?: Eip7702Auth;
}

interface SubmitRequest {
  rpcUrl: string;
  signedUserOp: RawUserOpWithAuth;
}

interface SubmitResponse {
  txHash: Hash;
  userOpHash: Hash;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert the backend's hex-string UserOp to viem's bigint-typed UserOperation<'0.8'>.
 */
function parseUserOp(raw: RawUserOp): UserOperation<'0.8'> {
  return {
    sender: raw.sender as Address,
    nonce: BigInt(raw.nonce),
    callData: raw.callData as Hex,
    callGasLimit: BigInt(raw.callGasLimit),
    verificationGasLimit: BigInt(raw.verificationGasLimit),
    preVerificationGas: BigInt(raw.preVerificationGas),
    maxFeePerGas: BigInt(raw.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(raw.maxPriorityFeePerGas),
    ...(raw.paymaster && { paymaster: raw.paymaster as Address }),
    ...(raw.paymasterVerificationGasLimit && {
      paymasterVerificationGasLimit: BigInt(raw.paymasterVerificationGasLimit),
    }),
    ...(raw.paymasterPostOpGasLimit && {
      paymasterPostOpGasLimit: BigInt(raw.paymasterPostOpGasLimit),
    }),
    ...(raw.paymasterData && { paymasterData: raw.paymasterData as Hex }),
    ...(raw.factory && { factory: raw.factory as Address }),
    ...(raw.factoryData && { factoryData: raw.factoryData as Hex }),
    signature: '0x',
  };
}

/**
 * Convert UserOperation<'0.8'> bigint fields → hex strings for JSON serialization.
 * The Go backend expects all numeric fields as 0x-prefixed hex strings.
 */
function serializeUserOp(op: UserOperation<'0.8'>): RawUserOpWithAuth {
  const toHex = (n: bigint) => `0x${n.toString(16)}`;
  return {
    sender: op.sender,
    nonce: toHex(op.nonce),
    callData: op.callData,
    callGasLimit: toHex(op.callGasLimit),
    verificationGasLimit: toHex(op.verificationGasLimit),
    preVerificationGas: toHex(op.preVerificationGas),
    maxFeePerGas: toHex(op.maxFeePerGas),
    maxPriorityFeePerGas: toHex(op.maxPriorityFeePerGas),
    ...(op.paymaster && { paymaster: op.paymaster }),
    ...(op.paymasterVerificationGasLimit !== undefined && {
      paymasterVerificationGasLimit: toHex(op.paymasterVerificationGasLimit),
    }),
    ...(op.paymasterPostOpGasLimit !== undefined && {
      paymasterPostOpGasLimit: toHex(op.paymasterPostOpGasLimit),
    }),
    ...(op.paymasterData && { paymasterData: op.paymasterData }),
    ...(op.factory && { factory: op.factory }),
    ...(op.factoryData && { factoryData: op.factoryData }),
    ...(op.signature && { signature: op.signature }),
  };
}

// ─── Main function ─────────────────────────────────────────────────────────────

export async function smartDeposit(params: SmartDepositParams): Promise<SmartDepositResult> {
  const {
    privateKey,
    rpcUrl,
    allsetApiUrl,
    tokenAddress,
    minAmount,
    bridgeAddress,
    depositCalldata,
    pollIntervalMs = 3000,
    timeoutMs,
    requestTimeoutMs = 60_000,
    onBalanceCheck,
  } = params;

  const eoa = privateKeyToAccount(privateKey);
  // No chain object needed — chainId is fetched dynamically from the RPC
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  // Step 1: Poll ERC-20 balance
  const startTime = Date.now();
  let tokenBalance = 0n;

  while (true) {
    if (timeoutMs && Date.now() - startTime > timeoutMs) {
      throw new Error('smartDeposit: timed out waiting for balance');
    }

    tokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_BALANCEOF_ABI,
      functionName: 'balanceOf',
      args: [eoa.address],
    })) as bigint;

    onBalanceCheck?.(tokenBalance);
    if (tokenBalance >= minAmount) break;

    await sleep(pollIntervalMs);
  }

  // Fetch chainId once — used for EIP-7702 auth and UserOp signing
  const chainId = await publicClient.getChainId();

  // Step 2: Build request auth signature (proves caller owns the private key).
  // Preimage is abi.encode(...) of a domain tag + chainId + nonce + request fields.
  // - Domain tag prevents cross-protocol signature collisions.
  // - chainId prevents cross-chain replay.
  // - nonce (random 32 bytes) prevents in-protocol replay; backend must track used nonces.
  // - abi.encode (not encodePacked) eliminates dynamic-field collision ambiguity.
  // Backend verifies: ecrecover(prefixed(hash), authSig) == from
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = `0x${Array.from(nonceBytes, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex;
  const DOMAIN_TAG = 'AllSet Portal authSig v1';
  const msgHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'string' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'bytes' },
        { type: 'uint256' },
      ],
      [
        DOMAIN_TAG,
        BigInt(chainId),
        nonce,
        eoa.address,
        tokenAddress,
        minAmount,
        bridgeAddress,
        depositCalldata,
        BigInt(timestamp),
      ],
    ),
  );
  const authSig = await eoa.signMessage({ message: { raw: msgHash } });

  // Step 3: POST /userop/prepare
  const prepareReq: PrepareRequest = {
    rpcUrl,
    from: eoa.address,
    tokenAddress,
    amount: minAmount.toString(),
    bridgeAddress,
    depositCalldata,
    chainId,
    nonce,
    timestamp,
    authSig,
  };

  const prepared = await postJson<PrepareResponse>(
    `${allsetApiUrl}/userop/prepare`,
    prepareReq,
    requestTimeoutMs,
  );

  // Step 4: Sign EIP-7702 authorization.
  // We always re-sign to ensure the EOA is delegated to the correct v0.8 impl,
  // even if a prior (possibly outdated) delegation exists.
  let eip7702Auth: Eip7702Auth | undefined;
  if (prepared.needsAuthorization) {
    const accountNonce = await publicClient.getTransactionCount({ address: eoa.address });
    const signed = await eoa.signAuthorization({
      address: prepared.delegate7702Address,
      chainId,
      nonce: accountNonce,
    });
    const yParity = signed.yParity ?? 0;
    eip7702Auth = {
      address: prepared.delegate7702Address,
      chainId: toEvenHex(chainId),
      nonce: toEvenHex(accountNonce),
      yParity: toEvenHex(yParity),
      r: `0x${BigInt(signed.r).toString(16).padStart(64, '0')}` as Hex,
      s: `0x${BigInt(signed.s).toString(16).padStart(64, '0')}` as Hex,
    };
  }

  // Step 5: Parse backend response + sign UserOperation (v0.8 uses EIP-712 typed data)
  const userOpToSign: UserOperation<'0.8'> = parseUserOp(prepared.unsignedUserOp);

  // v0.8 requires EIP-712 signTypedData, NOT signMessage/personal_sign
  const typedData = getUserOperationTypedData({
    chainId,
    entryPointAddress: ENTRY_POINT_V08,
    userOperation: { ...userOpToSign, signature: '0x' },
  });
  const signature = await eoa.signTypedData(typedData);
  const signedUserOp: UserOperation<'0.8'> = { ...userOpToSign, signature };

  // Step 6: POST /userop/submit
  const serialized = serializeUserOp(signedUserOp);
  if (eip7702Auth) {
    serialized.eip7702Auth = eip7702Auth;
  }
  const submitReq: SubmitRequest = {
    rpcUrl,
    signedUserOp: serialized,
  };

  const { txHash, userOpHash: returnedUserOpHash } = await postJson<SubmitResponse>(
    `${allsetApiUrl}/userop/submit`,
    submitReq,
    requestTimeoutMs,
  );

  return {
    txHash,
    userOpHash: returnedUserOpHash,
    userAddress: eoa.address,
    tokenBalance,
  };
}

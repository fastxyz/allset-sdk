/**
 * fast-client.ts — FastClient implementation for AllSet SDK
 * 
 * Provides a reference implementation of the FastClient interface with proper
 * handling of large integers (timestamp_nanos) to avoid JavaScript precision loss.
 */

import { bcs } from '@mysten/bcs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bech32m } from 'bech32';
import type { FastClient } from './types.js';

// Configure both the v3 hash API and the legacy sync hook for compatibility.
(ed.etc as unknown as { sha512Sync: (...m: Uint8Array[]) => Uint8Array }).sha512Sync =
  (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
ed.hashes.sha512 = sha512;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FAST_RPC_URL = 'https://staging.proxy.fastset.xyz';
const CROSS_SIGN_URL = 'https://staging.cross-sign.allset.fastset.xyz';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const BIGINT_MARKER = '__allset_bigint__:';

function stringifyRpcPayload(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Uint8Array) return Array.from(value);
    if (typeof value === 'bigint') return `${BIGINT_MARKER}${value.toString()}`;
    return value;
  }).replace(/"__allset_bigint__:(-?\d+)"/g, '$1');
}

function parseRpcResponse<T>(responseText: string): T {
  return JSON.parse(
    responseText.replace(
      /("timestamp_nanos"\s*:\s*)(\d+)/g,
      (_match, prefix, digits) => `${prefix}"${BIGINT_MARKER}${digits}"`,
    ),
    (_key, value) => {
      if (typeof value === 'string' && value.startsWith(BIGINT_MARKER)) {
        return BigInt(value.slice(BIGINT_MARKER.length));
      }
      return value;
    },
  ) as T;
}

function pubkeyToFastAddress(pubkey: string): string {
  const pubkeyBytes = hexToBytes(pubkey);
  const words = bech32m.toWords(pubkeyBytes);
  return bech32m.encode('fast', words);
}

// ─── BCS Definitions ──────────────────────────────────────────────────────────

const AmountBcs = bcs.u256().transform({
  input: (val: string) => {
    const hexVal = val.startsWith('0x') ? val : `0x${val}`;
    return BigInt(hexVal).toString();
  },
});

const TokenTransferBcs = bcs.struct('TokenTransfer', {
  token_id: bcs.bytes(32),
  amount: AmountBcs,
  user_data: bcs.option(bcs.bytes(32)),
});

const ExternalClaimBodyBcs = bcs.struct('ExternalClaimBody', {
  verifier_committee: bcs.vector(bcs.bytes(32)),
  verifier_quorum: bcs.u64(),
  claim_data: bcs.vector(bcs.u8()),
});

const ExternalClaimFullBcs = bcs.struct('ExternalClaimFull', {
  claim: ExternalClaimBodyBcs,
  signatures: bcs.vector(bcs.tuple([bcs.bytes(32), bcs.bytes(64)])),
});

const ClaimTypeBcs = bcs.enum('ClaimType', {
  TokenTransfer: TokenTransferBcs,
  TokenCreation: bcs.struct('TokenCreation', { dummy: bcs.u8() }),
  TokenManagement: bcs.struct('TokenManagement', { dummy: bcs.u8() }),
  Mint: bcs.struct('Mint', { dummy: bcs.u8() }),
  Burn: bcs.struct('Burn', { dummy: bcs.u8() }),
  StateInitialization: bcs.struct('StateInitialization', { dummy: bcs.u8() }),
  StateUpdate: bcs.struct('StateUpdate', { dummy: bcs.u8() }),
  ExternalClaim: ExternalClaimFullBcs,
  StateReset: bcs.struct('StateReset', { dummy: bcs.u8() }),
  JoinCommittee: bcs.struct('JoinCommittee', { dummy: bcs.u8() }),
  LeaveCommittee: bcs.struct('LeaveCommittee', { dummy: bcs.u8() }),
  ChangeCommittee: bcs.struct('ChangeCommittee', { dummy: bcs.u8() }),
  Batch: bcs.struct('Batch', { dummy: bcs.u8() }),
});

const TransactionBcs = bcs.struct('Transaction', {
  sender: bcs.bytes(32),
  recipient: bcs.bytes(32),
  nonce: bcs.u64(),
  timestamp_nanos: bcs.u128(),
  claim: ClaimTypeBcs,
  archival: bcs.bool(),
});

// ─── FastClient Options ───────────────────────────────────────────────────────

export interface FastClientOptions {
  /** Private key as hex string (32 bytes / 64 hex chars) */
  privateKey: string;
  /** Public key as hex string (32 bytes / 64 hex chars) */
  publicKey: string;
  /** Optional RPC URL override */
  rpcUrl?: string;
  /** Optional cross-sign URL override */
  crossSignUrl?: string;
}

export interface FastWallet {
  /** Private key as 64 hex chars (32 bytes), without 0x prefix */
  privateKey: string;
  /** Public key as 64 hex chars (32 bytes), without 0x prefix */
  publicKey: string;
  /** Fast bech32m address derived from the public key */
  address: string;
}

type SerializedTransaction = Parameters<typeof TransactionBcs.serialize>[0];
type SerializedClaim = SerializedTransaction['claim'];

// ─── FastClient Implementation ────────────────────────────────────────────────

/**
 * Generate a new Fast wallet (private key + public key + address).
 *
 * Generate once, store the keys securely, then use them with createFastClient().
 *
 * @example
 * ```typescript
 * const wallet = createFastWallet();
 * const fastClient = createFastClient({
 *   privateKey: wallet.privateKey,
 *   publicKey: wallet.publicKey,
 * });
 * ```
 */
export function createFastWallet(): FastWallet {
  const privateKeyBytes = ed.utils.randomSecretKey();
  let publicKeyBytes: Uint8Array | null = null;

  try {
    publicKeyBytes = ed.getPublicKey(privateKeyBytes);
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);

    return {
      privateKey,
      publicKey,
      address: pubkeyToFastAddress(publicKey),
    };
  } finally {
    privateKeyBytes.fill(0);
    publicKeyBytes?.fill(0);
  }
}

/**
 * Create a FastClient for interacting with the Fast network.
 * 
 * IMPORTANT: This implementation properly handles large integers (timestamp_nanos)
 * which exceed JavaScript's safe integer range. Incorrect handling causes transaction
 * hash mismatches and on-chain verification failures (error 0x36289cf3).
 * 
 * @example
 * ```typescript
 * const client = createFastClient({
 *   privateKey: process.env.FAST_PRIVATE_KEY!,
 *   publicKey: process.env.FAST_PUBLIC_KEY!,
 * });
 * ```
 */
export function createFastClient(options: FastClientOptions): FastClient {
  const { privateKey, publicKey, rpcUrl = DEFAULT_FAST_RPC_URL, crossSignUrl = CROSS_SIGN_URL } = options;
  
  const address = pubkeyToFastAddress(publicKey);
  const privateKeyBytes = hexToBytes(privateKey);
  const publicKeyBytes = hexToBytes(publicKey);

  async function getNonce(): Promise<number> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'proxy_getAccountInfo',
      params: {
        address: Array.from(publicKeyBytes),
        token_balances_filter: [],
        state_key_filter: null,
        certificate_by_nonce: null,
      },
    };
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringifyRpcPayload(payload),
    });
    const result = parseRpcResponse<{ result?: { next_nonce?: number | string } }>(await response.text());
    const nextNonce = result.result?.next_nonce;
    return nextNonce === undefined ? 0 : Number(nextNonce);
  }

  /**
   * Compute transaction hash from certificate.
   * 
   * CRITICAL: timestamp_nanos can exceed JavaScript's safe integer range (2^53 - 1).
   * We extract it from raw response text BEFORE JSON parsing to preserve precision.
   */
  function computeTxHash(responseText: string, certificate: unknown): string {
    const cert = certificate as { envelope?: { transaction?: unknown } };
    
    if (!cert.envelope?.transaction) {
      throw new Error('Certificate missing envelope.transaction');
    }

    const certTx = structuredClone(cert.envelope.transaction) as SerializedTransaction & {
      claim?: { TokenTransfer?: { amount?: string | number } };
      timestamp_nanos?: bigint | string | number;
    };

    // Normalize amount to hex with 0x prefix
    if (certTx.claim?.TokenTransfer?.amount !== undefined) {
      const amt = certTx.claim.TokenTransfer.amount;
      if (typeof amt === 'string' && !amt.startsWith('0x')) {
        // Amount is hex string without prefix - just add prefix
        certTx.claim.TokenTransfer.amount = '0x' + amt;
      } else if (typeof amt === 'number') {
        certTx.claim.TokenTransfer.amount = '0x' + BigInt(amt).toString(16);
      }
    }

    // CRITICAL: Extract timestamp_nanos from raw response to preserve precision
    // JavaScript's JSON.parse converts large numbers to floats, losing precision
    // for values > Number.MAX_SAFE_INTEGER (9007199254740991)
    const rawTsMatch = responseText.match(/"timestamp_nanos"\s*:\s*(\d+)/);
    if (rawTsMatch) {
      certTx.timestamp_nanos = BigInt(rawTsMatch[1]);
    } else if (certTx.timestamp_nanos !== undefined) {
      // Fallback - may lose precision for large values
      certTx.timestamp_nanos = BigInt(certTx.timestamp_nanos);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certTxBytes = TransactionBcs.serialize(certTx as any).toBytes();
    return '0x' + bytesToHex(keccak_256(certTxBytes));
  }

  return {
    address,

    async submit(params: { recipient: string; claim: Record<string, unknown> }) {
      const nonce = await getNonce();

      // Decode recipient
      const decoded = bech32m.decode(params.recipient, 90);
      const recipientPubKey = new Uint8Array(bech32m.fromWords(decoded.words));

      const baseTransaction = {
        sender: publicKeyBytes,
        recipient: recipientPubKey,
        nonce,
        timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
        archival: false,
      } satisfies Omit<SerializedTransaction, 'claim'>;

      let claim: SerializedClaim;

      if (params.claim.TokenTransfer) {
        const tt = params.claim.TokenTransfer as { token_id: Uint8Array; amount: string; user_data: unknown };
        const hexAmount = BigInt(tt.amount).toString(16);
        claim = {
          TokenTransfer: {
            token_id: tt.token_id,
            amount: hexAmount,
            user_data: tt.user_data as Uint8Array | null,
          },
        };
      } else if (params.claim.ExternalClaim) {
        const ec = params.claim.ExternalClaim as {
          claim: { verifier_committee?: Uint8Array[]; verifier_quorum?: number; claim_data?: number[] };
          signatures?: Array<[Uint8Array, Uint8Array]>;
        };
        claim = {
          ExternalClaim: {
            claim: {
              verifier_committee: ec.claim.verifier_committee ?? [],
              verifier_quorum: ec.claim.verifier_quorum ?? 0,
              claim_data: ec.claim.claim_data ?? [],
            },
            signatures: ec.signatures ?? [],
          },
        };
      } else {
        throw new Error('Unsupported claim type: ' + Object.keys(params.claim).join(', '));
      }

      const transaction: SerializedTransaction = {
        ...baseTransaction,
        claim,
      };

      // Sign: ed25519("Transaction::" + BCS(transaction))
      const msgHead = new TextEncoder().encode('Transaction::');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgBody = TransactionBcs.serialize(transaction as any).toBytes();
      const msg = new Uint8Array(msgHead.length + msgBody.length);
      msg.set(msgHead, 0);
      msg.set(msgBody, msgHead.length);
      const signatureBytes = await ed.signAsync(msg, privateKeyBytes.slice(0, 32));

      // Submit to RPC
      const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'proxy_submitTransaction',
        params: {
          transaction,
          signature: { Signature: Array.from(signatureBytes) },
        },
      };

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stringifyRpcPayload(payload),
      });

      // Keep raw response text for precise timestamp_nanos extraction
      const responseText = await response.text();
      const result = parseRpcResponse<{
        result?: { Success?: unknown } | unknown;
        error?: { message: string };
      }>(responseText);

      if (result.error) {
        throw new Error(`Fast RPC error: ${result.error.message}`);
      }

      const submitResult = result.result as { Success?: unknown };
      const certificate = submitResult?.Success ?? submitResult;

      if (!certificate) {
        throw new Error('No result from Fast RPC');
      }

      // Compute hash with precise timestamp_nanos
      const txHash = computeTxHash(responseText, certificate);

      return { txHash, certificate };
    },

    async evmSign(params: { certificate: unknown }) {
      const res = await fetch(crossSignUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stringifyRpcPayload({
          jsonrpc: '2.0',
          id: 1,
          method: 'crossSign_evmSignCertificate',
          params: { certificate: params.certificate },
        }),
      });

      if (!res.ok) {
        throw new Error(`Cross-sign request failed: ${res.status}`);
      }

      const json = await res.json() as {
        result?: { transaction: number[]; signature: string };
        error?: { message: string };
      };

      if (json.error) {
        throw new Error(`Cross-sign error: ${json.error.message}`);
      }

      if (!json.result?.transaction || !json.result?.signature) {
        throw new Error('Cross-sign returned invalid response');
      }

      return json.result;
    },
  };
}

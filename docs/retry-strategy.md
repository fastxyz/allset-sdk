# Retry Strategy for Backend POSTs in smartDeposit

**Status:** Partially decided. Prepare retry approved for SDK-only implementation. Submit retry deferred pending idempotency-key design.

## Background

After balance polling succeeds, `smartDeposit` makes two backend calls:
1. `POST /userop/prepare` — backend assembles unsigned UserOp + paymasterData
2. `POST /userop/submit` — backend relays signed UserOp to Pimlico

Both currently have no retry logic. A single transient failure (network, rate limit, 5xx) surfaces to the caller as a hard error, forcing a full retry of `smartDeposit` from scratch (including re-polling the balance).

## Safety Analysis

### `/userop/prepare` — safe to retry

- No on-chain state is committed.
- Each call produces a fresh unsigned UserOp that the SDK will then sign.
- Transient failures (5xx, 429, timeout, network reset) can safely be retried.
- Do **not** retry on 4xx — those indicate real rejections (bad auth, expired timestamp, nonce already used).

### `/userop/submit` — dangerous to retry naively

The key risk: if the submission reaches Pimlico and the response is lost on the way back (timeout after send, TCP reset, 5xx after headers sent), the SDK can't tell whether the UserOp was accepted or not.

- **Blind retry** → second `eth_sendUserOperation` with same nonce → Pimlico rejects with `AA25 invalid account nonce`. Benign if interpreted correctly, but confusing.
- **Retry with fresh nonce** → double-deposit. Never do this.
- **Safe retry window:** only retry if we're certain the request never reached Pimlico — i.e., connect error, DNS failure, TLS failure. Distinguishing these from "sent but response lost" is hard with `fetch`.

**Decision: single attempt only for `/userop/submit` for now.** Surface ambiguous failures with enough context (userOpHash computed locally) for the caller to reconcile by polling Pimlico directly.

## Decided: Prepare Retry (SDK-only, no backend change needed)

Retry `/userop/prepare` up to 3 attempts with exponential backoff:

| Attempt | Delay before |
|---------|-------------|
| 1       | 0ms (immediate) |
| 2       | 500ms |
| 3       | 1500ms |

**Retry on:**
- `AbortError` (request timeout per `requestTimeoutMs`)
- Network errors (`TypeError: Failed to fetch`, `ECONNREFUSED`, DNS, TLS)
- HTTP 5xx
- HTTP 429 (rate limited)

**Do not retry on:**
- HTTP 4xx (except 429) — real rejection from backend

**Implementation:** extend the existing `postJson()` helper with optional retry config, or add a `retryPostJson()` wrapper. Expose as `prepareRetries?: number` on `SmartDepositParams` (default: 3).

## Deferred: Submit Idempotency Key (requires backend change)

The clean long-term fix for safe submit retries:

1. SDK generates a UUID per `smartDeposit` call and sends it as an `Idempotency-Key` header on both requests.
2. Backend persists `key → result` mapping for ~10 minutes.
3. A retry with the same key returns the cached result instead of re-executing.
4. `/userop/submit` becomes safely retryable: at-most-once Pimlico submission per key, guaranteed by backend.

**Required backend changes:**
- Accept `Idempotency-Key` header on `POST /userop/prepare` and `POST /userop/submit`.
- Persist key → response in Redis with TTL (10 minutes is conservative; 2–3 minutes likely sufficient given `requestTimeoutMs` default of 60s).
- On duplicate key: return cached response, do NOT re-call Pimlico.

**SDK changes (after backend ships):**
- Generate `crypto.randomUUID()` once at the start of `smartDeposit`.
- Pass as `Idempotency-Key` header on both POSTs.
- Add retry-with-backoff to `/userop/submit` (same policy as `/userop/prepare`).

## Reconciliation Path (current workaround for ambiguous submit failures)

Until idempotency keys land, callers who hit a submit timeout/error should:
1. Compute the userOpHash locally using `getUserOperationHash` from viem.
2. Poll Pimlico's `eth_getUserOperationReceipt` with that hash.
3. If receipt found → deposit landed, treat as success.
4. If not found after N polls → re-run `smartDeposit` from scratch.

The SDK should ideally compute and return the userOpHash in the error object when submit fails ambiguously, so the caller doesn't have to re-derive it. See Minor item in PR #30 review about local userOpHash computation.

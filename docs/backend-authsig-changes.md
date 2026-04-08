# Backend Changes Required: authSig Scheme (PR #30 Review — Critical #1)

**Status:** SDK side landed post-0.1.11. Backend not yet updated. `/userop/prepare` will reject all SDK requests until the Go handler is updated to match.

## Context

PR #30's original authSig scheme had three problems:

- No `chainId` in the preimage → cross-chain replay.
- No `nonce` → in-protocol replay within the timestamp window.
- No domain separator → cross-protocol signature collisions.

The SDK fix (in `src/node/eip7702.ts`) switched from `encodePacked` to `abi.encode`, added a versioned domain tag, and added `chainId` + random `nonce` to both the preimage and the request body.

## Required Backend Changes

### 1. Request schema — add two fields

`/userop/prepare` request must accept:

- `chainId` — number (int64)
- `nonce` — hex string, 32 bytes (`bytes32`)

Both are required. Reject requests missing either.

### 2. Hash recomputation

Replace the current `encodePacked` hash with `abi.encode` of the following tuple, then `keccak256` the result:

```
(string, uint256, bytes32, address, address, uint256, address, bytes, uint256)
= (DOMAIN_TAG, chainId, nonce, from, tokenAddress, amount, bridgeAddress, depositCalldata, timestamp)
```

Where `DOMAIN_TAG = "AllSet Portal authSig v1"` — **exact string, versioned**, so we can rotate later without breaking old clients.

Go implementation sketch using `go-ethereum`:

```go
import (
    "github.com/ethereum/go-ethereum/accounts/abi"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/crypto"
)

stringTy, _  := abi.NewType("string", "", nil)
uint256Ty, _ := abi.NewType("uint256", "", nil)
bytes32Ty, _ := abi.NewType("bytes32", "", nil)
addressTy, _ := abi.NewType("address", "", nil)
bytesTy, _   := abi.NewType("bytes", "", nil)

args := abi.Arguments{
    {Type: stringTy},  // DOMAIN_TAG
    {Type: uint256Ty}, // chainId
    {Type: bytes32Ty}, // nonce
    {Type: addressTy}, // from
    {Type: addressTy}, // tokenAddress
    {Type: uint256Ty}, // amount
    {Type: addressTy}, // bridgeAddress
    {Type: bytesTy},   // depositCalldata
    {Type: uint256Ty}, // timestamp
}

encoded, _ := args.Pack(
    "AllSet Portal authSig v1",
    chainIdBig,
    nonceBytes32, // [32]byte
    common.HexToAddress(from),
    common.HexToAddress(tokenAddress),
    amountBig,
    common.HexToAddress(bridgeAddress),
    depositCalldataBytes,
    big.NewInt(timestamp),
)
msgHash := crypto.Keccak256(encoded)
```

### 3. Signature verification — unchanged

Still `personal_sign` prefix:

```
prefixed = keccak256("\x19Ethereum Signed Message:\n32" ‖ msgHash)
recover(prefixed, authSig) == from
```

### 4. Replay protection — new, **required**

Persist seen `nonce` values and reject duplicates. Without this, the nonce field is cosmetic.

- Recommended: Redis `SET nonce:{hex} 1 EX {window + margin} NX`. `NX` fails if the key exists → duplicate nonce → reject.
- TTL should be at least the timestamp window plus some margin (e.g., window = 60s → TTL = 120s).

### 5. Timestamp window — verify or add

Enforce `|now - timestamp| <= 60s`. If a window already exists, confirm the bound is tight (≤ 60s). Reject otherwise.

## Reference

- SDK encoding lives in `src/node/eip7702.ts` around the `msgHash` construction (search for `DOMAIN_TAG`).
- The SDK uses `encodeAbiParameters` (viem) — the Go `abi.Arguments.Pack` call above produces byte-identical output.

---

# Proposed Fix: Pin EIP-7702 Delegate Client-Side (PR #30 Review — Critical #2)

*(Previously at `docs/eip7702-delegate-pinning.md` — see that file. Kept separate because it's a client-side change, not a backend change.)*

# Proposed Fix: Pin EIP-7702 Delegate Client-Side (PR #30 Review — Critical #2)

**Status:** Proposed, not yet implemented. Decide before next release.

## Problem

`src/node/eip7702.ts` currently signs an EIP-7702 authorization to whatever address the backend returns in `PrepareResponse.delegate7702Address`:

```ts
if (prepared.needsAuthorization) {
  const signed = await eoa.signAuthorization({
    address: prepared.delegate7702Address,  // unchecked
    chainId,
    nonce: accountNonce,
  });
}
```

EIP-7702 delegations install contract code at the EOA's address and persist across transactions. Whoever controls the delegate contract effectively controls the EOA: they can sweep every incoming token without ever seeing the private key, and the delegation only ends when the EOA signs *another* authorization overwriting it.

A compromised or malicious backend (hacked, insider, DNS hijack, stolen deploy creds) can therefore return an attacker-controlled delegate and permanently hijack the EOA. This defeats the file header's "private key never leaves the SDK" guarantee in substance — the attacker doesn't need the key; they've installed their code *at* the user's address.

## Proposed Fix — Two Layers

### Layer 1: Pin canonical delegate per chain

Hard-code the trusted v0.8 delegate implementation per chainId in the SDK, and reject anything else the backend returns.

```ts
// src/node/eip7702.ts

const CANONICAL_DELEGATE: Record<number, Address> = {
  1:        '0x...', // mainnet
  8453:     '0x...', // Base
  11155111: '0x...', // Sepolia
  // add chains as supported
};

// inside smartDeposit, after fetching chainId:
const expectedDelegate = CANONICAL_DELEGATE[chainId];
if (!expectedDelegate) {
  throw new Error(
    `smartDeposit: no canonical 7702 delegate configured for chainId ${chainId}`,
  );
}
if (
  prepared.delegate7702Address.toLowerCase() !== expectedDelegate.toLowerCase()
) {
  throw new Error(
    `smartDeposit: backend returned unexpected 7702 delegate ` +
    `${prepared.delegate7702Address}, expected ${expectedDelegate}`,
  );
}
```

**Alternative (stronger):** expose `delegate7702Address` as a `SmartDepositParams` option so the caller passes the trusted delegate explicitly. Then the SDK itself isn't a trust root either — the application is.

### Layer 2: Re-derive `needsAuthorization` locally

Don't trust the backend's flag. Read the EOA's code on-chain and decode the EIP-7702 delegation indicator (`0xef0100 ‖ <20-byte address>`, 23 bytes total).

```ts
const code = await publicClient.getCode({ address: eoa.address });
const isDelegated =
  code !== undefined &&
  code.length === 2 + 2 * 23 && // "0x" + 46 hex chars
  code.toLowerCase().startsWith('0xef0100');
const currentDelegate = isDelegated
  ? (`0x${code!.slice(8)}`.toLowerCase() as Address)
  : undefined;
const needsAuthorization =
  currentDelegate !== expectedDelegate.toLowerCase();
```

Use this locally-derived `needsAuthorization` instead of `prepared.needsAuthorization`. The backend field can become advisory or be removed from `PrepareResponse` entirely.

## Impact

- A fully compromised backend can still deny service (return garbage UserOps that revert) but **cannot** cause the user to sign a malicious delegation.
- Restores the "private key never leaves the SDK" guarantee in substance.
- Removes one RPC round-trip's worth of trust from the backend path.

## Tradeoffs

- **Requires SDK release to support a new chain or rotate a delegate implementation.** This is arguably a feature: delegation rotations should be explicit user-facing upgrades, not silent backend config changes.
- **Small extra RPC call** (`eth_getCode`) per `smartDeposit` invocation. Negligible.
- **Need to source canonical delegate addresses.** For Pimlico's v0.8 Simple7702Account or whichever reference implementation is standard, confirm the address per chain before adding to the allowlist.

## Open Questions

1. Which delegate implementation is canonical for this project — Pimlico's Simple7702Account, a custom audited contract, or something else?
2. Should the delegate be hard-coded in the SDK (Layer 1 as written) or passed by the caller (Layer 1 alternative)? The caller-passed version is safer but pushes the trust-sourcing problem to every consumer.
3. Do we want to ship Layer 2 (`eth_getCode` re-derivation) alongside Layer 1, or just Layer 1? Layer 1 alone closes the hijack; Layer 2 removes another field of backend trust but is slightly more code to maintain.

## References

- EIP-7702 spec: https://eips.ethereum.org/EIPS/eip-7702
- Current implementation: `src/node/eip7702.ts` (`smartDeposit`, step 4)
- PR #30 code review — full list of findings in conversation history / commit 38f256a

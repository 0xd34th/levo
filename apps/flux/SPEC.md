# Flux Sui Public Key Decoding Fix

## Goal

Fix xterm.fi / Flux Sui swap execution when a Sui wallet account exposes a non-Ed25519 public key shape, specifically the `Invalid Sui public key: bytes: expected raw Ed25519 bytes or Sui public key bytes, received 62 bytes` failure seen while swapping SUI to USDC on Sui.

## Scope

- Limit implementation to `apps/flux` Sui public-key decoding and adjacent signer tests.
- Keep existing Privy and dAppKit signer contracts; do not change route quoting, chain selection, token selection, or LI.FI provider config.
- Decode Sui SDK-supported public-key schemes that can be validated against the connected account address.
- Preserve explicit failure for malformed public keys that do not match the account address.

## Non-Goals

- Do not change swap route selection, fee logic, or token metadata.
- Do not add a compatibility layer for malformed wallet accounts that do not map to the connected Sui address.
- Do not deploy in this task unless explicitly requested.

## Acceptance

1. Raw Ed25519, raw Secp256k1, raw Secp256r1, raw Passkey-style SEC keys, raw zkLogin identifiers, and Sui scheme-prefixed public keys decode when they match the connected address.
2. A 62-byte raw zkLogin identifier no longer throws the current `expected raw Ed25519 bytes... received 62 bytes` error when an address/client is supplied.
3. External dAppKit signer can return `toSuiAddress()` for supported non-Ed25519 public keys.
4. Existing Privy signer behavior and transaction signature serialization remain green.
5. Targeted unit tests and Flux typecheck pass.

## Verification

- `pnpm --dir apps/flux test:unit -- src/lib/sui/publicKey.spec.ts src/lib/privy/sui.spec.ts src/providers/WalletProvider/dappKitSignerProviders.spec.ts`
- `pnpm --dir apps/flux typecheck`

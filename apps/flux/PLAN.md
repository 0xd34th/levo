# Flux Sui Public Key Decoding Fix Plan

## 1. Baseline

- Confirm the failing surface is `apps/flux` Sui swap execution through the dAppKit/Privy Sui signer boundary.
- Read the shared decoder, dAppKit signer provider, Privy signer, Wallet Standard account type, and Mysten public-key helpers.
- Keep the diff scoped to the decoder, adjacent tests, and this task spec/plan.

## 2. Tests First

- Add decoder coverage for:
  - raw 33-byte Secp256k1 public keys validated by address;
  - raw 33-byte Secp256r1 public keys validated by address;
  - raw 62-byte zkLogin public identifiers validated by address;
  - malformed raw bytes still rejected.
- Add dAppKit signer coverage proving an external account with raw zkLogin public-key bytes can produce the connected Sui address.
- Keep existing Privy signer tests green.

## 3. Implementation

- Keep Sui scheme-prefixed bytes as the first decode attempt when they are valid.
- If scheme-prefixed decoding fails, continue through raw public-key candidates instead of stopping early.
- Decode raw bytes by trying Sui SDK-supported schemes, using the supplied address to disambiguate.
- Preserve the existing string encoding candidate handling for hex, base58, base64, and ASCII bytes that contain encoded keys.
- Keep errors explicit and aggregate candidate failure reasons.

## 4. Verification

- Run targeted unit tests:
  - `pnpm --dir apps/flux test:unit -- src/lib/sui/publicKey.spec.ts src/lib/privy/sui.spec.ts src/providers/WalletProvider/dappKitSignerProviders.spec.ts`
- Run typecheck:
  - `pnpm --dir apps/flux typecheck`
- Review `git diff --check` and `git status --short` for scoped changes.

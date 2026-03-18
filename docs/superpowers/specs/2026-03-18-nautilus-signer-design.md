# Nautilus Signer Design

Date: 2026-03-18

## Context

Levo's claim flow already exists in the web app and on-chain package:

- The web app authenticates the user via Privy and reads the linked X account.
- The wallet setup flow binds `x_user_id` to a specific `privyUserId` and embedded Sui wallet.
- The claim route builds a PTB that calls `x_vault::claim_vault`.
- The Move contract requires an attestation signature over:
  - `x_user_id`
  - `sui_address`
  - `nonce`
  - `expires_at`
  - `registry_id`

The missing production blocker for testnet is the signer service behind `NAUTILUS_ENCLAVE_URL`.

The current web app expects an HTTP service at `POST /attestation`. The web app does not currently send Privy tokens or X proofs to that service. Because of that, the source of truth for user identity in the first version remains the web app's Privy session verification and wallet-binding checks, not the signer itself.

## Goal

Ship a first version of the Nautilus signer inside the current monorepo that:

- unblocks the testnet claim flow quickly
- preserves the existing web app request and response contract
- signs the exact attestation payload expected by the deployed Move verifier
- keeps a clean boundary so the signer can later move behind AWS Nitro without changing the external web-to-signer API

## Non-Goals

This version does not attempt to:

- move Privy or X identity verification into the signer
- implement AWS Nitro Enclaves in the first delivery
- introduce PCR-based on-chain registration
- replace the existing claim route or wallet-binding model

## Design Summary

Add a new workspace: `apps/nautilus-signer`.

The signer is a small Node/TypeScript HTTP service. The web app continues to authenticate the user, verify wallet ownership, and decide whether a claim request is eligible. The signer only signs attestation messages for the already-validated `(x_user_id, sui_address)` pair it receives from the web app.

The signer is protected with a service-to-service shared secret so it is not a public arbitrary-signing endpoint. In later Nitro deployment, this HTTP contract stays stable and only the signer execution environment changes.

## Trust Model

### Current identity root

In version 1, the root of identity trust remains:

1. `verifyPrivyXAuth()` verifies the current Privy session and linked X account.
2. The wallet setup route binds `x_user_id` to `privyUserId` and a specific embedded wallet.
3. The claim route re-checks that the current Privy session still owns the stored embedded wallet.
4. The signer receives the already-validated `x_user_id` and `sui_address` and returns a signature.

### Why the signer still matters

The Move contract will not allow claim without a valid attestation signature. Even if the app already trusts Privy, the chain still needs a trusted signer to bind the claim to the expected `(x_user_id, sui_address)` pair.

### Why the signer cannot be public

If the signer were reachable by anyone without an app-to-signer secret, an attacker could ask it to sign an attestation for another user's `x_user_id` and the attacker's own `sui_address`. Because the on-chain contract trusts the signer key, that would allow unauthorized claims. This is why version 1 still requires a minimal service-to-service authentication layer.

## Workspace Layout

Create a new workspace under `apps/nautilus-signer`.

Planned files:

- `apps/nautilus-signer/package.json`
- `apps/nautilus-signer/tsconfig.json`
- `apps/nautilus-signer/.env.example`
- `apps/nautilus-signer/src/config.ts`
- `apps/nautilus-signer/src/schema.ts`
- `apps/nautilus-signer/src/sign-attestation.ts`
- `apps/nautilus-signer/src/server.ts`

This service stays separate from `apps/web` so deployment and trust boundaries remain explicit.

## HTTP API

### Endpoint

`POST /attestation`

### Request body

```json
{
  "x_user_id": "12345",
  "sui_address": "0x..."
}
```

### Required request header

`Authorization: Bearer <NAUTILUS_SIGNER_SECRET>`

### Response body

```json
{
  "signature": "0x...",
  "x_user_id": "12345",
  "sui_address": "0x...",
  "nonce": "1",
  "expires_at": "1773810000000"
}
```

The response format must remain compatible with `apps/web/lib/nautilus.ts`.

## Signing Rules

The signer must construct the exact attestation payload expected by the deployed Move verifier:

- `x_user_id: u64`
- `sui_address: address`
- `nonce: u64`
- `expires_at: u64`
- `registry_id: address`

The encoded bytes must match the Move-side BCS layout used by `nautilus_verifier::verify_attestation`.

### Deployed verifier binding

For the current testnet deployment:

- `ENCLAVE_REGISTRY_ID = 0x11cddaae036a2faabc315226ae031d10cd1c488f91dd436fd0aac2157b25715a`

The signer must use that registry id as the domain separator when constructing the payload.

### Time format

`expires_at` must be milliseconds since Unix epoch. The Move verifier compares it to `clock.timestamp_ms()`.

### Key material

The signer reads a base64-encoded 32-byte Ed25519 seed from environment configuration. The corresponding public key must match the key already registered in `EnclaveRegistry`.

At the time of writing, the only trusted signer key registered on-chain is:

- `0x77ea384188b9f8a8f2886fa676d64ca11e2730a6af4e2c181f187b2dc815a704`

## Configuration

### `apps/nautilus-signer`

Required:

- `HOST`
- `PORT`
- `ENCLAVE_REGISTRY_ID`
- `NAUTILUS_SIGNER_SECRET`
- `NAUTILUS_SIGNER_SEED_BASE64`

### `apps/web`

Required additions:

- `NAUTILUS_ENCLAVE_URL`
- `NAUTILUS_SIGNER_SECRET`

The web app already supports `NAUTILUS_ENCLAVE_URL`; it only needs to start forwarding the shared secret header.

## Error Handling

The signer returns:

- `400` for invalid request input
- `401` or `403` for missing or invalid shared secret
- `405` for unsupported HTTP methods
- `500` for missing configuration or unexpected signing failures

The signer should never expose internal stack traces or secret-derived values in the response body.

The web app continues to translate signer failures into its existing claim-route error shape:

- `502 Failed to obtain attestation`

## Local Development

For local use:

- signer runs on `http://127.0.0.1:8787`
- web app sets `NAUTILUS_ENCLAVE_URL=http://127.0.0.1:8787`

This is compatible with the current web-side URL validation, which only requires HTTPS in production mode.

## Cloud Deployment Path

Version 1 runs as a normal Node service.

Future Nitro migration keeps the same external interface:

1. keep the public `/attestation` contract stable
2. replace the signer internals with a parent process plus enclave/vsock bridge
3. optionally move identity verification into the enclave in a later phase

This keeps the current delivery focused on testnet availability while preserving a clean path to a real enclave-backed signer.

## Testing Strategy

### Unit tests

Cover:

- request validation
- shared-secret enforcement
- signature response shape
- `expires_at` generation in milliseconds
- deterministic signing for a fixed input/key fixture

### Service integration tests

Cover:

- `POST /attestation` success response
- invalid header rejection
- invalid `x_user_id`
- invalid `sui_address`

### End-to-end verification

The final proof is a real claim flow:

1. start signer
2. start web app
3. trigger `POST /api/v1/payments/claim`
4. ensure `x_vault::claim_vault` succeeds on-chain

If claim succeeds, the signer is producing a chain-valid attestation for the registered key.

## Execution Plan

Implementation should proceed in this order:

1. Create `apps/nautilus-signer`
2. Implement input validation and config loading
3. Implement BCS attestation encoding and Ed25519 signing
4. Implement `POST /attestation`
5. Add shared-secret header support in `apps/web/lib/nautilus.ts`
6. Add tests for the signer and web integration
7. Verify end-to-end claim flow locally

## Decision

Build a monorepo-local signer service first, keep the web app as the source of user authentication and wallet ownership checks, and preserve a stable signer HTTP contract so the implementation can later move behind AWS Nitro without changing claim flow semantics.

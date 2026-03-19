# Nautilus Signer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monorepo-local signer service that produces chain-valid claim attestations and wire `apps/web` to call it with a shared secret.

**Architecture:** Create a standalone `apps/nautilus-signer` Node/TypeScript workspace with a single `POST /attestation` endpoint. Keep Privy/X verification in `apps/web`, keep the signer focused on validation + BCS encoding + Ed25519 signing, and preserve the external contract so the implementation can later move behind AWS Nitro without changing the web app API.

**Tech Stack:** Node HTTP server, TypeScript, `zod`, `@mysten/sui`, `@noble/curves`, `vitest`

---

### Task 1: Create the signer workspace and signing core

**Files:**
- Create: `apps/nautilus-signer/package.json`
- Create: `apps/nautilus-signer/tsconfig.json`
- Create: `apps/nautilus-signer/.env.example`
- Create: `apps/nautilus-signer/src/config.ts`
- Create: `apps/nautilus-signer/src/schema.ts`
- Create: `apps/nautilus-signer/src/sign-attestation.ts`
- Test: `apps/nautilus-signer/src/sign-attestation.test.ts`

- [ ] **Step 1: Write the failing signer-core tests**

Cover:
- valid request signing returns `signature`, `nonce`, `expires_at`, `x_user_id`, `sui_address`
- invalid `x_user_id` is rejected
- invalid `sui_address` is rejected
- fixed key + fixed inputs produce deterministic signature bytes
- configured base64 seed derives the expected public key for the registered testnet signer
- `expires_at` is emitted in milliseconds and is sufficiently in the future

Run: `pnpm --filter nautilus-signer exec vitest run src/sign-attestation.test.ts`
Expected: FAIL because the workspace and implementation do not exist yet.

- [ ] **Step 2: Scaffold the signer workspace**

Create:
- `package.json` named `nautilus-signer` with `dev`, `start`, and `test` scripts
- declare required dependencies/devDependencies:
  - dependencies: `@mysten/sui`, `@noble/curves`, `zod`
  - devDependencies: `vitest`, `tsx`, `typescript`, `@types/node`
- `tsconfig.json` for a strict Node TypeScript workspace
- `.env.example` with `HOST`, `PORT`, `ENCLAVE_REGISTRY_ID`, `NAUTILUS_SIGNER_SECRET`, and `NAUTILUS_SIGNER_SEED_BASE64`
- pin local defaults in `.env.example` and config handling:
  - `HOST=127.0.0.1`
  - `PORT=8787`

- [ ] **Step 3: Implement config and request schemas**

In `src/config.ts`:
- validate required env vars
- decode the base64 Ed25519 seed
- derive the Ed25519 public key from the configured seed
- expose normalized config values, including the derived public key for verification

In `src/schema.ts`:
- validate request payload shape
- parse unsigned integer `x_user_id`
- normalize and validate `sui_address`

- [ ] **Step 4: Implement the attestation signer**

In `src/sign-attestation.ts`:
- build the exact BCS payload expected by `nautilus_verifier::verify_attestation`
- encode:
  - `x_user_id` as little-endian `u64`
  - `sui_address` as 32 raw bytes
  - `nonce` as little-endian `u64`
  - `expires_at` as little-endian `u64`
  - `registry_id` as 32 raw bytes
- sign with Ed25519 using the configured seed
- return the response payload in the web app's expected shape

- [ ] **Step 5: Run signer-core tests and make them pass**

Run: `pnpm --filter nautilus-signer exec vitest run src/sign-attestation.test.ts`
Expected: PASS

### Task 2: Add the HTTP server and service-level tests

**Files:**
- Create: `apps/nautilus-signer/src/server.ts`
- Test: `apps/nautilus-signer/src/server.test.ts`

- [ ] **Step 1: Write the failing HTTP tests**

Cover:
- `POST /attestation` success path
- missing `Authorization` header rejected
- wrong bearer secret rejected
- invalid method rejected
- malformed request body rejected
- invalid `x_user_id` rejected with an HTTP-level validation failure
- invalid `sui_address` rejected with an HTTP-level validation failure

Run: `pnpm --filter nautilus-signer exec vitest run src/server.test.ts`
Expected: FAIL because the server is not implemented yet.

- [ ] **Step 2: Implement the HTTP server**

In `src/server.ts`:
- expose a small Node HTTP server
- accept only `POST /attestation`
- require `Authorization: Bearer <NAUTILUS_SIGNER_SECRET>`
- parse JSON body
- validate request
- call the signing function
- return JSON without leaking stack traces

- [ ] **Step 3: Export a testable server factory**

Keep the file split so tests can:
- instantiate the server without booting the CLI entrypoint
- inject config or use test env
- start on an ephemeral port

- [ ] **Step 4: Run the signer test suite**

Run: `pnpm --filter nautilus-signer exec vitest run`
Expected: PASS

### Task 3: Wire the web app to the signer

**Files:**
- Modify: `apps/web/lib/nautilus.ts`
- Modify: `apps/web/lib/nautilus.test.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/app/api/v1/payments/claim/route.test.ts`

- [ ] **Step 1: Write the failing web-client tests**

Add coverage for:
- sending the signer bearer secret in the request headers
- throwing a clear error when `NAUTILUS_SIGNER_SECRET` is missing
- preserving the existing attestation response validation behavior
- preserving the claim route's `502 Failed to obtain attestation` behavior when signer access fails

Run: `pnpm --filter web exec vitest run lib/nautilus.test.ts`
Expected: FAIL because the client does not yet send the secret header.

- [ ] **Step 2: Implement signer secret forwarding**

In `apps/web/lib/nautilus.ts`:
- read `NAUTILUS_SIGNER_SECRET`
- require it when requesting an attestation
- send `Authorization: Bearer <secret>` with the existing JSON payload

- [ ] **Step 3: Update environment docs**

In `apps/web/.env.example`:
- document `NAUTILUS_SIGNER_SECRET` alongside `NAUTILUS_ENCLAVE_URL`

- [ ] **Step 4: Add a claim-route regression test for signer failure**

In `apps/web/app/api/v1/payments/claim/route.test.ts`:
- mock attestation failure
- assert the route still returns the existing `502` error response shape

- [ ] **Step 5: Run the updated web-client and route tests**

Run: `pnpm --filter web exec vitest run lib/nautilus.test.ts app/api/v1/payments/claim/route.test.ts`
Expected: PASS

### Task 4: Verify the integrated implementation

**Files:**
- No new code if prior tasks are clean

- [ ] **Step 1: Run TypeScript checks**

Run:
- `pnpm --filter nautilus-signer exec tsc --noEmit`
- `pnpm --filter web exec tsc --noEmit`

Expected: PASS

- [ ] **Step 2: Run focused tests**

Run:
- `pnpm --filter nautilus-signer exec vitest run`
- `pnpm --filter web exec vitest run lib/nautilus.test.ts app/api/v1/payments/claim/route.test.ts`

Expected: PASS

- [ ] **Step 3: Smoke test the signer locally**

Run signer:
- `pnpm --filter nautilus-signer dev`

Verify the configured seed first:
- confirm the signer logs or exposes the derived public key
- confirm it matches the registered on-chain key `0x77ea384188b9f8a8f2886fa676d64ca11e2730a6af4e2c181f187b2dc815a704`

Then call:

```bash
curl -X POST http://127.0.0.1:8787/attestation \
  -H "content-type: application/json" \
  -H "authorization: Bearer $NAUTILUS_SIGNER_SECRET" \
  -d '{"x_user_id":"12345","sui_address":"0x2"}'
```

Expected:
- `200 OK`
- JSON response with `signature`, `x_user_id`, `sui_address`, `nonce`, `expires_at`

- [ ] **Step 4: Run the real claim-flow verification from the spec**

Run signer:
- `pnpm --filter nautilus-signer dev`

Run web app:
- `pnpm --filter web dev`

Then trigger the real claim path:
- authenticate with Privy
- ensure the test user has a funded unclaimed vault
- call `POST /api/v1/payments/claim` through the app or browser session
- confirm the resulting transaction succeeds on-chain
- confirm `x_vault::claim_vault` completed successfully as the final proof that the signer output is chain-valid

- [ ] **Step 5: Document any remaining manual cloud-deployment follow-up**

Note in the final handoff:
- the signer is still a normal Node service
- AWS Nitro migration is a deployment change, not a contract change

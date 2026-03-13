# Levo — Implementation Plan

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Full-featured, Sui testnet |
| Stack | Next.js fullstack, TypeScript |
| TEE | Hybrid — mock local, real Nautilus in staging |
| Infra | Self-managed VPS, Docker Compose |
| Wallet | @mysten/dapp-kit |
| Coins | Generic `Coin<T>` + mock test token |
| Vault derivation | Versioned: **v1** uses `u64 x_user_id` directly as derived_object key (unsalted, publicly computable); **v2** (Phase 6) will use `blake2b256("XUID:" \|\| x_user_id \|\| salt)` for privacy |
| X identity model | `x_user_id` is the immutable routing identity; `username` is mutable metadata only. `derivation_version` changes only when the derivation formula / registry changes, never on handle renames. |
| Sequencing | Vertical slices (flow by flow) |

---

## Project Structure

```
levo/
├── apps/
│   └── web/                    # Next.js app (frontend + API routes)
│       ├── app/                # App Router pages, layouts, and route handlers
│       │   └── api/            # `app/api/**/route.ts` REST endpoints
│       ├── components/         # React components
│       ├── lib/                # Shared utilities, Sui client, X API client
│       └── styles/             # Global styles, tokens, theming
├── packages/
│   ├── contracts/              # Move smart contracts
│   │   ├── sources/
│   │   │   ├── x_vault.move    # XVaultRegistry, XVault, claim_vault, sweep_coin_to_vault
│   │   │   └── test_usdc.move  # Mock stablecoin with faucet mint
│   │   ├── tests/
│   │   └── Move.toml
│   ├── nautilus-mock/          # Mock TEE attestation signer
│   │   └── src/
│   └── nautilus-enclave/       # Real Nautilus enclave code (later)
│       └── src/
├── infra/
│   ├── docker-compose.yml      # Postgres, Redis, app, Nautilus
│   ├── nginx/                  # Reverse proxy config
│   └── scripts/                # Deploy, seed, migrate scripts
├── docs/
│   └── plans/                  # Design & implementation docs
├── package.json                # Root npm tooling manifest
└── turbo.json                  # Turborepo config (if needed)
```

The repository uses a single root `package.json` for JavaScript tooling such as test-vector generation. Move contracts live alongside the app so generated TypeScript types stay in sync as more web packages are added. All HTTP endpoints live under Next.js App Router route handlers in `app/api`. The `nautilus-mock` package provides a drop-in signer for local dev that produces the same attestation payload structure as the real enclave.

---

## Phase 1 — Move Contracts + Mock Token (Foundation)

Everything depends on the on-chain primitives working correctly.

### Deliverables

1. **`x_vault` module** — the core contract:
   - `XVaultRegistry` shared object (namespace root)
   - `derive_vault_address(registry, x_user_id)` — deterministic address computation
   - `claim_vault` — claim derived vault and bind it to the recipient's Sui address after attestation verification
   - `sweep_coin_to_vault<T>` — receive coins sent to the vault's derived address via `Receiving<Coin<T>>` and merge into the vault's per-type balance (dynamic field)
   - `withdraw<T>` / `withdraw_all<T>` — vault owner pulls a caller-specified amount of coin type `T`, or the entire stored balance of coin type `T` only, to their wallet. These exit paths remain available even while the vault registry is paused.
   - `transfer_vault` — transfer the vault object to `ctx.sender()` as the final PTB step after claim + sweep. This is safe because `XVault` has `key` only (no `store`), so only the current Sui object owner can supply it as input; in sponsored transactions `ctx.sender()` is still the end user, not the gas sponsor.
   - `update_owner` — attested owner handoff for wallet rotation or other support-reviewed address changes that the current owner still initiates. Unlike `transfer_vault`, this path consumes the address-owned vault, verifies an owner-handoff attestation over `(x_user_id, vault_id, current_owner, new_owner, recovery_counter, expires_at, registry_id)`, requires an exact counter match (`attestation.recovery_counter == vault.recovery_counter`), transfers the object to `new_owner`, then advances the replay-protection recovery counter. It is not a lost-key recovery path; a separate future mechanism would be required for true key-loss recovery.
   - `rescue_object<T>` — owner-gated, pause-gated recovery of arbitrary `key + store` objects accidentally sent to the vault address
   - Admin controls: `pause` / `unpause` on `XVaultRegistry` for claim, sweep, rescue, and owner-handoff flows. Pause intentionally does not block `withdraw` / `withdraw_all`, so users can still exit during an incident.
   - Events: `VaultClaimed` (on claim), `FundsSwept` (on sweep, with `coin_type` + `amount`), `FundsWithdrawn` (on withdraw, with `coin_type` + `amount`), `OwnerUpdated` (on owner handoff). Phase 1 intentionally does not emit separate `transfer_vault` or `rescue_object` events: initial claim ownership is already captured by `VaultClaimed`, owner handoffs are captured by `OwnerUpdated`, and arbitrary-object rescues are outside the payment-ledger/indexer scope.
   - Coins are sent to the derived vault address via standard `public_transfer` — no wrapper entry function needed at the contract layer; custom send-side events (if needed for indexing) will be added in a later phase

2. **`test_usdc` module** — mock stablecoin:
   - Standard `Coin<TEST_USDC>` with `TreasuryCap`
   - Public `mint` function (testnet only — anyone can mint for testing)

3. **`nautilus_verifier` module** — on-chain attestation verification:
   - `EnclaveRegistry` shared object with admin-gated key management
   - `register_pubkey` / `remove_pubkey` — register and revoke Ed25519 enclave public keys (32-byte validation enforced)
   - `pause` / `unpause` — emergency stop controls for attestation verification
   - `verify_attestation` — verify BCS-serialized `(x_user_id, sui_address, nonce, expires_at, registry_id)` signature against any registered key, and reject expired attestations by asserting `expires_at` has not passed
   - `verify_owner_recovery_attestation` — verify owner-handoff attestations bound to `(x_user_id, vault_id, current_owner, new_owner, recovery_counter, expires_at, registry_id)` and reject expired attestations before `update_owner` executes. The current public name is kept for compatibility even though the flow is owner-initiated handoff, not autonomous key-loss recovery.
   - Phase 1 uses a mock signer key registered via `register_pubkey`. PCR-backed enclave registration is deferred to Phase 6 (real Nautilus integration)

4. **Move tests** covering:
   - Derive address -> transfer coin to it -> claim -> first sweep -> follow-up sweep -> withdraw
   - Reject claim with wrong attestation / wrong sender
   - Reject duplicate claim
   - Multi-coin-type sweep and withdraw
   - Pre- and post-claim send lifecycle
   - Owner handoff: valid attested transfer, stale-signature replay rejection, and paused-registry rejection paths
   - Key management: invalid pubkey length, missing key removal, duplicate key rejection
   - Positive and negative attestation verification (valid sig, wrong sig, expired, cross-registry replay)
   - Pause controls for both registries across claim-time and owner-handoff verification paths

**Deploy to Sui testnet** at the end of this phase. Record the `XVaultRegistry` object ID and package ID.

---

## Phase 2 — Send Flow (First Vertical Slice)

End-to-end: sender opens the app, types an X handle, sends stablecoins. No claim yet — funds just land at the derived address.

### Backend (Next.js App Router route handlers)

1. **`POST /api/v1/resolve/x-username`** — takes `username`, always calls X API `GET /2/users/by/username/{username}` with app-only bearer token, and never uses the DB cache as the source of truth for payment routing. Returns canonical `x_user_id`, `username`, `derivation_version`, and computes `vault_object_id` (derived address) using on-chain `derive_vault_address` via dev-inspect or local SDK computation. Persist the last-seen mapping in Postgres for analytics, audit, and rate-limit observability only.

2. **`POST /api/v1/payments/quote`** — takes `username`, `coin_type`, `amount`, `sender_address`, plus a connected-wallet proof (for example a signature over a server-issued quote challenge). Re-resolves the handle against X API on every send attempt, then returns canonical `x_user_id`, `derivation_version`, `vault_object_id` as transfer target, estimated gas, and an opaque confirmation payload for the later confirm call. That payload must be a server-generated HMAC or signed token binding at least `(x_user_id, derivation_version, vault_address, coin_type, amount, sender_address, nonce, expires_at)` so the client cannot tamper with routing data or replay an old quote indefinitely. Persist each issued quote as a short-lived `payment_quote` row and rate-limit quote creation by IP + sender address, with a cap on unresolved quotes per sender.

3. **`POST /api/v1/payments/confirm`** — called by the frontend immediately after a successful send transaction and treated as an idempotent finalize step, not a best-effort analytics call. Takes `tx_digest` and the opaque confirmation payload from `payments/quote`. It must first verify the payload HMAC / signature, ensure the quote is still unresolved, and reject expired payloads before making any RPC calls. Confirm calls are rate-limited by quote ID/token hash plus IP, and the retry window should stay short (target: 5 minutes from quote issuance, not 24 hours). If the transaction is not yet visible on RPC, return `202 Accepted` / retry-later only while that short retry window remains open. If the transaction is found but failed, return `409 Conflict` with the chain failure reason and do not write a ledger row. If the transaction succeeded, re-derive the expected vault address from the quoted `x_user_id`, verify that the on-chain transaction sender exactly matches the quote-bound `sender_address`, and inspect effects using a deterministic matching rule: only support the app-produced single-recipient PTB shape, iterate successful `TransferObject` effects in order, find the lowest effect index whose recipient equals `quoted_vault_address` and whose transferred object is `Coin<quoted_coin_type>`, recover the transferred amount from the matched coin object / balance change, and reject the confirm if zero or multiple candidate matches remain or if the recovered amount differs from the quote. Write the `payment_ledger` row only when all recovered on-chain values match the quote-bound payload. Retries with the same payload must be safe. This is the authoritative source of truth for sender-side payment data since sends execute directly from the connected wallet without backend mediation.

4. **Postgres setup** — Docker container, initial schema migration with `x_user`, `payment_quote`, and `payment_ledger` tables. `x_user` is keyed by immutable `x_user_id` and stores mutable username metadata, account status (`active`, `renamed`, `suspended`, `deleted`), and active `derivation_version`. Username renames update the existing row because routing identity is the stable `x_user_id`; if an old handle later resolves to a different `x_user_id`, that becomes a distinct row. `derivation_version` only increments when routing derivation inputs change (for example v1 -> v2 privacy rollout), not when a username changes. If X resolution later fails or the account is suspended/deleted, stop issuing new quotes for that `x_user_id`, preserve prior audit history, and route exceptional fund handling through manual support review. Phase 1 `update_owner` only supports current-owner-initiated handoffs; it does not replace a future dedicated lost-key recovery flow. `payment_quote` stores short-lived unresolved quote metadata (`sender_address`, `x_user_id`, `username_at_quote`, `derivation_version`, `vault_address`, `coin_type`, `amount`, `expires_at`, `status`) so confirm and reconciliation only inspect recent unresolved sends. `payment_ledger` uses a source-aware idempotency key instead of `tx_digest` alone: contract events write `(ledger_source = 'contract_event', tx_digest, source_index = event_seq)`, while `payments/confirm` writes `(ledger_source = 'send_confirm', tx_digest, source_index = matched_transfer_effect_index)`. Using the matched transfer effect index keeps wallet-send confirmations retry-safe without colliding with later event-indexed rows from the same transaction or future multi-recipient PTBs. Drizzle ORM for type-safe queries.

### Frontend

1. **Send page** — core UX:
   - Wallet connect button (@mysten/dapp-kit)
   - X handle input with debounced resolution (calls resolve endpoint, shows avatar + verified user ID)
   - Amount input + coin type selector
   - "Send" button -> builds the app-standard PTB shape with exactly one transfer of the selected coin type to the derived vault address via `public_transfer` -> signs via connected wallet -> executes on Sui testnet

2. **Transaction confirmation** — tx digest, link to Sui explorer, amount sent, recipient handle. After wallet execution succeeds, the frontend enters a "finalizing payment" state and calls `POST /api/v1/payments/confirm` with the transaction digest plus the quote-issued confirmation payload before treating the send as durably recorded in app history. Pending confirms must be retried until the backend acknowledges the row (for example via local durable queue / retry-on-reload behavior), so a tab close or transient network error does not silently drop sender-side history.

3. **Basic layout** — minimal nav, responsive. Ship function over form.

No auth required for senders — they just connect a wallet and send.

---

## Phase 3 — Claim Flow (Second Vertical Slice)

Recipient authenticates with X, gets an attestation, and claims funds on-chain.

### Backend

1. **X OAuth 2.0 PKCE flow:**
   - `GET /api/v1/oauth/x/start` — generates `code_verifier`, `code_challenge`, `state`, stores in session (Redis). Redirects to `https://x.com/i/oauth2/authorize`.
   - `GET /api/v1/oauth/x/callback` — exchanges `code` for access token, calls `GET /2/users/me` to get `x_user_id`. Establishes authenticated session.

2. **`POST /api/v1/claim/prepare`** — takes session + recipient's Sui address. Queries the derived vault address for owned objects (coins waiting to be claimed) via GraphQL RPC. Returns `derivation_version`, whether the vault is already claimed, batched object refs for PTB construction, and server-configured batch caps for the first claim PTB vs follow-up sweep PTBs. The initial claim batch should start conservatively (for example 20-30 object refs because it includes `claim_vault + sweep_coin_to_vault + transfer_vault`), while later sweep-only batches can use a larger cap and be tuned without frontend redeploy.

3. **`POST /api/v1/claim/attest`** — calls the Nautilus mock signer (or real enclave in staging). Signs `(x_user_id, sui_address, nonce, expires_at, registry_id)` where `registry_id` is the deployed `EnclaveRegistry` object address (domain separator preventing cross-deployment replay). Returns attestation bytes + signature.

4. **Account lifecycle / recovery policy** — handle renames never create a new vault because derivation is keyed by immutable `x_user_id`, not the mutable handle string. If X later reports an account as suspended/deleted or it no longer resolves, mark the `x_user` row non-routable so new quotes stop immediately and retain historical rows for audit. Manual support may still coordinate an attested `update_owner` handoff when the current owner can participate, but true key-loss recovery remains out of scope for this phase and requires a separate future mechanism.

### Nautilus Mock (`packages/nautilus-mock`)

- Express server with a single endpoint mimicking `/process_data`
- Signs attestation payloads with a known Ed25519 keypair
- Same payload structure as real Nautilus — swap is just changing the URL and key registration

### Frontend

1. **Claim page** — "You have funds waiting" landing:
   - "Sign in with X" button -> OAuth PKCE flow
   - After auth: show pending funds (amounts, coin types)
   - "Connect wallet" to provide destination Sui address
   - "Claim" button -> first PTB calls `claim_vault` + `sweep_coin_to_vault` + `transfer_vault` with attestation + first batch refs -> signs -> executes
   - Batch logic: use the server-provided first-batch and follow-up-batch caps from `claim/prepare` instead of a hardcoded constant; follow-up PTBs call `sweep_coin_to_vault` against the already claimed vault with progress indicator

2. **Claim confirmation** — claimed amounts, tx digests, link to explorer.

---

## Phase 4 — Sponsored Transactions + Gas Station

New users claiming funds shouldn't need SUI for gas.

### Backend

1. **Gas Station service** — dedicated module holding a funded SUI address on testnet:
   - `POST /api/v1/tx/sponsor` — receives unsigned transaction from claim flow, validates it (whitelist: only `claim_vault`, `sweep_coin_to_vault`, `transfer_vault`, `withdraw`, and `withdraw_all` calls against the known package ID), co-signs as gas sponsor, returns sponsored transaction bytes. `withdraw_all<T>` remains sponsor-eligible because it only drains the full balance of a single coin type `T` and is still owner-authenticated. `update_owner` and `rescue_object` are intentionally excluded from sponsorship because they are owner-handoff / exceptional flows that should require explicit self-paid user intent rather than background onboarding gas.
   - **Budget controls** — per-user daily gas limit, per-transaction gas cap, total pool monitoring.
   - **Equivocation protection** — track in-flight sponsored transactions per sender. Reject new ones if a pending sponsored tx exists.

2. **Claim flow integration** — detect if user has SUI for gas:
   - If yes: normal self-paid transaction
   - If no: route through sponsor endpoint, build dual-signed transaction
   - Transparent to the user

3. **Monitoring** — log every sponsored transaction to `payment_ledger` with sponsor flag. Track gas pool balance with alerts.

### Frontend changes

- Claim flow silently checks SUI balance after wallet connect
- No visible difference to user — sponsorship happens behind the scenes
- Error state if gas pool depleted: fallback to self-pay with message

---

## Phase 5 — Indexer, Query Layer & Dashboard

Proper data infrastructure for querying payments, balances, and history.

### Indexer service

1. **Event listener** — subscribes to `VaultClaimed`, `FundsSwept`, `FundsWithdrawn`, and `OwnerUpdated` events via Sui GraphQL RPC (no JSON-RPC). Runs as a long-lived Docker process.
   - Tracks checkpoint cursor for reliable replay/recovery
   - Writes events to `payment_ledger` with idempotent upserts keyed by event identity, e.g. `(tx_digest, event_seq)`
   - `VaultClaimed` → records claim and updates `x_user` status; `FundsSwept` → records sweep-side amount/coin_type (covers both first-claim and follow-up sweep batches); `FundsWithdrawn` → records withdrawal amount/coin_type; `OwnerUpdated` → updates the current owner pointer used by recipient dashboard and recovery-aware views
   - Updates `x_user` status on claim events and ownership metadata on owner-handoff events
   - **Send-side ingestion**: Since coins are sent via bare `public_transfer` (no contract event), send-side data comes from Phase 2's `POST /api/v1/payments/confirm` endpoint, which the frontend calls after each successful send with the quote-issued confirmation payload. The backend validates the payload against the actual transfer effects before writing `payment_ledger`, making it the authoritative source for sender dashboard queries. In addition, a required reconciliation worker runs with its own named cursor (separate from the contract-event listener cursor) and materializes a bounded watch set only from recent unresolved `payment_quote` rows, using the exact `(sender_address, vault_address, derivation_version, coin_type, amount)` captured at quote time. Reconciled / expired / already-confirmed quotes are pruned from that watch set. The worker only backfills a `payment_ledger` row when a `TransferObject` effect matches one of those unresolved quotes, so unrelated transfers to the same derived address are ignored and older derivation versions remain reconcilable without watching every historical `x_user`-derived vault forever.

2. **Balance resolver** — queries owned objects at derived vault address via GraphQL RPC. Aggregates by coin type. Caches in Redis (30s TTL).

3. **Notification hooks** — when payment arrives for unclaimed vault, store "pending notification" row. Future: webhook, email, X DM.

### Frontend — Dashboard pages

1. **Sender dashboard** — connect wallet -> see all sent payments, status (pending/claimed), recipient handle, amounts, timestamps.

2. **Recipient dashboard** — after X login -> see incoming payments, claimed history, vault balances per coin type. Withdraw to connected wallet.

3. **Public lookup** (optional) — enter X handle -> see if vault exists, aggregate pending amount. Flag for later if privacy is a concern.

---

## Phase 6 — Real Nautilus Integration + Privacy

Swap mock TEE for real Nautilus. Add privacy layer.

### Nautilus Enclave (`packages/nautilus-enclave`)

1. **Enclave code** (Rust or TypeScript per Nautilus SDK):
   - `/process_data` with `type: "attest_claim"` — receives OAuth code/token, calls X API internally, validates identity, signs `(x_user_id, sui_address, nonce, expires_at, registry_id)` where `registry_id` binds the attestation to the deployed `EnclaveRegistry` object
   - `/process_data` with `type: "resolve_username"` — resolve handles inside enclave so X API bearer token never leaves TEE
   - `/get_attestation` — returns PCR values for on-chain registration
   - X OAuth client secret stored encrypted via Seal — only enclave with matching PCR can decrypt

2. **On-chain registration** — register the enclave's Ed25519 public key via `nautilus_verifier::register_pubkey`. For production, extend the verifier module to accept and validate PCR attestation values alongside the key (e.g., a new `register_pubkey_with_pcr` entry that stores PCR hashes and verifies them on-chain or via a trusted oracle). Revoke testnet-only keys with `remove_pubkey` once the real enclave key is registered.

3. **Deploy on VM** — Docker container with TEE support (AWS Nitro Enclave or Azure SGX).

### Privacy enhancements

1. **Versioned private derivation** — introduce `derivation_version = 2` with a new privacy registry and salted key derivation (`derive_address(registry_v2, hash(x_user_id + salt))`). Keep v1 unsalted vaults readable and claimable; do not mutate existing vault addresses in place.

2. **Backend resolver required** — since v2 derivation is salted, backend/enclave becomes the resolution layer for new private-mode sends. APIs, DB rows, and indexer records must carry `derivation_version` so v1 and v2 can coexist during rollout.

3. **Migration policy** — new sends can be cut over to v2 behind a feature flag after dashboards and claim flows support both versions. Historical v1 balances remain claimable in place; optional migration tooling can be added later rather than forcing an address-breaking cutover.

---

## Phase 7 — Infrastructure, Testing & Hardening

Everything works — now make it reliable, secure, and ops-friendly.

### Docker Compose stack

```yaml
services:
  web          # Next.js app (frontend + API)
  postgres     # Primary database
  redis        # Session store + cache
  indexer      # Event listener service
  nautilus     # TEE enclave (mock or real based on env)
  nginx        # Reverse proxy, SSL termination
```

Each service has health checks, restart policies, and resource limits. Single `docker compose up` for full stack.

### Testing strategy

1. **Move unit tests** — all contract paths (derive, claim_vault, sweep_coin_to_vault, withdraw, reject bad attestation, duplicate claim, multi-coin-type)
2. **API integration tests** — Jest/Vitest against running backend + testnet. Mock X API responses. Test OAuth flow, resolve, claim/prepare, sponsor.
3. **E2E tests** — Playwright. Full send flow (wallet -> resolve -> send -> confirm). Full claim flow (X login -> claim first batch -> follow-up sweeps -> withdraw). Sponsored tx path.
4. **Load/batch tests** — sweep with 10/50/200 coin objects to find practical PTB limit. Document max batch size and the crossover point where claim must spill into multiple transactions.

### Security hardening

- Rate limiting on all API endpoints (especially resolve, sponsor, and `payments/confirm`)
- CORS whitelist, CSRF protection on OAuth callbacks
- Input validation: sanitize X handles, validate amounts, reject malformed addresses
- `payments/confirm` validates the quote-issued HMAC / signed payload before any RPC lookup, then applies per-IP and per-wallet rate limits to bound confirm-path RPC abuse
- Sponsor whitelist: only allow PTBs calling known package ID + approved functions (`claim_vault`, `sweep_coin_to_vault`, `transfer_vault`, `withdraw`, `withdraw_all`); keep `update_owner` and `rescue_object` out of the sponsored path
- Secrets management: env vars via Docker secrets, no plaintext in repo

### Monitoring

- Structured JSON logging across all services
- Gas pool balance alerting
- Indexer checkpoint lag alerting
- Basic health endpoint per service

---

## Phase Dependencies

```
Phase 1 (Contracts)
  └── Phase 2 (Send Flow)
        └── Phase 3 (Claim Flow)
              ├── Phase 4 (Sponsored Tx)
              └── Phase 5 (Indexer + Dashboard)
                    └── Phase 6 (Real Nautilus + Privacy)
                          └── Phase 7 (Hardening)
```

Phases 4 and 5 can run in parallel after Phase 3 is complete.

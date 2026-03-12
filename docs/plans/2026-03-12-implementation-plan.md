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
│   │   │   ├── x_vault.move    # XVaultRegistry, XVault, claim_vault, sweep_to_vault
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
├── package.json                # pnpm workspace root
└── turbo.json                  # Turborepo config (if needed)
```

Monorepo managed by **pnpm workspaces**. Move contracts live alongside the app so generated TypeScript types stay in sync. All HTTP endpoints live under Next.js App Router route handlers in `app/api`. The `nautilus-mock` package provides a drop-in signer for local dev that produces the same attestation payload structure as the real enclave.

---

## Phase 1 — Move Contracts + Mock Token (Foundation)

Everything depends on the on-chain primitives working correctly.

### Deliverables

1. **`x_vault` module** — the core contract:
   - `XVaultRegistry` shared object (namespace root)
   - `derive_vault_address(registry, x_user_id)` — deterministic address computation
   - `claim_vault` — claim derived vault and bind it to the recipient's Sui address after attestation verification
   - `send_to_vault<T>` — entry function wrapping coin transfer to vault derived address + emits `PaymentSent` event (required because a bare `public_transfer` bypasses the contract and produces no custom event)
   - `sweep_to_vault<T>` — receive queued coins into an existing claimed vault and merge to dynamic field
   - `withdraw<T>` — vault owner pulls funds to their wallet
   - `PaymentSent` / `PaymentClaimed` / `FundsSwept` events for indexing & audit (`FundsSwept` is emitted by `sweep_to_vault` with actual `coin_type` + `amount`, covering both first-claim and follow-up sweep batches)

2. **`test_usdc` module** — mock stablecoin:
   - Standard `Coin<TEST_USDC>` with `TreasuryCap`
   - Public `mint` function (testnet only — anyone can mint for testing)

3. **`nautilus_verifier` module** — on-chain attestation verification:
   - Register enclave public key + PCR values
   - Verify attestation signature on claim (with a **testnet bypass flag** that accepts the mock signer's key)
   - Structured so the bypass can be removed for mainnet

4. **Move tests** covering:
   - Derive address -> transfer coin to it -> claim -> first sweep -> follow-up sweep -> withdraw
   - Reject claim with wrong attestation
   - Reject duplicate claim
   - Multi-coin-type sweep
   - Split claim flow across multiple transactions after the first successful claim

**Deploy to Sui testnet** at the end of this phase. Record the `XVaultRegistry` object ID and package ID.

---

## Phase 2 — Send Flow (First Vertical Slice)

End-to-end: sender opens the app, types an X handle, sends stablecoins. No claim yet — funds just land at the derived address.

### Backend (Next.js App Router route handlers)

1. **`POST /api/v1/resolve/x-username`** — takes `username`, always calls X API `GET /2/users/by/username/{username}` with app-only bearer token, and never uses the DB cache as the source of truth for payment routing. Returns canonical `x_user_id`, `username`, `derivation_version`, and computes `vault_object_id` (derived address) using on-chain `derive_vault_address` via dev-inspect or local SDK computation. Persist the last-seen mapping in Postgres for analytics, audit, and rate-limit observability only.

2. **`POST /api/v1/payments/quote`** — takes `username`, `coin_type`, `amount`. Re-resolves the handle against X API on every send attempt, then returns canonical `x_user_id`, `derivation_version`, `vault_object_id` as transfer target, estimated gas, and confirmation payload.

3. **Postgres setup** — Docker container, initial schema migration with `x_user` and `payment_ledger` tables from the spec. `x_user` stores last-resolved username metadata plus active `derivation_version`. `payment_ledger` uses an event-level idempotency key such as `(tx_digest, event_seq)` instead of `tx_digest` alone. Drizzle ORM for type-safe queries.

### Frontend

1. **Send page** — core UX:
   - Wallet connect button (@mysten/dapp-kit)
   - X handle input with debounced resolution (calls resolve endpoint, shows avatar + verified user ID)
   - Amount input + coin type selector
   - "Send" button -> builds PTB calling contract's `send_to_vault<T>(registry, x_user_id, coin)` (emits `PaymentSent` event for indexer) -> signs via connected wallet -> executes on Sui testnet

2. **Transaction confirmation** — tx digest, link to Sui explorer, amount sent, recipient handle.

3. **Basic layout** — minimal nav, responsive. Ship function over form.

No auth required for senders — they just connect a wallet and send.

---

## Phase 3 — Claim Flow (Second Vertical Slice)

Recipient authenticates with X, gets an attestation, and claims funds on-chain.

### Backend

1. **X OAuth 2.0 PKCE flow:**
   - `GET /api/v1/oauth/x/start` — generates `code_verifier`, `code_challenge`, `state`, stores in session (Redis). Redirects to `https://x.com/i/oauth2/authorize`.
   - `GET /api/v1/oauth/x/callback` — exchanges `code` for access token, calls `GET /2/users/me` to get `x_user_id`. Establishes authenticated session.

2. **`POST /api/v1/claim/prepare`** — takes session + recipient's Sui address. Queries the derived vault address for owned objects (coins waiting to be claimed) via GraphQL RPC. Returns `derivation_version`, whether the vault is already claimed, and batched object refs for PTB construction: first batch for `claim_vault + sweep_to_vault + transfer_vault`, later batches for `sweep_to_vault` only.

3. **`POST /api/v1/claim/attest`** — calls the Nautilus mock signer (or real enclave in staging). Signs `(x_user_id, sui_address, nonce, expires_at)`. Returns attestation bytes + signature.

### Nautilus Mock (`packages/nautilus-mock`)

- Express server with a single endpoint mimicking `/process_data`
- Signs attestation payloads with a known Ed25519 keypair
- Same payload structure as real Nautilus — swap is just changing the URL and key registration

### Frontend

1. **Claim page** — "You have funds waiting" landing:
   - "Sign in with X" button -> OAuth PKCE flow
   - After auth: show pending funds (amounts, coin types)
   - "Connect wallet" to provide destination Sui address
   - "Claim" button -> first PTB calls `claim_vault` + `sweep_to_vault` + `transfer_vault` with attestation + first batch refs -> signs -> executes
   - Batch logic: if >50 coin objects, follow-up PTBs call `sweep_to_vault` against the already claimed vault with progress indicator

2. **Claim confirmation** — claimed amounts, tx digests, link to explorer.

---

## Phase 4 — Sponsored Transactions + Gas Station

New users claiming funds shouldn't need SUI for gas.

### Backend

1. **Gas Station service** — dedicated module holding a funded SUI address on testnet:
   - `POST /api/v1/tx/sponsor` — receives unsigned transaction from claim flow, validates it (whitelist: only `claim_vault`, `sweep_to_vault`, `transfer_vault`, and `withdraw` calls against known package ID), co-signs as gas sponsor, returns sponsored transaction bytes.
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

1. **Event listener** — subscribes to `PaymentSent`, `PaymentClaimed`, and `FundsSwept` events via Sui GraphQL RPC (no JSON-RPC). Runs as a long-lived Docker process.
   - Tracks checkpoint cursor for reliable replay/recovery
   - Writes events to `payment_ledger` with idempotent upserts keyed by event identity, e.g. `(tx_digest, event_seq)`
   - `PaymentSent` → records send-side amount/coin_type; `FundsSwept` → records claim-side amount/coin_type (covers both first-claim and follow-up sweep batches); `PaymentClaimed` → updates `x_user` status
   - Updates `x_user` status on claim events

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
   - `/process_data` with `type: "attest_claim"` — receives OAuth code/token, calls X API internally, validates identity, signs `(x_user_id, sui_address, nonce, expires_at)`
   - `/process_data` with `type: "resolve_username"` — resolve handles inside enclave so X API bearer token never leaves TEE
   - `/get_attestation` — returns PCR values for on-chain registration
   - X OAuth client secret stored encrypted via Seal — only enclave with matching PCR can decrypt

2. **On-chain registration** — call `nautilus_verifier::register_enclave` with real PCR values and enclave public key. Remove testnet bypass flag (or keep both keys for dual-mode).

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

1. **Move unit tests** — all contract paths (derive, claim_vault, sweep_to_vault, withdraw, reject bad attestation, duplicate claim, multi-coin-type)
2. **API integration tests** — Jest/Vitest against running backend + testnet. Mock X API responses. Test OAuth flow, resolve, claim/prepare, sponsor.
3. **E2E tests** — Playwright. Full send flow (wallet -> resolve -> send -> confirm). Full claim flow (X login -> claim first batch -> follow-up sweeps -> withdraw). Sponsored tx path.
4. **Load/batch tests** — sweep with 10/50/200 coin objects to find practical PTB limit. Document max batch size and the crossover point where claim must spill into multiple transactions.

### Security hardening

- Rate limiting on all API endpoints (especially resolve and sponsor)
- CORS whitelist, CSRF protection on OAuth callbacks
- Input validation: sanitize X handles, validate amounts, reject malformed addresses
- Sponsor whitelist: only allow PTBs calling known package ID + approved functions (`claim_vault`, `sweep_to_vault`, `transfer_vault`, `withdraw`)
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

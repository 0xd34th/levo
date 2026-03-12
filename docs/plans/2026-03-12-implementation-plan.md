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
| Sequencing | Vertical slices (flow by flow) |

---

## Project Structure

```
levo/
├── apps/
│   └── web/                    # Next.js app (frontend + API routes)
│       ├── app/                # App Router pages & layouts
│       ├── components/         # React components
│       ├── lib/                # Shared utilities, Sui client, X API client
│       └── api/                # Route handlers (REST endpoints from spec)
├── packages/
│   ├── contracts/              # Move smart contracts
│   │   ├── sources/
│   │   │   ├── x_vault.move    # XVaultRegistry, XVault, claim_and_sweep
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

Monorepo managed by **pnpm workspaces**. Move contracts live alongside the app so generated TypeScript types stay in sync. The `nautilus-mock` package provides a drop-in signer for local dev that produces the same attestation payload structure as the real enclave.

---

## Phase 1 — Move Contracts + Mock Token (Foundation)

Everything depends on the on-chain primitives working correctly.

### Deliverables

1. **`x_vault` module** — the core contract:
   - `XVaultRegistry` shared object (namespace root)
   - `derive_vault_address(registry, x_user_id)` — deterministic address computation
   - `claim_and_sweep<T>` — claim derived vault + receive coins + merge to dynamic field
   - `withdraw<T>` — vault owner pulls funds to their wallet
   - `PaymentSent` / `PaymentClaimed` events for indexing & audit

2. **`test_usdc` module** — mock stablecoin:
   - Standard `Coin<TEST_USDC>` with `TreasuryCap`
   - Public `mint` function (testnet only — anyone can mint for testing)

3. **`nautilus_verifier` module** — on-chain attestation verification:
   - Register enclave public key + PCR values
   - Verify attestation signature on claim (with a **testnet bypass flag** that accepts the mock signer's key)
   - Structured so the bypass can be removed for mainnet

4. **Move tests** covering:
   - Derive address -> transfer coin to it -> claim -> sweep -> withdraw
   - Reject claim with wrong attestation
   - Reject duplicate claim
   - Multi-coin-type sweep

**Deploy to Sui testnet** at the end of this phase. Record the `XVaultRegistry` object ID and package ID.

---

## Phase 2 — Send Flow (First Vertical Slice)

End-to-end: sender opens the app, types an X handle, sends stablecoins. No claim yet — funds just land at the derived address.

### Backend (Next.js API routes)

1. **`POST /api/v1/resolve/x-username`** — takes `username`, calls X API `GET /2/users/by/username/{username}` with app-only bearer token. Returns `x_user_id`, `username`, and computes `vault_object_id` (derived address) using on-chain `derive_vault_address` via dev-inspect or local SDK computation. Cache `username -> x_user_id` in Postgres.

2. **`POST /api/v1/payments/quote`** — takes `x_user_id`, `coin_type`, `amount`. Returns `vault_object_id` as transfer target, estimated gas, and confirmation payload.

3. **Postgres setup** — Docker container, initial schema migration with `x_user` and `payment_ledger` tables from the spec. Drizzle ORM for type-safe queries.

### Frontend

1. **Send page** — core UX:
   - Wallet connect button (@mysten/dapp-kit)
   - X handle input with debounced resolution (calls resolve endpoint, shows avatar + verified user ID)
   - Amount input + coin type selector
   - "Send" button -> builds PTB with `transfer::public_transfer(coin, vault_object_id)` -> signs via connected wallet -> executes on Sui testnet

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

2. **`POST /api/v1/claim/prepare`** — takes session + recipient's Sui address. Queries the derived vault address for owned objects (coins waiting to be claimed) via GraphQL RPC. Returns the list of `Receiving<Coin<T>>` object refs needed for the PTB.

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
   - "Claim" button -> builds PTB calling `claim_and_sweep` with attestation + receiving refs -> signs -> executes
   - Batch logic: if >50 coin objects, split into multiple transactions with progress indicator

2. **Claim confirmation** — claimed amounts, tx digests, link to explorer.

---

## Phase 4 — Sponsored Transactions + Gas Station

New users claiming funds shouldn't need SUI for gas.

### Backend

1. **Gas Station service** — dedicated module holding a funded SUI address on testnet:
   - `POST /api/v1/tx/sponsor` — receives unsigned transaction from claim flow, validates it (whitelist: only `claim_and_sweep` and `withdraw` calls against known package ID), co-signs as gas sponsor, returns sponsored transaction bytes.
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

1. **Event listener** — subscribes to `PaymentSent` and `PaymentClaimed` events via Sui GraphQL RPC (no JSON-RPC). Runs as a long-lived Docker process.
   - Tracks checkpoint cursor for reliable replay/recovery
   - Writes events to `payment_ledger` with idempotent upserts (keyed on `tx_digest`)
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

1. **Salted derived keys** — use `derive_address(registry, hash(x_user_id + salt))` instead of plaintext. Salt lives in backend/enclave. Third parties can't map handle -> vault address.

2. **Backend resolver required** — since derivation is salted, backend becomes the resolution layer. Trade-off: less trustless, more private. **Configurable mode** — unsalted (fully verifiable) vs salted (private).

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

1. **Move unit tests** — all contract paths (derive, claim, sweep, withdraw, reject bad attestation, duplicate claim, multi-coin-type)
2. **API integration tests** — Jest/Vitest against running backend + testnet. Mock X API responses. Test OAuth flow, resolve, claim/prepare, sponsor.
3. **E2E tests** — Playwright. Full send flow (wallet -> resolve -> send -> confirm). Full claim flow (X login -> claim -> withdraw). Sponsored tx path.
4. **Load/batch tests** — sweep with 10/50/200 coin objects to find practical PTB limit. Document max batch size.

### Security hardening

- Rate limiting on all API endpoints (especially resolve and sponsor)
- CORS whitelist, CSRF protection on OAuth callbacks
- Input validation: sanitize X handles, validate amounts, reject malformed addresses
- Sponsor whitelist: only allow PTBs calling known package ID + known functions
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

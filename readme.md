# Levo

Send stablecoins to any X handle on Sui — no wallet address needed. Recipients claim funds when ready.

## How it works

1. **Send** — Enter an `@handle` and amount. Levo derives a deterministic vault address from the X user ID and sends funds there on-chain. The sender's Privy embedded wallet signs the transaction server-side with gas sponsorship.
2. **Claim** — The recipient signs in with X via Privy. A Nautilus enclave (AWS Nitro TEE) produces an Ed25519 attestation binding the X user ID to the recipient's Sui address. The on-chain contract verifies this attestation via hardware-backed PCR proof, claims the vault, sweeps coins, and withdraws to the recipient.
3. **Dashboard** — Both senders and recipients can view payment history and track transaction status.

## Architecture

```
apps/web              Next.js 16 frontend + API routes
packages/contracts    Sui Move smart contracts (XVault + NautilusVerifier)
infra/                Docker Compose (local Postgres + Redis)
```

The attestation signer runs as a **Rust application inside an AWS Nitro Enclave** via the [Mysten Labs Nautilus framework](https://github.com/MystenLabs/nautilus). The enclave generates an ephemeral Ed25519 keypair on startup (private key never leaves the TEE), and its public key is registered on-chain through a hardware attestation document with PCR verification.

### Smart contracts (`packages/contracts`)

- **XVaultRegistry** — Global registry, admin controls, pause toggle
- **XVault** — Per-user vault with deterministic address derivation (`derived_object`)
- **NautilusVerifier** — Attestation verification via Nautilus `enclave::verify_signature`, with OTW-based `EnclaveConfig` and PCR registration
- Key operations: `derive_vault_address`, `claim_vault`, `sweep_coin_to_vault`, `withdraw`, `withdraw_all`
- Claim requires a valid `IntentMessage<AttestationMessage>` signature from a registered Nautilus enclave

### Nautilus enclave

Rust application running in AWS Nitro Enclave. Signs claim attestations with the enclave's ephemeral Ed25519 key.

- `POST /process_data` — Accepts `{ payload: { x_user_id, sui_address, registry_id } }`, returns `{ signature, nonce, expires_at, intent_scope, timestamp_ms }`
- `GET /health_check` — Returns enclave public key and endpoint status
- `GET /get_attestation` — Returns AWS Nitro attestation document for on-chain registration
- No external API calls needed — signing is purely local computation
- Source: Nautilus framework `src/nautilus-server/src/apps/levo/mod.rs`

### Web app (`apps/web`)

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Send | `/` | Send funds to an X handle |
| Claim | `/claim` | Claim vault after X login |
| Dashboard | `/dashboard/sent` | Sent payment history |
| Dashboard | `/dashboard/received` | Received payment history |

Key API routes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/lookup/x-username` | GET | Public vault status lookup |
| `/api/v1/payments/quote` | POST | Generate HMAC-signed payment quote |
| `/api/v1/payments/send` | POST | Build, sign (Privy), and execute send transaction |
| `/api/v1/payments/confirm` | POST | Confirm payment after on-chain verification |
| `/api/v1/payments/claim` | POST | Request attestation, build and execute claim transaction |
| `/api/v1/wallet/setup` | POST | Provision Privy embedded Sui wallet |

### Tech stack

- **Frontend**: React 19, Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui
- **Auth**: Privy (X/Twitter OAuth + embedded Sui wallets)
- **Sui SDK**: @mysten/sui
- **Backend**: Next.js API routes, Prisma (PostgreSQL), Redis (rate limiting + locks)
- **Enclave**: Rust, fastcrypto (Ed25519), BCS, axum — via Nautilus framework (AWS Nitro)
- **Contracts**: Sui Move (2024.beta edition), depends on Nautilus `enclave` package
- **Testing**: Vitest (web), Move unit tests (contracts), Rust tests (enclave)

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- Sui CLI (for contract deployment)
- Rust + Cargo (for enclave development)
- AWS account with Nitro Enclave support (for enclave deployment)

## Setup

```bash
git clone https://github.com/0xd34th/levo.git && cd levo
pnpm install
```

### 1. Configure `apps/web/.env`

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `TWITTER_API_KEY` | From [twitterapi.io](https://twitterapi.io) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | From Privy dashboard |
| `PRIVY_APP_SECRET` | From Privy dashboard |
| `HMAC_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` |
| `NEXT_PUBLIC_PACKAGE_ID` | From `deployed.testnet.json` |
| `NEXT_PUBLIC_VAULT_REGISTRY_ID` | From `deployed.testnet.json` |
| `NEXT_PUBLIC_TREASURY_CAP_ID` | From `deployed.testnet.json` |
| `GAS_STATION_SECRET_KEY` | `openssl rand -base64 32` (fund the derived address with SUI) |
| `ENCLAVE_OBJECT_ID` | From `deployed.testnet.json` — Nautilus `Enclave<NAUTILUS_VERIFIER>` shared object |
| `ENCLAVE_REGISTRY_ID` | From `deployed.testnet.json` — `EnclaveConfig` object (used as domain separator) |
| `NAUTILUS_ENCLAVE_URL` | Enclave URL, e.g. `http://<EC2_IP>:3000` |

### 2. Database and services

```bash
# Start Postgres + Redis
docker compose -f infra/docker-compose.yml up -d

# Database migrations
cd apps/web && npx prisma migrate deploy && npx prisma generate

# Start web app
pnpm --filter web dev
```

Object IDs for testnet are in `packages/contracts/deployed.testnet.json`.

### 3. Nautilus enclave (AWS Nitro)

See the [Nautilus framework](https://github.com/MystenLabs/nautilus) for full deployment docs. Quick summary:

```bash
# On EC2 with Nitro Enclave support (min 4 vCPU)
cd nautilus
make ENCLAVE_APP=levo && make run
sh expose_enclave.sh

# Register on-chain (from local machine)
sh register_enclave.sh $ENCLAVE_PKG $LEVO_PKG $CONFIG_ID $ENCLAVE_URL nautilus_verifier NAUTILUS_VERIFIER
```

After each enclave restart, re-register the new ephemeral key via `register_enclave.sh`.

## Testing

```bash
pnpm --filter web exec vitest run         # Web app tests (135 tests)
cd packages/contracts && sui move test    # Move contract tests (28 tests)
```

## Design decisions

### Why Privy instead of zkLogin

zkLogin ties a Sui address to a specific OAuth provider nonce and epoch — if the user's JWT expires or Sui epochs rotate, the derived address changes and funds become inaccessible. This is a critical risk for a product where funds sit in vaults for an indefinite period before the recipient claims them.

Privy gives us a persistent, server-managed embedded wallet per user. The wallet address is stable across sessions and doesn't depend on OAuth token lifecycle. It also lets us do server-side transaction signing (for gas sponsorship and atomic claim flows) without requiring the user to install a browser extension or understand gas.

### Why Nautilus (AWS Nitro Enclaves)

The attestation signer runs inside an AWS Nitro Enclave — a hardware-isolated TEE where the Ed25519 private key is generated and never leaves the enclave. The enclave's public key is registered on-chain via a Nitro attestation document, with PCR values proving the exact code running inside.

This provides:
- **Key isolation** — Private key exists only in enclave memory
- **Code integrity** — PCR hashes prove unmodified code
- **Hardware attestation** — AWS-signed documents verify enclave identity on-chain
- **Ephemeral keys** — Fresh keypair on each restart, no key material to manage

## Testnet proof

End-to-end flow verified on Sui testnet — screenshots at [`infra/images/`](infra/images/).

## License

Private — All rights reserved.

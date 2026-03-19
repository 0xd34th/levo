# Levo

Send stablecoins to any X handle on Sui — no wallet address needed. Recipients claim funds when ready.

## How it works

1. **Send** — Enter an `@handle` and amount. Levo derives a deterministic vault address from the X user ID and sends funds there on-chain. The sender's Privy embedded wallet signs the transaction server-side with gas sponsorship.
2. **Claim** — The recipient signs in with X via Privy. A local Nautilus signer produces an Ed25519 attestation binding the X user ID to the recipient's Sui address. The on-chain contract verifies this attestation, claims the vault, sweeps coins, and withdraws to the recipient.
3. **Dashboard** — Both senders and recipients can view payment history and track transaction status.

## Architecture

```
apps/web              Next.js 16 frontend + API routes
apps/nautilus-signer  Attestation signer (Node.js HTTP service)
packages/contracts    Sui Move smart contracts (XVault + NautilusVerifier)
```

### Smart contracts (`packages/contracts`)

- **XVaultRegistry** — Global registry, admin controls, pause toggle
- **XVault** — Per-user vault with deterministic address derivation (`derived_object`)
- **NautilusVerifier** — Ed25519 attestation verification with registered enclave public keys
- Key operations: `derive_vault_address`, `claim_vault`, `sweep_coin_to_vault`, `withdraw`, `withdraw_all`
- Claim requires a valid Ed25519 attestation signature from a registered enclave key

### Nautilus signer (`apps/nautilus-signer`)

Standalone Node.js service that signs claim attestations. Produces BCS-compatible Ed25519 signatures that the on-chain `nautilus_verifier::verify_attestation` accepts.

- `POST /attestation` — Accepts `{ x_user_id, sui_address }`, returns `{ signature, nonce, expires_at }`
- Requires `Authorization: Bearer <shared-secret>` header
- Designed to later move behind AWS Nitro Enclaves without changing the web app API

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
- **Signer**: Node.js, @noble/curves (Ed25519), zod
- **Contracts**: Sui Move (2024.beta edition)
- **Testing**: Vitest (web + signer), Move unit tests (contracts)

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- Sui CLI (for contract deployment)

## Setup

```bash
# Install dependencies
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
| `APP_ORIGIN` | `http://localhost:3000` |
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` |
| `NEXT_PUBLIC_PACKAGE_ID` | From `deployed.testnet.json` |
| `NEXT_PUBLIC_VAULT_REGISTRY_ID` | From `deployed.testnet.json` |
| `NEXT_PUBLIC_TREASURY_CAP_ID` | From `deployed.testnet.json` |
| `GAS_STATION_SECRET_KEY` | `openssl rand -base64 32` (fund the derived address with SUI) |
| `ENCLAVE_REGISTRY_ID` | From `deployed.testnet.json` |
| `NAUTILUS_ENCLAVE_URL` | `http://127.0.0.1:8787` |
| `NAUTILUS_SIGNER_SECRET` | Shared secret with signer — `openssl rand -hex 32` |

### 2. Configure `apps/nautilus-signer/.env`

```bash
cp apps/nautilus-signer/.env.example apps/nautilus-signer/.env
```

| Variable | Description |
|----------|-------------|
| `HOST` | `127.0.0.1` |
| `PORT` | `8787` |
| `ENCLAVE_REGISTRY_ID` | Same value as web app |
| `NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY` | `0x77ea384188b9f8a8f2886fa676d64ca11e2730a6af4e2c181f187b2dc815a704` |
| `NAUTILUS_SIGNER_SECRET` | Must match web app's `NAUTILUS_SIGNER_SECRET` |
| `NAUTILUS_SIGNER_SEED_BASE64` | Ed25519 seed matching the registered on-chain public key (stored outside repo) |

### 3. Database and services

```bash
# Database
cd apps/web && npx prisma migrate deploy && npx prisma generate

# Terminal 1 — signer
cd apps/nautilus-signer && node --env-file=.env --import=tsx src/server.ts

# Terminal 2 — web
pnpm --filter web dev
```

Object IDs for testnet are in `packages/contracts/deployed.testnet.json`. The signer seed (`NAUTILUS_SIGNER_SEED_BASE64`) is stored outside the repo — ask the team for it if you need to reproduce the claim flow.

## Testing

```bash
pnpm --filter web exec vitest run              # Web app tests
pnpm --filter nautilus-signer exec vitest run   # Signer tests
cd packages/contracts && sui move test          # Move contract tests
```

## Design decisions

### Why Privy instead of zkLogin

zkLogin ties a Sui address to a specific OAuth provider nonce and epoch — if the user's JWT expires or Sui epochs rotate, the derived address changes and funds become inaccessible. This is a critical risk for a product where funds sit in vaults for an indefinite period before the recipient claims them.

Privy gives us a persistent, server-managed embedded wallet per user. The wallet address is stable across sessions and doesn't depend on OAuth token lifecycle. It also lets us do server-side transaction signing (for gas sponsorship and atomic claim flows) without requiring the user to install a browser extension or understand gas. The UX is "sign in with X, funds appear" — no wallet friction at all.

We can always add zkLogin as an optional advanced path later, but for the MVP the embedded wallet approach eliminates the largest class of "lost funds" edge cases.

### Why a local signer instead of AWS Nitro Enclaves

The attestation signer is built as a standalone Node.js service (`apps/nautilus-signer`) with the same API contract that a Nitro Enclave would expose. The external interface is identical: `POST /attestation` with a bearer secret, returning a signed BCS payload that the on-chain `nautilus_verifier` accepts.

Moving to Nitro is a deployment change, not a code change — swap the Node process for an enclave image, rotate the signing key, and register the new public key on-chain. The web app doesn't change at all.

For testnet, standing up a Nitro enclave adds operational complexity (EC2 instance, enclave build pipeline, PCR attestation) with zero user-facing benefit. The local signer lets us iterate on the claim flow, contract integration, and UX without being blocked on AWS infrastructure. We'll provision Nitro when we move to mainnet and need the trust guarantee for real funds.

## Testnet proof

End-to-end flow verified on Sui testnet — screenshots at [`infra/images/`](infra/images/):

| Screenshot | Description |
|------------|-------------|
| `sent.png` | 0.1 SUI sent to `@moore_expo`, confirmed on-chain transfer to the deterministic vault |
| `claim.png` | Recipient signed in with X, embedded wallet provisioned, funds claimed in one transaction |
| `proof.png` | SuiVision explorer confirming 0.1 SUI in the recipient's embedded wallet |

## License

Private — All rights reserved.

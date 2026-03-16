# Levo

Send stablecoins to any X handle on Sui — no wallet address needed. Recipients claim funds when ready.

## How it works

1. **Send** — Enter an `@handle` and amount. Levo derives a deterministic vault address from the X user ID via Nautilus attestation and sends funds there on-chain.
2. **Claim** — The recipient signs in with X, connects a Sui wallet, and claims the vault. Only the verified handle owner can claim.
3. **Withdraw** — Once claimed, the vault owner can withdraw funds to their wallet at any time.

## Architecture

```
apps/web          Next.js 16 frontend + API routes
packages/contracts Sui Move smart contracts (XVault)
```

### Smart contracts (`packages/contracts`)

- **XVaultRegistry** — Global registry, admin controls, pause toggle
- **XVault** — Per-user vault with deterministic address derivation
- Key operations: `derive_vault_address`, `claim_vault`, `sweep_coin_to_vault`, `withdraw`
- Claim requires Nautilus enclave attestation signature

### Web app (`apps/web`)

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Send | `/send` | Send funds to an X handle |
| Claim | `/claim` | Three-step claim flow |
| Lookup | `/lookup` | Check vault status for any handle |
| Dashboard | `/dashboard` | Sent/received payment history |
| History | `/history` | Transaction history |

Key API routes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/resolve/x-username` | POST | Resolve X handle → vault address |
| `/api/v1/lookup/x-username` | GET | Public vault status lookup |
| `/api/v1/payments/quote` | POST | Generate payment quote |
| `/api/v1/payments/confirm` | POST | Confirm payment after tx |

### Tech stack

- **Frontend**: React 19, Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui
- **Sui SDK**: @mysten/sui, @mysten/dapp-kit-react
- **Backend**: Next.js API routes, Prisma (PostgreSQL), Redis (rate limiting)
- **Contracts**: Sui Move (2024.beta edition)
- **Testing**: Vitest (web), Move unit tests (contracts)

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- Sui CLI (for contract deployment)

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/web/.env.example apps/web/.env
# Fill in:
#   DATABASE_URL          — PostgreSQL connection string
#   REDIS_URL             — Redis connection string
#   TWITTER_API_KEY       — from twitterapi.io (for X handle resolution)
#   HMAC_SECRET           — openssl rand -hex 32
#   NEXT_PUBLIC_SUI_NETWORK
#   NEXT_PUBLIC_PACKAGE_ID
#   NEXT_PUBLIC_VAULT_REGISTRY_ID
#   NEXT_PUBLIC_TREASURY_CAP_ID

# Set up database
cd apps/web
npx prisma migrate deploy
npx prisma generate

# Run dev server
pnpm dev
```

## Testnet deployment

Contracts are deployed on Sui testnet. See `packages/contracts/deployed.testnet.json` for object IDs.

## Testing

```bash
# Web app unit tests
cd apps/web && pnpm test

# Move contract tests
cd packages/contracts && sui move test
```

## License

Private — All rights reserved.

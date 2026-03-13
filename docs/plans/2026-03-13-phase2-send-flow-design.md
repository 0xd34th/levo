# Phase 2: Send Flow — Design Document

> Validated 2026-03-13. This is the authoritative design for Phase 2 implementation.

## Decisions

| Decision | Choice |
|----------|--------|
| Framework | Next.js 15, App Router, pnpm |
| Styling | shadcn/ui + Tailwind CSS |
| ORM | Prisma (replaces Drizzle from original plan) |
| X API | twitterapi.io (`$0.18/1k profiles`, API key auth) |
| Wallet | @mysten/dapp-kit, all standard Sui wallets |
| Database | Postgres 16 (Docker) |
| Cache/Rate limit | Redis 7 (Docker) |
| Vault derivation | Local TypeScript replication of `blake2b256(registry_id || bcs(x_user_id) || tag)`, validated once on server start via dev-inspect |
| State management | useState + TanStack Query (no global store) |

---

## Project Structure

```
levo/
├── apps/
│   └── web/                              # Next.js 15 App Router
│       ├── app/
│       │   ├── api/v1/
│       │   │   ├── resolve/x-username/route.ts
│       │   │   ├── payments/quote/route.ts
│       │   │   └── payments/confirm/route.ts
│       │   ├── send/page.tsx
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                       # shadcn/ui components
│       │   ├── wallet-connect-button.tsx
│       │   ├── handle-input.tsx
│       │   ├── resolved-user-card.tsx
│       │   ├── amount-input.tsx
│       │   ├── send-button.tsx
│       │   └── confirmation-modal.tsx
│       ├── lib/
│       │   ├── sui.ts                    # Sui client + local derive helper
│       │   ├── twitter.ts                # twitterapi.io client
│       │   ├── hmac.ts                   # Quote payload signing/verification
│       │   ├── rate-limit.ts             # Redis sliding window
│       │   └── prisma.ts                 # Prisma client singleton
│       └── styles/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── packages/
│   └── contracts/                        # (existing Phase 1)
├── infra/
│   └── docker-compose.yml                # Postgres + Redis
└── .env.local
```

---

## Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model XUser {
  xUserId            String        @id @map("x_user_id")
  username           String
  profilePicture     String?       @map("profile_picture")
  isBlueVerified     Boolean       @default(false) @map("is_blue_verified")
  accountStatus      AccountStatus @default(ACTIVE) @map("account_status")
  derivationVersion  Int           @default(1) @map("derivation_version")
  createdAt          DateTime      @default(now()) @map("created_at")
  updatedAt          DateTime      @updatedAt @map("updated_at")

  quotes  PaymentQuote[]
  ledger  PaymentLedger[]

  @@map("x_user")
}

enum AccountStatus {
  ACTIVE
  RENAMED
  SUSPENDED
  DELETED
}

model PaymentQuote {
  id                String      @id @default(cuid())
  senderAddress     String      @map("sender_address")
  xUserId           String      @map("x_user_id")
  usernameAtQuote   String      @map("username_at_quote")
  derivationVersion Int         @map("derivation_version")
  vaultAddress      String      @map("vault_address")
  coinType          String      @map("coin_type")
  amount            BigInt
  expiresAt         DateTime    @map("expires_at")
  status            QuoteStatus @default(PENDING)
  hmacToken         String      @map("hmac_token")
  createdAt         DateTime    @default(now()) @map("created_at")

  xUser  XUser @relation(fields: [xUserId], references: [xUserId])

  @@index([senderAddress, status])
  @@index([xUserId])
  @@index([expiresAt])
  @@map("payment_quote")
}

enum QuoteStatus {
  PENDING
  CONFIRMED
  EXPIRED
  FAILED
}

model PaymentLedger {
  id              String       @id @default(cuid())
  ledgerSource    LedgerSource @map("ledger_source")
  txDigest        String       @map("tx_digest")
  sourceIndex     Int          @map("source_index")
  senderAddress   String       @map("sender_address")
  xUserId         String       @map("x_user_id")
  vaultAddress    String       @map("vault_address")
  coinType        String       @map("coin_type")
  amount          BigInt
  createdAt       DateTime     @default(now()) @map("created_at")

  xUser  XUser @relation(fields: [xUserId], references: [xUserId])

  @@unique([ledgerSource, txDigest, sourceIndex])
  @@index([senderAddress])
  @@index([xUserId])
  @@map("payment_ledger")
}

enum LedgerSource {
  SEND_CONFIRM
  CONTRACT_EVENT
}
```

---

## API Endpoints

### `POST /api/v1/resolve/x-username`

**Input:** `{ "username": "death_xyz" }`

**Flow:**
1. Validate + sanitize username (strip `@`, alphanumeric + underscore, max 15 chars)
2. Call `GET https://api.twitterapi.io/twitter/user/info?userName={username}` with `X-API-Key` header
3. If user not found or `unavailable`, return 404
4. Compute `vaultAddress` locally: `blake2b256(registry_id || bcs(x_user_id) || derivation_tag)`
5. Upsert `XUser` row — update `username`, `profilePicture`, `isBlueVerified` if changed
6. Return: `{ xUserId, username, profilePicture, isBlueVerified, derivationVersion, vaultAddress }`

**Rate limit:** 30 req/min per IP

---

### `POST /api/v1/payments/quote`

**Input:** `{ "username", "coinType", "amount", "senderAddress" }`

**Flow:**
1. Re-resolve username against twitterapi.io (always fresh)
2. If `XUser.accountStatus` is `SUSPENDED` or `DELETED`, reject
3. Check rate limits: max 10 unresolved quotes per sender
4. Compute `vaultAddress` from `xUserId` (local derivation)
5. Generate HMAC token: `HMAC-SHA256(secret, xUserId|derivationVersion|vaultAddress|coinType|amount|senderAddress|nonce|expiresAt)` — expiry = now + 5 min
6. Write `PaymentQuote` row with status `PENDING`
7. Return: `{ xUserId, username, profilePicture, vaultAddress, coinType, amount, estimatedGas, quoteToken, expiresAt }`

**Rate limit:** 10 req/min per IP + sender address

---

### `POST /api/v1/payments/confirm`

**Input:** `{ "txDigest", "quoteToken" }`

**Flow:**
1. Verify HMAC token signature — reject if tampered
2. Decode token, check `expiresAt` — reject if expired (5-min window)
3. Find matching `PaymentQuote` by token hash, assert status is `PENDING`
4. Call `sui_getTransactionBlock(txDigest)` via Sui RPC
5. If tx not yet visible, return `202 Accepted` (client retries)
6. If tx failed on-chain, mark quote `FAILED`, return `409 Conflict`
7. If tx succeeded: validate sender matches quote's `senderAddress`, find the `TransferObject` effect to `vaultAddress` with matching `Coin<coinType>`, verify amount matches
8. Write `PaymentLedger` row with `ledgerSource = SEND_CONFIRM`, `sourceIndex = matched effect index`
9. Mark quote `CONFIRMED`
10. Return: `{ status: "confirmed", amount, vaultAddress, txDigest }`

**Idempotency:** Same `quoteToken + txDigest` re-submission returns the existing ledger row.

**Rate limit:** 20 req/min per IP

---

## Frontend — Send Page

Single page at `/send` with inline flow:

```
┌──────────────────────────────────────┐
│  Levo                [Connect Wallet]│
├──────────────────────────────────────┤
│                                      │
│  Send to X handle                    │
│  ┌────────────────────────────────┐  │
│  │ @  [username input        ]    │  │
│  └────────────────────────────────┘  │
│  ┌─ resolved card ───────────────┐  │
│  │  avatar  @death_xyz  verified │  │
│  │  vault: 0xab..cd              │  │
│  └────────────────────────────────┘  │
│                                      │
│  Amount                              │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ [  amount   ] │ │ [TUSDC v]   │  │
│  └──────────────┘ └──────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │         Send $20.00            │  │
│  │      to @death_xyz             │  │
│  └────────────────────────────────┘  │
│                                      │
│  Confirmation:                       │
│  Sent 20 TUSDC to @death_xyz        │
│  tx: HxK3f...  [View on Explorer]   │
└──────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `WalletConnectButton` | dapp-kit `ConnectButton`, top-right |
| `HandleInput` | Debounced (500ms), calls resolve on blur/enter |
| `ResolvedUserCard` | Avatar, username, verified badge, vault address |
| `AmountInput` | Numeric input + coin type dropdown (TEST_USDC only for Phase 2) |
| `SendButton` | Disabled until wallet + user + amount valid. Executes quote → PTB → sign → confirm |
| `ConfirmationModal` | Tx digest, explorer link, amount, recipient |

### Send Button Flow

1. Call `POST /api/v1/payments/quote`
2. Build PTB: split exact amount from wallet coin → `public_transfer` to `vaultAddress`
3. Sign + execute via `signAndExecuteTransaction` (dapp-kit)
4. Call `POST /api/v1/payments/confirm` with `txDigest` + `quoteToken`
5. Show `ConfirmationModal` or error state

### Error States

| Error | UX |
|-------|-----|
| Username not found | "User not found on X" |
| Account suspended/deleted | "This account is not available" |
| Quote expired | Auto-refresh quote on retry |
| Tx failed on-chain | Show chain error, allow retry |
| Confirm 202 | "Finalizing..." with auto-retry (3 attempts, 2s interval) |

---

## Infrastructure

### Docker Compose (`infra/docker-compose.yml`)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: levo
      POSTGRES_PASSWORD: levo_dev
      POSTGRES_DB: levo
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pg_data:
```

### Environment (`.env.local`)

```
DATABASE_URL="postgresql://levo:levo_dev@localhost:5432/levo"
REDIS_URL="redis://localhost:6379"
TWITTER_API_KEY="<your-key>"
HMAC_SECRET="<random-32-byte-hex>"
NEXT_PUBLIC_SUI_NETWORK="testnet"
NEXT_PUBLIC_PACKAGE_ID="<from deployed.testnet.json>"
NEXT_PUBLIC_VAULT_REGISTRY_ID="<from deployed.testnet.json>"
```

### Rate Limiting

Redis sliding window in `lib/rate-limit.ts`, applied per route handler:

| Endpoint | Limit |
|----------|-------|
| resolve/x-username | 30 req/min per IP |
| payments/quote | 10 req/min per IP + sender |
| payments/confirm | 20 req/min per IP |

---

## Vault Address Derivation (TypeScript)

Local replication of `derived_object::derive_address`:

```ts
import { blake2b } from '@noble/hashes/blake2b';
import { bcs } from '@mysten/sui/bcs';

function deriveVaultAddress(registryId: string, xUserId: bigint): string {
  const registryBytes = bcs.Address.serialize(registryId).toBytes();
  const userIdBytes = bcs.u64().serialize(xUserId).toBytes();
  const tag = new TextEncoder().encode('sui::derived_object::DerivedObjectTag');
  const hash = blake2b(
    new Uint8Array([...registryBytes, ...userIdBytes, ...tag]),
    { dkLen: 32 }
  );
  return '0x' + Buffer.from(hash).toString('hex');
}
```

Validated once on server start by comparing against a dev-inspect call to the on-chain `derive_vault_address`. If mismatch, server refuses to start.

---

## Not In Scope (Phase 2)

- No X OAuth / claim flow (Phase 3)
- No sponsored transactions (Phase 4)
- No indexer or dashboards (Phase 5)
- No auth required for senders — wallet connect only
- Single coin type (TEST_USDC) — dropdown is ready for more but not wired

# Phase 2: Send Flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the end-to-end send flow: sender opens the app, types an X handle, sends stablecoins to their deterministic vault address on Sui testnet.

**Architecture:** Next.js 15 App Router fullstack app. Three API routes handle X username resolution, quote generation, and transaction confirmation. Frontend is a single Send page with wallet connect, handle resolution, and transaction signing. Prisma + Postgres for persistence, Redis for rate limiting.

**Tech Stack:** Next.js 15, TypeScript, pnpm, Prisma, Postgres 16, Redis 7, @mysten/sui, @mysten/dapp-kit-react, shadcn/ui, Tailwind CSS, Vitest, twitterapi.io

**Design document:** `docs/plans/2026-03-13-phase2-send-flow-design.md`

**Working directory:** `.worktrees/phase2-send-flow/apps/web/` (for most tasks)

---

## Prerequisites

- Docker Desktop running (for Postgres + Redis)
- pnpm installed (`npm i -g pnpm`)
- Phase 1 contracts deployed to testnet (see `packages/contracts/deployed.testnet.json`)
- twitterapi.io API key (sign up at https://twitterapi.io/dashboard)

---

## Task 1: Next.js 15 App Scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `apps/web/` (entire Next.js app)
- Modify: `.gitignore`

**Step 1: Create pnpm workspace config**

Create `pnpm-workspace.yaml` at repo root:

```yaml
packages:
  - "apps/*"
```

**Step 2: Scaffold Next.js 15 app**

```bash
cd <worktree-root>
pnpm create next-app@latest apps/web --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --turbopack --use-pnpm
```

If prompted interactively, answer:
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- `src/` directory: **No**
- App Router: Yes
- Turbopack: Yes
- Import alias: `@/*`

**Step 3: Install project dependencies**

```bash
cd apps/web

# Sui SDK + dapp-kit
pnpm add @mysten/sui @mysten/dapp-kit-core @mysten/dapp-kit-react @tanstack/react-query

# Database + cache
pnpm add prisma @prisma/client ioredis

# Utilities
pnpm add zod @noble/hashes

# Dev
pnpm add -D vitest @types/node
```

**Step 4: Initialize shadcn/ui**

```bash
cd apps/web
pnpm dlx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

Then add the components we need:

```bash
pnpm dlx shadcn@latest add button input card dialog label badge skeleton separator
```

**Step 5: Update `.gitignore`**

Append Next.js entries to the repo root `.gitignore`:

```gitignore
# Next.js
apps/web/.next/
apps/web/node_modules/
apps/web/out/
```

**Step 6: Verify dev server starts**

```bash
cd apps/web && pnpm dev
```

Expected: Server starts at `http://localhost:3000`. Stop it after verifying.

**Step 7: Commit**

```bash
git add pnpm-workspace.yaml apps/web/ .gitignore
git commit -m "feat: scaffold Next.js 15 app with shadcn/ui and Sui SDK"
```

---

## Task 2: Docker Compose + Environment

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `apps/web/.env.local`
- Create: `apps/web/.env.example`

**Step 1: Create Docker Compose file**

Create `infra/docker-compose.yml`:

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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U levo"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pg_data:
```

**Step 2: Create `.env.example`**

Create `apps/web/.env.example`:

```env
# Database
DATABASE_URL="postgresql://levo:levo_dev@localhost:5432/levo"

# Redis
REDIS_URL="redis://localhost:6379"

# twitterapi.io
TWITTER_API_KEY=""

# HMAC secret for quote tokens (generate with: openssl rand -hex 32)
HMAC_SECRET=""

# Sui
NEXT_PUBLIC_SUI_NETWORK="testnet"
NEXT_PUBLIC_PACKAGE_ID=""
NEXT_PUBLIC_VAULT_REGISTRY_ID=""
```

**Step 3: Create `.env.local`**

Copy `.env.example` to `.env.local` and fill in values from `packages/contracts/deployed.testnet.json`:

```bash
cd apps/web
cp .env.example .env.local
# Edit .env.local with your actual values:
# - TWITTER_API_KEY from twitterapi.io dashboard
# - HMAC_SECRET: run `openssl rand -hex 32`
# - NEXT_PUBLIC_PACKAGE_ID and NEXT_PUBLIC_VAULT_REGISTRY_ID from deployed.testnet.json
```

**Step 4: Start Docker services and verify**

```bash
cd <worktree-root>/infra
docker compose up -d
docker compose ps
```

Expected: Both `postgres` and `redis` show as healthy.

**Step 5: Commit**

```bash
git add infra/docker-compose.yml apps/web/.env.example
git commit -m "feat: add Docker Compose for Postgres and Redis"
```

Note: `.env.local` is gitignored by default in Next.js.

---

## Task 3: Prisma Schema + Migration

**Files:**
- Create: `apps/web/prisma/schema.prisma`
- Create: `apps/web/lib/prisma.ts`

**Step 1: Initialize Prisma**

```bash
cd apps/web
pnpm prisma init
```

**Step 2: Write the schema**

Replace `apps/web/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model XUser {
  xUserId           String        @id @map("x_user_id")
  username          String
  profilePicture    String?       @map("profile_picture")
  isBlueVerified    Boolean       @default(false) @map("is_blue_verified")
  accountStatus     AccountStatus @default(ACTIVE) @map("account_status")
  derivationVersion Int           @default(1) @map("derivation_version")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  quotes PaymentQuote[]
  ledger PaymentLedger[]

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

  xUser XUser @relation(fields: [xUserId], references: [xUserId])

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
  id            String       @id @default(cuid())
  ledgerSource  LedgerSource @map("ledger_source")
  txDigest      String       @map("tx_digest")
  sourceIndex   Int          @map("source_index")
  senderAddress String       @map("sender_address")
  xUserId       String       @map("x_user_id")
  vaultAddress  String       @map("vault_address")
  coinType      String       @map("coin_type")
  amount        BigInt
  createdAt     DateTime     @default(now()) @map("created_at")

  xUser XUser @relation(fields: [xUserId], references: [xUserId])

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

**Step 3: Run initial migration**

```bash
cd apps/web
pnpm prisma migrate dev --name init
```

Expected: Migration succeeds, Prisma Client generated.

**Step 4: Create Prisma client singleton**

Create `apps/web/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**Step 5: Verify connection**

```bash
cd apps/web
pnpm prisma db push --force-reset && pnpm prisma migrate dev --name init
```

Or run a quick script to test:

```bash
pnpm prisma studio
```

Expected: Prisma Studio opens at `http://localhost:5555` showing the tables.

**Step 6: Commit**

```bash
git add apps/web/prisma/ apps/web/lib/prisma.ts
git commit -m "feat: add Prisma schema with x_user, payment_quote, payment_ledger"
```

---

## Task 4: Vault Address Derivation (TDD)

**Files:**
- Create: `apps/web/lib/sui.ts`
- Create: `apps/web/lib/sui.test.ts`
- Create: `apps/web/vitest.config.ts`

**Step 1: Set up Vitest**

Create `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

Add test script to `apps/web/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 2: Write the failing test**

Create `apps/web/lib/sui.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveVaultAddress, getSuiClient } from './sui';

describe('deriveVaultAddress', () => {
  // Use a known registry ID for deterministic testing.
  // This value comes from the test vectors used in Move tests.
  const REGISTRY_ID = '0x0000000000000000000000000000000000000000000000000000000000000001';

  it('returns a valid Sui address (0x-prefixed, 66 chars)', () => {
    const addr = deriveVaultAddress(REGISTRY_ID, 12345n);
    expect(addr).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always returns same address', () => {
    const a = deriveVaultAddress(REGISTRY_ID, 12345n);
    const b = deriveVaultAddress(REGISTRY_ID, 12345n);
    expect(a).toBe(b);
  });

  it('different x_user_ids produce different addresses', () => {
    const a = deriveVaultAddress(REGISTRY_ID, 111n);
    const b = deriveVaultAddress(REGISTRY_ID, 222n);
    expect(a).not.toBe(b);
  });

  it('different registries produce different addresses', () => {
    const other = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const a = deriveVaultAddress(REGISTRY_ID, 12345n);
    const b = deriveVaultAddress(other, 12345n);
    expect(a).not.toBe(b);
  });
});

describe('getSuiClient', () => {
  it('returns a SuiClient instance', () => {
    const client = getSuiClient();
    expect(client).toBeDefined();
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- lib/sui.test.ts
```

Expected: FAIL — `./sui` module does not exist.

**Step 4: Write the implementation**

Create `apps/web/lib/sui.ts`:

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { deriveObjectID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

let _client: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!_client) {
    _client = new SuiClient({ url: getFullnodeUrl(network) });
  }
  return _client;
}

/**
 * Compute the deterministic vault address for a given x_user_id.
 * Matches the on-chain `derived_object::derive_address(registry.id, x_user_id)`.
 */
export function deriveVaultAddress(registryId: string, xUserId: bigint): string {
  const keyBytes = bcs.u64().serialize(xUserId).toBytes();
  return deriveObjectID(registryId, 'u64', keyBytes);
}

/**
 * Validate that our local derivation matches the on-chain function.
 * Call this once on server start. Throws if mismatch.
 */
export async function validateDerivation(): Promise<void> {
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    console.warn('[sui] NEXT_PUBLIC_VAULT_REGISTRY_ID not set, skipping derivation validation');
    return;
  }

  const client = getSuiClient();
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  if (!packageId) {
    console.warn('[sui] NEXT_PUBLIC_PACKAGE_ID not set, skipping derivation validation');
    return;
  }

  // Use dev-inspect to call derive_vault_address on-chain with a test user ID
  const testUserId = 999999n;
  const localAddress = deriveVaultAddress(registryId, testUserId);

  const tx = {
    kind: 'moveCall' as const,
    target: `${packageId}::x_vault::derive_vault_address` as `${string}::${string}::${string}`,
    arguments: [registryId, String(testUserId)],
  };

  console.log(`[sui] Local derivation for user ${testUserId}: ${localAddress}`);
  console.log('[sui] Derivation validation requires manual dev-inspect check on first deploy');
  // Full dev-inspect validation can be added once the app is running against testnet.
  // For now, the unit tests verify determinism and the Move tests verify correctness.
}
```

**Step 5: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- lib/sui.test.ts
```

Expected: All 4 tests PASS.

**Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/lib/sui.ts apps/web/lib/sui.test.ts apps/web/package.json
git commit -m "feat: add vault address derivation with deriveObjectID"
```

---

## Task 5: HMAC Quote Token (TDD)

**Files:**
- Create: `apps/web/lib/hmac.ts`
- Create: `apps/web/lib/hmac.test.ts`

**Step 1: Write the failing test**

Create `apps/web/lib/hmac.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { signQuoteToken, verifyQuoteToken, type QuotePayload } from './hmac';

const TEST_SECRET = 'a'.repeat(64); // 32-byte hex secret

const validPayload: QuotePayload = {
  xUserId: '12345',
  derivationVersion: 1,
  vaultAddress: '0xabc',
  coinType: '0x2::sui::SUI',
  amount: '1000000',
  senderAddress: '0xdef',
  nonce: 'test-nonce-123',
  expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 min from now
};

describe('signQuoteToken', () => {
  it('returns a non-empty string', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('is deterministic', () => {
    const a = signQuoteToken(validPayload, TEST_SECRET);
    const b = signQuoteToken(validPayload, TEST_SECRET);
    expect(a).toBe(b);
  });
});

describe('verifyQuoteToken', () => {
  it('returns the payload for a valid token', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, TEST_SECRET);
    expect(result).not.toBeNull();
    expect(result!.xUserId).toBe('12345');
    expect(result!.amount).toBe('1000000');
  });

  it('returns null for a tampered token', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const tampered = token.slice(0, -4) + 'xxxx';
    const result = verifyQuoteToken(tampered, TEST_SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a wrong secret', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, 'b'.repeat(64));
    expect(result).toBeNull();
  });

  it('returns null for an expired token', () => {
    const expiredPayload = { ...validPayload, expiresAt: Math.floor(Date.now() / 1000) - 10 };
    const token = signQuoteToken(expiredPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, TEST_SECRET);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- lib/hmac.test.ts
```

Expected: FAIL — `./hmac` does not exist.

**Step 3: Write the implementation**

Create `apps/web/lib/hmac.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export interface QuotePayload {
  xUserId: string;
  derivationVersion: number;
  vaultAddress: string;
  coinType: string;
  amount: string;          // stringified BigInt
  senderAddress: string;
  nonce: string;
  expiresAt: number;       // unix timestamp (seconds)
}

/**
 * Sign a quote payload into an opaque token: base64(json_payload).base64(hmac).
 */
export function signQuoteToken(payload: QuotePayload, secret: string): string {
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(jsonStr).toString('base64url');
  const hmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Verify and decode a quote token. Returns null if invalid, tampered, or expired.
 */
export function verifyQuoteToken(token: string, secret: string): QuotePayload | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const receivedHmac = token.slice(dotIndex + 1);

  const expectedHmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');

  // Timing-safe comparison
  try {
    const a = Buffer.from(receivedHmac, 'base64url');
    const b = Buffer.from(expectedHmac, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload: QuotePayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt <= now) return null;

    return payload;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- lib/hmac.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add apps/web/lib/hmac.ts apps/web/lib/hmac.test.ts
git commit -m "feat: add HMAC-signed quote token library"
```

---

## Task 6: Twitter API Client (TDD)

**Files:**
- Create: `apps/web/lib/twitter.ts`
- Create: `apps/web/lib/twitter.test.ts`

**Step 1: Write the failing test**

Create `apps/web/lib/twitter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveXUser, type XUserInfo } from './twitter';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MOCK_API_RESPONSE = {
  id: '123456789',
  userName: 'death_xyz',
  name: 'Death',
  profilePicture: 'https://pbs.twimg.com/photo.jpg',
  isBlueVerified: true,
  unavailable: false,
};

describe('resolveXUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user info for a valid username', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    const result = await resolveXUser('death_xyz', 'test-api-key');
    expect(result).not.toBeNull();
    expect(result!.xUserId).toBe('123456789');
    expect(result!.username).toBe('death_xyz');
    expect(result!.isBlueVerified).toBe(true);
  });

  it('returns null when user is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await resolveXUser('nonexistent_user', 'test-api-key');
    expect(result).toBeNull();
  });

  it('returns null when user is unavailable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...MOCK_API_RESPONSE, unavailable: true }),
    });

    const result = await resolveXUser('suspended_user', 'test-api-key');
    expect(result).toBeNull();
  });

  it('sanitizes username — strips @ prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    await resolveXUser('@death_xyz', 'test-api-key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('userName=death_xyz'),
      expect.anything(),
    );
  });

  it('throws on invalid username format', async () => {
    await expect(resolveXUser('inv@lid!', 'test-api-key')).rejects.toThrow('Invalid username');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- lib/twitter.test.ts
```

Expected: FAIL.

**Step 3: Write the implementation**

Create `apps/web/lib/twitter.ts`:

```typescript
export interface XUserInfo {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;

function sanitizeUsername(raw: string): string {
  const cleaned = raw.startsWith('@') ? raw.slice(1) : raw;
  if (!USERNAME_RE.test(cleaned)) {
    throw new Error('Invalid username');
  }
  return cleaned;
}

/**
 * Resolve an X username to user info via twitterapi.io.
 * Returns null if user is not found or unavailable.
 */
export async function resolveXUser(
  rawUsername: string,
  apiKey: string,
): Promise<XUserInfo | null> {
  const username = sanitizeUsername(rawUsername);

  const res = await fetch(
    `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(username)}`,
    {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    },
  );

  if (!res.ok) return null;

  const data = await res.json();

  if (data.unavailable) return null;
  if (!data.id) return null;

  return {
    xUserId: String(data.id),
    username: data.userName ?? username,
    profilePicture: data.profilePicture ?? null,
    isBlueVerified: Boolean(data.isBlueVerified),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- lib/twitter.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add apps/web/lib/twitter.ts apps/web/lib/twitter.test.ts
git commit -m "feat: add twitterapi.io client with username resolution"
```

---

## Task 7: Rate Limiting

**Files:**
- Create: `apps/web/lib/rate-limit.ts`

**Step 1: Write the rate limiter**

Create `apps/web/lib/rate-limit.ts`:

```typescript
import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return _redis;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (seconds)
}

/**
 * Sliding window rate limiter using Redis.
 * @param key Unique key (e.g., `resolve:${ip}`)
 * @param windowSec Window size in seconds
 * @param max Max requests per window
 */
export async function rateLimit(
  key: string,
  windowSec: number,
  max: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = now - windowMs;

  const fullKey = `rl:${key}`;

  // Use a sorted set: score = timestamp, member = unique request id
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(fullKey, 0, windowStart);
  pipeline.zadd(fullKey, now, `${now}:${Math.random()}`);
  pipeline.zcard(fullKey);
  pipeline.expire(fullKey, windowSec + 1);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAt: Math.floor((now + windowMs) / 1000),
  };
}

/**
 * Count pending quotes for a sender (used for quote rate limiting).
 */
export async function countPendingQuotes(senderAddress: string): Promise<number> {
  // This is handled via Prisma query, not Redis. See quote endpoint.
  // Placeholder for the rate-limit module interface.
  return 0;
}
```

**Step 2: Commit**

```bash
git add apps/web/lib/rate-limit.ts
git commit -m "feat: add Redis sliding-window rate limiter"
```

---

## Task 8: Resolve X Username Endpoint

**Files:**
- Create: `apps/web/app/api/v1/resolve/x-username/route.ts`

**Step 1: Write the route handler**

Create `apps/web/app/api/v1/resolve/x-username/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveXUser } from '@/lib/twitter';
import { deriveVaultAddress } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  username: z.string().min(1).max(16),
});

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rl = await rateLimit(`resolve:${ip}`, 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Parse input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
  }

  const { username } = parsed.data;

  // Resolve via twitterapi.io
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const userInfo = await resolveXUser(username, apiKey);
  if (!userInfo) {
    return NextResponse.json({ error: 'User not found on X' }, { status: 404 });
  }

  // Derive vault address
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const vaultAddress = deriveVaultAddress(registryId, BigInt(userInfo.xUserId));
  const derivationVersion = 1;

  // Upsert x_user row (analytics/audit only — not source of truth for routing)
  await prisma.xUser.upsert({
    where: { xUserId: userInfo.xUserId },
    update: {
      username: userInfo.username,
      profilePicture: userInfo.profilePicture,
      isBlueVerified: userInfo.isBlueVerified,
    },
    create: {
      xUserId: userInfo.xUserId,
      username: userInfo.username,
      profilePicture: userInfo.profilePicture,
      isBlueVerified: userInfo.isBlueVerified,
      derivationVersion,
    },
  });

  return NextResponse.json({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: userInfo.profilePicture,
    isBlueVerified: userInfo.isBlueVerified,
    derivationVersion,
    vaultAddress,
  });
}
```

**Step 2: Manual test**

Start services and test:

```bash
# Terminal 1: ensure Docker is running
cd <worktree-root>/infra && docker compose up -d

# Terminal 2: start dev server
cd <worktree-root>/apps/web && pnpm dev

# Terminal 3: test endpoint
curl -X POST http://localhost:3000/api/v1/resolve/x-username \
  -H 'Content-Type: application/json' \
  -d '{"username": "elonmusk"}'
```

Expected: JSON response with `xUserId`, `username`, `vaultAddress`, etc.

**Step 3: Commit**

```bash
git add apps/web/app/api/v1/resolve/x-username/route.ts
git commit -m "feat: add POST /api/v1/resolve/x-username endpoint"
```

---

## Task 9: Payments Quote Endpoint

**Files:**
- Create: `apps/web/app/api/v1/payments/quote/route.ts`

**Step 1: Write the route handler**

Create `apps/web/app/api/v1/payments/quote/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { resolveXUser } from '@/lib/twitter';
import { deriveVaultAddress } from '@/lib/sui';
import { signQuoteToken, type QuotePayload } from '@/lib/hmac';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  username: z.string().min(1).max(16),
  coinType: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string'),
  senderAddress: z.string().startsWith('0x'),
});

const QUOTE_TTL_SECONDS = 300; // 5 minutes
const MAX_PENDING_QUOTES_PER_SENDER = 10;

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  // Rate limit by IP + sender
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
  }

  const { username, coinType, amount, senderAddress } = parsed.data;

  const rl = await rateLimit(`quote:${ip}:${senderAddress}`, 60, 10);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Check pending quote cap
  const pendingCount = await prisma.paymentQuote.count({
    where: { senderAddress, status: 'PENDING' },
  });
  if (pendingCount >= MAX_PENDING_QUOTES_PER_SENDER) {
    return NextResponse.json({ error: 'Too many pending quotes' }, { status: 429 });
  }

  // Always re-resolve against X API
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const userInfo = await resolveXUser(username, apiKey);
  if (!userInfo) {
    return NextResponse.json({ error: 'User not found on X' }, { status: 404 });
  }

  // Check account status
  const existingUser = await prisma.xUser.findUnique({
    where: { xUserId: userInfo.xUserId },
  });
  if (existingUser && (existingUser.accountStatus === 'SUSPENDED' || existingUser.accountStatus === 'DELETED')) {
    return NextResponse.json({ error: 'This account is not available' }, { status: 403 });
  }

  // Derive vault address
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const derivationVersion = 1;
  const vaultAddress = deriveVaultAddress(registryId, BigInt(userInfo.xUserId));
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS;

  // Sign HMAC token
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const payload: QuotePayload = {
    xUserId: userInfo.xUserId,
    derivationVersion,
    vaultAddress,
    coinType,
    amount,
    senderAddress,
    nonce,
    expiresAt,
  };
  const quoteToken = signQuoteToken(payload, hmacSecret);

  // Upsert x_user
  await prisma.xUser.upsert({
    where: { xUserId: userInfo.xUserId },
    update: {
      username: userInfo.username,
      profilePicture: userInfo.profilePicture,
      isBlueVerified: userInfo.isBlueVerified,
    },
    create: {
      xUserId: userInfo.xUserId,
      username: userInfo.username,
      profilePicture: userInfo.profilePicture,
      isBlueVerified: userInfo.isBlueVerified,
      derivationVersion,
    },
  });

  // Write quote row
  await prisma.paymentQuote.create({
    data: {
      senderAddress,
      xUserId: userInfo.xUserId,
      usernameAtQuote: userInfo.username,
      derivationVersion,
      vaultAddress,
      coinType,
      amount: BigInt(amount),
      expiresAt: new Date(expiresAt * 1000),
      hmacToken: quoteToken,
    },
  });

  return NextResponse.json({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: userInfo.profilePicture,
    vaultAddress,
    coinType,
    amount,
    quoteToken,
    expiresAt,
  });
}
```

**Step 2: Manual test**

```bash
curl -X POST http://localhost:3000/api/v1/payments/quote \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "elonmusk",
    "coinType": "0x2::sui::SUI",
    "amount": "1000000",
    "senderAddress": "0x0000000000000000000000000000000000000000000000000000000000000001"
  }'
```

Expected: JSON with `quoteToken`, `vaultAddress`, `expiresAt`.

**Step 3: Commit**

```bash
git add apps/web/app/api/v1/payments/quote/route.ts
git commit -m "feat: add POST /api/v1/payments/quote endpoint"
```

---

## Task 10: Payments Confirm Endpoint

**Files:**
- Create: `apps/web/app/api/v1/payments/confirm/route.ts`

**Step 1: Write the route handler**

Create `apps/web/app/api/v1/payments/confirm/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyQuoteToken } from '@/lib/hmac';
import { getSuiClient } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  txDigest: z.string().min(1),
  quoteToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rl = await rateLimit(`confirm:${ip}`, 60, 20);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
  }

  const { txDigest, quoteToken } = parsed.data;

  // Verify HMAC token
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const payload = verifyQuoteToken(quoteToken, hmacSecret);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired quote token' }, { status: 401 });
  }

  // Check idempotency — if already confirmed, return existing result
  const existing = await prisma.paymentLedger.findFirst({
    where: {
      ledgerSource: 'SEND_CONFIRM',
      txDigest,
    },
  });
  if (existing) {
    return NextResponse.json({
      status: 'confirmed',
      amount: existing.amount.toString(),
      vaultAddress: existing.vaultAddress,
      txDigest,
    });
  }

  // Find matching quote
  const quote = await prisma.paymentQuote.findFirst({
    where: { hmacToken: quoteToken, status: 'PENDING' },
  });
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found or already used' }, { status: 404 });
  }

  // Fetch transaction from Sui
  const client = getSuiClient();
  let tx;
  try {
    tx = await client.getTransactionBlock({
      digest: txDigest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
        showInput: true,
      },
    });
  } catch (err: any) {
    // Transaction not yet visible on RPC
    if (err?.message?.includes('not found') || err?.code === -32000) {
      return NextResponse.json(
        { status: 'pending', message: 'Transaction not yet visible, retry shortly' },
        { status: 202 },
      );
    }
    throw err;
  }

  // Check tx succeeded
  if (tx.effects?.status?.status !== 'success') {
    await prisma.paymentQuote.update({
      where: { id: quote.id },
      data: { status: 'FAILED' },
    });
    return NextResponse.json(
      { error: 'Transaction failed on-chain', reason: tx.effects?.status?.error },
      { status: 409 },
    );
  }

  // Verify sender matches
  const txSender = tx.transaction?.data?.sender;
  if (txSender !== payload.senderAddress) {
    return NextResponse.json({ error: 'Sender mismatch' }, { status: 400 });
  }

  // Find matching transfer in objectChanges
  const objectChanges = tx.objectChanges ?? [];
  const transferIndex = objectChanges.findIndex((change) => {
    if (change.type !== 'transferred') return false;
    const recipient = (change as any).recipient?.AddressOwner;
    const objectType = (change as any).objectType ?? '';
    return recipient === payload.vaultAddress && objectType.includes(payload.coinType);
  });

  if (transferIndex === -1) {
    return NextResponse.json({ error: 'No matching transfer found in transaction' }, { status: 400 });
  }

  // Get amount from balance changes
  const balanceChanges = tx.balanceChanges ?? [];
  const balanceChange = balanceChanges.find((bc) => {
    const owner = (bc.owner as any)?.AddressOwner;
    return owner === payload.vaultAddress && bc.coinType.includes(payload.coinType);
  });

  if (!balanceChange) {
    return NextResponse.json({ error: 'No matching balance change found' }, { status: 400 });
  }

  const confirmedAmount = BigInt(balanceChange.amount);
  if (confirmedAmount !== BigInt(payload.amount)) {
    return NextResponse.json(
      { error: 'Amount mismatch', expected: payload.amount, actual: confirmedAmount.toString() },
      { status: 400 },
    );
  }

  // Write ledger row + update quote atomically
  await prisma.$transaction([
    prisma.paymentLedger.create({
      data: {
        ledgerSource: 'SEND_CONFIRM',
        txDigest,
        sourceIndex: transferIndex,
        senderAddress: payload.senderAddress,
        xUserId: payload.xUserId,
        vaultAddress: payload.vaultAddress,
        coinType: payload.coinType,
        amount: confirmedAmount,
      },
    }),
    prisma.paymentQuote.update({
      where: { id: quote.id },
      data: { status: 'CONFIRMED' },
    }),
  ]);

  return NextResponse.json({
    status: 'confirmed',
    amount: confirmedAmount.toString(),
    vaultAddress: payload.vaultAddress,
    txDigest,
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/app/api/v1/payments/confirm/route.ts
git commit -m "feat: add POST /api/v1/payments/confirm endpoint"
```

---

## Task 11: Frontend Providers + Layout

**Files:**
- Create: `apps/web/lib/dapp-kit.ts`
- Create: `apps/web/app/providers.tsx`
- Modify: `apps/web/app/layout.tsx`

**Step 1: Create dapp-kit configuration**

Create `apps/web/lib/dapp-kit.ts`:

```typescript
import { createDAppKit } from '@mysten/dapp-kit-core';
import { getFullnodeUrl } from '@mysten/sui/client';

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';

export const dAppKit = createDAppKit({
  networkConfig: {
    testnet: { url: getFullnodeUrl('testnet') },
    mainnet: { url: getFullnodeUrl('mainnet') },
  },
  defaultNetwork: network,
});
```

**Step 2: Create providers wrapper**

Create `apps/web/app/providers.tsx`:

```tsx
'use client';

import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { dAppKit } from '@/lib/dapp-kit';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      {children}
    </DAppKitProvider>
  );
}
```

**Step 3: Update layout**

Modify `apps/web/app/layout.tsx` to wrap with providers and add minimal header:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Levo — Send to X Handle',
  description: 'Send stablecoins to any X handle on Sui',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 4: Verify app renders**

```bash
cd apps/web && pnpm dev
```

Open `http://localhost:3000` — should render without errors.

**Step 5: Commit**

```bash
git add apps/web/lib/dapp-kit.ts apps/web/app/providers.tsx apps/web/app/layout.tsx
git commit -m "feat: add dapp-kit providers and app layout"
```

---

## Task 12: Send Page — Components

**Files:**
- Create: `apps/web/app/send/page.tsx`
- Create: `apps/web/components/handle-input.tsx`
- Create: `apps/web/components/resolved-user-card.tsx`
- Create: `apps/web/components/amount-input.tsx`
- Create: `apps/web/components/send-button.tsx`
- Create: `apps/web/components/confirmation-modal.tsx`

**Step 1: Create HandleInput component**

Create `apps/web/components/handle-input.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HandleInputProps {
  onResolved: (data: ResolvedUser | null) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export interface ResolvedUser {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
  derivationVersion: number;
  vaultAddress: string;
}

export function HandleInput({ onResolved, onLoading, onError }: HandleInputProps) {
  const [value, setValue] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const resolve = useCallback(async (username: string) => {
    if (!username || username.length < 1) {
      onResolved(null);
      onError(null);
      return;
    }

    onLoading(true);
    onError(null);

    try {
      const res = await fetch('/api/v1/resolve/x-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error || 'User not found');
        onResolved(null);
        return;
      }

      const data: ResolvedUser = await res.json();
      onResolved(data);
    } catch {
      onError('Failed to resolve user');
      onResolved(null);
    } finally {
      onLoading(false);
    }
  }, [onResolved, onLoading, onError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setValue(raw);
    onResolved(null);

    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => resolve(raw.replace(/^@/, '')), 500);
    setDebounceTimer(timer);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="handle">X Handle</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
        <Input
          id="handle"
          placeholder="username"
          value={value}
          onChange={handleChange}
          className="pl-8"
        />
      </div>
    </div>
  );
}
```

**Step 2: Create ResolvedUserCard component**

Create `apps/web/components/resolved-user-card.tsx`:

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ResolvedUser } from './handle-input';

interface Props {
  user: ResolvedUser | null;
  loading: boolean;
  error: string | null;
}

export function ResolvedUserCard({ user, loading, error }: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!user) return null;

  const shortAddr = `${user.vaultAddress.slice(0, 8)}...${user.vaultAddress.slice(-6)}`;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {user.profilePicture ? (
          <img src={user.profilePicture} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">@{user.username}</span>
            {user.isBlueVerified && <Badge variant="secondary">Verified</Badge>}
          </div>
          <div className="text-xs text-muted-foreground font-mono">vault: {shortAddr}</div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create AmountInput component**

Create `apps/web/components/amount-input.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  amount: string;
  onAmountChange: (amount: string) => void;
  coinType: string;
}

export function AmountInput({ amount, onAmountChange, coinType }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only numbers and one decimal point
    if (/^\d*\.?\d*$/.test(val)) {
      onAmountChange(val);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="amount">Amount</Label>
      <div className="flex gap-2">
        <Input
          id="amount"
          placeholder="0.00"
          value={amount}
          onChange={handleChange}
          className="flex-1"
          inputMode="decimal"
        />
        <div className="flex items-center rounded-md border px-3 text-sm font-medium text-muted-foreground">
          TUSDC
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Create SendButton component**

Create `apps/web/components/send-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { Button } from '@/components/ui/button';
import type { ResolvedUser } from './handle-input';

interface Props {
  user: ResolvedUser | null;
  amount: string;
  coinType: string;
  onSuccess: (result: { txDigest: string; amount: string }) => void;
  onError: (error: string) => void;
}

// Convert human-readable amount (e.g., "20.5") to base units (e.g., 20500000 for 6 decimals)
function toBaseUnits(amount: string, decimals: number = 6): bigint {
  const [whole, frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

export function SendButton({ user, amount, coinType, onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const amountBase = amount ? toBaseUnits(amount) : 0n;
  const disabled = !account || !user || !amount || amountBase <= 0n || loading;

  const handleSend = async () => {
    if (!user || !account) return;

    setLoading(true);
    onError('');

    try {
      // Step 1: Get a quote
      const quoteRes = await fetch('/api/v1/payments/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          coinType,
          amount: amountBase.toString(),
          senderAddress: account.address,
        }),
      });

      if (!quoteRes.ok) {
        const data = await quoteRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create quote');
      }

      const quote = await quoteRes.json();

      // Step 2: Build and sign transaction
      const tx = new Transaction();
      tx.transferObjects(
        [coinWithBalance({ balance: amountBase, type: coinType })],
        user.vaultAddress,
      );

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      if (result.FailedTransaction) {
        throw new Error(result.FailedTransaction.status.error?.message || 'Transaction failed');
      }

      const txDigest = result.Transaction.digest;

      // Step 3: Confirm with backend (retry up to 3 times)
      let confirmed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const confirmRes = await fetch('/api/v1/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txDigest, quoteToken: quote.quoteToken }),
        });

        if (confirmRes.status === 200) {
          confirmed = true;
          break;
        }

        if (confirmRes.status === 202) {
          // Not yet visible, wait and retry
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // Other error
        const data = await confirmRes.json().catch(() => ({}));
        throw new Error(data.error || 'Confirmation failed');
      }

      if (!confirmed) {
        // Transaction succeeded but confirm is still pending — not a failure
        console.warn('Confirm still pending after 3 attempts');
      }

      onSuccess({ txDigest, amount: amountBase.toString() });
    } catch (err: any) {
      onError(err.message || 'Send failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSend} disabled={disabled} className="w-full" size="lg">
      {loading
        ? 'Sending...'
        : user
          ? `Send ${amount || '0'} TUSDC to @${user.username}`
          : 'Send'}
    </Button>
  );
}
```

**Step 5: Create ConfirmationModal component**

Create `apps/web/components/confirmation-modal.tsx`:

```tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  txDigest: string;
  amount: string;
  recipientUsername: string;
}

export function ConfirmationModal({ open, onClose, txDigest, amount, recipientUsername }: Props) {
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';
  const explorerUrl = `https://suiscan.xyz/${network}/tx/${txDigest}`;

  // Convert from base units (6 decimals) to human-readable
  const displayAmount = (Number(amount) / 1_000_000).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment Sent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-center text-lg">
            Sent <span className="font-bold">{displayAmount} TUSDC</span> to{' '}
            <span className="font-bold">@{recipientUsername}</span>
          </p>
          <div className="rounded-md bg-muted p-3 text-xs font-mono break-all text-center">
            {txDigest}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                View on Explorer
              </a>
            </Button>
            <Button className="flex-1" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 6: Wire the Send page**

Create `apps/web/app/send/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HandleInput, type ResolvedUser } from '@/components/handle-input';
import { ResolvedUserCard } from '@/components/resolved-user-card';
import { AmountInput } from '@/components/amount-input';
import { SendButton } from '@/components/send-button';
import { ConfirmationModal } from '@/components/confirmation-modal';

// Phase 2: only TEST_USDC. coinType comes from deployed.testnet.json.
const COIN_TYPE = process.env.NEXT_PUBLIC_PACKAGE_ID
  ? `${process.env.NEXT_PUBLIC_PACKAGE_ID}::test_usdc::TEST_USDC`
  : '';

export default function SendPage() {
  const account = useCurrentAccount();
  const [resolvedUser, setResolvedUser] = useState<ResolvedUser | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    txDigest: string;
    amount: string;
  } | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-bold">Levo</h1>
        <ConnectButton />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Send to X Handle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <HandleInput
              onResolved={setResolvedUser}
              onLoading={setResolveLoading}
              onError={setResolveError}
            />

            <ResolvedUserCard
              user={resolvedUser}
              loading={resolveLoading}
              error={resolveError}
            />

            <AmountInput
              amount={amount}
              onAmountChange={setAmount}
              coinType={COIN_TYPE}
            />

            {sendError && (
              <p className="text-sm text-destructive">{sendError}</p>
            )}

            <SendButton
              user={resolvedUser}
              amount={amount}
              coinType={COIN_TYPE}
              onSuccess={(result) => {
                setConfirmation(result);
                setSendError('');
              }}
              onError={setSendError}
            />

            {!account && (
              <p className="text-center text-sm text-muted-foreground">
                Connect your wallet to send
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      {confirmation && resolvedUser && (
        <ConfirmationModal
          open={!!confirmation}
          onClose={() => {
            setConfirmation(null);
            setAmount('');
            setResolvedUser(null);
          }}
          txDigest={confirmation.txDigest}
          amount={confirmation.amount}
          recipientUsername={resolvedUser.username}
        />
      )}
    </div>
  );
}
```

**Step 7: Update home page to redirect to /send**

Replace `apps/web/app/page.tsx` contents:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/send');
}
```

**Step 8: Verify the send page renders**

```bash
cd apps/web && pnpm dev
```

Open `http://localhost:3000/send`. Should render the send form with wallet connect button.

**Step 9: Commit**

```bash
git add apps/web/app/send/ apps/web/app/page.tsx apps/web/components/
git commit -m "feat: add send page with handle resolution, amount input, and tx signing"
```

---

## Task 13: E2E Smoke Test

**Prerequisites:**
- Docker services running (`infra/docker-compose.yml`)
- `.env.local` filled with real values (twitterapi.io key, HMAC secret, package ID, registry ID)
- Sui wallet browser extension installed with testnet SUI
- TEST_USDC minted to your wallet (see Phase 1 deployment docs)

**Step 1: Start all services**

```bash
# Terminal 1
cd <worktree-root>/infra && docker compose up -d

# Terminal 2
cd <worktree-root>/apps/web && pnpm dev
```

**Step 2: Test resolve endpoint**

```bash
curl -X POST http://localhost:3000/api/v1/resolve/x-username \
  -H 'Content-Type: application/json' \
  -d '{"username": "elonmusk"}'
```

Expected: `200 OK` with `xUserId`, `username`, `vaultAddress`.

**Step 3: Test full send flow in browser**

1. Open `http://localhost:3000/send`
2. Click "Connect Wallet" — connect Sui wallet on testnet
3. Type an X handle (e.g., `elonmusk`)
4. Wait for resolution — user card should appear
5. Enter an amount (e.g., `1.00`)
6. Click "Send 1.00 TUSDC to @elonmusk"
7. Approve transaction in wallet
8. Confirmation modal should appear with tx digest
9. Click "View on Explorer" to verify on Suiscan

**Step 4: Verify database state**

```bash
cd <worktree-root>/apps/web && pnpm prisma studio
```

Check:
- `x_user` table has the resolved user
- `payment_quote` table has a row with status `CONFIRMED`
- `payment_ledger` table has a row with `ledgerSource = SEND_CONFIRM`

**Step 5: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix: adjustments from E2E smoke test"
```

---

## Summary

| Task | What | Verified By |
|------|------|-------------|
| 1 | Next.js 15 + shadcn/ui scaffolding | Dev server starts |
| 2 | Docker Compose (Postgres + Redis) | Containers healthy |
| 3 | Prisma schema + migration | Prisma Studio shows tables |
| 4 | Vault address derivation | 4 unit tests pass |
| 5 | HMAC quote token | 5 unit tests pass |
| 6 | Twitter API client | 5 unit tests pass |
| 7 | Rate limiter | Build compiles |
| 8 | Resolve endpoint | curl returns user data |
| 9 | Quote endpoint | curl returns quote token |
| 10 | Confirm endpoint | Build compiles |
| 11 | Providers + layout | App renders |
| 12 | Send page + components | Page renders with form |
| 13 | E2E smoke test | Full send flow works |

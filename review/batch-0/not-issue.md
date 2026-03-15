# Not-Issue Findings — Batch 0

> Last updated: 2026-03-15

### [N-001] `formatAmount` breaks on negative input or zero-decimal coin types

**File**: `apps/web/lib/coins.ts:41-47`
**Severity**: Medium
**Description**: If `baseUnits` is negative (e.g. `"-100"`), `padStart` pads incorrectly producing garbage. If `getCoinDecimals` ever returned 0, `str.slice(0, -0)` returns `""` in JS. Currently safe since amounts are always positive BigInt and decimals are always > 0, but fragile.
**Suggested Fix**: Add a defensive assertion or guard:
```typescript
if (decimals === 0) return baseUnits;
```
**Reason**: Not reachable in the current codebase. Payment quotes reject non-positive amounts before persistence, confirmed ledger rows are written only after the on-chain amount matches that positive quote amount, and `getCoinDecimals()` only returns `9` or `6` for the currently supported coins.

---

### [N-002] No backfill script for `confirmed_tx_digest` migration

**File**: `apps/web/prisma/migrations/20260314195600_add_payment_quote_confirmed_tx_digest/migration.sql`
**Severity**: Low
**Description**: The migration adds a nullable `confirmed_tx_digest` column. The code handles NULLs via `hasMatchingLegacyConfirmedLedgerEntry`, but there's no backfill plan. After backfilling, the legacy fallback code can be removed.
**Suggested Fix**: Write a one-time backfill joining `payment_quote` with `payment_ledger` on matching fields, then remove the legacy code path.
**Reason**: 当前是开发环境，不需要为已有生产数据制定迁移或回填方案；现有代码也已经保留了对 `NULL` 旧数据路径的兼容逻辑，因此这不是当前环境下需要处理的缺陷。

---

### [N-003] Mint function has no on-chain access control — client-side `NETWORK` check is cosmetic only

**File**: `apps/web/app/send/page.tsx:50`, `apps/web/components/mint-button.tsx`
**Severity**: High
**Description**: The client-side render guard (`NETWORK !== 'mainnet'`) was fixed (F-001/F-014), but anyone can craft the mint transaction manually. If the Move package is deployed on mainnet, the `mint` function is callable by anyone. The client check is UX-only.
**Suggested Fix**: Ensure the Move contract's `mint` function uses `#[test_only]` or equivalent on-chain access controls.
**Reason**: Not an issue for the current codebase. The on-chain contract at `packages/contracts/sources/test_usdc.move` explicitly says it shares the `TreasuryCap` so anyone can mint on testnet, and the app only renders the mint UI off mainnet. This is intentional test-token behavior, not an accidental missing access-control check in the web app.

---

### [N-004] `loadMoreError` can display without a retry button

**File**: `apps/web/components/transaction-list.tsx:90-99`
**Severity**: Medium
**Description**: "Load More" button only shows when `nextCursor` is non-null, but `loadMoreError` renders independently. If a load-more fails and the cursor state is cleared, the error shows with no way to retry.
**Suggested Fix**: Gate `loadMoreError` display on `nextCursor` presence, or add a standalone retry for load-more errors.
**Reason**: False positive. The load-more failure path in `apps/web/app/history/page.tsx` sets `loadMoreError` but does not clear `nextCursor`, so the existing `Load More` button remains available as the retry action.

---

### [N-005] History page `useEffect` double-fires due to `fetchHistory` in dependency array

**File**: `apps/web/app/history/page.tsx:139-154`
**Severity**: Medium
**Description**: `fetchHistory` is recreated when `account?.address` changes (via `useCallback` dep), and the effect depends on both `account?.address` and `fetchHistory`. This can cause double invocations. AbortController mitigates races but the extra call is wasteful.
**Suggested Fix**: Remove `fetchHistory` from effect deps and call via a stable ref.
**Reason**: Not a real bug in the current code. `fetchHistory` only changes when `account?.address` or `dAppKit` changes, so the effect still reruns once per render change set; any duplicate invocation seen in development would come from React Strict Mode, not from the dependency array itself.

---

### [N-006] Legacy HMAC fallback cross-scope defense relies on fragile negative discriminator

**File**: `apps/web/lib/wallet-auth.ts:31`, `apps/web/lib/hmac.ts:17-30`
**Severity**: High
**Description**: Both `verifyQuoteToken` and `verifyWalletAuthChallenge` accept legacy unscoped HMACs during rollout. The cross-scope defense uses type guards (`isQuotePayload` / `isWalletAuthChallengePayload`). The wallet-auth guard's negative discriminator `!('xUserId' in payload)` is fragile — any future payload type lacking `xUserId` but matching the wallet-auth shape could bypass it. While the existing guards work for the current two token types (and cross-scope tests exist in both test files), the defense is not cryptographically enforced.
**Suggested Fix**: Add a positive `type` discriminator field to both payload types (e.g., `{ type: 'quote' }` / `{ type: 'wallet-auth' }`) and validate in each type guard. The legacy fallback window is finite (TODO 2026-Q2), but this hardens cross-scope isolation.
**Reason**: Not a current defect. The only two legacy-compatible payload shapes in the codebase are still disjoint (`quote` requires `xUserId`, `wallet-auth` rejects payloads containing it), the HMAC covers the raw payload bytes so attackers cannot reshape a token without the secret, and both cross-scope rejection tests already exist.

---

### [N-007] History page retry fetch has no AbortSignal

**File**: `apps/web/app/history/page.tsx:198`
**Severity**: Medium
**Description**: `onRetry={() => fetchHistory()}` does not pass an `AbortSignal`. If the user switches wallets while a retry is in flight, the response could briefly update state for the wrong address before `isStaleRequest()` catches it. The stale-request guard mitigates but the fetch itself is not cancelled.
**Suggested Fix**: Wire the retry through a controlled AbortSignal, or document that the stale-request guard is sufficient.
**Reason**: False positive for current behavior. `fetchHistory()` already guards both success and error paths with `isStaleRequest()`, so a retry started for an old address cannot update UI state for a new wallet; the missing abort is a cleanup/performance nit, not a correctness bug.

---

### [N-008] Index creation may lock table in production

**File**: `apps/web/prisma/migrations/20260314210000_add_payment_ledger_history_index/migration.sql`
**Severity**: Medium
**Description**: `CREATE INDEX` acquires a `ShareLock` on the table, blocking writes during index creation. For large `payment_ledger` tables, this could cause downtime. Prisma migrations don't natively support `CREATE INDEX CONCURRENTLY`.
**Suggested Fix**: For production deployment on a large table, run index creation manually with `CONCURRENTLY` outside of Prisma migrations.
**Reason**: Operational rollout note rather than a repository defect. Prisma migrations run transactionally and cannot use `CREATE INDEX CONCURRENTLY`; if this table ever becomes large in production, handling the rollout outside Prisma is a deployment decision, not a code fix for this batch.

---

### [N-009] Cursor pagination: JavaScript Date millisecond precision vs PostgreSQL microsecond precision

**File**: `apps/web/app/api/v1/payments/history/route.ts:53-71`
**Severity**: Low
**Description**: The cursor stores `createdAt` as an ISO string parsed via `new Date()` (millisecond precision). PostgreSQL `timestamp` has microsecond precision. If two records differ only at the microsecond level, the cursor equality check may not match. Mitigated by the `(createdAt, id)` compound ordering and Prisma's `@default(now())` likely producing millisecond-rounded values.
**Suggested Fix**: Acceptable as-is. If strict correctness needed, store as raw numeric preserving full precision.
**Reason**: Not applicable to the current schema. `payment_ledger.created_at` is created as `TIMESTAMP(3)` in the initial migration, so stored precision is already milliseconds and matches the cursor encoding precision.

---

### [N-010] `hasMatchingHmac` length check is non-constant-time

**File**: `apps/web/lib/scoped-hmac.ts:18`
**Severity**: Low
**Description**: The `received.length === expected.length` check before `timingSafeEqual` is not constant-time. An attacker could theoretically distinguish which HMAC format matches by timing. However, both candidates produce SHA-256 outputs (32 bytes), so their base64url encodings are always the same length. No practical vulnerability.
**Suggested Fix**: Add a comment explaining why this is safe (equal-length SHA-256 outputs).
**Reason**: Not a real vulnerability in the current code. Both candidate HMACs are SHA-256 digests, so the decoded buffers are always the same length and the pre-check does not reveal which candidate matched in practice.

---

### [N-011] Wallet auth challenge replayable for 5-minute TTL

**File**: `apps/web/lib/wallet-auth.ts`, `apps/web/app/api/v1/payments/history/route.ts:17`
**Severity**: Low
**Description**: The challenge token + signature pair is valid for 5 minutes across unlimited requests. Intentional for pagination UX. Cookie is `httpOnly` + `sameSite: strict`; signature is in header (not cookie), mitigating CSRF. If cookie leaks (XSS, browser extension), attacker can replay for 5 minutes. Acceptable for read-only history.
**Suggested Fix**: Document threat model explicitly. Consider adding wallet address to history rate limit key.
**Reason**: Intentional product tradeoff for read-only pagination. The token is bound to a wallet address, same-origin cookie, request path, and origin, and the endpoint only returns that wallet's own history; the 5-minute replay window is already the chosen UX model, not an accidental vulnerability.

---

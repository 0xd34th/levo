# Not-Issue Findings — Batch 0

> Last updated: 2026-03-16

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

### [N-012] `UsernameInput` useEffect dependency on `onResolvedChange` is fragile — refactoring can cause re-fetch storms

**File**: `apps/web/components/username-input.tsx:89`
**Severity**: Medium
**Description**: The resolution effect has `[onResolvedChange, value]` in its dependency array. Currently `onResolvedChange` is `setResolvedUser` (React state setter, referentially stable). But if any parent wraps it in a non-memoized inline callback, the effect fires on every render, causing unnecessary API calls and flickering. The effect also clears the resolved user at the start via `onResolvedChange(null)`, creating a brief null window on every re-render.
**Suggested Fix**: Store `onResolvedChange` in a ref to decouple it from the dependency array: `const onResolvedChangeRef = useRef(onResolvedChange); onResolvedChangeRef.current = onResolvedChange;`.
**Reason**: Not a current bug. The only live usage passes React state setter `setResolvedUser`, which is referentially stable, so the reported re-fetch storm is a future reuse hazard rather than a present regression.

---

### [N-013] Incoming payments endpoint calls Twitter API on every paginated request — wastes API quota

**File**: `apps/web/app/api/v1/payments/incoming/route.ts:49-71`
**Severity**: Medium
**Description**: Every call to `/api/v1/payments/incoming` — including "Load more" pagination — calls `resolveFreshXUser(username, apiKey)` which hits the external Twitter API. This is unnecessary on pagination because the user's identity was already verified on the first page load. With a rate limit of 60 req/min per IP, a user paging through many results will quickly exhaust the Twitter API budget and hit 429 errors just from paging.
**Suggested Fix**: Cache the resolved user info with a short TTL so subsequent paginated requests for the same username within the same session skip the Twitter API call. Alternatively, accept an `xUserId` parameter on pagination requests and look up the user from the database.
**Reason**: Already addressed in current code. `resolveFreshXUser()` reuses a fresh cached `x_user` row before calling the Twitter provider, so pagination does not hit the provider on every request; the remaining real problem was the separate write-on-read issue that was later fixed elsewhere in this batch.

---

### [N-014] `PaymentTable` date formatting can produce "Invalid Date" for malformed date strings

**File**: `apps/web/components/payment-table.tsx:106,180`
**Severity**: Low
**Description**: `dateFormatter.format(new Date(row.date))` renders "Invalid Date" if `row.date` is undefined/null or an unexpected format. The pattern appears in both mobile and desktop table views.
**Suggested Fix**: Add a safe date formatting helper that returns a fallback string when the date is invalid.
**Reason**: Not a current defect in these flows. The dashboard APIs currently serialize row dates with `toISOString()`, so the table is not receiving malformed or null date values from the live code paths covered by this batch.

---

### [N-015] `usesDollarAmountPrefix` returns true for any non-SUI token, including future non-dollar tokens

**File**: `apps/web/lib/send-form.ts:13-15`
**Severity**: Low
**Description**: `usesDollarAmountPrefix` returns `true` for any `coinType !== SUI_COIN_TYPE`. If a non-dollar-denominated token is added, it would incorrectly show a `$` prefix. Works for current SUI + TEST_USDC, but the function name implies a dollar-specific check while the implementation is a SUI-exclusion check.
**Suggested Fix**: Either rename to `isNonNativeCoin` or add an explicit check against known dollar-denominated coin types.
**Reason**: The current UI only exposes SUI and TEST_USDC, so the helper’s behavior still matches the supported asset set today. This is extension debt, not a present incorrect result.

---

### [N-016] Lookup and incoming payment endpoints expose vault address and balances to unauthenticated users

**File**: `apps/web/app/api/v1/lookup/x-username/route.ts:77`, `apps/web/app/api/v1/payments/incoming/route.ts:91`
**Severity**: Low
**Description**: The public endpoints return the deterministic vault address and exact balance details without authentication. An attacker can query any X handle to learn whether they have pending funds, the exact amount, and the vault address — enabling targeted social engineering. This is a product/design decision but worth flagging as a privacy consideration.
**Suggested Fix**: Consider whether full balance details should be public, or if a simpler "has pending funds: yes/no" would suffice for unauthenticated lookup.
**Reason**: Intentional product tradeoff. The lookup and received-dashboard surfaces are explicitly public pre-claim views in the current product, so exposing vault status and balances is by design rather than an accidental data leak.

---

### [N-017] `coin-selector.tsx` recomputes coin options on every render

**File**: `apps/web/components/coin-selector.tsx:14-35`
**Severity**: Low
**Description**: `getCoinOptions()` is called on every render, creating new arrays and objects each time. Since `NEXT_PUBLIC_PACKAGE_ID` is a build-time constant, the options never change.
**Suggested Fix**: Memoize with `useMemo` or compute once at module scope.
**Reason**: Not a meaningful current performance issue. `CoinSelector` only builds a tiny 1-2 item array per render, so this is a micro-optimization rather than a user-visible defect.

---

### [N-018] `getIncomingPaymentsPage` does not filter by payment status — may surface unconfirmed entries

**File**: `apps/web/lib/received-dashboard.ts:194-213`
**Severity**: Medium
**Description**: The query filters only by `xUserId` with no `status` condition. If the `paymentLedger` table can hold rows in non-confirmed states (pending, failed), they appear in the public received dashboard as confirmed payments (the client hard-codes `status: 'Confirmed'`). This is an unauthenticated public endpoint, so exposing incomplete payment entries to anyone querying a handle is a data integrity concern.
**Suggested Fix**: Add a status filter to the Prisma query (e.g., `where: { xUserId, status: 'CONFIRMED' }`), or verify that only confirmed entries exist in the ledger table.
**Reason**: False positive. `PaymentLedger` has no status field in `apps/web/prisma/schema.prisma`, and the table is only written from confirmed-ledger paths in `apps/web/app/api/v1/payments/confirm/route.ts`, so the received dashboard is already reading a confirmed-only ledger rather than omitting a real status filter.

---

### [N-019] Sent dashboard `PaymentTable` missing `key` prop — scroll state leaks across wallet switches

**File**: `apps/web/app/dashboard/sent/page.tsx:276`
**Severity**: Low
**Description**: The received dashboard uses `key={data.username}` on `PaymentTable` to reset scroll state when the handle changes, but the sent dashboard does not set a `key` prop. When a user disconnects one wallet and connects another, the virtualized scroll position from the previous wallet's data carries over, causing the table to render with an incorrect scroll offset for the new data.
**Suggested Fix**: Add `key={account?.address}` to the `PaymentTable` in `sent/page.tsx`.
**Reason**: Not a current issue. `apps/web/app/dashboard/sent/page.tsx` does not enable `PaymentTable` virtualization, so the component is not holding the virtual-scroll state that the received dashboard resets with a `key`.

---

### [N-020] Sent dashboard `signatureRef` not cleared on unmount — stale signature on re-navigation

**File**: `apps/web/app/dashboard/sent/page.tsx:52-54`
**Severity**: Low
**Description**: The `signatureRef` persists across Next.js soft navigations. If a user authenticates, navigates away, and returns after the 5-minute TTL expires, the stale signature is sent in the first request, triggering a 401 and the retry loop, which forces an unnecessary wallet signing prompt. The retry loop handles this gracefully, but the UX is suboptimal.
**Suggested Fix**: Clear `signatureRef.current = null` in the effect's cleanup function.
**Reason**: False positive. `signatureRef` is a component-local ref, so unmounting destroys it; on live wallet changes the page already resets `signatureRef.current` inside the address-scoped effect, which is the only persistence path that exists in the current component.

---

### [N-021] Received dashboard `handleLoadMore` shares abort controller with initial fetch

**File**: `apps/web/app/dashboard/received/page.tsx:112-113`
**Severity**: Medium
**Description**: `handleLoadMore` reuses the same abort-controller ref as `handleSubmit`, which was flagged as a risk if the user triggered load-more while a fresh initial lookup was still in flight.
**Suggested Fix**: Use separate `AbortController` refs for initial loads and load-more operations.
**Reason**: False positive in the current UI flow. `handleSubmit()` sets `loading` and clears `activeHandle` before the next paint, and `handleLoadMore()` is guarded by `!activeHandle || loading || loadingMore`, so the page does not expose a reachable state where a load-more action can cancel a live initial lookup.

---

### [N-022] `payment-table.tsx` renders external links without validating URL protocol

**File**: `apps/web/components/payment-table.tsx:168-176,230-237`
**Severity**: Medium
**Description**: The finding assumes `PaymentTable` receives arbitrary prebuilt transaction URLs from API data and would therefore open untrusted protocols.
**Suggested Fix**: Validate the rendered URL protocol before creating the external link.
**Reason**: Not a current defect. Every existing `PaymentTable` call site in `apps/web/app/lookup/page.tsx`, `apps/web/app/dashboard/received/page.tsx`, and `apps/web/app/dashboard/sent/page.tsx` derives `txUrl` locally from `explorerUrl()` / `getExplorerTransactionUrl()`, which already return `null` for invalid digests and otherwise construct controlled explorer URLs rather than trusting a server-supplied string.

---

### [N-023] `UsernameInput` internal resolved state not cleared on programmatic value reset

**File**: `apps/web/components/username-input.tsx:44-49`
**Severity**: Low
**Description**: The finding assumes a current caller resets only the controlled input value and leaves the parent-side resolved recipient untouched.
**Suggested Fix**: Clear the component’s resolved state and call `onResolvedChange(null)` when the normalized value becomes empty from outside the input’s `onChange` path.
**Reason**: Not a current bug. `UsernameInput` is only used by `apps/web/app/page.tsx`, and that page’s `resetFlow()` already clears both `username` and the parent `resolvedUser` state directly before the component rerenders; with an empty value the component also hides any stale internal resolution UI, so the active send flow does not retain an old recipient.

---

### [N-024] `formatAmount` silently accepts empty string input

**File**: `apps/web/lib/coins.ts:56-60`
**Severity**: Low
**Description**: The finding points out that `formatAmount('', coinType)` currently normalizes to `'0'`.
**Suggested Fix**: Reject empty or non-numeric input inside `formatAmount()`.
**Reason**: Not a current defect. All live callers pass canonical positive-integer base-unit strings sourced from validated form input, database rows, or on-chain balances; there is no present code path feeding an empty string into `formatAmount()`, and tightening the helper globally would expand the change surface well beyond this batch.

---

### [N-025] `pruneReceivedVaultSummaryCache` can over-evict valid entries

**File**: `apps/web/lib/received-dashboard.ts:91-97`
**Severity**: Low
**Description**: The finding claims the cache-size enforcement loop can evict valid entries even after expired entries have already been removed.
**Suggested Fix**: Skip or weaken the size-cap eviction when expiry pruning already ran.
**Reason**: False positive. The `while` loop only executes when `receivedVaultSummaryCache.size > RECEIVED_VAULT_SUMMARY_CACHE_MAX_ENTRIES` after expired entries have already been pruned, so any remaining evictions are the intended oldest-entry removals needed to enforce the configured hard cap rather than accidental over-eviction.

---

### [N-026] `AvatarImage` relies on caller-provided sizing with no enforcement

**File**: `apps/web/components/ui/avatar.tsx:20-28`
**Severity**: Low
**Description**: The finding suggests documenting that avatar callers must provide explicit sizing for the `fill` image to render correctly.
**Suggested Fix**: Add a comment warning future callers to size the avatar container explicitly.
**Reason**: Not a present bug. The `Avatar` wrapper already provides a default `size-10` container, and every current caller either uses that default or passes an explicit size class on the `Avatar` itself, so the component is not currently rendering broken images because of missing sizing.

---

### [N-027] Vault summary cache linear pruning on every write is O(n)

**File**: `apps/web/lib/received-dashboard.ts:84-98`
**Severity**: Low
**Description**: The finding flags the cache-pruning pass as an O(n) walk on every write.
**Suggested Fix**: Replace the cache with an LRU implementation or prune less often.
**Reason**: Not a current defect. The cache is explicitly bounded to 500 entries with a 30-second TTL, so the worst-case scan is capped and small enough for this path; this is a possible future optimization, not a correctness or present reliability bug.

---

### [N-028] `normalizeHandle` is unnecessary indirection over `normalizeUsernameInput`

**File**: `apps/web/lib/received-dashboard-client.ts:19-21`
**Severity**: Low
**Description**: `normalizeHandle()` is a trivial wrapper around `normalizeUsernameInput()`.
**Suggested Fix**: Replace call sites with direct `normalizeUsernameInput()` imports and remove the wrapper.
**Reason**: Not a current issue. `apps/web/lib/received-dashboard-client.ts` intentionally acts as the small shared client helper surface for the claim, lookup, and received-dashboard pages, and keeping `normalizeHandle()` there avoids spreading another direct import across those UI entry points without changing behavior.

---

### [N-029] Resolve route hardcodes `derivationVersion = 1` instead of reading from DB like read-path endpoints

**File**: `apps/web/app/api/v1/resolve/x-username/route.ts:73`
**Severity**: Low
**Description**: The resolve route hardcodes `const derivationVersion = 1` while the read-path endpoints (lookup, incoming payments) read `derivationVersion` from the database via `persistReceivedDashboardXUser()`. The reviewer flagged this as a potential fund-loss risk if the derivation version is ever bumped in the DB.
**Suggested Fix**: Read the derivation version from the `xUser` row after the upsert instead of hardcoding.
**Reason**: Not a current defect. `deriveVaultAddress(registryId, BigInt(xUserId))` does NOT take `derivationVersion` as a parameter — the address derivation is identical regardless of version. The field is metadata-only, used for cache keys and response payloads. The hardcoded `1` matches `DEFAULT_DERIVATION_VERSION` used by all read paths. This is extension debt for a hypothetical future derivation scheme change, not a present inconsistency that affects vault addresses or fund routing.

---

### [N-030] `fixed.md` renumbering removes old F-024 without explicit trail

**File**: `review/batch-0/fixed.md`
**Severity**: Low
**Description**: The old F-024 ("Editing the handle leaves the previous recipient live long enough to misdirect a send") was deleted from `fixed.md` rather than kept with a note explaining why it was superseded. The remaining findings were renumbered from F-025→F-024 through F-056→F-055. While the architectural change (server-side resolution) genuinely eliminates the old F-024's root cause, deleting it and renumbering makes it harder to trace audit history. Future references to "F-040" in commit messages or conversations now point to a different finding.
**Suggested Fix**: When superseding a finding via architecture change, keep the entry with a note like "**Superseded**: Root cause eliminated by moving recipient resolution server-side" rather than deleting and renumbering. Alternatively, add the superseded finding to a separate section.
**Reason**: This batch workflow intentionally renumbers finding IDs after each processing round, and the active `new-fix-batch` instructions explicitly require sequential renumbering in `review.md`, `fixed.md`, and `not-issue.md`. The current files still preserve the substantive recipient-routing history through later findings such as the reopened send-target regressions, so this is a process-preference concern rather than a concrete defect in the code under review.

---

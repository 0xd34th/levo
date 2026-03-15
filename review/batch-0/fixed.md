# Fixed Findings — Batch 0

> Last updated: 2026-03-15

### [F-001] MintButton has no mainnet guard

**File**: `apps/web/app/send/page.tsx:51`
**Severity**: Medium
**Description**: The `MintButton` renders whenever `TREASURY_CAP_ID` is set, regardless of network. If the env var is accidentally set in a mainnet deployment, test minting would be exposed to all users.
**Suggested Fix**: Add `NETWORK !== 'mainnet'` guard:
```tsx
{TREASURY_CAP_ID && NETWORK !== 'mainnet' && (
  <MintButton packageId={PACKAGE_ID} treasuryCapId={TREASURY_CAP_ID} />
)}
```
**Fixed in**: Added the `NETWORK !== 'mainnet'` render guard around `MintButton` in `apps/web/app/send/page.tsx`.

---

### [F-002] Missing composite index for paginated history query

**File**: `apps/web/prisma/schema.prisma` (PaymentLedger model)
**Severity**: Medium
**Description**: The history endpoint queries `WHERE senderAddress = ? ORDER BY createdAt DESC, id DESC` but only a single-column index on `senderAddress` exists. As transaction volume grows, Postgres must fetch all rows for a sender and sort in memory.
**Suggested Fix**: Add a composite index:
```prisma
@@index([senderAddress, createdAt(sort: Desc), id(sort: Desc)])
```
**Fixed in**: Added the descending composite index to `apps/web/prisma/schema.prisma` and created `apps/web/prisma/migrations/20260314210000_add_payment_ledger_history_index/migration.sql` to create it in Postgres.

---

### [F-003] Profile picture URL not validated server-side

**File**: `apps/web/app/api/v1/payments/history/route.ts:59`
**Severity**: Medium
**Description**: The API returns `row.xUser.profilePicture` directly. The client-side `TransactionRow` validates with `isTrustedProfilePictureUrl`, but other API consumers would receive raw URLs, potentially enabling XSS via malicious URLs stored in the database.
**Suggested Fix**: Apply the trusted-URL check server-side before returning:
```typescript
profilePicture: row.xUser.profilePicture && isTrustedProfilePictureUrl(row.xUser.profilePicture)
  ? row.xUser.profilePicture
  : null,
```
**Fixed in**: Added a shared trusted-profile-picture helper and now sanitize `profilePicture` in `apps/web/app/api/v1/payments/history/route.ts` before serializing the API response.

---

### [F-004] Load-more errors silently swallowed on history page

**File**: `apps/web/app/history/page.tsx:113-117`
**Severity**: Medium
**Description**: When `isLoadMore` is true and the fetch fails, the error is completely swallowed. The "Load More" button re-enables but the user gets no feedback that it failed.
**Suggested Fix**: Set a transient error state for load-more failures too, or show a brief toast.
**Fixed in**: Added a dedicated `loadMoreError` state in `apps/web/app/history/page.tsx` and rendered that feedback in `apps/web/components/transaction-list.tsx` without replacing the already loaded transaction list.

---

### [F-005] No cursor format validation in history endpoint

**File**: `apps/web/app/api/v1/payments/history/route.ts:11`
**Severity**: Low
**Description**: The cursor is `z.string().optional()` with no format validation. Malformed CUIDs would cause Prisma to throw (500 error) rather than a clean 400.
**Suggested Fix**: Add CUID validation: `cursor: z.string().cuid().optional()` or wrap the Prisma call in a try-catch.
**Fixed in**: Tightened `QuerySchema` in `apps/web/app/api/v1/payments/history/route.ts` to require `cursor` to be a valid CUID before Prisma runs.

---

### [F-006] Duplicate `TransactionItem` interface

**File**: `apps/web/app/history/page.tsx:17-27`, `apps/web/components/transaction-list.tsx:8-18`
**Severity**: Low
**Description**: The `TransactionItem` interface is defined identically in both files. Changes to the API response shape would require updating both.
**Suggested Fix**: Extract to a shared types file (e.g. `@/lib/types.ts`) and import from both.
**Fixed in**: Extracted shared history response types into `apps/web/lib/transaction-history.ts` and updated the history page and transaction list to import them from one source.

---

### [F-007] Initial history fetch failures leave the page stuck with no in-app recovery

**File**: `apps/web/app/history/page.tsx:106`
**Severity**: Medium
**Description**: Any failure during the initial history load sets `error`, but there is no retry path after that. `TransactionList` renders only the error text, and the page only refetches on wallet-address changes. A transient network error, rate-limit response, or a one-time signature rejection leaves the history page unusable until the user manually reloads or reconnects their wallet.
**Suggested Fix**: Expose a retry action from `TransactionList` for the initial error state, or automatically request a fresh challenge and retry once after a 401 before surfacing the error.
**Fixed in**: Added a retry action to the initial history error state in `apps/web/components/transaction-list.tsx` and wired it back to `fetchHistory()` from `apps/web/app/history/page.tsx`.

---

### [F-008] Load-more requests can permanently disable pagination after a wallet switch

**File**: `apps/web/app/history/page.tsx:39`
**Severity**: Medium
**Description**: `onLoadMore()` starts a request without an `AbortSignal`, sets `loadingMoreRef.current = true`, and only clears that flag in `finally` when `activeAddressRef.current === address`. If the user switches wallets while the request is in flight, the address check fails, the ref stays latched, and every later load-more call returns immediately on `if (loadingMoreRef.current) return`. The new account can no longer paginate until the page is reloaded.
**Suggested Fix**: Reset `loadingMoreRef` / `loadingMore` unconditionally for load-more requests in `finally`, or track load-more requests with an abort/sequence token so account changes cannot leave the flag stuck.
**Fixed in**: Added a `loadMoreRequestIdRef` sequence guard in `apps/web/app/history/page.tsx` and reset history UI state on account changes so stale load-more requests cannot leave pagination latched.

---

### [F-009] Stale wallet-signature results can poison history auth after an account switch

**File**: `apps/web/app/history/page.tsx:38`
**Severity**: Medium
**Description**: `fetchHistory()` wrote `signatureRef.current = signed.signature` immediately after `signPersonalMessage()` resolved, and only then checked whether the request was stale (`activeAddressRef.current !== address`). If the user switched wallets while the signature prompt for the previous address was still open, the old request could cache the previous wallet's signature after the new account had already reset state. The next history fetch or load-more call for the new wallet could then skip the challenge step, send the stale signature, and fail with a 401 until the user retried again. The same stale request could also surface an error on the new account because the catch path was not guarded against address changes.
**Suggested Fix**: Scope the auth flow to a request/account token and only commit `signatureRef` or set errors if the request is still current. At minimum, move the address/abort guard ahead of `signatureRef.current = signature`, and guard the catch path the same way before calling `setError` / `setLoadMoreError`.
**Fixed in**: Added a shared `isStaleRequest()` guard throughout `fetchHistory()` in `apps/web/app/history/page.tsx`, delayed caching `signatureRef` until after the post-sign stale check, and prevented stale requests from clearing signatures or surfacing errors on the active wallet.

---

### [F-010] New history page fails strict TypeScript checking

**File**: `apps/web/app/history/page.tsx:39`
**Severity**: Medium
**Description**: `loadMoreRequestId` was initialized as `number | null`, then assigned into `loadMoreRequestIdRef.current` inside the load-more branch. Under `strict` TypeScript, that branch did not narrow the ternary result back to `number`, so `pnpm --filter web exec tsc --noEmit` failed with `TS2322: Type 'number | null' is not assignable to type 'number'` on this file. Any CI or build step that type-checks the app would stop on the new history page.
**Suggested Fix**: Create the request id only inside the load-more branch so the assigned value is always a `number`, or explicitly narrow it before writing to `loadMoreRequestIdRef.current`.
**Fixed in**: Reworked the load-more request id flow in `apps/web/app/history/page.tsx` so `loadMoreRequestIdRef.current` only receives a `number`, and the strict TypeScript error on this file is gone.

---

### [F-011] Confirm retries now fail for already-finalized payments if the user regenerated the quote

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:122`
**Severity**: Medium
**Description**: The previous implementation short-circuited on an existing `payment_ledger` row for the submitted `txDigest`, so any retry for an already-recorded on-chain payment returned `status: "confirmed"` immediately. The new flow only short-circuited when the same `quoteToken` was already `CONFIRMED`. If the user regenerated an equivalent quote after sending the transaction, the retry path updated that second quote, hit the unique `payment_ledger` constraint on `txDigest`, rolled the transaction back, and returned `409 Transaction already confirmed` instead of the confirmed result.
**Suggested Fix**: Restore a `payment_ledger`-based idempotency path for matching `txDigest` values, but verify that the ledger row matches the current quote fields before returning success. At minimum, on `P2002`, load the existing ledger row and return the confirmed payload when it matches the submitted quote.
**Fixed in**: Added `findMatchingConfirmedLedgerEntry()` in `apps/web/app/api/v1/payments/confirm/route.ts` and now return the stored confirmed payload whenever the submitted `txDigest` already has a matching ledger row, both before the RPC work and after unique-constraint conflicts.

---

### [F-012] Wallet-auth rejects valid mixed-case Sui addresses that the API currently accepts

**File**: `apps/web/lib/api.ts:82`, `apps/web/app/api/v1/payments/history/route.ts:30`, `apps/web/app/api/v1/wallet-auth/challenge/route.ts:27`
**Severity**: Medium
**Description**: The new wallet-auth endpoints accepted mixed-case `0x[0-9a-fA-F]{64}` addresses, but `verifyWalletAuth()` passed that raw string into `verifyPersonalMessageSignature()`. In `@mysten/sui`, signature verification compares the supplied address to `publicKey.toSuiAddress()`, which is normalized lowercase. A valid signature for `0xABCD...` therefore failed with `Public key bytes do not match the provided address`, even though the challenge route and query validation accepted that address form.
**Suggested Fix**: Normalize the address once at ingress with `normalizeSuiAddress()` and use the canonical form consistently in the challenge payload, the history query, and `verifyPersonalMessageSignature()`. Alternatively, tighten validation to only accept canonical lowercase addresses.
**Fixed in**: Normalized Sui addresses with `normalizeSuiAddress()` before issuing wallet-auth challenges, before verifying the signed message in `apps/web/lib/api.ts`, and before querying history rows so mixed-case inputs are canonicalized consistently end-to-end.

---

### [F-013] Legacy wallet-auth tokens still pass quote verification

**File**: `apps/web/lib/hmac.ts:48`, `apps/web/app/api/v1/payments/confirm/route.ts:136`
**Severity**: Medium
**Description**: `verifyQuoteToken()` now accepts legacy unscoped HMACs but never validates that the decoded payload actually has quote fields like `amount`, `senderAddress`, and `vaultAddress`. A still-valid pre-rollout wallet-auth challenge token therefore verifies successfully as a quote token; the confirm route then reaches `findMatchingConfirmedLedgerEntry()` / `BigInt(quotePayload.amount)` with `amount === undefined` and throws a 500 instead of rejecting the token.
**Suggested Fix**: Validate the decoded quote payload shape before returning from `verifyQuoteToken()` and reject malformed legacy tokens, or drop legacy quote-token fallback once the rollout window has passed.
**Fixed in**: Added `isQuotePayload()` validation in `apps/web/lib/hmac.ts` so malformed legacy payloads are rejected before confirm logic runs, and added a regression test in `apps/web/lib/hmac.test.ts` covering wallet-auth-shaped legacy tokens.

---

### [F-014] Send page can render a mint button that is guaranteed to fail

**File**: `apps/web/app/send/page.tsx:50`
**Severity**: Low
**Description**: The new header renders `MintButton` whenever `TREASURY_CAP_ID` is present on a non-mainnet network, but it does not require `PACKAGE_ID`. In a partially configured environment, users still see the button even though clicking it builds the invalid target `::test_usdc::mint` and the wallet rejects the transaction immediately.
**Suggested Fix**: Gate the button on both env vars, e.g. `PACKAGE_ID && TREASURY_CAP_ID && NETWORK !== 'mainnet'`.
**Fixed in**: Tightened the render guard in `apps/web/app/send/page.tsx` so the mint UI only appears when both `PACKAGE_ID` and `TREASURY_CAP_ID` are configured off mainnet.

---

### [F-015] Ledger-based retry success can still leave regenerated quotes stuck in `PENDING`

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:415`
**Severity**: Low
**Description**: `syncPendingQuoteWithConfirmedLedger()` only runs in the early `matchingLedger` fast path. If another request creates the ledger row after that precheck but before this request reaches `paymentLedger.create()`, Prisma throws `P2002`, the transaction rolls back, and the catch block still returns `status: "confirmed"` without updating the regenerated quote row. That leaves the quote `PENDING` until expiry, so repeated retries/regenerations can still consume the sender's pending-quote quota.
**Suggested Fix**: In the `isPrismaConflictError` branch, call `syncPendingQuoteWithConfirmedLedger()` before returning the confirmed response (and do the same in any other fallback that can return success while the quote may still be `PENDING`).
**Fixed in**: Added the missing `syncPendingQuoteWithConfirmedLedger()` call in the `P2002` conflict fallback of `apps/web/app/api/v1/payments/confirm/route.ts` and covered that race with a regression test in `apps/web/app/api/v1/payments/confirm/route.test.ts`.

---

### [F-016] New `MintButton` adds another strict TypeScript failure under the current compiler target

**File**: `apps/web/components/mint-button.tsx:13`
**Severity**: Low
**Description**: The app still targets `ES2017` in `apps/web/tsconfig.json`, so the new `10_000_000n` bigint literal in `MintButton` triggers `TS2737` under `pnpm --filter web exec tsc --noEmit`. The project already has older bigint-target failures elsewhere, but this diff adds another error in a newly introduced file and makes it harder to get the web app back to a clean type-check baseline.
**Suggested Fix**: Either raise the TypeScript target to `ES2020`+ for the app, or avoid bigint literal syntax in this component for now (for example `const MINT_AMOUNT = BigInt('10000000')`).
**Fixed in**: Replaced the bigint literal in `apps/web/components/mint-button.tsx` with `BigInt('10000000')`, which removes the new `TS2737` from the app's current `ES2017` type-check output without changing behavior.

---

### [F-017] `Array.some()` short-circuit undermines `timingSafeEqual` in `hasMatchingHmac`

**File**: `apps/web/lib/scoped-hmac.ts:15`
**Severity**: High
**Description**: `expectedHmacs.some()` short-circuits on first match, leaking which HMAC scheme matched via timing. During legacy rollout the array always has 2 entries — an attacker could distinguish scoped vs legacy tokens. While exploitability requires sub-millisecond network timing, it directly undermines the purpose of `timingSafeEqual`.
**Suggested Fix**: Replace `some()` with a loop that evaluates all candidates without early exit:
```typescript
let match = false;
for (const expectedHmac of expectedHmacs) {
  const expected = Buffer.from(expectedHmac, 'base64url');
  if (received.length === expected.length && timingSafeEqual(received, expected)) {
    match = true;
  }
}
return match;
```
**Fixed in**: Reworked `hasMatchingHmac()` in `apps/web/lib/scoped-hmac.ts` to evaluate every candidate HMAC before returning, so the code no longer short-circuits on the first match.

---

### [F-018] Missing structural type guard in `verifyWalletAuthChallenge` — cross-domain token risk during legacy rollout

**File**: `apps/web/lib/wallet-auth.ts:60-74`
**Severity**: High
**Description**: `hmac.ts` added `isQuotePayload` to prevent wallet-auth tokens from being accepted as quote tokens (F-013). But `verifyWalletAuthChallenge` has no equivalent guard — it casts the parsed JSON directly and uses only truthiness checks. During legacy rollout both modules accept unscoped HMACs, so a legacy quote token could theoretically pass wallet-auth verification if its fields satisfy the checks. Currently blocked because quote payloads lack `address`, but the defense is fragile.
**Suggested Fix**: Add an explicit `isWalletAuthPayload` type guard with structural checks and an explicit `!('xUserId' in p)` rejection of quote payloads.
**Fixed in**: Added `isWalletAuthChallengePayload()` in `apps/web/lib/wallet-auth.ts` and now reject parsed payloads that do not match the wallet-auth shape, including quote payloads that carry `xUserId`.

---

### [F-019] `getExpectedOrigin` allows localhost bypass in production when `APP_ORIGIN` is not set

**File**: `apps/web/lib/api.ts:69-75`
**Severity**: Medium
**Description**: The `getExpectedOrigin` function falls back to checking `req.nextUrl.hostname` against `localhost`/`127.0.0.1` even when `NODE_ENV === 'production'`. If `APP_ORIGIN` is not configured, an attacker who can control the `Host` header (e.g., behind a dumb reverse proxy) can send `Host: localhost:3000` and bypass origin validation for wallet-auth challenges. Both the challenge issuance and verification endpoints use the same function, so both would consistently derive `http://localhost:3000`, making the forged origin pass all checks.
**Suggested Fix**: In production, return `null` unconditionally when `APP_ORIGIN` is not set. The localhost fallback should only apply in non-production environments:
```typescript
if (process.env.NODE_ENV !== 'production') {
  return requestOrigin;
}
return null;
```
**Fixed in**: Tightened `getExpectedOrigin()` in `apps/web/lib/api.ts` so production now requires `APP_ORIGIN`; the localhost fallback only applies in non-production, and `apps/web/lib/api.test.ts` now covers the production and configured-origin cases.

---

### [F-020] Inconsistent `expiresAt` time units across token types

**File**: `apps/web/lib/wallet-auth.ts:76` vs `apps/web/lib/hmac.ts:71`
**Severity**: High
**Description**: Wallet-auth uses milliseconds for `expiresAt`, quote tokens use seconds. Same field name, different units — anyone copying patterns between modules will introduce a 1000x expiration bug.
**Suggested Fix**: Add explicit unit docs to both interfaces, or standardize on one unit.
**Fixed in**: Documented the wallet-auth payload timestamps in `apps/web/lib/wallet-auth.ts` as milliseconds so the differing units are explicit alongside the already documented quote-token seconds field.

---

### [F-021] Extra DB query on every confirm request before idempotency check

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:144`
**Severity**: Medium
**Description**: `findMatchingConfirmedLedgerEntry()` runs on every request before checking quote status. For common retries (quote already confirmed with stored txDigest), this is a wasted DB query.
**Suggested Fix**: Check quote status first, only look up ledger when needed.
**Fixed in**: Moved the initial `findMatchingConfirmedLedgerEntry()` call in `apps/web/app/api/v1/payments/confirm/route.ts` so confirmed quotes with a stored digest return before the extra ledger lookup.

---

### [F-022] Redundant single-column `senderAddress` index on `PaymentLedger`

**File**: `apps/web/prisma/schema.prisma:79-80`
**Severity**: Medium
**Description**: The composite index `(senderAddress, createdAt DESC, id DESC)` added in F-002 makes the single-column `@@index([senderAddress])` redundant (B-tree leftmost prefix property). The old index adds write overhead for no benefit.
**Suggested Fix**: Remove `@@index([senderAddress])`.
**Fixed in**: Removed the redundant single-column `senderAddress` index from `apps/web/prisma/schema.prisma` and added `apps/web/prisma/migrations/20260315100000_drop_redundant_payment_ledger_sender_index/migration.sql` to drop the old database index.

---

### [F-023] No deadline for legacy HMAC removal

**File**: `apps/web/lib/hmac.ts:57`, `apps/web/lib/wallet-auth.ts:53`
**Severity**: Low
**Description**: Both modules accept legacy unscoped HMACs "during rollout" with no TODO, deadline, or feature flag for removal. Risks becoming permanent tech debt.
**Suggested Fix**: Add `// TODO(2026-Q2): Remove legacy HMAC support` and/or gate behind an env var.
**Fixed in**: Added explicit `TODO(2026-Q2)` removal notes next to the legacy HMAC fallbacks in `apps/web/lib/hmac.ts` and `apps/web/lib/wallet-auth.ts`.

---

### [F-024] History pagination uses an `id` cursor with a different primary sort key

**File**: `apps/web/app/api/v1/payments/history/route.ts:39`
**Severity**: Medium
**Description**: The history endpoint paginates with `cursor: { id: cursor }` but orders rows by `createdAt DESC, id DESC`. Prisma cursor pagination requires the page order to be anchored to the cursor field; otherwise page boundaries are not stable. Once `createdAt` and CUID `id` order diverge, "Load More" can skip or duplicate ledger rows.
**Suggested Fix**: Make the cursor match the sort order. Either paginate by a cursor that encodes both `createdAt` and `id`, or switch the query to order by the unique cursor field itself.
**Fixed in**: Replaced the raw `id` cursor in `apps/web/app/api/v1/payments/history/route.ts` with an encoded `{ createdAt, id }` cursor plus explicit `(createdAt, id)` boundary filtering, and added regression coverage for cursor encode/decode in `apps/web/lib/transaction-history-cursor.test.ts`.

---

### [F-025] Expired wallet auth always forces one visible history failure

**File**: `apps/web/app/history/page.tsx:96`
**Severity**: Medium
**Description**: When `/api/v1/payments/history` returns `401`, the client clears `signatureRef` and then immediately throws. That means once the 5-minute wallet-auth challenge expires, the first refresh or "Load More" attempt always shows an error even though the client already knows it needs a fresh challenge. Users must click a second time to recover.
**Suggested Fix**: On the first `401`, clear the cached signature and rerun the challenge/sign flow once before surfacing an error. Keep a one-retry guard so genuine auth failures do not loop forever.
**Fixed in**: Updated `fetchHistory()` in `apps/web/app/history/page.tsx` to retry the history request once with a fresh challenge/signature after the first `401`, so expired auth no longer guarantees a visible failure.

---

### [F-026] Valid short-form Sui addresses are rejected before normalization

**File**: `apps/web/app/api/v1/wallet-auth/challenge/route.ts:17`, `apps/web/app/api/v1/payments/history/route.ts:12`
**Severity**: Low
**Description**: Both endpoints require exactly 64 hex nybbles in the query string and only then call `normalizeSuiAddress()`. The Sui SDK's `normalizeSuiAddress()` explicitly left-pads shorter valid addresses, so inputs like `0x2` are rejected with `400` even though the code then canonicalizes addresses immediately afterward.
**Suggested Fix**: Normalize first and validate the normalized result, or use the SDK's address validator on `normalizeSuiAddress(value)` instead of a fixed-width regex at the API boundary.
**Fixed in**: Added shared `parseSuiAddress()` normalization/validation in `apps/web/lib/api.ts`, switched the wallet-auth challenge and history routes to use it, and added coverage in `apps/web/lib/api.test.ts` for short-form addresses.

---

### [F-027] Send-page header is not mobile-safe when mint controls are visible

**File**: `apps/web/app/send/page.tsx:43`
**Severity**: Low
**Description**: The new header is a single non-wrapping flex row containing the brand, nav, optional `MintButton`, optional mint result text, and the wallet button. On narrow screens, showing the mint controls leaves no wrap or shrink path, so the header can overflow horizontally or push the connect button partly off-screen.
**Suggested Fix**: Let the header wrap or stack on small screens, and keep the mint result on its own line or truncate it so the wallet button remains visible.
**Fixed in**: Changed the send-page header in `apps/web/app/send/page.tsx` to stack on small screens and let the nav/mint cluster wrap, keeping the wallet button visible when mint controls are present.

---

### [F-028] Mint status leaks across wallet switches

**File**: `apps/web/components/mint-button.tsx:17`
**Severity**: Low
**Description**: `result` is only cleared when another mint starts. If a user disconnects or switches wallets, the component keeps the previous wallet's success/error text in state and shows it again for the next wallet session.
**Suggested Fix**: Reset `result` whenever `account?.address` changes, and clear it when the wallet disconnects.
**Fixed in**: Added an address-change effect in `apps/web/components/mint-button.tsx` to clear stale mint status on wallet switches and constrained the status text so it does not widen the header on mobile.

---

### [F-029] New `getExpectedOrigin` tests fail strict TypeScript checking

**File**: `apps/web/lib/api.test.ts:9`
**Severity**: Low
**Description**: The new test file assigns to `process.env.NODE_ENV` directly in `afterEach()` and in the individual test cases. Under the current Node typings, `NODE_ENV` is readonly, so `pnpm --filter web exec tsc --noEmit` now fails with `TS2540` on lines 9, 20, 28, and 36. The app already has older typecheck failures elsewhere, but this diff adds fresh compiler errors in a newly introduced file.
**Suggested Fix**: Replace the direct assignments with `vi.stubEnv()` / `vi.unstubAllEnvs()`, or route the writes through a small mutable helper/cast so the test no longer mutates the readonly property directly.
**Fixed in**: Reworked `apps/web/lib/api.test.ts` to use `vi.stubEnv()` / `vi.unstubAllEnvs()` and added a small regression check for the shared Sui-address parser without introducing new readonly-env assignments.

---

### [F-030] Missing `aria-label` on explorer link icon

**File**: `apps/web/components/transaction-row.tsx:62-85`
**Severity**: Low
**Description**: External link SVG has `title="View on explorer"` but no `aria-label`. Screen readers may not announce the link purpose.
**Suggested Fix**: Add `aria-label="View on explorer"` to the `<a>` tag.
**Fixed in**: Added `aria-label="View on explorer"` to the explorer link in `apps/web/components/transaction-row.tsx`.

---

### [F-031] No cross-domain token rejection test in wallet-auth

**File**: `apps/web/lib/wallet-auth.test.ts`
**Severity**: Low
**Description**: `hmac.test.ts` tests that legacy wallet-auth tokens are rejected by `verifyQuoteToken`, but `wallet-auth.test.ts` does not test the inverse. Would catch the vulnerability in [R-002].
**Suggested Fix**: Add a test creating a legacy quote token and asserting `verifyWalletAuthChallenge` returns null.
**Fixed in**: Added the inverse legacy-token regression test in `apps/web/lib/wallet-auth.test.ts`, asserting that a legacy quote token is rejected by `verifyWalletAuthChallenge()`.

---

### [F-032] Confirm endpoint missing `Cache-Control: no-store`

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:39-46`
**Severity**: Medium
**Description**: The `confirmedResponse` helper returns payment data (amounts, vault addresses, tx digests) without cache control headers. The history endpoint correctly sets `Cache-Control: private, no-store`. While POST responses are typically not cached by browsers, some CDNs or proxies may cache if misconfigured.
**Suggested Fix**: Add `Cache-Control: no-store` header to the `confirmedResponse` helper.
**Fixed in**: Added `Cache-Control: no-store` to the shared `confirmedResponse()` helper in `apps/web/app/api/v1/payments/confirm/route.ts`, so successful confirm responses are explicitly non-cacheable.

---

### [F-033] `txDigest` regex minimum length (32) is too permissive

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:10`
**Severity**: Medium
**Description**: The regex `^[1-9A-HJ-NP-Za-km-z]{32,44}$` accepts 32-character Base58 strings, but Sui transaction digests are Base58-encoded 32-byte hashes producing 43-44 characters. A 32-character string only encodes ~23 bytes.
**Suggested Fix**: Tighten the regex to `{43,44}`.
**Fixed in**: Tightened the confirm-route `txDigest` validation to `{43,44}` in `apps/web/app/api/v1/payments/confirm/route.ts` and updated the confirm-route tests to use valid-length digests while rejecting malformed short ones before the RPC call.

---

### [F-034] HMAC_SECRET minimum length not validated

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:128`, `apps/web/app/api/v1/wallet-auth/challenge/route.ts:42`
**Severity**: Low
**Description**: The code checks `!hmacSecret` but does not validate minimum length. A single-character HMAC secret would pass.
**Suggested Fix**: Add minimum length check (e.g., 32 hex chars = 16 bytes) or validate at application startup.
**Fixed in**: Added shared `hasValidHmacSecret()` validation in `apps/web/lib/api.ts` and used it in the confirm route, wallet-auth challenge route, and wallet-auth verification path so undersized secrets fail as server configuration errors.

---

### [F-035] Confirm route test coverage is incomplete

**File**: `apps/web/app/api/v1/payments/confirm/route.test.ts`
**Severity**: Low
**Description**: Tests cover idempotency scenarios (regenerated quotes, P2002 conflicts) but miss: the happy path (first-time confirmation), failing transactions, sender mismatch, amount mismatch, and missing balance changes.
**Suggested Fix**: Add test cases for missing paths.
**Fixed in**: Expanded `apps/web/app/api/v1/payments/confirm/route.test.ts` to cover the first-time success path, failed on-chain transactions, sender mismatch, amount mismatch, missing balance changes, and short-digest input rejection.

---

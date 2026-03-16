# Fixed Findings — Batch 0

> Last updated: 2026-03-16

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

### [F-024] The new multi-asset send flow still labels SUI amounts as dollars

**File**: `apps/web/components/amount-input.tsx:29`
**Severity**: Medium
**Description**: The homepage now lets users switch between `TEST USDC` and `SUI`, and even defaults to `SUI` when no test-USDC package is configured. But the amount field still hardcodes a leading `$`, and the success state echoes amounts as `"$<amount> <coin>"`. Selecting SUI therefore produces copy like `$1.5 SUI`, which is financially misleading in a payment flow and can cause users to enter the wrong value.
**Suggested Fix**: Only render a dollar prefix for dollar-denominated assets, and make the success copy format the selected coin generically instead of assuming USD.
**Fixed in**: Added `usesDollarAmountPrefix()` in `apps/web/lib/send-form.ts`, used it in `apps/web/components/amount-input.tsx` so SUI no longer renders a dollar prefix, and updated `apps/web/components/transaction-result.tsx` to show generic `<amount> <coin>` success copy.

---

### [F-025] Switching assets can leave an invalid amount enabled until send time

**File**: `apps/web/components/amount-input.tsx:14`
**Severity**: Low
**Description**: Amount validation only runs while the user is typing, not when `coinType` changes. A valid 9-decimal SUI amount can therefore stay in the field after the user switches to 6-decimal `TEST USDC`, while `SendButton` remains enabled. The first time the user learns the amount is invalid is after clicking send, when `toBaseUnits()` throws.
**Suggested Fix**: Revalidate or clamp the current amount whenever `coinType` changes, and keep the send action disabled while the visible amount exceeds the selected asset's precision.
**Fixed in**: Added `sanitizeAmountForCoinType()` in `apps/web/lib/send-form.ts`, applied it when `apps/web/app/page.tsx` changes the selected asset, and tightened `apps/web/components/send-button.tsx` so invalid precision disables send and surfaces a validation error before transaction building.

---

### [F-026] Leading `@` input truncates valid 15-character X handles

**File**: `apps/web/components/username-input.tsx:114`
**Severity**: Low
**Description**: The field visually prefixes `@` and the resolver strips it, so users can reasonably paste or type `@handle`. But the controlled value still keeps that raw `@` while `maxLength={15}` counts it against X's 15-character limit. A valid 15-character handle entered with the leading `@` is truncated to 14 characters before resolution, which can resolve the wrong account or fail lookup entirely.
**Suggested Fix**: Strip a leading `@` in `onChange` before storing the value and enforcing length, or allow 16 characters in the DOM while normalizing the stored value back to 15 handle characters.
**Fixed in**: Reused the new `normalizeUsernameInput()` helper in `apps/web/components/username-input.tsx` so leading `@` characters are stripped before storage, and increased the DOM `maxLength` to `MAX_X_HANDLE_LENGTH + 1` so pasted `@handle` values still allow a full 15-character X username.

---

### [F-027] History pagination uses an `id` cursor with a different primary sort key

**File**: `apps/web/app/api/v1/payments/history/route.ts:39`
**Severity**: Medium
**Description**: The history endpoint paginates with `cursor: { id: cursor }` but orders rows by `createdAt DESC, id DESC`. Prisma cursor pagination requires the page order to be anchored to the cursor field; otherwise page boundaries are not stable. Once `createdAt` and CUID `id` order diverge, "Load More" can skip or duplicate ledger rows.
**Suggested Fix**: Make the cursor match the sort order. Either paginate by a cursor that encodes both `createdAt` and `id`, or switch the query to order by the unique cursor field itself.
**Fixed in**: Replaced the raw `id` cursor in `apps/web/app/api/v1/payments/history/route.ts` with an encoded `{ createdAt, id }` cursor plus explicit `(createdAt, id)` boundary filtering, and added regression coverage for cursor encode/decode in `apps/web/lib/transaction-history-cursor.test.ts`.

---

### [F-028] Expired wallet auth always forces one visible history failure

**File**: `apps/web/app/history/page.tsx:96`
**Severity**: Medium
**Description**: When `/api/v1/payments/history` returns `401`, the client clears `signatureRef` and then immediately throws. That means once the 5-minute wallet-auth challenge expires, the first refresh or "Load More" attempt always shows an error even though the client already knows it needs a fresh challenge. Users must click a second time to recover.
**Suggested Fix**: On the first `401`, clear the cached signature and rerun the challenge/sign flow once before surfacing an error. Keep a one-retry guard so genuine auth failures do not loop forever.
**Fixed in**: Updated `fetchHistory()` in `apps/web/app/history/page.tsx` to retry the history request once with a fresh challenge/signature after the first `401`, so expired auth no longer guarantees a visible failure.

---

### [F-029] Valid short-form Sui addresses are rejected before normalization

**File**: `apps/web/app/api/v1/wallet-auth/challenge/route.ts:17`, `apps/web/app/api/v1/payments/history/route.ts:12`
**Severity**: Low
**Description**: Both endpoints require exactly 64 hex nybbles in the query string and only then call `normalizeSuiAddress()`. The Sui SDK's `normalizeSuiAddress()` explicitly left-pads shorter valid addresses, so inputs like `0x2` are rejected with `400` even though the code then canonicalizes addresses immediately afterward.
**Suggested Fix**: Normalize first and validate the normalized result, or use the SDK's address validator on `normalizeSuiAddress(value)` instead of a fixed-width regex at the API boundary.
**Fixed in**: Added shared `parseSuiAddress()` normalization/validation in `apps/web/lib/api.ts`, switched the wallet-auth challenge and history routes to use it, and added coverage in `apps/web/lib/api.test.ts` for short-form addresses.

---

### [F-030] Send-page header is not mobile-safe when mint controls are visible

**File**: `apps/web/app/send/page.tsx:43`
**Severity**: Low
**Description**: The new header is a single non-wrapping flex row containing the brand, nav, optional `MintButton`, optional mint result text, and the wallet button. On narrow screens, showing the mint controls leaves no wrap or shrink path, so the header can overflow horizontally or push the connect button partly off-screen.
**Suggested Fix**: Let the header wrap or stack on small screens, and keep the mint result on its own line or truncate it so the wallet button remains visible.
**Fixed in**: Changed the send-page header in `apps/web/app/send/page.tsx` to stack on small screens and let the nav/mint cluster wrap, keeping the wallet button visible when mint controls are present.

---

### [F-031] Mint status leaks across wallet switches

**File**: `apps/web/components/mint-button.tsx:17`
**Severity**: Low
**Description**: `result` is only cleared when another mint starts. If a user disconnects or switches wallets, the component keeps the previous wallet's success/error text in state and shows it again for the next wallet session.
**Suggested Fix**: Reset `result` whenever `account?.address` changes, and clear it when the wallet disconnects.
**Fixed in**: Added an address-change effect in `apps/web/components/mint-button.tsx` to clear stale mint status on wallet switches and constrained the status text so it does not widen the header on mobile.

---

### [F-032] New `getExpectedOrigin` tests fail strict TypeScript checking

**File**: `apps/web/lib/api.test.ts:9`
**Severity**: Low
**Description**: The new test file assigns to `process.env.NODE_ENV` directly in `afterEach()` and in the individual test cases. Under the current Node typings, `NODE_ENV` is readonly, so `pnpm --filter web exec tsc --noEmit` now fails with `TS2540` on lines 9, 20, 28, and 36. The app already has older typecheck failures elsewhere, but this diff adds fresh compiler errors in a newly introduced file.
**Suggested Fix**: Replace the direct assignments with `vi.stubEnv()` / `vi.unstubAllEnvs()`, or route the writes through a small mutable helper/cast so the test no longer mutates the readonly property directly.
**Fixed in**: Reworked `apps/web/lib/api.test.ts` to use `vi.stubEnv()` / `vi.unstubAllEnvs()` and added a small regression check for the shared Sui-address parser without introducing new readonly-env assignments.

---

### [F-033] Missing `aria-label` on explorer link icon

**File**: `apps/web/components/transaction-row.tsx:62-85`
**Severity**: Low
**Description**: External link SVG has `title="View on explorer"` but no `aria-label`. Screen readers may not announce the link purpose.
**Suggested Fix**: Add `aria-label="View on explorer"` to the `<a>` tag.
**Fixed in**: Added `aria-label="View on explorer"` to the explorer link in `apps/web/components/transaction-row.tsx`.

---

### [F-034] No cross-domain token rejection test in wallet-auth

**File**: `apps/web/lib/wallet-auth.test.ts`
**Severity**: Low
**Description**: `hmac.test.ts` tests that legacy wallet-auth tokens are rejected by `verifyQuoteToken`, but `wallet-auth.test.ts` does not test the inverse. That missing coverage would have caught the inverse wallet-auth/quote-token acceptance bug directly.
**Suggested Fix**: Add a test creating a legacy quote token and asserting `verifyWalletAuthChallenge` returns null.
**Fixed in**: Added the inverse legacy-token regression test in `apps/web/lib/wallet-auth.test.ts`, asserting that a legacy quote token is rejected by `verifyWalletAuthChallenge()`.

---

### [F-035] Confirm endpoint missing `Cache-Control: no-store`

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:39-46`
**Severity**: Medium
**Description**: The `confirmedResponse` helper returns payment data (amounts, vault addresses, tx digests) without cache control headers. The history endpoint correctly sets `Cache-Control: private, no-store`. While POST responses are typically not cached by browsers, some CDNs or proxies may cache if misconfigured.
**Suggested Fix**: Add `Cache-Control: no-store` header to the `confirmedResponse` helper.
**Fixed in**: Added `Cache-Control: no-store` to the shared `confirmedResponse()` helper in `apps/web/app/api/v1/payments/confirm/route.ts`, so successful confirm responses are explicitly non-cacheable.

---

### [F-036] `txDigest` regex minimum length (32) is too permissive

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:10`
**Severity**: Medium
**Description**: The regex `^[1-9A-HJ-NP-Za-km-z]{32,44}$` accepts 32-character Base58 strings, but Sui transaction digests are Base58-encoded 32-byte hashes producing 43-44 characters. A 32-character string only encodes ~23 bytes.
**Suggested Fix**: Tighten the regex to `{43,44}`.
**Fixed in**: Tightened the confirm-route `txDigest` validation to `{43,44}` in `apps/web/app/api/v1/payments/confirm/route.ts` and updated the confirm-route tests to use valid-length digests while rejecting malformed short ones before the RPC call.

---

### [F-037] HMAC_SECRET minimum length not validated

**File**: `apps/web/app/api/v1/payments/confirm/route.ts:128`, `apps/web/app/api/v1/wallet-auth/challenge/route.ts:42`
**Severity**: Low
**Description**: The code checks `!hmacSecret` but does not validate minimum length. A single-character HMAC secret would pass.
**Suggested Fix**: Add minimum length check (e.g., 32 hex chars = 16 bytes) or validate at application startup.
**Fixed in**: Added shared `hasValidHmacSecret()` validation in `apps/web/lib/api.ts` and used it in the confirm route, wallet-auth challenge route, and wallet-auth verification path so undersized secrets fail as server configuration errors.

---

### [F-038] Confirm route test coverage is incomplete

**File**: `apps/web/app/api/v1/payments/confirm/route.test.ts`
**Severity**: Low
**Description**: Tests cover idempotency scenarios (regenerated quotes, P2002 conflicts) but miss: the happy path (first-time confirmation), failing transactions, sender mismatch, amount mismatch, and missing balance changes.
**Suggested Fix**: Add test cases for missing paths.
**Fixed in**: Expanded `apps/web/app/api/v1/payments/confirm/route.test.ts` to cover the first-time success path, failed on-chain transactions, sender mismatch, amount mismatch, missing balance changes, and short-digest input rejection.

---

### [F-039] New `ThemeToggle` fails the repo lint gate

**File**: `apps/web/components/theme-toggle.tsx:12`
**Severity**: Medium
**Description**: The new theme toggle calls `setMounted(true)` inside `useEffect`, which trips the repo's `react-hooks/set-state-in-effect` rule. `pnpm --filter web lint` currently exits with code 1 on this file, so the current diff cannot pass the existing lint check.
**Suggested Fix**: Replace the effect-driven mount flag with a lint-compliant hydration strategy, such as deriving the icon from `resolvedTheme` or moving the client-ready check to a shared hook that does not call `setState` inside an effect.
**Fixed in**: Replaced the effect-driven mount state in `apps/web/components/theme-toggle.tsx` with a `useSyncExternalStore()` client-ready check and switched the toggle logic to `resolvedTheme`, which clears the `react-hooks/set-state-in-effect` lint error without changing behavior.

---

### [F-040] Public handle lookups have no stale-request protection

**File**: `apps/web/app/dashboard/received/page.tsx:48`, `apps/web/app/lookup/page.tsx:29`, `apps/web/app/claim/page.tsx:34`
**Severity**: Medium
**Description**: The new received dashboard, public lookup page, and claim page all allow multiple in-flight lookups with no `AbortController` or request token. A slower earlier lookup can therefore overwrite a newer handle's result, and the received dashboard's `handleLoadMore()` can even merge an older handle's next page into the currently displayed handle after the user has already searched for someone else.
**Suggested Fix**: Track each lookup with an abort signal or monotonically increasing request id and ignore stale responses before calling `setResult` / `setLookup` / `setData`. For the received dashboard, guard load-more merges against `activeHandle` changes before appending items.
**Fixed in**: Added per-page request-id guards to `apps/web/app/lookup/page.tsx` and `apps/web/app/claim/page.tsx`, and added both lookup and load-more invalidation guards to `apps/web/app/dashboard/received/page.tsx` so stale responses no longer overwrite or append into newer handle searches.

---

### [F-041] Claim page reports success without performing any claim

**File**: `apps/web/app/claim/page.tsx:33`
**Severity**: Medium
**Description**: The `/claim` route is exposed in the main navbar, but the final "Claim funds" action never calls a backend endpoint or submits a wallet transaction. `handleStepAction('claim')` just waits 900 ms, sets `claimPreviewComplete = true`, and the stepper flips to `Claimed` via `effectiveClaimed`. That makes the page present a successful claim state even though no funds moved on-chain.
**Suggested Fix**: Keep the step pending until a real claim request/transaction succeeds, or hide/feature-flag the route until the claim flow is actually wired end to end.
**Fixed in**: Stopped deriving claimed status from the local preview flag in `apps/web/app/claim/page.tsx`, changed the third step to explicit preview copy, and updated the post-click messaging/card so the page no longer presents an unwired preview as a completed claim.

---

### [F-042] Primary navigation disappears completely on mobile

**File**: `apps/web/components/navbar.tsx:110`
**Severity**: Medium
**Description**: All route links (`/`, `/dashboard/sent`, `/lookup`, `/claim`) live inside a `<nav>` with `hidden ... md:flex`, and there is no small-screen fallback menu anywhere else in the header. On phones, users lose in-app navigation to every page except whatever URL they already opened directly.
**Suggested Fix**: Add a mobile navigation affordance, such as a sheet/menu button or a horizontally scrollable tab row that stays visible below `md`.
**Fixed in**: Added a dedicated `md:hidden` mobile nav row in `apps/web/components/navbar.tsx`, preserving the existing desktop nav while keeping the main routes reachable on small screens.

---

### [F-043] Starting a new claim lookup leaves the previous handle live and clickable

**File**: `apps/web/app/claim/page.tsx:41`
**Severity**: Medium
**Description**: `handleLookup()` does not clear `lookup`, `hasSignedInWithX`, or `claimPreviewComplete` when a new search starts, and the empty-handle validation path returns without clearing them either. After loading one handle, entering another handle still leaves the previous vault details and stepper mounted until the new request finishes, so the user can keep clicking "Continue" or "Claim funds" against stale data while the input shows a different handle.
**Suggested Fix**: Clear the loaded lookup and step state immediately when validation fails or when a new lookup begins, and disable the stepper while a replacement lookup is in flight.
**Fixed in**: `apps/web/app/claim/page.tsx` now clears the loaded lookup, preview state, pending step state, and notices immediately when a new lookup starts or fails validation, so stale claim UI is removed before the next handle is processed.

---

### [F-044] Public lookup and incoming payment endpoints write to DB on every unauthenticated GET request

**File**: `apps/web/app/api/v1/lookup/x-username/route.ts:68`, `apps/web/app/api/v1/payments/incoming/route.ts:80`
**Severity**: High
**Description**: Both new public API endpoints call `persistReceivedDashboardXUser(userInfo)` on every request with no authentication. This function upserts the `xUser` table, updating `username`, `profilePicture`, and `isBlueVerified` from the Twitter API response. Since these are public GET endpoints (rate limited at 30-60 req/min per IP), any anonymous user can trigger repeated upserts for any X handle. This creates unnecessary write amplification on read-heavy public endpoints, violates HTTP GET semantics (write on read), and if the Twitter API ever returns stale/inconsistent data during degradation, the persisted user record could be corrupted by unauthenticated traffic.
**Suggested Fix**: Make the upsert conditional on a freshness check (e.g., only upsert if the existing record is older than N minutes or missing), or cache resolved user info so repeated requests don't write every time.
**Fixed in**: Added a freshness-and-equality short-circuit in `apps/web/lib/received-dashboard.ts` so `persistReceivedDashboardXUser()` reuses recent unchanged `x_user` rows instead of upserting on every public GET.

---

### [F-045] Username not URL-encoded in client-side fetch calls — query parameter injection risk

**File**: `apps/web/app/claim/page.tsx:58`, `apps/web/app/lookup/page.tsx:48`
**Severity**: Medium
**Description**: The claim and lookup pages construct fetch URLs via template literals without encoding: `` `/api/v1/lookup/x-username?username=${username}` ``. While `normalizeHandle()` strips leading `@` and trims whitespace, it does not strip characters like `&` or `#`. The server-side Zod regex would reject such inputs, but the request is still sent with potentially injected query parameters. The received dashboard correctly uses `URLSearchParams` which auto-encodes values.
**Suggested Fix**: Use `URLSearchParams` consistently across all client-side fetch calls, matching the pattern already used in `apps/web/app/dashboard/received/page.tsx`.
**Fixed in**: Updated `apps/web/app/claim/page.tsx` and `apps/web/app/lookup/page.tsx` to build lookup URLs with `URLSearchParams`, so handles are encoded before the request is sent.

---

### [F-046] `normalizeHandle` is weaker than `normalizeUsernameInput` — allows overlong/malformed handles to reach the server

**File**: `apps/web/lib/received-dashboard-client.ts:50-52`
**Severity**: Medium
**Description**: The `normalizeHandle` function used on claim, lookup, and received dashboard pages only trims whitespace and strips a single leading `@`. Unlike `normalizeUsernameInput` in `send-form.ts`, it does not strip all whitespace, handle multiple leading `@` characters, or enforce the 15-character X handle limit. A user could enter `@@handle` (resulting in `@handle`) or a 30-character string. The server catches these but shows confusing error messages.
**Suggested Fix**: Reuse `normalizeUsernameInput` from `send-form.ts` in the dashboard/lookup/claim pages, or unify the normalization logic so client-side validation matches server-side constraints.
**Fixed in**: `apps/web/lib/received-dashboard-client.ts` now reuses `normalizeUsernameInput()`, and the claim, lookup, and received-dashboard inputs all apply that normalization plus the shared max-length guard as the user types.

---

### [F-047] `received-dashboard.ts` does not validate `xUserId` before BigInt conversion

**File**: `apps/web/lib/received-dashboard.ts:138`
**Severity**: Medium
**Description**: `getReceivedVaultSummary` calls `BigInt(xUserId)` where `xUserId` is a string from the Twitter API. If the API returns a non-numeric ID, `BigInt()` throws a `SyntaxError` that propagates as a 503 with an opaque error message.
**Suggested Fix**: Validate that `xUserId` matches `/^\d+$/` before conversion, and return a descriptive 400-level error if malformed.
**Fixed in**: Added shared numeric X-user-id parsing in `apps/web/lib/twitter.ts`, ignored malformed cached ids in `apps/web/lib/x-user-lookup.ts`, and guarded `getReceivedVaultSummary()` before `BigInt()` in `apps/web/lib/received-dashboard.ts`.

---

### [F-048] Fake "Sign in with X" step provides no actual identity verification

**File**: `apps/web/app/claim/page.tsx:121-127`
**Severity**: Medium
**Description**: Related to but distinct from the separate fake-claim-step finding in this batch. The "Sign in with X" step (`id === 'signin'`) simulates X OAuth by waiting 700ms and setting `hasSignedInWithX = true` — no actual OAuth flow, API call, or identity verification occurs. The entire claim stepper can be advanced to the final step without proving ownership of the X handle. If the claim transaction is wired in the future without fixing this, anyone could claim any handle's vault without authentication.
**Suggested Fix**: Either implement actual X OAuth, or clearly gate the entire claim page behind a "Coming soon" state that prevents the stepper from advancing. The current UI gives users the impression that they have authenticated when they have not.
**Fixed in**: Changed the claim page’s sign-in step into an explicit coming-soon gate in `apps/web/app/claim/page.tsx`, so clicking it now shows notice text without marking the user authenticated or unlocking later steps.

---

### [F-049] `sent/page.tsx` displays full 66-character wallet address with no truncation in header badge

**File**: `apps/web/app/dashboard/sent/page.tsx:239-241`
**Severity**: Low
**Description**: The sent dashboard renders `{account.address}` inside a Badge in the table header. A Sui address is 66 characters, which overflows on narrow screens. Other pages use `truncateAddress()`.
**Suggested Fix**: Apply `truncateAddress(account.address)` for consistency.
**Fixed in**: Updated `apps/web/app/dashboard/sent/page.tsx` to truncate the connected wallet address in the header badge with `truncateAddress()`.

---

### [F-050] "Payments sent" count shows loaded items count, not total

**File**: `apps/web/app/dashboard/sent/page.tsx:216`
**Severity**: Low
**Description**: The "Payments sent" metric card shows `{items.length}`, which only reflects loaded items — not the user's total sent payment count. After loading 20 of 200 payments, it shows "20". Misleading for a summary metric.
**Suggested Fix**: Either label it "Payments loaded", remove the count metric, or add a `totalCount` field to the server response.
**Fixed in**: Relabeled the metric in `apps/web/app/dashboard/sent/page.tsx` to `Payments loaded`, so the existing `items.length` value no longer implies a backend total.

---

### [F-051] No AbortController in claim page or lookup page fetch calls

**File**: `apps/web/app/claim/page.tsx:57-83`, `apps/web/app/lookup/page.tsx:47-71`
**Severity**: Low
**Description**: Both pages use `lookupRequestIdRef` to discard stale responses from an earlier stale-request fix, but don't use `AbortController` to actually cancel in-flight HTTP requests. Old requests continue consuming network bandwidth and server resources. The sent dashboard correctly uses `AbortController`.
**Suggested Fix**: Add `AbortController` support, aborting the previous request when a new lookup starts.
**Fixed in**: Added per-page `AbortController` refs in `apps/web/app/claim/page.tsx` and `apps/web/app/lookup/page.tsx`, aborting superseded requests and cleaning them up on unmount.

---

### [F-052] Received-dashboard types duplicated between server and client modules

**File**: `apps/web/lib/received-dashboard-client.ts:3-48`, `apps/web/lib/received-dashboard.ts:13-63`
**Severity**: Low
**Description**: Interfaces like `ReceivedClaimStatus`, `ReceivedBalance`, `IncomingPaymentItem`, etc. are defined identically in both files. If one is updated without the other, client and server silently disagree on the API contract. Same pattern as F-006 (which was fixed for `TransactionItem`).
**Suggested Fix**: Extract shared types into a dedicated `received-dashboard-types.ts` that both import from.
**Fixed in**: Extracted the shared received-dashboard contract into `apps/web/lib/received-dashboard-types.ts` and updated both the server and client helpers to import the same types and claim-status model constant.

---

### [F-053] Deleted vault objects treated as unclaimed in received dashboard

**File**: `apps/web/lib/received-dashboard.ts:156`
**Severity**: Medium
**Description**: When the vault object lookup returns `deleted`, the code treats it the same as `notExists` — i.e., as unclaimed. A deleted vault likely means the user already claimed and the object was consumed. Treating it as "unclaimed" with `claimStatus: 'UNCLAIMED'` is misleading, as it suggests the user has never claimed when they may have already withdrawn funds.
**Suggested Fix**: Add a distinct status for the `deleted` case (e.g., `PREVIOUSLY_CLAIMED` or handle it as `CLAIMED`), or log a warning when a deleted vault is encountered.
**Fixed in**: Added the `PREVIOUSLY_CLAIMED` claim status in `apps/web/lib/received-dashboard-types.ts`, mapped `deleted` object lookups to it in `apps/web/lib/received-dashboard.ts`, and updated the claim/received dashboard copy to surface that state correctly.

---

### [F-054] Received dashboard `data.items` grows unbounded in client memory

**File**: `apps/web/app/dashboard/received/page.tsx:110-116`
**Severity**: Low
**Description**: The "Load more" pattern appends each page into `data.items` via `setData((prev) => ({ ...payload, items: [...prev.items, ...payload.items] }))`. There is no upper bound. For a popular handle with thousands of incoming payments, continuous paging could exhaust browser memory, and all rows render without virtualization.
**Suggested Fix**: Add a maximum item count or implement virtual scrolling for long lists.
**Fixed in**: Added optional row virtualization to `apps/web/components/payment-table.tsx` and enabled it for the received dashboard in `apps/web/app/dashboard/received/page.tsx`, so long incoming-payment lists now render through a windowed viewport instead of mounting every row at once.

---

### [F-055] `mapIncomingPayment` throws on unsupported coin types stored in the payment ledger

**File**: `apps/web/lib/received-dashboard.ts:48-49`
**Severity**: High
**Description**: After the display helpers were tightened to throw for unsupported coin types, `mapIncomingPayment` calls both on every ledger row without filtering. `getIncomingPaymentsPage` maps all rows regardless of coin type. If any ledger row contains a coin type not in the display whitelist (e.g., a token temporarily supported then removed, or a future migration), the entire paginated response crashes with an unhandled exception (503). The balance code in `getReceivedVaultSummary` correctly filters via `isDisplaySupportedCoinType`, but the payment listing does not.
**Suggested Fix**: Filter unsupported coin types before mapping, or wrap in a safe mapper that returns `null` for unsupported types and filters them out:
```typescript
const mapped = mapIncomingPayment(row);
// where mapIncomingPayment returns null for unsupported coinType
items: items.map(mapIncomingPayment).filter(Boolean)
```
**Fixed in**: Made `mapIncomingPayment()` return `null` for unsupported assets in `apps/web/lib/received-dashboard.ts`, and updated `getIncomingPaymentsPage()` to keep scanning paginated ledger rows until it fills the page with displayable items instead of crashing on a single unsupported coin type.

---

### [F-056] `summarizeAmount` in sent dashboard crashes on unsupported coin types from DB

**File**: `apps/web/app/dashboard/sent/page.tsx:22-38`
**Severity**: High
**Description**: Same root cause as the preceding unsupported-coin listing finding. `summarizeAmount` iterates all loaded `TransactionItem` objects and calls `formatAmount(total.toString(), coinType)` and `getCoinLabel(coinType)` — both throw after the display helpers were tightened for unsupported coin types. The history API returns `coinType` directly from the database without filtering against the display whitelist. A single unsupported ledger row crashes the entire sent dashboard client-side.
**Suggested Fix**: Guard with `isDisplaySupportedCoinType` or wrap in try/catch with a fallback label:
```typescript
try {
  return `${formatAmount(total.toString(), coinType)} ${getCoinLabel(coinType)}`;
} catch {
  return `${total.toString()} (unknown asset)`;
}
```
**Fixed in**: Added a shared `formatSentAmount()` guard in `apps/web/app/dashboard/sent/page.tsx` so both the volume summary and each table row fall back to raw units for unsupported assets instead of throwing.

---

### [F-057] Received dashboard `fetchIncoming` lacks AbortController — rapid searches leak concurrent requests

**File**: `apps/web/app/dashboard/received/page.tsx:35-49`
**Severity**: Medium
**Description**: Earlier fixes added `AbortController` support to the claim and lookup pages, but the received dashboard was not included. `handleSubmit` does not abort the previous request when a new search starts. Rapid handle searches cause concurrent in-flight fetches that each consume network bandwidth and server resources (including Sui RPC calls via `getReceivedVaultSummary`). The request-id guard from the earlier stale-response fix discards stale responses, but the HTTP requests themselves continue running.
**Suggested Fix**: Add `AbortController` ref matching the claim/lookup pattern, aborting previous requests on new search and on unmount.
**Fixed in**: Added a shared request `AbortController` ref in `apps/web/app/dashboard/received/page.tsx`, wired it into both initial lookups and load-more fetches, and abort the active request on replacement and unmount.

---

### [F-058] `persistReceivedDashboardXUser` silently swallows errors and returns default derivation version

**File**: `apps/web/lib/received-dashboard.ts:109-112`
**Severity**: Medium
**Description**: The entire function body is wrapped in a try/catch that swallows all errors and returns `DEFAULT_DERIVATION_VERSION` (1). If the database is down or the Prisma query fails, the function silently succeeds with version 1. A wrong derivation version produces a completely wrong vault address, showing incorrect balances and potentially directing funds to an unrelated address. Callers in the lookup and incoming payment routes proceed to build responses using this potentially-wrong derivation version.
**Suggested Fix**: Separate read and write error handling. Throw on read failures (where the real derivation version is needed) and only fall back to default on write failures for genuinely new users.
**Fixed in**: Split `persistReceivedDashboardXUser()` in `apps/web/lib/received-dashboard.ts` so lookup reads now fail loudly, write failures reuse the known derivation version when possible, and both public routes now catch persistence failures before returning a 503 instead of building a response with the wrong vault derivation.

---

### [F-059] Vault summary re-fetched from Sui RPC on every paginated incoming payments request

**File**: `apps/web/lib/received-dashboard.ts:251-268`
**Severity**: Medium
**Description**: `buildIncomingPaymentsResponse` calls `getReceivedVaultSummary` on every request, including "Load more" pagination. This makes two RPC calls (`getObject` + `getAllBalances`) to the Sui fullnode per page load. The vault summary (existence, claim status, balances) is unlikely to change between consecutive page loads during a single browsing session. With 60 req/min rate limits, heavy paging generates unnecessary RPC load. Distinct from N-013 (Twitter API caching, already addressed).
**Suggested Fix**: Return vault summary only on the first page (no cursor) and have the client reuse it for subsequent pages, or add short TTL caching for vault summary by xUserId.
**Fixed in**: Added a short TTL vault-summary cache in `apps/web/lib/received-dashboard.ts`, seeded from the first page load and reused for subsequent paginated incoming-payment requests for the same `xUserId` / registry / derivation tuple.

---

### [F-060] `PaymentTable` `desktopColSpan` off-by-one — spacer rows don't span full table width

**File**: `apps/web/components/payment-table.tsx:129`
**Severity**: Medium
**Description**: `desktopColSpan` is calculated as `3 + (showClaimStatus ? 1 : 0) + (showTxLink ? 1 : 0)`. The base count of 3 accounts for Counterparty + Amount + Status, but the table always renders a Date column too. The actual base should be 4. The undercounted `colSpan` causes virtualization spacer `<td>` elements to not span the full table width, producing layout glitches where spacer rows are narrower than data rows.
**Suggested Fix**: Change base count to 4:
```typescript
const desktopColSpan = 4 + (showClaimStatus ? 1 : 0) + (showTxLink ? 1 : 0);
```
**Fixed in**: Corrected the base desktop column count to `4` in `apps/web/components/payment-table.tsx`, so virtualized spacer rows now span the full table width.

---

### [F-061] `receivedVaultSummaryCache` is an unbounded in-memory Map — memory leak in production

**File**: `apps/web/lib/received-dashboard.ts:37`
**Severity**: High
**Description**: `receivedVaultSummaryCache` is a `Map<string, CachedReceivedVaultSummary>` at module scope with no size limit. Expired entries are only removed on individual `get` lookups — entries that are never re-fetched stay forever. In a long-running server handling many unique usernames, the cache grows without bound, causing memory exhaustion.
**Suggested Fix**: Use an LRU cache with a max entry count or add periodic sweeping of expired entries.
**Fixed in**: Added bounded cache pruning in `apps/web/lib/received-dashboard.ts`, evicting expired entries and capping the vault-summary cache at 500 entries while promoting active keys on cache hits.

---

### [F-062] Bundled Apple San Francisco fonts may violate license terms

**File**: `apps/web/app/fonts/SFNS.ttf`, `apps/web/app/fonts/SFCompact.ttf`, `apps/web/app/fonts/SFNSMono.ttf`
**Severity**: High
**Description**: The font files (`SFNS`, `SFCompact`, `SFNSMono`) are Apple's San Francisco family. Apple's license restricts these fonts to use exclusively on Apple platforms. Serving them from a web server to non-Apple devices is a license violation.
**Suggested Fix**: Replace with a redistributable alternative or a system font stack.
**Fixed in**: Replaced the local Apple font bundle in `apps/web/app/layout.tsx` with redistributable `next/font/google` families (`Manrope`, `Space_Grotesk`, `JetBrains_Mono`) and removed the bundled San Francisco `.ttf` assets from `apps/web/app/fonts/`.

---

### [F-063] `getIncomingPaymentsPage` loop has no iteration cap — can execute unlimited DB queries

**File**: `apps/web/lib/received-dashboard.ts:281`
**Severity**: Medium
**Description**: The `while (mappedItems.length <= limit && !exhausted)` loop keeps fetching batches from the database until enough displayable items are found. If a user has thousands of payments with unsupported coin types (filtered out by `isDisplaySupportedCoinType`), the loop will issue a proportionally large number of queries with no ceiling.
**Suggested Fix**: Add a max iteration guard.
**Fixed in**: Added `MAX_INCOMING_PAYMENT_SCAN_ITERATIONS` in `apps/web/lib/received-dashboard.ts`, stopping the scan after 10 queries and returning a continuation cursor instead of allowing unbounded database pagination.

---

### [F-064] Missing `/dashboard` index page causes 404

**File**: `apps/web/app/dashboard/` (no `page.tsx`)
**Severity**: Medium
**Description**: Only `/dashboard/sent/page.tsx` and `/dashboard/received/page.tsx` exist. Users navigating to `/dashboard` directly get a 404. The old `/history` route redirects to `/dashboard/sent` but `/dashboard` itself has no redirect.
**Suggested Fix**: Add a redirecting `apps/web/app/dashboard/page.tsx`.
**Fixed in**: Added `apps/web/app/dashboard/page.tsx` with a server-side redirect to `/dashboard/sent`.

---

### [F-065] `getCoinLabel` and `getCoinDecimals` now throw for unknown coin types — breaking `transaction-row.tsx`

**File**: `apps/web/lib/coins.ts:34`, `apps/web/components/transaction-row.tsx:61`
**Severity**: Medium
**Description**: `getCoinLabel` and `getCoinDecimals` were changed to throw for unsupported coin types instead of returning a fallback. `transaction-row.tsx` called both without a guard. If the sent-history API returns a payment with an unsupported coin type, the component crashes.
**Suggested Fix**: Guard with `isDisplaySupportedCoinType(coinType)` before calling `formatAmount` / `getCoinLabel`, or add a fallback display.
**Fixed in**: Guarded `apps/web/components/transaction-row.tsx` with `isDisplaySupportedCoinType()` and now render a safe `Unsupported asset` fallback instead of throwing on historical unsupported coin types.

---

### [F-066] `parseXUserId` accepts "0" as a valid X user ID

**File**: `apps/web/lib/twitter.ts:40`
**Severity**: Medium
**Description**: The `X_USER_ID_RE` pattern is `/^\d+$/`, which matches "0" and "00000". X user IDs are positive integers starting from 1. A zero-valued ID could produce a degenerate vault address derivation via `BigInt("0")`, potentially colliding with an uninitialized default.
**Suggested Fix**: Tighten the regex to positive integers only.
**Fixed in**: Tightened `X_USER_ID_RE` in `apps/web/lib/twitter.ts` to `/^[1-9]\\d*$/` and added regression coverage in `apps/web/lib/twitter.test.ts` for zero-valued ids.

---

### [F-067] Explorer URL `txDigest` is interpolated without format validation

**File**: `apps/web/lib/coins.ts:72`
**Severity**: Medium
**Description**: `getExplorerTransactionUrl` constructs a URL by interpolating `txDigest` directly. If a malformed digest contains URL-special characters, the resulting URL could point somewhere unexpected. The URLs are used in `<a href>` and `<Link href>` throughout the codebase.
**Suggested Fix**: Validate `txDigest` before constructing the URL.
**Fixed in**: Added base58 transaction-digest validation in `apps/web/lib/coins.ts` using `fromBase58()` and return `null` for malformed digests; `apps/web/lib/coins.test.ts` now covers the accepted and rejected cases.

---

### [F-068] `amount-input.tsx` uses hardcoded `id="amount-input"` — breaks with multiple instances

**File**: `apps/web/components/amount-input.tsx:40`
**Severity**: Low
**Description**: The component uses a static `id="amount-input"` for both `<Label htmlFor>` and `<Input id>`. If two `AmountInput` components render on the same page, IDs collide, breaking accessibility label association. `UsernameInput` correctly uses `useId()`.
**Suggested Fix**: Use React's `useId()` hook for the input id.
**Fixed in**: Switched `apps/web/components/amount-input.tsx` to `useId()` so each rendered amount input gets its own unique label/input association.

---

### [F-069] `resolved-user-card.tsx` imports `ResolvedUser` from legacy `handle-input` instead of `username-input`

**File**: `apps/web/components/resolved-user-card.tsx:3`
**Severity**: Low
**Description**: Line 3 imports `ResolvedUser` from `@/components/handle-input`. Other components were updated to import from `@/components/username-input`. While `handle-input.tsx` still exists so this compiles, it creates a fragile split between the old and new canonical type sources.
**Suggested Fix**: Update the import to `import type { ResolvedUser } from '@/components/username-input';`
**Fixed in**: Updated `apps/web/components/resolved-user-card.tsx` to import `ResolvedUser` from the canonical `@/components/username-input` source.

---

### [F-070] `images.remotePatterns` hostname glob `**.twimg.com` is broader than needed

**File**: `apps/web/next.config.ts:10`
**Severity**: Low
**Description**: `**.twimg.com` allows image loading from any subdomain. Profile pictures only come from `pbs.twimg.com`. While `isTrustedProfilePictureUrl` provides defense in depth, the Next.js image proxy accepts any twimg subdomain.
**Suggested Fix**: Narrow to `hostname: 'pbs.twimg.com'`.
**Fixed in**: Restricted `images.remotePatterns` in `apps/web/next.config.ts` to `pbs.twimg.com` only.

---

### [F-071] `getIncomingPaymentsPage` over-fetches rows on subsequent scan iterations

**File**: `apps/web/lib/received-dashboard.ts:313`
**Severity**: Medium
**Description**: Each iteration of the scan loop fetched `limit + 1` rows from the database, even after previous batches had already contributed displayable items. That over-scanned the ledger on later iterations.
**Suggested Fix**: Compute the remaining number of rows needed per iteration and fetch only that amount.
**Fixed in**: Updated `apps/web/lib/received-dashboard.ts` to request only the remaining `limit + 1 - mappedItems.length` rows on each scan iteration, and adjusted `apps/web/lib/received-dashboard.test.ts` to assert the smaller second fetch.

---

### [F-072] Redundant double prune call in vault summary cache

**File**: `apps/web/lib/received-dashboard.ts:160,166`
**Severity**: Low
**Description**: `cacheReceivedVaultSummary` called `pruneReceivedVaultSummaryCache(now)` twice with the same timestamp, so the second pass re-scanned the full cache for no effect.
**Suggested Fix**: Remove the redundant second prune.
**Fixed in**: Removed the duplicate post-insert prune call from `apps/web/lib/received-dashboard.ts`; the cache is still swept before insertion and bounded by the existing size cap.

---

### [F-073] `PaymentTable` does not validate avatar image URLs through `isTrustedProfilePictureUrl`

**File**: `apps/web/components/payment-table.tsx:138-140,186-188`
**Severity**: Medium
**Description**: `PaymentTable` rendered `AvatarImage` from `row.counterpartyAvatarUrl` directly, unlike the other avatar-rendering components in the app.
**Suggested Fix**: Validate the avatar URL before rendering.
**Fixed in**: Added `isTrustedProfilePictureUrl()` checks in both the mobile and desktop `PaymentTable` avatar paths so only trusted image URLs reach `AvatarImage`.

---

### [F-074] Hardcoded dark-mode colors throughout new components break light mode

**File**: Multiple new components and pages
**Severity**: Medium
**Description**: A large set of newly added pages/components used white-alpha borders/backgrounds and hardcoded dark surfaces that only looked correct on dark backgrounds, leaving light mode with washed-out or nearly invisible surfaces.
**Suggested Fix**: Replace hardcoded values with theme-aware tokens or explicit dark-mode overrides.
**Fixed in**: Reworked the affected surfaces in `apps/web/app/page.tsx`, `apps/web/app/lookup/page.tsx`, `apps/web/app/claim/page.tsx`, `apps/web/app/dashboard/received/page.tsx`, `apps/web/app/dashboard/sent/page.tsx`, `apps/web/components/amount-input.tsx`, `apps/web/components/username-input.tsx`, `apps/web/components/coin-selector.tsx`, `apps/web/components/dashboard-tabs.tsx`, `apps/web/components/claim-stepper.tsx`, `apps/web/components/payment-table.tsx`, `apps/web/components/transaction-result.tsx`, `apps/web/components/ui/avatar.tsx`, and `apps/web/components/ui/table.tsx` to use semantic light-mode surfaces with dark-mode overrides instead of hardcoded dark-only colors.

---

### [F-075] `UsernameInput` clears resolved state redundantly in both `onChange` and debounce callback

**File**: `apps/web/components/username-input.tsx:52-55,122-126`
**Severity**: Low
**Description**: The input already cleared resolved state in `onChange`, then repeated the same clear when the debounced lookup began.
**Suggested Fix**: Keep the immediate clear in `onChange` and avoid the duplicate clear in the debounce callback.
**Fixed in**: Removed the redundant `setResolvedUser(null)` and `onResolvedChange(null)` calls from the debounced lookup path in `apps/web/components/username-input.tsx`, leaving a single clear point in `onChange`.

---

### [F-076] `coin-selector.tsx` badge uses theme-unaware `border-white/10`

**File**: `apps/web/components/coin-selector.tsx:46`
**Severity**: Low
**Description**: The "Sui settlement" badge border was effectively invisible in light mode because it used a white-alpha border.
**Suggested Fix**: Replace the hardcoded white border with a theme-aware border token.
**Fixed in**: Updated the `CoinSelector` badge in `apps/web/components/coin-selector.tsx` to use `border-border` in light mode with the previous white-alpha border preserved only behind `dark:`.

---

### [F-077] SendButton lacks AbortController — stale callbacks and non-cancellable confirm retries

**File**: `apps/web/components/send-button.tsx:30`
**Severity**: Medium
**Description**: `handleSend` issued sequential fetch calls to `/api/v1/payments/quote` and `confirmWithRetry` with no `AbortController`. If the user navigated away mid-transaction or the component unmounted, the fetch calls and retry loop continued running, and stale callbacks could still call `onError`/`onConfirm`.
**Suggested Fix**: Accept an `AbortSignal` in `confirmWithRetry`, pass it to confirm fetches, make the retry delay abortable, and abort the active request from component cleanup so stale callbacks stop on unmount.
**Fixed in**: Added request-scoped `AbortController` cleanup in `apps/web/components/send-button.tsx`, passed the signal through quote and confirm requests, made the confirm retry delay abortable, and guarded stale completion/error callbacks after unmount.

---

### [F-078] API error responses missing `Cache-Control: no-store` header

**File**: `apps/web/app/api/v1/lookup/x-username/route.ts:14`, `apps/web/app/api/v1/payments/incoming/route.ts:18`
**Severity**: Low
**Description**: The public lookup and incoming-payment endpoints already marked success responses `Cache-Control: no-store`, but several error paths still returned cacheable 404/429/500/503 responses.
**Suggested Fix**: Attach `Cache-Control: no-store` to all error responses on these public GET endpoints, including paths that also need to preserve existing headers such as `Retry-After`.
**Fixed in**: Added shared `withNoStore()` / `noStoreJson()` helpers in `apps/web/lib/api.ts`, switched both public GET routes to use them on error responses, and added focused route tests covering the merged `Retry-After` + `no-store` case and the 404 `no-store` case.

---

### [F-079] UsernameInput still calls old `/api/v1/resolve/x-username` — incomplete API migration

**File**: `apps/web/components/username-input.tsx:48`
**Severity**: High
**Description**: The send flow still resolved recipients through the legacy `POST /api/v1/resolve/x-username` path even though the newer `GET /api/v1/lookup/x-username` endpoint already backs the claim flow and carries the hardened public-lookup response shape.
**Suggested Fix**: Move `UsernameInput` onto `GET /api/v1/lookup/x-username?username=...`, keep the request cancellable, and map only the fields needed for the existing `ResolvedUser` contract.
**Fixed in**: Updated `apps/web/components/username-input.tsx` to fetch the new lookup endpoint with `URLSearchParams`, `cache: 'no-store'`, and a typed `PublicLookupResponse` to `ResolvedUser` mapping so the send flow no longer depends on the old resolve route.

---

### [F-080] Old resolve endpoint returns unsanitized `profilePicture` URL in API response

**File**: `apps/web/app/api/v1/resolve/x-username/route.ts:64`
**Severity**: Medium
**Description**: The legacy resolve route returned and persisted `userInfo.profilePicture` directly from the upstream lookup result, leaving the raw URL exposed on that API path.
**Suggested Fix**: Sanitize the profile picture URL inside the route before persistence and before building the JSON response.
**Fixed in**: Added a route-local sanitized `profilePicture` value in `apps/web/app/api/v1/resolve/x-username/route.ts`, used it for both the Prisma upsert and the API response, and added `apps/web/app/api/v1/resolve/x-username/route.test.ts` to lock the behavior.

---

### [F-081] `isTrustedProfilePictureUrl` uses `endsWith('.twimg.com')` instead of exact hostname

**File**: `apps/web/lib/transaction-history.ts:18`
**Severity**: Low
**Description**: The runtime profile-picture trust check accepted any HTTPS `*.twimg.com` hostname, which was broader than the exact `pbs.twimg.com` host already allowed by the app’s image configuration.
**Suggested Fix**: Match the runtime trust check to the image allowlist by accepting only the exact `pbs.twimg.com` hostname.
**Fixed in**: Tightened `isTrustedProfilePictureUrl()` in `apps/web/lib/transaction-history.ts` to require `https://pbs.twimg.com`, and added `apps/web/lib/transaction-history.test.ts` to cover the exact-host and sibling-subdomain cases.

---

### [F-082] Unsanitized `profilePicture` persisted to DB via `persistReceivedDashboardXUser`

**File**: `apps/web/lib/received-dashboard.ts:101`
**Severity**: Medium
**Description**: `persistReceivedDashboardXUser()` still compared and persisted the raw upstream `profilePicture` URL even though the public lookup response already sanitized that field before returning it to clients.
**Suggested Fix**: Sanitize the avatar URL before the freshness comparison and use the sanitized value for both the Prisma `update` and `create` branches.
**Fixed in**: Updated `apps/web/lib/received-dashboard.ts` to sanitize `profilePicture` once via `sanitizeProfilePictureUrl()` before freshness checks and before the Prisma upsert, and expanded `apps/web/lib/received-dashboard.test.ts` to cover both trusted and untrusted avatar cases.

---

### [F-083] `truncateAddress` crashes on null/undefined input

**File**: `apps/web/lib/received-dashboard-client.ts:25`
**Severity**: Medium
**Description**: `truncateAddress()` assumed a non-empty string and sliced directly, which made the helper brittle against missing or short address values.
**Suggested Fix**: Accept nullable input defensively, return an empty string for missing values, and leave already-short addresses unchanged.
**Fixed in**: Hardened `truncateAddress()` in `apps/web/lib/received-dashboard-client.ts` to handle `null`, `undefined`, and short addresses safely, and added `apps/web/lib/received-dashboard-client.test.ts` coverage for all three cases.

---

### [F-084] Claim and lookup page submit buttons not disabled during loading

**File**: `apps/web/app/claim/page.tsx:203`, `apps/web/app/lookup/page.tsx:122`
**Severity**: Low
**Description**: Both pages changed the submit label during an in-flight lookup but still allowed repeated clicks, which could burn redundant API requests until the current fetch finished.
**Suggested Fix**: Disable the submit button while the current lookup is pending.
**Fixed in**: Added `disabled={loadingLookup}` to the claim-page submit button in `apps/web/app/claim/page.tsx` and `disabled={loading}` to the lookup-page submit button in `apps/web/app/lookup/page.tsx`.

---

### [F-085] `TransactionResult` calls `getCoinLabel` without guard — crashes on unsupported coin types

**File**: `apps/web/components/transaction-result.tsx:20`
**Severity**: High
**Description**: `TransactionResult` still called `getCoinLabel()` directly even after coin-type formatting was tightened to throw for unsupported assets, which meant a malformed `coinType` could crash the post-send success state.
**Suggested Fix**: Guard the label lookup with the same display-support check already used elsewhere and provide a safe fallback label.
**Fixed in**: Updated `apps/web/components/transaction-result.tsx` to gate `getCoinLabel()` behind `isDisplaySupportedCoinType()` and fall back to `unsupported asset`, and added `apps/web/components/transaction-result.test.tsx` to verify the component no longer throws on unknown coin types.

---

### [F-086] Resolve endpoint (`POST /api/v1/resolve/x-username`) success response lacks `Cache-Control: no-store`

**File**: `apps/web/app/api/v1/resolve/x-username/route.ts:15`
**Severity**: Medium
**Description**: The legacy resolve route still returned cacheable JSON responses after `noStoreJson()` was introduced for the newer public lookup endpoints.
**Suggested Fix**: Route all resolve responses through the shared `noStoreJson()` helper.
**Fixed in**: Switched `apps/web/app/api/v1/resolve/x-username/route.ts` to use `noStoreJson()` for success and error responses, and extended `apps/web/app/api/v1/resolve/x-username/route.test.ts` to assert the `Cache-Control: no-store` header on success.

---

### [F-087] `UsernameInput` sends heavyweight lookup request for every debounced keystroke

**File**: `apps/web/components/username-input.tsx:47`
**Severity**: Medium
**Description**: The send flow had been moved to the full public lookup endpoint, which performs extra RPC and database work that the sender form does not actually need.
**Suggested Fix**: Restore the lightweight resolve path for `UsernameInput` now that the resolve route is sanitized and no-store, while keeping the heavier lookup endpoint for claim/lookup surfaces that need vault summary data.
**Fixed in**: Moved `apps/web/components/username-input.tsx` back to `POST /api/v1/resolve/x-username`, preserved abortable debounce behavior, and kept the newer consistency fix by using `normalizeUsernameInput(value)` for the derived `normalizedValue`.

---

### [F-088] `summarizeAmount` in sent dashboard crashes on malformed `amount` strings

**File**: `apps/web/app/dashboard/sent/page.tsx:18`
**Severity**: Medium
**Description**: `summarizeAmount()` converted every `item.amount` directly with `BigInt()`, so a malformed ledger amount could crash the whole sent dashboard summary.
**Suggested Fix**: Validate raw amount strings before converting them to `BigInt` and skip malformed values.
**Fixed in**: Added `parseLedgerAmount()` in `apps/web/app/dashboard/sent/page.tsx` and now ignore malformed amount strings when computing the summary totals instead of throwing.

---

### [F-089] Claim page `handleStepAction` for 'claim' step lacks sign-in precondition guard

**File**: `apps/web/app/claim/page.tsx:149`
**Severity**: Medium
**Description**: The claim-step handler relied on UI state alone and did not defensively re-check the X sign-in and wallet-connection prerequisites inside the action branch itself.
**Suggested Fix**: Add explicit `hasSignedInWithX` and `walletReady` guards before the claim preview branch proceeds.
**Fixed in**: Added precondition guards in `apps/web/app/claim/page.tsx` so the claim action now exits with a notice unless both X sign-in and wallet connection are satisfied.

---

### [F-090] Received dashboard submit button not disabled during loading

**File**: `apps/web/app/dashboard/received/page.tsx:180`
**Severity**: Low
**Description**: The received dashboard still allowed repeated “Load dashboard” submissions while the current lookup was in flight.
**Suggested Fix**: Disable the submit button while `loading` is true.
**Fixed in**: Added `disabled={loading}` to the received-dashboard submit button in `apps/web/app/dashboard/received/page.tsx`.

---

### [F-091] `UsernameInput` `normalizedValue` uses weaker normalization than `normalizeUsernameInput`

**File**: `apps/web/components/username-input.tsx:85`
**Severity**: Low
**Description**: The component derived `normalizedValue` with a weaker one-`@` / trim-only transform than the canonical username normalization helper used everywhere else in the same component.
**Suggested Fix**: Use `normalizeUsernameInput(value)` for the derived `normalizedValue` as well.
**Fixed in**: Updated `apps/web/components/username-input.tsx` to derive `normalizedValue` with `normalizeUsernameInput(value)`, matching the component’s input and request normalization path.

---

### [F-092] `defaultCoinType` may produce malformed coin type from whitespace-only `NEXT_PUBLIC_PACKAGE_ID`

**File**: `apps/web/lib/coins.ts:7`
**Severity**: Low
**Description**: `getTestUsdcCoinType()` treated whitespace-only package ids as truthy and could build malformed `TEST_USDC` coin-type strings.
**Suggested Fix**: Trim the package id before the truthy check.
**Fixed in**: Updated `apps/web/lib/coins.ts` to trim `packageId` before constructing the test-USDC coin type and added `apps/web/lib/coins.test.ts` coverage for whitespace-only input.

---

### [F-093] Claim page `handleStepAction` timeouts not cleaned up on unmount

**File**: `apps/web/app/claim/page.tsx:28`
**Severity**: Low
**Description**: The simulated sign-in and claim delays used bare `setTimeout` promises with no cleanup, which left pending timers alive after unmount.
**Suggested Fix**: Track the active timeout and clear it during effect cleanup, or replace the raw timeout with a cleanup-aware helper.
**Fixed in**: Added a shared `stepTimeoutRef` / `waitForStepDelay()` helper in `apps/web/app/claim/page.tsx` and clear the active timeout on unmount so the preview-step timers no longer survive the page lifecycle.

---

### [F-094] Sent dashboard retry/load-more calls lack AbortController

**File**: `apps/web/app/dashboard/sent/page.tsx:294,325`
**Severity**: Medium
**Description**: The retry button and "Load more" button both called `fetchHistory()` without an abort signal, so unmounts or wallet switches could leave stale requests alive until completion.
**Suggested Fix**: Store the active AbortController in a ref that covers every history request path and abort it on unmount and wallet changes.
**Fixed in**: Added a shared `requestControllerRef` in `apps/web/app/dashboard/sent/page.tsx`, routed initial load, retry, and load-more through it, and now abort the active request during cleanup and account resets.

---

### [F-095] Received dashboard does not clear `data` on new search

**File**: `apps/web/app/dashboard/received/page.tsx:55-98`
**Severity**: Medium
**Description**: `handleSubmit()` cleared `activeHandle` but left the previous `data` payload in place, so the old payments table stayed visible while the next search loaded.
**Suggested Fix**: Clear `data` alongside `activeHandle` at the start of a new lookup.
**Fixed in**: Added `setData(null)` at the start of `handleSubmit()` in `apps/web/app/dashboard/received/page.tsx` so a new search no longer flashes stale dashboard content.

---

### [F-096] Claim page `waitForStepDelay` concurrent calls overwrite timeout state

**File**: `apps/web/app/claim/page.tsx:47-54`
**Severity**: Medium
**Description**: Rapid repeated step actions could overwrite the pending delay state, leaving the earlier async path orphaned.
**Suggested Fix**: Make delayed step actions cancellable and sequence-aware instead of storing a single raw timeout id.
**Fixed in**: Replaced the claim-step timeout bookkeeping in `apps/web/app/claim/page.tsx` with abortable per-action controllers plus a request id guard, so a new step action now cancels and supersedes any previous delayed run cleanly.

---

### [F-097] Claim page step delay returns a never-resolving Promise on unmount

**File**: `apps/web/app/claim/page.tsx:47-54`
**Severity**: Medium
**Description**: Clearing the timeout on unmount left the awaiting `waitForStepDelay()` Promise pending forever.
**Suggested Fix**: Reject the delay Promise when the component or action is aborted.
**Fixed in**: Updated `waitForStepDelay()` in `apps/web/app/claim/page.tsx` to accept an `AbortSignal`, reject with `AbortError` on cancellation, and abort outstanding step delays during lookup resets and unmount cleanup.

---

### [F-098] Lookup page does not clear `result` on new search

**File**: `apps/web/app/lookup/page.tsx:39-91`
**Severity**: Low
**Description**: The previous lookup result stayed rendered until the next request finished because `setResult(null)` only ran on validation failure or fetch error.
**Suggested Fix**: Clear the current result before starting a fresh lookup request.
**Fixed in**: Added `setResult(null)` before the new request starts in `apps/web/app/lookup/page.tsx`, so successful follow-up searches no longer flash stale data while loading.

---

### [F-099] `PaymentTable` computes virtualization windows even when virtualization is off

**File**: `apps/web/components/payment-table.tsx:112-129`
**Severity**: Low
**Description**: The component eagerly computed visible windows and sliced rows even when `shouldVirtualize` was false.
**Suggested Fix**: Only compute the virtualization window when virtualization is active.
**Fixed in**: Gated `getVisibleWindow()` and the derived row slicing behind `shouldVirtualize` in `apps/web/components/payment-table.tsx`, leaving the non-virtualized render path free of that extra work.

---

### [F-100] Received dashboard uses unsafe type assertions for Sui object responses

**File**: `apps/web/lib/received-dashboard.ts:248-254`
**Severity**: Low
**Description**: The vault summary path manually cast the Sui object response into ad hoc shapes for `data` and `error.code`.
**Suggested Fix**: Use the SDK's typed response object directly.
**Fixed in**: Imported `SuiObjectResponse` from `@mysten/sui/jsonRpc` in `apps/web/lib/received-dashboard.ts` and now read `data` / `error?.code` through the SDK type instead of unchecked local assertions.

---

### [F-101] `TransactionResult` amount type does not clarify display-vs-base-unit semantics

**File**: `apps/web/components/transaction-result.tsx:40`
**Severity**: Low
**Description**: `TransactionResultData.amount` is a plain `string`, but this component expects the send form's already formatted display value rather than raw base units.
**Suggested Fix**: Add a doc comment clarifying the field semantics or rename the property.
**Fixed in**: Added an inline type comment on `TransactionResultData.amount` in `apps/web/components/transaction-result.tsx` to document that the value is pre-formatted for display.

---

### [F-102] TEST_USDC display whitelist still accepts spoofed package IDs

**File**: `apps/web/lib/coins.ts:28`
**Severity**: Medium
**Description**: `getCoinLabel()`, `getCoinDecimals()`, and `isDisplaySupportedCoinType()` still accept any coin type whose suffix is `::test_usdc::TEST_USDC`. A malicious sender can deposit a different package's look-alike token into a recipient vault, and the public lookup / incoming-payment dashboards will format it as legitimate `TEST_USDC` instead of rejecting it.
**Suggested Fix**: Resolve the configured TEST_USDC type with `getTestUsdcCoinType()` and require exact equality in the display helpers, rather than matching any package that ends with the TEST_USDC suffix.
**Fixed in**: Tightened `apps/web/lib/coins.ts` so display helpers only accept the exact configured TEST_USDC package id, and added regression coverage in `apps/web/lib/coins.test.ts` to reject spoofed package-suffix lookalikes.

---

### [F-103] 24-hour X-user cache can route payments to a reassigned handle

**File**: `apps/web/lib/x-user-lookup.ts:10`
**Severity**: High
**Description**: `resolveFreshXUser()` now trusts any cached `xUser` row updated within the last 24 hours before it asks X for the current owner of the handle. That helper is on the payment path for both `POST /api/v1/resolve/x-username` and `POST /api/v1/payments/quote`. If an X handle is renamed or reassigned during that window, the cached stale `xUserId` is reused, the app derives the previous owner’s vault address, and the sender can quote and send funds to the wrong recipient. The helper comment still describes this cache as protection for back-to-back lookups in the same client flow, which a one-day TTL no longer satisfies.
**Suggested Fix**: Keep the cache window short for payment-critical lookups (seconds or a few minutes), or force a live revalidation before deriving a vault address / issuing a payment quote.
**Fixed in**: Restored the `resolveFreshXUser()` cache TTL in `apps/web/lib/x-user-lookup.ts` to 60 seconds so payment-critical lookups only reuse very recent handle ownership data.

---

### [F-104] Redis readiness failures now block every rate-limited API as a fake 429

**File**: `apps/web/lib/rate-limit.ts:88`
**Severity**: High
**Description**: `rateLimit()` now returns `allowed: false` whenever Redis is not yet `ready` or the Lua script throws. All callers treat that the same as an actual quota hit and return `429 Rate limit exceeded`, so a Redis cold start, reconnect, or transient outage now hard-fails core flows like username resolve, quote creation, wallet-auth challenge, payment confirm, history, and public lookup even when the user has made zero requests. Because `getRedis()` constructs the client lazily and `rateLimit()` checks `redis.status` immediately, the first requests after process start are especially likely to be rejected before Redis becomes ready.
**Suggested Fix**: Do not collapse infrastructure failure into quota exhaustion. Either keep limiter failures fail-open as before, or return a distinct unavailable state so callers can emit `503` and preserve valid traffic when Redis is merely unhealthy.
**Fixed in**: Restored fail-open behavior in `apps/web/lib/rate-limit.ts` for Redis-not-ready and Redis-eval failure cases so infrastructure issues no longer surface as fake `429 Rate limit exceeded` responses.

---

### [F-105] Editing the handle no longer cancels the in-flight send target

**File**: `apps/web/components/send-button.tsx:124`
**Severity**: High
**Description**: Recipient resolution now happens inside `handleSend()`, but the request controller is only aborted on unmount or when another send starts. If the user clicks send for `@alice` and then edits the visible handle to `@bob` while the resolve, quote, or wallet-sign flow is still in flight, the transaction continues against the old `normalizedUsername` captured at click time. That reintroduces the same misdirected-send class that an earlier handle-edit fix in this batch had already addressed: the form can show one handle while the payment still targets another recipient.
**Suggested Fix**: Abort the active send whenever the handle changes, or lock the recipient field once sending starts and keep an explicit immutable recipient preview visible until the flow completes.
**Fixed in**: Added parent-managed send state in `apps/web/app/page.tsx`, wired `apps/web/components/send-button.tsx` to report when a send is in flight, and disabled `apps/web/components/username-input.tsx` during that window so the visible recipient cannot diverge from the active send target.

---

### [F-106] Handle edits no longer clear failed recipient-lookup errors

**File**: `apps/web/app/page.tsx:42`
**Severity**: Low
**Description**: The refactor removed `UsernameInput`'s local resolve/error state and now reports lookup failures through `sendError` in `HomePage`, but typing a new handle only updates `username`. After a failed `resolve/x-username` response such as `User not found on X`, the stale error banner keeps showing while the user corrects the handle, so the form still looks invalid even when the current input may now be fine. Previously those lookup errors were cleared immediately on edit inside `UsernameInput`.
**Suggested Fix**: Clear `sendError` whenever the handle changes, or keep recipient-resolution errors local to the handle field so they reset with the current input.
**Fixed in**: Routed handle edits through `handleUsernameChange()` in `apps/web/app/page.tsx`, which now clears `sendError` before storing the next username value.

---

### [F-107] Sending flow still allows the visible amount and asset to diverge from the actual transfer

**File**: `apps/web/app/page.tsx:103`, `apps/web/components/send-button.tsx:157`
**Severity**: Medium
**Description**: The latest fix freezes `UsernameInput` while a send is in flight, but `AmountInput` and `CoinSelector` remain editable. `handleSend()` captures `amount`, `coinType`, and `baseAmount` at click time, then continues through resolve, quote, wallet-sign, and confirm with those original values. If the user changes the visible amount or asset while the request is in flight, the form can show one set of values while the wallet prompt and actual transfer still use the earlier ones.
**Suggested Fix**: Freeze `AmountInput` and `CoinSelector` for the duration of the send flow as well, or abort and restart the in-flight send whenever either value changes.
**Fixed in**: Added `disabled` support to `apps/web/components/amount-input.tsx` and `apps/web/components/coin-selector.tsx`, then wired `apps/web/app/page.tsx` to lock both controls whenever `isSending` is true so the on-screen amount and asset stay aligned with the in-flight send parameters.

---

### [F-108] Quote route test leaks env state into the rest of the suite

**File**: `apps/web/app/api/v1/payments/quote/route.test.ts:80`
**Severity**: Low
**Description**: The new test sets `process.env.TWITTER_API_KEY`, `process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID`, and `process.env.HMAC_SECRET` in `beforeEach()` but never restores the previous values. Because Vitest files can share a worker process, later tests can inherit these vars and incorrectly miss configuration-error paths or fail depending on execution order, which makes the suite order-dependent.
**Suggested Fix**: Snapshot and restore the touched env vars in `afterEach()`/`afterAll()`, or use `vi.stubEnv()` with `vi.unstubAllEnvs()` so the test does not leak global process state.
**Fixed in**: Switched `apps/web/app/api/v1/payments/quote/route.test.ts` to `vi.stubEnv()` in `beforeEach()` and added `vi.unstubAllEnvs()` in `afterEach()` so the test no longer leaks env mutations into later Vitest workers.

---

### [F-109] Sequential double X API resolution per send — redundant Twitter lookup

**File**: `apps/web/components/send-button.tsx:190`, `apps/web/app/api/v1/payments/quote/route.ts:106`
**Severity**: Medium
**Description**: The refactored send flow resolves the X username client-side via `POST /api/v1/resolve/x-username` (step 1), then sends the resolved username to `POST /api/v1/payments/quote` (step 2), which calls `resolveFreshXUser()` again server-side. Every send triggers two Twitter API lookups for the same user. The `resolveFreshXUser` 60-second cache may absorb the second call, but if the two requests straddle a cache boundary or the resolve-to-quote latency exceeds the cache window, external API consumption doubles and the user experiences extra latency from the sequential round-trips.
**Suggested Fix**: Either pass the resolved `xUserId` from step 1 into the quote request so the quote endpoint can skip the redundant lookup when a valid ID is provided, or remove the separate resolve call and let the quote endpoint be the single resolver.
**Fixed in**: Simplified `apps/web/components/send-button.tsx` so the send flow no longer calls `/api/v1/resolve/x-username` first. The button now sends the normalized handle directly to `/api/v1/payments/quote`, making the quote endpoint the single server-side resolver for this flow.

---

### [F-110] Resolve and quote response shapes cast without runtime validation

**File**: `apps/web/components/send-button.tsx:206`, `apps/web/components/send-button.tsx:233`
**Severity**: Medium
**Description**: The resolve response is cast with `as ResolvedUser` (line 206) and the quote response with `as { quoteToken: string; vaultAddress: string }` (line 233), both without any runtime field checks. If either endpoint changes its response shape, or if a proxy/CDN injects an unexpected response, the code proceeds with potentially undefined fields. The critical path is `resolvedUser.username` (sent to the quote endpoint) and `quote.vaultAddress` (used to build the on-chain transfer). A missing `vaultAddress` would cause the Sui transaction to target an undefined address; a missing `quoteToken` would fail at the confirm step with a confusing error.
**Suggested Fix**: Add minimal runtime checks before proceeding:
```ts
const resolvedUser = (await resolveRes.json()) as ResolvedUser;
if (!resolvedUser?.username || !resolvedUser?.vaultAddress) {
  onError('Unexpected resolve response');
  return;
}
```
And for the quote:
```ts
if (!quote?.quoteToken || !quote?.vaultAddress) {
  onError('Invalid quote response');
  return;
}
```
**Fixed in**: Removed the unsafe resolve-response cast by collapsing the send flow to a single quote call, and added `parseQuoteResponse()` in `apps/web/components/send-button.tsx` to require `username`, `quoteToken`, and `vaultAddress` before proceeding to transaction construction.

---

### [F-111] Quote route test has no negative test case for invalid sender address

**File**: `apps/web/app/api/v1/payments/quote/route.test.ts`
**Severity**: Low
**Description**: The new test file contains a single test case that verifies short-form address normalization succeeds. There is no negative test for an invalid `senderAddress` (e.g., `"not-a-sui-address"`) to verify that `parseSuiAddress` correctly rejects it and returns 400. The `parseSuiAddress` function is the key change in this route — validating both the happy and unhappy paths is important for regression coverage.
**Suggested Fix**: Add a negative test:
```ts
it('rejects invalid sender addresses', async () => {
  const req = new NextRequest('http://localhost/api/v1/payments/quote', {
    method: 'POST',
    body: JSON.stringify({
      username: 'alice',
      coinType: '0x2::sui::SUI',
      amount: '1000000000',
      senderAddress: 'not-a-sui-address',
    }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});
```
**Fixed in**: Added an invalid-address regression test to `apps/web/app/api/v1/payments/quote/route.test.ts` and asserted that the route returns `400` before rate limiting or X-user resolution runs.

---

### [F-112] Redundant disabled guard inside CoinSelector onClick handler

**File**: `apps/web/components/coin-selector.tsx:68`
**Severity**: Low
**Description**: The `onClick` handler has an explicit `if (disabled) return` guard on line 68, but the `<Button>` element already receives `disabled={disabled}` on line 66. When a native HTML button is disabled, browsers do not fire click events. The manual guard is dead code in practice.
**Suggested Fix**: Remove the redundant check:
```tsx
onClick={() => onValueChange(option.value)}
```
Or keep it with a comment if it is intentional defense-in-depth.
**Fixed in**: Removed the dead `disabled` branch from `apps/web/components/coin-selector.tsx` and left the control state to the existing `Button disabled={disabled}` prop.

---

### [F-113] No pre-send recipient confirmation after removing client-side resolution

**File**: `apps/web/components/send-button.tsx:214`, `apps/web/components/username-input.tsx`
**Severity**: Medium
**Description**: The refactored send flow resolves the recipient server-side during the quote step, which happens after the user clicks "Send." The old `UsernameInput` showed a loading spinner, avatar, verified badge, and vault address, giving the user visual confirmation of the resolved recipient before committing. Now the first feedback about whether the handle exists or resolved to the expected person comes from the quote API response — but that response is consumed internally by `SendButton` and never shown to the user before the wallet prompt. The resolved `username` only surfaces in the success screen. A mistyped handle (e.g., `alicee` instead of `alice`) that resolves to a different valid X user would proceed to the wallet signature without the sender realizing the mistake. The wallet popup shows only the raw vault address, not the human-readable recipient.
**Suggested Fix**: After the quote response returns and before building the transaction, show a brief confirmation step (e.g., a modal or inline card) displaying the resolved username, avatar, and vault address. Alternatively, re-introduce a lightweight pre-send resolution that shows the resolved identity in the form (without blocking on it for the send action).
**Fixed in**: Added `apps/web/components/recipient-confirmation-modal.tsx` and wired `apps/web/components/send-button.tsx` to pause after quote creation, display the resolved username/avatar/verified state/vault address, and only open the wallet flow after the sender explicitly confirms the recipient.

---

### [F-114] Dead code: `ResolvedUser` type export and `resolved-user-card.tsx` / `handle-input.tsx` components

**File**: `apps/web/components/username-input.tsx:8-15`, `apps/web/components/resolved-user-card.tsx`, `apps/web/components/handle-input.tsx`
**Severity**: Low
**Description**: `UsernameInput` still exports the `ResolvedUser` type, and `resolved-user-card.tsx` imports it. Neither `resolved-user-card.tsx` nor `handle-input.tsx` is imported by any live application code (only by plan docs under `docs/plans/`). After the refactor that removed client-side resolution from `UsernameInput`, these components and the exported type are dead code that adds confusion about which components are canonical.
**Suggested Fix**: Remove `ResolvedUser` from `username-input.tsx`, delete `resolved-user-card.tsx` and `handle-input.tsx` if they are not part of an active plan, or move `ResolvedUser` to a shared types file if it will be needed for a future recipient-confirmation step.
**Fixed in**: Moved the live recipient-preview type into `apps/web/lib/resolved-user.ts`, removed the stale export from `apps/web/components/username-input.tsx`, simplified `apps/web/components/resolved-user-card.tsx` into the active preview card used by the confirmation modal, and deleted the unused `apps/web/components/handle-input.tsx`.

---

### [F-115] `SendButton` button label says "Sending payment" during quote resolution

**File**: `apps/web/components/send-button.tsx:317-320`
**Severity**: Low
**Description**: When the user clicks "Send", the button immediately shows "Sending payment" with a spinner. However, the actual flow is: (1) fetch quote from server (1-3s including Twitter API resolution), (2) build transaction, (3) wallet prompt. The "Sending payment" label during step 1 is misleading — the payment hasn't started yet; the system is resolving the recipient. This is a minor UX clarity issue, not a bug.
**Suggested Fix**: Use a two-phase label: "Resolving recipient..." during the quote fetch, switching to "Sending payment" after the wallet signature begins.
**Fixed in**: Added explicit send stages in `apps/web/components/send-button.tsx` so the button now shows `Resolving recipient`, `Review recipient`, `Approve in wallet`, and `Sending payment` at the appropriate points in the flow.

---

### [F-116] Direct-transfer note compares against lifetime ledger totals, not current claimable balance

**File**: `apps/web/lib/received-dashboard.ts:51`, `apps/web/lib/received-dashboard-client.ts:70`
**Severity**: Low
**Description**: `getRecordedTotals()` sums every historical `payment_ledger` row for the X user, and `untrackedBalanceNote()` subtracts that lifetime total from the vault's current on-chain balance. After any previous claim/sweep, those two numbers diverge: old confirmed payments stay in `payment_ledger`, but they are no longer in the vault. That makes the new note under-report or completely hide direct-transfer balances for handles with prior claim history, even though the visible pending balance still includes those coins.
**Suggested Fix**: Compare against the current app-tracked balance per coin, not the lifetime inflow total. If the backend does not yet persist claim/sweep outflows, avoid rendering an exact `Includes X from direct transfers` amount and use softer copy until that state exists.
**Fixed in**: Updated `untrackedBalanceNote()` in `apps/web/lib/received-dashboard-client.ts` to suppress the exact direct-transfer amount unless the vault is still `UNCLAIMED`, and wired the lookup/received dashboard pages to pass `claimStatus`. That keeps the exact delta on the only state where lifetime recorded totals still match the current unswept balance, and avoids misleading amounts after claim/sweep history exists.

---

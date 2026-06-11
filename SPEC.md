## Goal

Migrate Levo's Sui funds flows to Sui Address Balances for user-facing settlement and preferred sponsored gas, while keeping legacy Coin<SUI> gas as an explicit fallback.

## Scope

- `apps/web` payments send/confirm.
- `apps/web` Earn stake/claim/withdraw transaction construction and settlement.
- `apps/web` 7K swap transaction construction and execute route.
- Agent executor and live dry-run sponsored gas build paths.
- Gas station health/status/funding scripts and docs.
- Root `SPEC.md` / `PLAN.md` updates for this migration.

## Non-Goals

- No Prisma schema changes.
- No REST request/response shape changes.
- No Move package changes unless verification proves they are required.
- No dependency upgrade from the current `@mysten/sui` version.
- No removal of legacy Coin<SUI> gas fallback or merge tooling in this pass.

## Public Interfaces

- New helper module:
  - `apps/web/lib/address-balance.ts`
- Settlement behavior:
  - User-facing payment recipient, Earn payout/withdraw recipient, and swap output recipient receive funds through `0x2::coin::send_funds<T>`.
  - Protocol-required inputs still use SDK coin construction/selection.
- Gas behavior:
  - Sponsored transactions prefer address-balance gas when `enable_address_balance_gas_payments` is enabled and sponsor SUI addressBalance is funded.
  - Fallback rebuilds a fresh transaction and uses legacy sponsor Coin<SUI> gas.
- Ops behavior:
  - `/api/health` reports signer validity, address-balance gas readiness, and fallback availability.
  - `gas-station:status` reports feature flag, total SUI, addressBalance, coinBalance, and legacy coin fragmentation.
  - `gas-station:merge` remains a fallback/legacy maintenance tool.

## Acceptance

1. `payments/send` builds settlement with `coin::send_funds<T>` and sponsored builds set `setGasPayment([])` when Address Balance gas is available.
2. `payments/confirm` accepts matching positive recipient `balanceChanges` without requiring `objectChanges`, and falls back to matching accumulator `merge` events when RPC `balanceChanges` are absent.
3. Payment confirmation still rejects sender, recipient, coin type, and amount mismatches.
4. Earn stake still passes Coin input to StableLayer; Earn principal withdrawal and claim payout settle to the user's address balance.
5. Swap input still passes Coin input to 7K; swap output settles to the user's address balance.
6. Agent executor and live dry-run sponsored builds use the shared gas preference helper.
7. Gas station health/status/docs no longer present coin fragmentation as the primary funding model; fallback remains explicit.
8. Verification commands pass:
   - `pnpm --filter web exec vitest run`
   - `pnpm --filter web typecheck`
   - `pnpm --filter web build`

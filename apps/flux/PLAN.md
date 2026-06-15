# Flux Destination Chain Selector Plan

## 1. Baseline

- Confirm `apps/flux` dirty baseline and avoid unrelated files.
- Read `ChainAbstractionController`, `ChainChip`, `useBestRoute`, chain/token stores, widget cache sync, and existing chain-first E2E coverage.

## 2. Tests First

- Add pure logic coverage in `ChainAbstractionController/selection.spec.ts` for:
  - destination override wins over auto best route;
  - invalid or disallowed destination override is cleared;
  - destination options are built from asset instances and route candidates by `toToken.chainId`;
  - allowed destination chain constraints filter options.
- Extend `tests/chainFirstTokenSelection.spec.ts` for:
  - selecting a multi-chain destination asset renders `Destination chain`;
  - selecting a destination chain writes the new `toChain` to the URL and updates the To picker chain;
  - `?toChain=...&toToken=...` hydrates the selector.

## 3. Implementation

- Add destination-chain helper functions next to the existing initial selection helpers.
- Add `toChainOverride` state to `ChainAbstractionController`.
- Hydrate destination override from URL/store/config when available.
- Compute `effectiveToChainId = toChainOverride ?? autoToChainId ?? firstAllowedDestinationInstance`.
- Reset destination override when the destination asset changes or assets are reversed.
- Clear destination override when it is no longer part of the selected asset or allowed destination constraints.
- Render `ChainChip` with label `Destination chain` for multi-chain destination options and preserve best-rate status via route candidate metadata.

## 4. Verification

- Run targeted unit tests:
  - `pnpm --dir apps/flux test:unit -- src/components/Widgets/ChainAbstractionController/selection.spec.ts src/hooks/useBestRoute.spec.ts src/components/Widgets/chainTokenFormSync.spec.ts`
- Run typecheck:
  - `pnpm --dir apps/flux typecheck`
- Run targeted E2E:
  - `pnpm --dir apps/flux test:ci:e2e -- tests/chainFirstTokenSelection.spec.ts`
- If rendered E2E cannot run because of local environment constraints, report the exact blocker and keep unit/typecheck evidence separate.

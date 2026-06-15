# Flux Destination Chain Selector Plan

## 1. Baseline

- Confirm `apps/flux` dirty baseline and avoid unrelated files.
- Read `ChainAbstractionController`, `ChainChip`, `useBestRoute`, `useUrlParams`, `useBridgeConditions`, chain/token stores, widget cache sync, and existing chain-first E2E coverage.

## 2. Tests First

- Add pure logic coverage in `ChainAbstractionController/selection.spec.ts` for:
  - destination override wins over auto best route even outside receivable wallet types;
  - invalid or disallowed destination override is cleared;
  - auto destination fallback uses receivable chains when there is no manual override;
  - destination options are built from asset instances and route candidates by `toToken.chainId`;
  - options include Solana USDC even when the receivable set only contains Sui;
  - quote destination ids merge receivable ids with the manual override.
- Add URL/parser and address coverage:
  - `useUrlParams.spec.ts` preserves Sui native token query params containing `::`;
  - `useBridgeConditions.spec.ts` detects stale auto `toAddress` without treating user-entered addresses as stale.
- Extend `tests/chainFirstTokenSelection.spec.ts` for:
  - `/en` From search `SUI`, select native SUI / Source chain `Sui`;
  - To search `USDC`, Destination chain menu contains `Solana`;
  - selecting Solana writes `toChain` / `toToken` to the URL and updates the To picker chain;
  - `?fromChain=9270000000000000&fromToken=0x...::sui::SUI&toChain=1151111081099710&toToken=EPjFWdd5...` hydrates the selectors.

## 3. Implementation

- Split destination-chain helper functions next to the existing initial selection helpers:
  - all destination instances for display/manual selection;
  - receivable destination instances for auto default only;
  - quote destination ids for fanout, adding the manual override when present.
- Add `toChainOverride` state to `ChainAbstractionController`.
- Hydrate source and destination selections from current URL params first, then store/config.
- Compute `effectiveToChainId` from valid manual override, then auto route constrained by receivable chains, then first receivable destination.
- Reset destination override when the destination asset changes or assets are reversed.
- Clear destination override only when it is no longer part of the selected asset.
- Render `ChainChip` with label `Destination chain` for multi-chain destination options and preserve best-rate status via route candidate metadata.
- Clear stale auto `toAddress` when destination switches to a chain type with no auto wallet address; preserve user-entered addresses.

## 4. Verification

- Run targeted unit tests:
  - `pnpm --dir apps/flux test:unit -- src/components/Widgets/ChainAbstractionController/selection.spec.ts src/hooks/useBestRoute.spec.ts src/components/Widgets/chainTokenFormSync.spec.ts src/hooks/useUrlParams.spec.ts src/hooks/useBridgeConditions.spec.ts`
- Run typecheck:
  - `pnpm --dir apps/flux typecheck`
- Run targeted E2E:
  - `pnpm --dir apps/flux test:ci:e2e -- tests/chainFirstTokenSelection.spec.ts`
- If rendered E2E cannot run because of local environment constraints, report the exact blocker and keep unit/typecheck evidence separate.

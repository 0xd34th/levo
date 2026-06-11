1. Add failing unit coverage for Address Balance gas and settlement:
   - helper feature/balance detection, `setGasPayment([])`, fallback rebuild, and `coin::send_funds`;
   - payment confirmation with no Coin object transfer;
   - payment accumulator event fallback;
   - Earn and swap output settlement;
   - agent dry-run sponsor gas preference;
   - gas station status/health output.
2. Add `apps/web/lib/address-balance.ts`:
   - read `enable_address_balance_gas_payments`;
   - read sponsor SUI `addressBalance`/`coinBalance`;
   - apply empty gas payment for Address Balance gas;
   - rebuild via callback for legacy fallback;
   - wrap `0x2::coin::send_funds<T>`.
3. Migrate payments:
   - `payments/send` uses `coinWithBalance` for input and `coin::send_funds` for recipient settlement;
   - sponsored build uses the shared gas preference helper;
   - `payments/confirm` validates sender and recipient amount via `balanceChanges` or accumulator merge events.
4. Migrate Earn and Swap:
   - Earn protocol inputs remain Coin inputs;
   - Earn claim payout and withdraw principal use `send_funds`;
   - 7K swap input remains Coin input and swap output uses `send_funds`;
   - sponsored user builds use Address Balance gas preference.
5. Migrate Agent gas build paths:
   - executor uses shared gas preference helper for sponsored execution;
   - live dry-run uses the same helper for sponsor signing checks.
6. Update ops and docs:
   - `/api/health` reports Address Balance gas readiness and fallback availability;
   - `gas-station:status` reports feature flag, addressBalance, coinBalance, total SUI, and legacy coin details;
   - `fund-gas-station` funds sponsor address balance;
   - README, `apps/web/README.md`, and `.env.example` describe the new funding model.
7. Run verification and fix failures:
   - targeted Vitest for modified surfaces;
   - `pnpm --filter web exec vitest run`;
   - `pnpm --filter web typecheck`;
   - `pnpm --filter web build`.

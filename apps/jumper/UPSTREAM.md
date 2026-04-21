## Upstream

- Source repository: `https://github.com/jumperexchange/jumper-exchange`
- Vendored into: `apps/jumper`
- Imported upstream commit: `ba27ccdcbd79e907ae8bda0570dc7b15d14df871`

## Local Fork Scope

This fork keeps the upstream Jumper UI as the execution surface, but replaces wallet UX with a Privy-backed account model:

- Privy authentication only: `email` and `google`
- Canonical embedded wallets per account: `ethereum`, `solana`, `sui`, `bitcoin-segwit`
- LI.FI wallet contexts are auto-populated from the current Privy account
- Destination `toAddress` auto-fills from the same account on the selected target chain
- Wallet menu is replaced by an account drawer rather than an external-wallet picker

## Sync Rules

When rebasing this fork on a newer upstream snapshot:

1. Re-vendor upstream into `apps/jumper`
2. Re-apply `src/providers/WalletProvider/*` Privy integration
3. Re-apply `src/lib/privy/*`, `src/hooks/useWalletFleet.ts`, and `/api/privy/*`
4. Re-verify wallet auto-fill behavior for EVM, Solana, Sui, and Bitcoin
5. Re-run `pnpm --dir apps/jumper typecheck` and relevant unit tests

## Notes

- `apps/web` is intentionally left untouched.
- This fork is vendored directly; it is not a git submodule.

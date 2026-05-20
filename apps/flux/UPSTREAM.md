## Upstream

- Source repository: `https://github.com/jumperexchange/jumper-exchange`
- Vendored into: `apps/jumper`
- Imported upstream commit: `ba27ccdcbd79e907ae8bda0570dc7b15d14df871`

## Local Fork Scope

This fork keeps the upstream Jumper UI as the execution surface, but replaces wallet UX with a Privy-backed account model:

- Privy is scoped to **identity verification only**: `email` and `google` (`loginMethods: ['email', 'google']`, `externalWallets.disableAllExternalWallets: true`). The Privy popup never offers wallet entries — those live exclusively in the custom `LoginModal`'s Sui dapp-kit list
- Canonical embedded wallets per account: `ethereum`, `solana`, `sui`, `bitcoin-segwit`
- LI.FI wallet contexts are auto-populated from the current Privy account
- Destination `toAddress` auto-fills from the same account on the selected target chain
- Wallet menu is replaced by an account drawer; the only external-wallet entry surfaced anywhere in the UI is Sui via `@mysten/dapp-kit-react`

### Sui external-wallet support (orthogonal to Privy)

Jumper additionally supports a Sui-only session via `@mysten/dapp-kit-react`'s `DAppKitProvider`, in parallel to Privy. The two sessions are deliberately orthogonal:

- A user may have neither, only one, or both sessions active at the same time
- They are NEVER merged into a single user identity (no backend linkage)
- "Sui-only session" = `useCurrentAccount()` from dapp-kit; persistence is dapp-kit's localStorage `mysten-dapp-kit:selected-wallet-and-address` key. There is no SIWS endpoint
- Sui signing routing (always): external dapp-kit wallet > Privy embedded Sui — see `selectSuiSession.ts` and `dappKitSignerProviders.ts`
- Destination `toAddress` for Sui follows the same priority via `useWalletFleetAddress`. EVM/SOL destinations still rely on Privy embedded wallets; Sui-only users must enter `toAddress` manually for those chains
- Login UX is gated by a custom chooser modal (`src/components/LoginModal/`). Two CTAs delegate to Privy or to dapp-kit respectively; the modal auto-closes on successful authentication from either side
- The account drawer (`src/components/Menus/WalletMenu/`) renders a dedicated "External Sui wallet" panel when dapp-kit reports a connected account; logging out of Privy never disconnects dapp-kit, and disconnecting Sui never logs out of Privy
- Future identity merging (e.g. Sui-only user adding email later → unified account) is explicitly out of scope and will require a deliberate product decision

In-flight swap caveat: a Sui swap captured in the LI.FI executor continues to use the signer it was instantiated with. Switching wallets mid-execution is not aborted; new submissions use the new signer.

## Sync Rules

When rebasing this fork on a newer upstream snapshot:

1. Re-vendor upstream into `apps/jumper`
2. Re-apply `src/providers/WalletProvider/*` Privy integration (including `dappKitSignerProviders.ts`, `selectSuiSession.ts`)
3. Re-apply `src/lib/privy/*`, `src/lib/sui/*`, `src/hooks/useWalletFleet.ts`, and `/api/privy/*`
4. Re-apply `src/components/LoginModal/*` and the dapp-kit-aware updates in `src/components/Menus/WalletMenu/*` and `src/components/Navbar/hooks.ts`
5. Re-verify wallet auto-fill behavior for EVM, Solana, Sui (both Privy embedded and external dapp-kit), and Bitcoin
6. Re-run `pnpm --dir apps/jumper typecheck` and relevant unit tests

## Notes

- `apps/web` is intentionally left untouched.
- This fork is vendored directly; it is not a git submodule.

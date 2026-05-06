1. 用现网 `Wallet is being provisioned` 文案落点和已知 `Invalid JWT token provided` 日志，确认回归来自把 `wallet-fleet` 也错误切到 identity-token 合同，而不是钱包真的在生成。
2. 重构 `src/lib/privy/server.ts`：保留 `requirePrivySession` 的 access-token 优先 / identity-token fallback，同时新增 identity-token header 校验 helper，并校验与 session user 一致。
3. 把 `useWalletFleet` 恢复到 session/access token；把 Sui / bitcoin signer 改成同时携带 session token 与 identity token，请求 signing route 时显式传 identity-token header。
4. 更新 signing route 和下游 `rawSign` 调用，只把已校验的 identity token 传进 `authorization_context.user_jwts`。
5. 补回归测试：`requirePrivySession` / identity-token helper / `useWalletFleet` token 来源；然后跑针对性单测与 `typecheck`。

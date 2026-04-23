1. 用现网报错和服务器 `Invalid JWT token provided` 日志压实根因，确认失败点落在共享 `/api/privy/*` session 校验而不是 Sui route 或交易字节本身。
2. 重构 `src/lib/privy/server.ts`：把 bearer token 视为通用 user JWT，优先校验 access token，失败后回退到 identity token，并统一产出完整 user + wallet fleet。
3. 同步更新 `useWalletFleet`、Sui signer、bitcoin signer 与对应 route handler，统一使用新的 session JWT 命名和合同，清掉误导性的 `accessToken` 语义残留。
4. 为 `requirePrivySession` 新增回归测试，覆盖 access-token 成功、identity-token fallback 成功和双重失败返回 401。
5. 运行针对性单测与 `typecheck`，确认满足 `SPEC.md` 且不引入 wallet-fleet / bitcoin 回归。

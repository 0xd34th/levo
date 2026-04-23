## Goal

修复 `apps/jumper` 当前线上 `swap` 流程里 Privy JWT 合同漂移的问题：浏览器发起 Sui 交易时，`/api/privy/sui/sign` 不能再因为 `Invalid JWT token provided` 导致 `Failed to sign Sui transaction`，并且同一份修复要同时覆盖 `wallet-fleet` 与 bitcoin signing 的共享 `/api/privy/*` 鉴权链路。

## Scope

- 复现并修复浏览器到 `/api/privy/*` 的 JWT 传递与服务端校验链路。
- 统一前端调用方、`requirePrivySession` 和 downstream `rawSign` 使用的用户 JWT 合同，避免只修 Sui 表象。
- 保持现有 widget、wallet-fleet 响应结构和已部署的 same-origin jumper proxy 合同不变。
- 为 JWT fallback 和共享 session helper 增加回归测试。

## Non-Goals

- 不改动 LI.FI route selection、桥接策略或 Sui 交易构造逻辑。
- 不改动 Privy app 配置、上游 dashboard 设置或线上部署流程。
- 不要求本轮直接 `commit/push/deploy`；发版属于后续显式动作。

## Constraints

- 修复要优先落在共享 Privy auth primitive，而不是在单个 Sui signer 上做特判。
- 新合同不能要求浏览器暴露 server-only secret，也不能破坏现有 `walletFleet` / signer API 形状。
- 需要兼容已存在的 bearer token 调用方，避免一次修复再引入 bitcoin 或 wallet-fleet 回归。

## Acceptance

1. Sui signer 不再因为 `/api/privy/sui/sign` 校验 JWT 失败而返回 `Failed to sign Sui transaction` 这一类共享 auth 错误。
2. `/api/privy/wallet-fleet`、`/api/privy/sui/sign`、`/api/privy/bitcoin/sign-psbt` 共用同一套 JWT session 合同，不再保留 “前端传 access token、服务端只认另一类 token” 的分裂状态。
3. `requirePrivySession` 在 bearer token 为 identity token 时仍能验出 user 并拿到完整 wallet fleet；若 bearer token 是可用 access token，也继续兼容。
4. 新增回归测试覆盖 access-token 路径、identity-token fallback 路径，以及双重校验都失败时返回鉴权错误。
5. `apps/jumper` 的相关单测与必要 `typecheck` 通过。

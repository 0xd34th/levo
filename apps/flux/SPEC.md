## Goal

修复 `apps/jumper` 当前线上 Privy JWT 合同拆分错误的问题：浏览器发起 Sui 交易时，`/api/privy/sui/sign` 不能再因为 `Invalid JWT token provided` 导致 `Failed to sign Sui transaction`；同时 `wallet-fleet` 读取链钱包列表时也不能因为误改成 identity-token 路径而把地址全部打成 `Wallet is being provisioned`。

## Scope

- 复现并修复浏览器到 `/api/privy/*` 的 JWT 传递与服务端校验链路。
- 把 `wallet-fleet` 场景和 `rawSign` 场景拆成正确的双轨 token 合同：session/access token 负责用户会话读取，identity token 负责 Privy wallet authorization key exchange。
- 保持现有 widget、wallet-fleet 响应结构和已部署的 same-origin jumper proxy 合同不变。
- 为 JWT fallback、identity-token header 校验，以及 `useWalletFleet` token 来源增加回归测试。

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
2. `wallet-fleet` 不再因为 identity-token 时序或空值问题把已有钱包地址统一打成 `Wallet is being provisioned`。
3. `/api/privy/wallet-fleet` 继续接受稳定 session/access token；`/api/privy/sui/sign` 与 `/api/privy/bitcoin/sign-psbt` 则显式接收并校验 identity token，用于 Privy `rawSign`。
4. 服务端会校验 identity token 与 session user 是否属于同一用户，避免把错误或串号的 identity token 直接下放到 `rawSign`。
5. 新增回归测试覆盖 access-token session 路径、identity-token fallback 路径、identity-token header 校验，以及 `useWalletFleet` 的 token 来源。
6. `apps/jumper` 的相关单测与必要 `typecheck` 通过。

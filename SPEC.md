## Goal

在现有 `StableLayer Earn` 主链路上补两项产品硬约束：

1. 整个应用里用户可见的 `USDC` 一律显示到小数点后两位，且 `USDC` 输入也最多两位。
2. `Earn` 不再依赖 `LEVO_TREASURY_ADDRESS`；用户通过 Levo 领取/提取时，收益只拿到 `90%`，剩余 `10%` 继续留在协议里，不转给任何 treasury 地址。

## Scope

- 调整 `apps/web/lib/coins.ts` 及所有沿用它的前端显示/输入链路，让 `USDC` 与展示成 `USDC` 的 `LevoUSD` 在 UI 上固定两位显示，同时保留链上 6 位 base-unit 精度。
- 改写 `apps/web/lib/stable-layer-earn.ts` 的 claim / withdraw 逻辑，移除 treasury split，改成把保留的 `10%` 存入一个隐藏的 retained Bucket account。
- 新增本地持久化映射，记录每个 `xUserId` 对应的 retained account，避免重复创建和执行链抖动。
- 更新 Earn API、页面、测试和示例环境变量，去掉 `treasuryFeeUsdc` 与 `LEVO_TREASURY_ADDRESS`。

## Non-Goals

- 不改变 `X_HANDLE` 直发钱包主链路。
- 不改变链上 `USDC` / `LevoUSD` 的真实 decimals；两位只作用于用户输入与显示。
- 不做新的 treasury、fee recipient 或额外运维地址配置。
- 不保证脱离 Levo UI 直接操作底层协议时仍能强制维持 90%；本轮约束作用于 Levo 应用链路。

## Constraints

- 用户只看到 `USDC`；不得暴露 `USDB`、`Bucket`、`PSM`、`saving pool`、shadow account 等内部名词。
- `claimableYieldUsdc`、preview 和最终到账口径都必须是用户净到手的 `90%`。
- `principal` 仍然 `100%` 返还，只有收益腿走 `90 / 10`。
- 由于 `stable-layer-sdk` 的公开 `buildClaimTx()` 只能整笔 claim，本轮必须在本地 Earn adapter 中补 retained-account 逻辑，而不是继续依赖 treasury split。
- 既然新规则已经替代旧规则，本轮必须同时移除 `LEVO_TREASURY_ADDRESS` 配置、preview fee 字段和对应 UI 文案，不能保留旧口径残留。

## Acceptance

1. `USDC` 与展示成 `USDC` 的 `LevoUSD` 在全应用固定显示两位小数；`SUI` 等其他资产保持原有显示规则。
2. `USDC` 输入在发送页和 Earn 页都最多两位小数，但链上 base-unit 计算仍使用 6 位精度。
3. `GET /api/v1/earn/summary` 与 `POST /api/v1/earn/preview` 返回的 `claimableYieldUsdc / userReceivesUsdc` 都是用户净口径，不再返回 `treasuryFeeUsdc`。
4. `Earn` 的 claim / withdraw 不再读取 `LEVO_TREASURY_ADDRESS`，剩余 `10%` 会留在协议中的隐藏 retained account，而不是转给外部地址。
5. Prisma 新增 retained-account 映射表与 migration；执行链成功后会稳定复用同一个 retained account。
6. `apps/web` 的相关单测、类型检查和构建继续通过。

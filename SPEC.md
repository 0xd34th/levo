## Goal

按“全新开始、不留尾巴”的要求，重发主网 `contracts` 与独立 `Levo USD`，重新完成 StableLayer 注册链路，并把主网 claim 从“保留 1 raw dust”改成“零剩余赎回”。

## Scope

- 移除 `packages/contracts` 内嵌 `levo_usd.move`，主网只认 `packages/levo-usd` 独立包。
- 更新主网发布/bootstrap 逻辑：`publish contracts -> publish levo-usd -> onboard stable layer -> add_entity -> register signer`。
- 调整 `apps/web` claim 路径：主网 `LEVO_USD` 使用 `withdraw_all` 后整额 burn，不再保留 dust reserve。
- 更新部署状态与样例：live state 不再保留 `brokenLevoUsd`，旧状态只进 history。

## Non-Goals

- 不重新部署 StableLayer 自身主网 package / registry。
- 不设计或实现旧主网资产迁移。
- 不给 `x_vault` 引入新的按币种最小入账阈值配置。

## Constraints

- 一次收干净：不保留 bundled `contracts::levo_usd`、不保留 claim reserve 逻辑、不中留 `brokenLevoUsd` live 字段。
- 改动要贴合现有发布脚本、bootstrap 结构、web claim 测试模式。
- 若 StableLayer 不接受整额 burn，系统应明确报不可赎回，不做部分兑付。

## Acceptance

1. `packages/contracts/sources/levo_usd.move` 已删除，contracts 主网发布脚本不再依赖或排除该文件。
2. `bootstrap-mainnet` 产出的 live deployment state 只包含当前有效 `activeLevoUsd`，旧 active/broken 状态仅归档到 `history.runs`。
3. 主网 `LEVO_USD` claim 不再使用 `withdraw(total - 1)` 或 `STABLE_LAYER_DUST_RESERVE_RAW`，而是整额 `withdraw_all` 后 burn。
4. `apps/web` 不再返回 `stable_layer_withdraw_amount_zero` 这类 reserve 预检语义；整额 burn 失败时走明确的 StableLayer 失败响应。
5. 相关测试通过，且 `packages/contracts` 的 `sui move build` 通过。

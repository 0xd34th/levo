## Goal

在 `tenxhunter` 已完成链上 owner 迁移后，彻底移除应用层 `repair` 相关入口与临时 owner migration 流程，收口到稳定上线所需的主路径。

## Scope

- 删除临时 `/api/v1/payments/owner-migration` 路由及其前端入口。
- 删除应用层 `REPAIR_REQUIRED` / `REPAIR_AND_WITHDRAW` 相关类型、状态、文案、按钮与测试。
- 调整 claim / quote / dashboard / lookup 行为，使应用层只支持正常 `CLAIM` 与 `WITHDRAW` 主路径。
- 对 `OWNED_BY_OTHER` 统一改为不支持的阻断行为，不再尝试 repair。

## Non-Goals

- 不升级或修改已部署 Move 合约。
- 不修改 StableLayer 协议逻辑。
- 不处理新的历史迁移方案设计；legacy-owner 仅保留服务端阻断，不再提供自助修复。

## Constraints

- 变更要一次收干净，不保留临时 owner migration 入口、repair UI 或双轨逻辑。
- 必须贴合现有 web app 结构与测试模式，保持主路径行为不变。
- `tenxhunter` 已迁移完成这一事实视为前置条件，本轮代码不得再依赖 repair 流程。

## Acceptance

1. 代码库中不再存在应用层 `owner-migration` 临时入口，相关路由、前端按钮和测试全部删除。
2. 代码库中不再存在 `REPAIR_REQUIRED`、`REPAIR_AND_WITHDRAW`、`repairWallet`、`requestOwnerRecoveryAttestation` 在应用层 claim/quote/dashboard 路径中的使用。
3. `claim` API 只保留 `CLAIM` / `WITHDRAW` 主路径；遇到 `OWNED_BY_OTHER` 时直接返回不支持，不再尝试 repair。
4. `quote`、`received dashboard`、`claim page`、`lookup page`、`claim card` 的文案和动作已收口，不再向用户暴露 repair 概念。
5. `pnpm --filter web lint`、`pnpm --filter web test`、`pnpm --filter web build` 全部通过。

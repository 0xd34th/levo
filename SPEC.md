## Goal

把 `X_HANDLE` 收款主链路从“vault + claim”切到“Privy canonical Sui wallet + direct transfer”，新单不再经过 deterministic vault，也不再需要 claim。

## Scope

- 在 `apps/web` 内新增/复用 recipient provisioning 能力：基于 `x_user_id` 确保 canonical `Privy user + Sui wallet`，并把映射落回 `xUser`。
- 改造 `POST /api/v1/payments/quote` 的 `X_HANDLE` 分支：报价时即解析并确保 recipient wallet，返回 resolved recipient address。
- 改造 `POST /api/v1/payments/send`：`X_HANDLE` 与 `SUI_ADDRESS` 都走直发地址路径，不再走 StableLayer mint into vault。
- 改造 `lookup` / `received` 相关读接口与前端消费类型，移除 claim/vault 语义，改为 recipient wallet readiness / direct delivery 语义。
- 清理产品主链路中的 claim/vault 入口、文案、状态模型和显式依赖。

## Non-Goals

- 不做历史资金迁移，不处理旧 vault 余额，不为旧 claim 数据做回填。
- 不做数据库 schema migration；现有 `vaultAddress` 持久化字段本轮仅语义改作 “resolved recipient address”。
- 不做链上 `x_vault` 包删除、历史合约下线或数据归档。

## Constraints

- 新方案已确认替代旧方案，本轮必须收干净新单主链路，不能继续保留 `X_HANDLE -> vault -> claim` 作为运行时 fallback。
- 改动需贴合现有 `apps/web` 结构，优先复用已有 direct-address send / payment confirm / history 逻辑。
- 所有新写入必须以 `x_user_id` 作为 canonical identity key；`username` 只做解析入口和展示快照。
- 如果 Privy recipient provisioning 失败，请明确失败，不降级到旧 vault 链路。

## Acceptance

1. 新增或复用的 recipient provisioning helper 能按 `x_user_id` 命中或创建 canonical Privy user，并确保存在 Sui wallet，随后把 `privyUserId / privyWalletId / suiAddress / suiPublicKey` 回写到 `xUser`。
2. `POST /api/v1/payments/quote` 的 `X_HANDLE` 分支不再读取 `NEXT_PUBLIC_VAULT_REGISTRY_ID`、不再导出 vault 地址，而是返回 canonical recipient wallet address。
3. `POST /api/v1/payments/send` 的 `X_HANDLE` 分支不再调用 StableLayer mint-into-vault 路径；`X_HANDLE` 与 `SUI_ADDRESS` 都直接转账到 `quotePayload.vaultAddress`（现语义为 resolved recipient address）。
4. `GET /api/v1/lookup/x-username` 与 `GET /api/v1/payments/received` 及其前端消费处不再依赖 claim/vault 状态模型，而是返回/展示 recipient wallet readiness 与 direct-delivery 信息。
5. `/claim` 页面、`/api/v1/payments/claim`、claim card、claim status 文案和主链路引用已清理，不再作为新方案入口。
6. 相关单测通过；至少覆盖 recipient provisioning、`quote` X_HANDLE 直解析、`send` X_HANDLE 直发、以及 lookup/received 新返回模型。

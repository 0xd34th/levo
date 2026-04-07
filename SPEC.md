## Goal

让 `received` 和首页 `recent` 交易记录优先显示发送方对应的 X 账号，而不是只显示发送钱包地址。

## Scope

- 修改 received 数据返回结构，补充发送方 X 账号元数据。
- 修改 recent 合流展示逻辑，优先显示发送方 `@username` 与头像。
- 修改 received 页映射逻辑，优先显示发送方 `@username` 与头像。

## Non-Goals

- 不修改 sent 历史展示。
- 不修改链上路由、vault 推导或 wallet 绑定逻辑。
- 不新增数据库字段或迁移。

## Constraints

- 发送方账号映射只能基于现有 `x_user.sui_address -> x_user` 唯一绑定。
- 查不到发送方账号时，必须回退到现有地址展示，不影响当前功能。
- 改动保持最小，贴合现有 API / UI 结构。

## Acceptance

1. `received` 页面中，若发送方地址能映射到 `x_user`，则展示 `@username`、头像和 `X sender`；否则继续展示截断地址和 `Sender wallet`。
2. 首页 `recent` 中，收到款项若能映射到发送方 `x_user`，则展示 `@username` 和头像；否则继续展示截断地址。
3. 相关单测覆盖账号映射与回退行为，并通过。

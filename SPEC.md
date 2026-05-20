## Goal

把 `Earn` 从“收益可估值但 claim 不可结算”的临时降级，升级为可长期运行的服务端代结算链路：`Claimable Yield` 正常显示，`Claim` 能真实把收益打到用户嵌入钱包，`Withdraw` 先结收益再提本金。

## Scope

- 为 `apps/web` 引入 StableLayer manager signer，服务端持有并执行收益 harvest / payout。
- 为 `Earn` 新增正式收益账本：
  - 全局 per-share 累计状态。
  - 用户 reward debt / claimed totals / last known deposited balance。
  - 多步骤 claim / withdraw 的 pending settlement 状态。
- 重构 `summary / preview / execute / confirm`：
  - `summary` 显示 `harvested outstanding + unharvested estimate` 的总 `Claimable Yield`。
  - `Claim` 走服务端结算，不再要求用户钱包链上签收益 claim。
  - `Withdraw` 固定顺序为“先结收益，再执行用户签名的本金 withdraw”。
  - `confirm` 能恢复 yield pending、principal pending，以及“收益已到账、本金失败”的 partial 场景。
- 更新 `app/earn/page.tsx`、表单可用性判断、预览展示和提示语义，反映新的 settlement mode 与 preview 拆分字段。
- 补充数据库迁移、示例环境变量与相关单测 / 路由测试。

## Non-Goals

- 不修改 StableLayer 主网合约权限模型。
- 不替换现有 sponsor gas station 架构；本金 withdraw 仍沿用 sponsor + 用户签名。
- 不引入新的后台定时任务、独立 worker 或队列系统。
- 不改动 `payments/send` 主链路。

## Constraints

- `Claimable Yield` 不能再把 manager-only 失败吞成 `0`；即使当前无未 harvest 奖励，也必须正确反映已 harvest 但未 payout 的用户应计收益。
- `Claim` 必须在服务端真实结算成功后才返回成功；不能继续走“仅估值、按钮禁用”的临时降级。
- `Withdraw` 若收益结算成功但本金腿失败，必须返回可恢复的 `partial` 结果，而不是回滚成全失败或静默丢状态。
- 新方案替代旧的 `yieldSettlementAvailable` 降级语义；同轮清理旧字段、旧分支与误导性测试。
- 账本计算必须防止用户新 stake 直接吃到历史已 harvest 收益；stake / claim / withdraw 后都要正确推进 reward debt。

## Acceptance

1. `apps/web` 新增 `STABLE_LAYER_MANAGER_SECRET_KEY` 服务端配置，缺失时 `summary` 会显式返回 `yieldSettlementMode: 'disabled'`，而不是伪造可结算状态。
2. `Earn summary` 返回的 `claimableYieldUsdc` = 已 harvest 未 payout 的应计收益 + 当前全局 farm 未 harvest 收益的用户份额估值；不再因为 `err_sender_is_not_manager` 显示 `0.00` 假值。
3. `Earn` 数据模型支持：
   - 全局 per-share reward state。
   - 用户 reward debt / claimed totals / last known deposited balance。
   - claim / withdraw 多步骤 pending settlement 恢复。
4. `preview` 返回新的 `yieldSettlementMode` 与收益拆分字段；`withdraw` 预览能同时展示 `principalReceivesUsdc`、`yieldReceivesUsdc` 和总 `userReceivesUsdc`。
5. `Claim` 执行不再触发用户链上签收益 tx；服务端会用 manager signer 完成 harvest / payout，并把 USDC 打到用户嵌入钱包。
6. `Withdraw` 执行顺序为：先收益结算，再用户签名的本金 withdraw；若收益腿成功而本金腿失败，API 返回 `status: 'partial'`，并保留可恢复状态。
7. `Stake`、`Claim`、`Withdraw` 完成后，reward debt 会按正确的 post-action balance 收口，避免新 stake 吃历史收益或 partial/confirm 后账本漂移。
8. `app/earn/page.tsx` 与 `earn-form` 已切到新契约：`Claim` 仅在 `yieldSettlementMode === 'server_payout' && claimableYieldUsdc > 0` 时可用；UI 能正确处理 `partial`。
9. `apps/web/.env.example` 已补充 manager key 说明。
10. `apps/web` 相关测试通过，包括：
   - 账本计算与 summary 估值。
   - claim server payout。
   - withdraw 先收益后本金。
   - `partial` / `pending` confirm 恢复。
   - 页面 / 路由 / 表单契约更新。

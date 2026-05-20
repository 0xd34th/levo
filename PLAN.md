1. 更新 `SPEC.md / PLAN.md`，把范围固定为 “manager signer + reward ledger + server payout” 方案，并明确替换掉旧的 `yieldSettlementAvailable` 降级语义。
2. 扩展 Prisma schema：
   - `EarnGlobalState`
   - `PendingEarnSettlement`
   - `EarnAccounting` 新增 reward debt / totals / last known deposited balance
   - 必要时补充 `PendingEarn` 元数据以支持 stake 后 debt 校正。
3. 在 `stable-layer-earn.ts` 中加入：
   - manager key 解析 helper
   - global/user accounting loader
   - harvested outstanding / unharvested estimate 计算
   - claim / withdraw settlement plan builder
   - yield harvest / payout / retained deposit / principal withdraw 状态机
4. 让 `getEarnSummary()` 返回 `yieldSettlementMode`，并基于账本 + 当前全局 farm 状态计算 `claimableYieldUsdc`。
5. 重写 `previewEarnAction()`：
   - 返回 `principalReceivesUsdc` / `yieldReceivesUsdc` / `userReceivesUsdc`
   - `claim` 走 server payout 预览
   - `withdraw` 预览固定按“收益 + 本金”拆分
   - disabled 模式下允许 principal-only withdraw，但要显式标记 skipped。
6. 重写 `executeEarnAction()` / `confirmEarnAction()`：
   - `claim` 不再请求用户 authorization。
   - `withdraw` 先保存 principal bundle，再执行 yield settlement，再执行 principal。
   - pending / partial 都通过 `PendingEarnSettlement` 恢复。
7. 更新 stake 完成后的 bookkeeping，确保新 stake 不会吃到历史已 harvest 收益。
8. 更新 `earn-form.ts`、`earn-preview-notice.ts`、`app/earn/page.tsx`、相关 API route tests，切到新字段和新状态。
9. 更新 `.env.example`。
10. 跑迁移、单测、路由测试、eslint、`tsc --noEmit`、`git diff --check`，修到满足 `SPEC.md`。

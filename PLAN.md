1. 先更新与本轮收口一致的 Spec/Plan，固定验收：删临时 owner migration、删 repair 应用层入口、保留主路径。
2. 先写/改失败测试：删除 owner-migration 测试，调整 claim/quote/dashboard 相关测试期望为“无 repair、遇到 OWNED_BY_OTHER 直接阻断”。
3. 运行相关测试看红，确认测试确实覆盖到被移除的行为。
4. 实现最小充分清理：删除临时路由与前端按钮，简化 vault ownership、claim、quote、dashboard、lookup、claim-card、client labels。
5. 跑 `pnpm --filter web test`、`lint`、`build`，修正回归直到满足 SPEC。
6. 提交、推送、部署；复核线上 `/claim` 与进程状态。

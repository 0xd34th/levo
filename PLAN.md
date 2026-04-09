1. 更新本轮 Spec/Plan，固定验收：X_HANDLE 新单一律走 Privy canonical wallet 直发，不保留 vault/claim 主链路。
2. 先补失败测试：recipient provisioning helper、`payments/quote` 的 X_HANDLE 直解析、`payments/send` 的 X_HANDLE 直发；确认旧 vault/StableLayer 假设被打红。
3. 实现 recipient provisioning helper，复用 Privy Twitter subject + Sui wallet 能力，并把 canonical wallet 映射回写到 `xUser`。
4. 重构 `payments/quote` 与 `payments/send`：X_HANDLE 报价时确保 recipient wallet，发送时复用现有 direct-address transfer 路径。
5. 重构 `lookup` / `received` 读模型与前端类型/页面，替换 claim/vault 语义；清理 `/claim` 及相关组件、文案、入口和主链路依赖。
6. 跑针对性测试与必要构建验证，修复回归直到满足 `SPEC.md`。

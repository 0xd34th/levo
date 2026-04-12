1. 更新本轮 `SPEC.md / PLAN.md`，固定范围为 gas station 运维缓解包：保留现有 sponsor 架构，不接 Aftermath，不新增显式 gas coin 池管理。
2. 先补失败测试：gas station 健康摘要与启动日志、sponsor 错误提示增强、维护脚本的 `status / merge` 核心逻辑。
3. 补一条 `Earn` 回归测试，锁定 `summary / preview` dry-run 在 sponsor 已配置时必须沿用 sponsor，不能要求用户钱包持有 `SUI` gas。
4. 补一条 `Earn withdraw` 预览提示语义测试，区分“无可结算收益”的中性说明和“收益结算异常”的 warning。
5. 抽取 gas station 运维 helper，统一地址解析、余额/coin 汇总与维护建议生成。
6. 实现维护脚本，支持查看状态和手动 merge；补充 `package.json` 脚本入口与示例环境说明。
7. 更新 `instrumentation.ts`、`sui-transaction-errors.ts`、`Earn` dry-run sponsor 逻辑与 withdraw preview 文案展示，输出更可执行的健康/告警/错误信息，并打通预览链路。
8. 跑针对性测试与必要构建验证，修复回归直到满足 `SPEC.md`。

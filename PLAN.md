1. 更新本轮 Spec/Plan，固定验收：主网 contracts 与独立 Levo USD 重新发布，StableLayer 重新注册，claim 改为零剩余赎回，不保留旧 brokenLevoUsd live 状态。
2. 先写/改失败测试：调整 claim StableLayer 用例为 `withdraw_all` 语义；更新 deployment history / live state 预期；补 contracts 主网发布脚本的源文件排除测试。
3. 运行针对性测试看红，确认测试确实覆盖 dust reserve、brokenLevoUsd live 状态、contracts 发布脚本旧假设。
4. 实现最小充分改动：删除 contracts 内嵌 `levo_usd.move`，调整主网发布/bootstrap/state 逻辑，改 claim 为整额 withdraw_all + burn，清理注释与样例状态。
5. 跑相关测试、`sui move build`、以及必要的 web test/build，修正回归直到满足 SPEC。
6. 更新主网部署状态样例与说明文件，复核变更面后交付。

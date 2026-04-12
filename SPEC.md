## Goal

在不替换现有 sponsor 架构的前提下，为 `gas station` 补一套可执行的运维缓解能力，缩短 sponsor 因 `SUI` 余额不足或碎片失控导致的故障恢复时间。

## Scope

- 保留当前 `GAS_STATION_SECRET_KEY`、服务端 sponsor 双签链路与 `setGasOwner(...)` 逻辑。
- 为 `apps/web` 新增 gas station 维护脚本，至少支持：
  - 查看当前 gas station 地址、总 `SUI` 余额、`Coin<SUI>` 数量、最大 coin、最小 coin。
  - 手动合并 gas station 名下多个 `Coin<SUI>` 为一个主 coin。
- 强化 `apps/web/instrumentation.ts` 启动日志，输出更有用的 gas station 健康信息和阈值告警。
- 收口 sponsor 失败错误文案，让错误直接提示运维检查余额或执行 merge 脚本。
- 补齐 `Earn` 的 `summary / preview` dry-run gas payer 逻辑：在 sponsor 已配置时，预览阶段也要沿用 sponsor，而不是退回要求用户钱包自带 `SUI` gas。
- 调整 `Earn withdraw` 预览提示语义：当本次 withdraw 没有可结算收益时，显示中性说明；仅在确属收益结算暂不可用时显示 warning。
- 更新示例环境变量与必要文档，说明这套能力是运维缓解，不是 sponsor 根治方案。

## Non-Goals

- 不接入 Aftermath。
- 不删除或替换现有 `GAS_STATION_SECRET_KEY` sponsor 方案。
- 不新增运行时 gas coin 池管理、自动选 coin、自动 merge、自愈后台任务或定时调度。
- 不把 merge 行为接入请求主链路，也不在 `payments/send` / `Earn` 执行过程中自动触发链上维护操作。
- 不承诺彻底解决高并发 sponsor 下的所有 gas 竞争问题。

## Constraints

- 必须坚持“运维缓解”边界：链上 merge 只能作为人工执行脚本，不得偷偷变成运行时自动行为。
- 现有 `payments/send`、`Earn` 的 sponsor 主逻辑和对外 API 契约不得被重构成新方案。
- 新脚本应优先复用现有 `SuiClient`、`gas station keypair` 和项目环境变量，而不是引入新的钱包体系。
- merge 脚本必须显式要求 gas station 已配置，并在输入不足时返回清晰错误。
- 错误提示必须是人话，并给出明确下一步动作。

## Acceptance

1. 仓库内存在可执行的 gas station 维护脚本，能够输出地址、总 `SUI` 余额、`Coin<SUI>` 数量、最大 coin、最小 coin，并支持手动 merge。
2. `apps/web/instrumentation.ts` 在 `nodejs` 启动时会输出 gas station 地址及健康摘要；当余额或 coin 状态异常时，会给出明确告警。
3. sponsor 相关 “No valid gas coins found for the transaction.” 类错误会补充可执行运维提示，而不只是附带地址。
4. `Earn` 的 `getEarnSummary / previewEarnAction` 在 sponsor 已配置时，不再因为用户钱包没有 `SUI` gas 而在 dry-run 阶段失败。
5. `Earn withdraw` 预览在“无可结算收益”场景下显示中性说明，不再误用 warning 文案；在真实结算异常场景下仍保留 warning。
6. `apps/web/.env.example` 与相应文档/说明已更新，明确脚本用途和运维边界。
7. 本轮不接入 Aftermath，不新增显式 gas coin 池管理，不改变 `payments/send` 与 `Earn` 的 sponsor 架构。
8. `apps/web` 相关单测通过，且新增测试覆盖健康检查、错误提示、脚本核心逻辑，以及 `Earn` 预览阶段的 sponsor 路径与提示语义。

## Goal

在已经完成 `Earn` 上线的基础上，继续把仓库里剩余的 `Nautilus / x_vault / claim / verifier` 历史痕迹彻底清掉，只保留当前 `StableLayer + LevoUSD + Privy` 主链路所需的代码、脚本、配置与文档。

## Scope

- 保留已经完成的 `Earn` 页面与 `summary / preview / execute / confirm` API，不回退其行为。
- 删除 `packages/contracts` 中仅服务于 `x_vault / nautilus_verifier / test_vectors / test_usdc` 的整包资产。
- 删除或重写仍指向旧 `x_vault / Nautilus` 的根脚本、发布脚本、测试和部署状态文件。
- 精简 `scripts/mainnet-bootstrap-lib.ts`，只保留 `packages/levo-usd` 当前仍需要的通用解析/校验 helper。
- 清理 README、旧设计/计划文档、示例配置、测试和注释中的 `Nautilus / x_vault / claim` 历史叙述。

## Non-Goals

- 不做历史资金迁移，不处理历史 vault 余额。
- 不做数据库 schema migration；现有 `vaultAddress` 字段继续保留存储名。
- 不删除链上已发布的历史合约对象，只清理仓库源码、脚本、文档与运行时引用。
- 不移除 `NEXT_PUBLIC_PACKAGE_ID` 这类当前 testnet / fallback 仍在使用的通用配置位。

## Constraints

- 用户只看到 `USDC`；不得暴露 `USDB`、`Bucket`、`PSM`、`saving pool` 等内部名词。
- 不展示 APR，只展示实时 `Claimable Yield`。
- `90 / 10` 分成只作用于收益腿，不作用于本金腿。
- `Earn` 的产品与实现主语是 `StableLayer`，交易构造优先使用 `stable-layer-sdk`；若公开 API 不足，可在本地适配层补 PTB 细节。
- 既然新方案已经替代旧方案，本轮必须把 `Nautilus / x_vault` 的源码、脚本、测试、部署状态和主文档入口一起清掉，不能只停留在 web/runtime 层。
- 对仍被 `packages/levo-usd` 使用的通用 helper，要保留行为并补足测试，不能为了删旧代码把现有发布链路一起破坏。

## Acceptance

1. `/earn` 页面和 `Earn` API 保持可用；`apps/web` 的相关单测、类型检查和构建继续通过。
2. `packages/contracts` 整包及其 `x_vault / nautilus_verifier / test_vectors / test_usdc` 资产从仓库中移除。
3. 根脚本和发布入口里不再保留 `publish:contracts:mainnet`、`generate:test-vectors`、`bootstrap-mainnet`、`register-enclave-pubkey` 这类旧流程。
4. `scripts/mainnet-bootstrap-lib.ts` 与对应测试不再包含 `Nautilus / x_vault / signer` 专属逻辑，只保留 `LevoUSD` 当前仍在使用的通用 helper。
5. README、示例 env、部署脚本、rsync excludes 和历史设计/计划文档中，不再保留会误导当前产品方向的 `Nautilus / x_vault / claim` 叙述。
6. 重新扫描仓库时，不再在当前源码、脚本、文档里出现剩余的 `Nautilus / x_vault` 主路径痕迹；若保留极少量历史字样，必须只存在于无法安全删除的链上事实或测试 fixture 说明中，并在结果里明确说明。

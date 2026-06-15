# Flux Destination Chain Selector

## Goal

在 `apps/flux` 的自定义 chain-abstracted widget 中，Destination 侧和 Source 侧一样允许用户手动选择链。

默认仍由 best-route fanout 自动选择收益最好的目的链；用户手选后，以用户选择为准，直到切换目的资产或反转资产后重新回到自动选择。手动 Destination chain options 不受当前已连接/可接收钱包类型过滤；自动默认选择仍保持 wallet-safe。

## Scope

- 仅修改 Flux 自定义 widget controller 和相邻纯逻辑/测试。
- 继续隐藏 LI.FI 内置 chain selector，不改 `WidgetProps`、URL 参数名或 LI.FI widget config shape。
- 手动可选目的链只来自当前 destination asset 在 widget allowed chains、widget config chain/token constraints 下的实例，不因当前用户只连接了某一类钱包而隐藏其它实例。
- 自动 destination 默认值和无手选时的 quote fanout 继续受当前用户可接收 chain types 约束；有手选时，手选链会加入 quote fanout。
- 通过现有 `formRef.setFieldValue('toChain'/'toToken', ..., { setUrlSearchParam: true })` 同步到底层 LI.FI form、URL、widget cache 和 tracking store。
- URL/deep link hydration 直接读取当前 `fromChain/fromToken/toChain/toToken` query 参数，并覆盖 module-level Zustand 初始值的滞后风险。
- 自动写入的 `toAddress` 只能在仍匹配当前 destination chain type 时保留；切到无自动钱包地址的链类型时清掉旧自动地址，但不清用户手填地址。

## Non-Goals

- 不新增后端接口。
- 不扩大 Flux 支持链集合。
- 不改变 route quoting、fee、bridge/exchange allow/deny 或 relayer route 合同。
- 不恢复 LI.FI 内置 `ChainSelect`。

## Acceptance

1. Destination asset 存在多个可选链实例时，页面显示 `Destination chain` selector。
2. 初始状态继续自动选择 best-rate destination chain；没有 route quote 时回退到当前 asset 的第一个可用目的链实例。
3. 用户手动选择 destination chain 后，`toChain` 与对应 `toToken` 写回 LI.FI form，并同步 URL 参数、widget cache 和 tracking store。
4. `?toChain=...&toToken=...` deep link 或 widget config 的 `initialToChain/initialToToken` 会 hydrate destination override。
5. 切换 destination asset 或点击 reverse 后清空 destination override，让新 asset 重新走自动最佳链。
6. 当前 destination override 不在新 asset 实例中时会自动清空；仅不满足当前可接收 wallet type 不会清空有效手选链。
7. Selector options 使用 `bestRoute.best + bestRoute.alternatives` 按 `toToken.chainId` 展示 best-rate 和 delta 信息。
8. `Sui SUI -> Solana USDC` 中，已连接/可接收链类型只有 Sui 时，Destination chain 菜单仍显示并可选择 Solana。
9. Destination chain 切到没有自动钱包地址的生态时，会清掉之前自动填入的旧生态 `toAddress`；用户手动输入的 destination address 保留。

## Verification

- Unit:
  - `selection.spec.ts` 覆盖 destination override 优先级、无效 override 清理、receivable/manual quote ids 合并、destination options 的 quote 映射。
  - `useUrlParams.spec.ts` 覆盖 Sui native token 地址含 `::` 的 query hydration。
  - `useBridgeConditions.spec.ts` 覆盖旧自动 `toAddress` 清理判断。
  - `useBestRoute.spec.ts` 保持候选链对和约束逻辑通过。
- E2E:
  - `chainFirstTokenSelection.spec.ts` 覆盖 `/en` 上 Sui SUI -> Solana USDC、手选 destination chain 更新 URL 和 To picker，以及 `toChain/toToken` deep link hydrate。
- Commands:
  - `pnpm --dir apps/flux test:unit -- src/components/Widgets/ChainAbstractionController/selection.spec.ts src/hooks/useBestRoute.spec.ts src/components/Widgets/chainTokenFormSync.spec.ts src/hooks/useUrlParams.spec.ts src/hooks/useBridgeConditions.spec.ts`
  - `pnpm --dir apps/flux typecheck`
  - `pnpm --dir apps/flux test:ci:e2e -- tests/chainFirstTokenSelection.spec.ts`

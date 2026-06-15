# Flux Destination Chain Selector

## Goal

在 `apps/flux` 的自定义 chain-abstracted widget 中，Destination 侧和 Source 侧一样允许用户手动选择链。

默认仍由 best-route fanout 自动选择收益最好的目的链；用户手选后，以用户选择为准，直到切换目的资产或反转资产后重新回到自动选择。

## Scope

- 仅修改 Flux 自定义 widget controller 和相邻纯逻辑/测试。
- 继续隐藏 LI.FI 内置 chain selector，不改 `WidgetProps`、URL 参数名或 LI.FI widget config shape。
- 可选目的链只来自当前 destination asset 的实例，并继续受 widget allowed chains、widget config chain/token constraints、以及当前用户可接收 chain types 约束。
- 通过现有 `formRef.setFieldValue('toChain'/'toToken', ..., { setUrlSearchParam: true })` 同步到底层 LI.FI form、URL、widget cache 和 tracking store。

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
6. 当前 destination override 不在新 asset 实例中，或不满足可接收 chain type / allowed chain 约束时，会自动清空。
7. Selector options 使用 `bestRoute.best + bestRoute.alternatives` 按 `toToken.chainId` 展示 best-rate 和 delta 信息。

## Verification

- Unit:
  - `selection.spec.ts` 覆盖 destination override 优先级、无效 override 清理、allowed-chain 过滤、destination options 的 quote 映射。
  - `useBestRoute.spec.ts` 保持候选链对和约束逻辑通过。
- E2E:
  - `chainFirstTokenSelection.spec.ts` 覆盖多链 destination asset 显示 selector、手选 destination chain 更新 URL 和 To picker，以及 `toChain/toToken` deep link hydrate。
- Commands:
  - `pnpm --dir apps/flux test:unit -- src/components/Widgets/ChainAbstractionController/selection.spec.ts src/hooks/useBestRoute.spec.ts src/components/Widgets/chainTokenFormSync.spec.ts`
  - `pnpm --dir apps/flux typecheck`
  - `pnpm --dir apps/flux test:ci:e2e -- tests/chainFirstTokenSelection.spec.ts`

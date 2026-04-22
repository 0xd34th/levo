## Goal

修复 `apps/jumper` 钱包地址展示链路不一致的问题：`Send to Wallet` 的 `Connected wallets` 必须显示当前 Privy 账户下的完整 canonical wallet fleet，navbar 右上角钱包抽屉里的地址必须可直接复制。

## Scope

- 统一 `WalletProvider` 暴露给 widget / `@lifi/wallet-management` 的账户集合，让其与服务端 `walletFleet` 使用同一份 canonical embedded wallet truth。
- 修复 `Send to Wallet` / 自动填充等依赖 `useAccount()` 的路径，确保它们不再漏掉当前 Privy 账户下的链上地址。
- 为 navbar 钱包抽屉中的每条链地址补复制交互、成功反馈和必要的可点击 affordance。
- 补充针对账户解析与复制交互的回归测试。

## Non-Goals

- 不改动 Privy 登录方式、外部钱包策略或新的钱包产品范围。
- 不重构 `@lifi/widget` / `@lifi/wallet-management` 上游实现，也不引入 node_modules 直改。
- 不改动与本次问题无关的交易执行、路由选择或营销 UI。

## Constraints

- `walletFleet` 作为当前 fork 下 embedded wallet 地址集合的真值；widget 侧展示和 navbar 抽屉不能再各读一套更窄/更宽的数据。
- 保持现有 source wallet / destination wallet 自动填充语义不变，只修正地址集合不完整的问题。
- 复制交互必须 fail-safe：浏览器允许时应成功写入剪贴板并给出反馈；失败时不能打断抽屉或页面渲染。

## Acceptance

1. 登录后的 `Send to Wallet > Connected wallets` 能显示当前 canonical fleet 中所有已就绪地址，不再遗漏 EVM / Solana / Sui / Bitcoin 中的任一已生成地址。
2. 依赖 `useAccount()` 的 destination auto-fill / 选择逻辑读取到的地址集合与 navbar 钱包抽屉保持一致。
3. 点击 navbar 右上角个人昵称打开的钱包抽屉后，每个已显示的钱包地址都能直接复制，并复用现有 snackbar 成功提示。
4. 针对账户解析与抽屉复制交互的回归测试通过，且 `apps/jumper` 的相关测试、`typecheck`、必要构建验证通过。

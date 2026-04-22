1. 重写 `apps/jumper/SPEC.md` / `PLAN.md`，把验收固定为“Connected wallets 与 walletFleet 对齐 + navbar 地址可复制”。
2. 在 `WalletProvider` 中抽出 canonical embedded account 解析逻辑，让 EVM / Solana 也能在需要时回退到 `walletFleet` 地址，避免 widget 侧账户集合比抽屉更窄。
3. 更新 navbar 钱包抽屉组件，为每个已显示地址增加复制按钮和成功反馈；必要时抽出可复用的 clipboard helper。
4. 为账户解析和复制交互补单测，覆盖回退到 `walletFleet` 的场景与点击复制行为。
5. 运行 `apps/jumper` 相关测试、`typecheck`，必要时再补 `build`，确认满足 `SPEC.md`。

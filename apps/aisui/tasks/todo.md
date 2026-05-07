# aisui MVP 实施清单

来源：`docs/PLAN.md`。一次性落地，覆盖 4 周 sprint 的 read + write 全链路。

## 0. 项目骨架
- [x] 任务清单
- [x] `package.json`（Next.js 15 + TS + Tailwind v4 + AI SDK 5 + Sui + dapp-kit + Upstash + Recharts + Vitest）
- [x] `tsconfig.json` / `next.config.ts` / `tailwind.config.ts` / `postcss.config.mjs` / `vitest.config.ts`
- [x] `.env.example`（覆盖所有必需 key）
- [x] `.gitignore`

## 1. 缓存 / 配额护栏（Day 1 必须）
- [x] `lib/cache/store.ts`（Upstash Redis + 内存兜底）
- [x] `lib/cache/quota.ts`（per-tool 配额 + 软降级）
- [x] SWR 包装器 `withCache(key, fetcher, { ttl, staleWhileRevalidate })`

## 2. 数据源客户端
- [x] `lib/blockvision/client.ts`（fetch 封装、键自 env、错误重试）
- [x] `lib/blockvision/types.ts`
- [x] `lib/sui/rpc.ts`（@mysten/sui Client）
- [x] `lib/sui/ptb-explainer.ts`（PTB → 自然语言）
- [x] `lib/sui/aggregators/7k.ts`（7K Aggregator）
- [x] `lib/sui/names.ts`（SuiNS 域名解析）

## 3. Tools 注册表（Vercel AI SDK 5）
- [x] `lib/tools/index.ts`（注册表 + zod schema）
- [x] `get-token-metrics`
- [x] `get-portfolio`
- [x] `get-defi-positions`
- [x] `get-recent-activity`
- [x] `get-trending`
- [x] `get-nft-collection`
- [x] `get-object`（Sui 差异化）
- [x] `explain-tx`（Sui 差异化）
- [x] `prepare-swap`（7K）
- [x] `prepare-transfer`
- [x] `suggest-followups`

## 4. LLM / 模型路由 / Credits
- [x] `lib/llm/system-prompt.ts`
- [x] `lib/llm/model-router.ts`（Fast / Thinking / PRO）
- [x] `lib/credits/tracker.ts`（KV 计费，匿名指纹兜底）

## 5. API Routes
- [x] `app/api/chat/route.ts`（streamText + tools + UI streaming）
- [x] `app/api/auth/fingerprint/route.ts`
- [x] `app/api/auth/usage/route.ts`
- [x] `app/api/news/route.ts`
- [x] `app/api/sui-price/route.ts`

## 6. UI（chat shell + 卡片）
- [x] `app/layout.tsx`（含 dapp-kit Provider + QueryClient + ThemeProvider）
- [x] `app/page.tsx`（chip 行 + 输入 + 流式渲染）
- [x] `components/chat/MessageList.tsx`
- [x] `components/chat/Composer.tsx`
- [x] `components/chat/ChipBar.tsx`
- [x] `components/chat/ModeMenu.tsx`
- [x] `components/cards/TokenCard.tsx`（含 Recharts OHLCV）
- [x] `components/cards/PortfolioCard.tsx`
- [x] `components/cards/DefiCard.tsx`
- [x] `components/cards/ActivityList.tsx`
- [x] `components/cards/TrendingCard.tsx`
- [x] `components/cards/NFTCollectionCard.tsx`
- [x] `components/cards/ObjectCard.tsx`
- [x] `components/cards/TxExplainCard.tsx`
- [x] `components/cards/SwapCard.tsx`（dapp-kit signAndExecute）
- [x] `components/cards/TransferCard.tsx`
- [x] `components/wallet/WalletButton.tsx`

## 7. 测试 / 验证
- [x] tools fixture 测试（vitest）
- [x] `pnpm tsc --noEmit` 通过
- [x] `pnpm build` 通过

## 8. 收尾
- [x] README 含部署指引、env 列表、缺口说明
- [x] 删除半成品 / 死代码
- [x] Turnstile 服务端校验 + 前端门控（按 env 条件激活）
- [x] PostHog 客户端（按 env 条件加载，不配置零体积）
- [ ] git 初始 commit（待用户确认 — 默认不替用户提交）

## 验收

- typecheck: 0 错误
- vitest: 5 文件 / 7 测试全部通过
- next build: 10 路由生成成功（1 静态 + 8 动态 + not-found）
- dev server: GET / 200、GET /api/news 200（实拉 Sui Foundation RSS 6 条）、GET /api/auth/fingerprint 200（fingerprint cookie 自动签发，free 20/20 初始化）
- POST /api/chat 200 + DeepSeek 流式响应实测打通：模型按 system prompt 自我介绍为 "aisui, your Sui blockchain explorer"，AI SDK 5 stream 事件齐全（start / text-delta / text-end / finish）

## 切换到 DeepSeek（本轮调整）

- 拆掉 `@ai-sdk/anthropic`，换 `@ai-sdk/deepseek@1.0.39`（匹配 ai@5 的 V2 spec；2.x 是给 ai@6 的 V3 spec）
- `lib/llm/model-router.ts` 改用 `createDeepSeek({ apiKey, baseURL })`，三档 model id 由 env 注入：
  - fast → `DEFAULT_PROVIDER`（用户当前设为 `deepseek-v4-flash`）
  - thinking → `THINKING_PROVIDER`（默认 `deepseek-reasoner`）
  - pro → `PRO_PROVIDER`（默认 `deepseek-reasoner`）
- `/api/chat` 改为校验 `DEEPSEEK_API_KEY`；`reasoning` 标志由 model id 是否包含 `reason|thinking|r1|reasoner` 自动判定
- ModeMenu 文案、README、.env.example 同步更新

## Tx 完成后回 chat 渲染 receipt（本轮补完）

- 新增 `app/api/explain-tx/route.ts` — POST { digest } → 重试 4 次（fullnode 可能滞后）→ 返回 ExplainedTx
- `SwapCard` / `TransferCard` 新增 `onReceipt?: (digest) => void` 回调，签名成功后触发
- `MessageList` 透传 `onReceipt` 到两张写入卡片
- `page.tsx` 实现 `onReceipt`：
  1. 立即注入一条 placeholder assistant 消息（`tool-explain_tx` part，state=`input-available`），UI 立刻显示 loading
  2. fetch `/api/explain-tx`
  3. 用 `setMessages` 把 placeholder 切到 `output-available` + 完整 ExplainedTx 数据
  4. 失败时切到 `output-error` + errorText
- 不走 LLM、不消耗 credit、零延迟

## 与 docs/PLAN.md 的偏差

- Turnstile 前端 widget 未实装：服务端校验已写好（按 env 自动激活）；前端 widget 评估为 MVP 阶段过早优化（详见会话讨论），保持现状。
- Stripe webhook 未做：docs 标注"Stripe 可第二阶段，手动充值即可"。已提供 dev-only POST `/api/auth/usage` 用于本地补充 credits。
- Vercel 部署 + 自定义域 + OG image：需用户账号，Claude 无法代办。
- zkLogin / Enoki 未做：docs 标注 v2 / Post-MVP，与用户决策一致（MVP 只接 dapp-kit + Slush）。
- prepare_stake / 借贷写入工具未做：docs 标注"第二阶段"。
- Multi-model PRO 并发 GPT/Gemini：docs 标注 Post-MVP。
- 本仓库未替用户做 git commit（全局 CLAUDE.md：commit 需用户显式批准）。

## OKX × MCP 全套接入（本轮新增）

来源：`/Users/admin/.claude/plans/okx-web3-mcp-starry-cookie.md`。

### 9. OKX 客户端基础设施
- [x] `src/lib/okx/auth.ts`（HMAC-SHA256 签名 + buildQueryString 排序+url-encode）
- [x] `src/lib/okx/client.ts`（5 头注入 + SWR 缓存 + 重试 + 超时）
- [x] `src/lib/okx/chain.ts`（chainIndex 表，含 Sui=784）
- [x] `src/lib/okx/types.ts`（envelope + DEX/Bridge/Wallet 响应 schema）
- [x] `src/lib/okx/quota.ts`（per-fingerprint 配额护栏）
- [x] `src/lib/okx/index.ts`（统一导出）
- [x] `src/lib/env.ts` 增加 OKX 4 件套 + 子开关 + `okxConfigured()`
- [x] `tests/okx/auth.test.ts`（7 用例：固定向量 / POST body / method+path 变化 / 默认 timestamp / qs 编码）
- [x] `tests/okx/client.test.ts`（5 用例：headers / POST body / OkxApiError / 未配置抛错 / 429 重试）

### 10. swap 双源比价
- [x] `src/lib/sui/aggregators/types.ts`（共享 SwapQuote/Request/TxPayload + SwapSource）
- [x] `src/lib/sui/aggregators/7k.ts`（refactor：用共享类型，source: "sevenk"）
- [x] `src/lib/sui/aggregators/okx.ts`（X Routing；Sui PTB 从 `tx.txData/txBytes` 提取）
- [x] `src/lib/sui/aggregators/index.ts`（`getBestSwapQuote` 并发 + BigInt 比较 + `buildSwapTxBySource` dispatch）
- [x] `src/lib/tools/prepare-swap.ts`（双源比价 + alternatives + warnings）
- [x] `src/components/cards/SwapCard.tsx`（subtitle 显示 source label + 折叠区显示替代报价 + 差价百分比）
- [x] `src/app/api/swap-build/route.ts`（dispatch by source）
- [x] `tests/tools/prepare-swap.test.ts`（5 用例：原 quote-only + 双源选优 + OKX 失败降级 + 双家失败抛错 + 开关关闭不调 OKX）

### 11. portfolio / activity 数据源冗余
- [x] `src/lib/okx/wallet.ts`（getOkxSuiCoins / getOkxSuiNfts / getOkxSuiActivities + schema 适配）
- [x] `src/lib/tools/get-portfolio.ts`（BV→OKX fallback；source/fallbackReason 字段；429/402/5xx 触发条件）
- [x] `src/lib/tools/get-recent-activity.ts`（同上）
- [x] `tests/tools/get-portfolio.test.ts`（4 用例）
- [x] `tests/tools/get-recent-activity.test.ts`（2 用例）

### 12. 跨链 bridge tool
- [x] `src/lib/okx/bridge.ts`（`getOkxBridgeQuote` + `buildOkxBridgeDeepLink`）
- [x] `src/lib/tools/prepare-bridge.ts`（chain 解析 / native alias / `available` 状态机 / OKX 不可用时 deeplink-only 兜底）
- [x] `src/components/cards/BridgeCard.tsx`（route + fees + estimated time + Open in OKX Wallet 按钮）
- [x] `src/lib/tools/index.ts` 注册 `prepare_bridge`
- [x] `src/components/chat/MessageList.tsx` 分发 BridgeCard
- [x] `src/lib/llm/system-prompt.ts` 增补 prepare_bridge 触发规则 + 安全提示
- [x] `tests/tools/prepare-bridge.test.ts`（5 用例：成功 / 同链拒绝 / 未配置兜底 / quote 失败 warning / 未知链拒绝）

### 13. MCP 客户端框架
- [x] `pnpm add @modelcontextprotocol/sdk@1.29.0`
- [x] `src/lib/mcp/config.ts`（stdio/sse/http 三种 transport 解析 + makeToolName 沙箱）
- [x] `src/lib/mcp/client.ts`（Client + 三种 transport + connect/listTools/callTool/close + withTimeout）
- [x] `src/lib/mcp/registry.ts`（lazy singleton + 并发连接 + per-server 错误隔离 + dynamicTool 包装 + 名称去重）
- [x] `src/lib/mcp/index.ts`
- [x] `src/app/api/chat/route.ts`（local + MCP tools 合并；x-aisui-mcp-tools header）
- [x] `tests/mcp/config.test.ts`（7 用例）
- [x] `tests/mcp/registry.test.ts`（7 用例：空 / 单服务 / 失败隔离 / dynamicTool execute / 禁用 / close+reload / 配置错误）

### 14. 文档 / 验证
- [x] `docs/OKX_INTEGRATION.md`（新建）
- [x] `docs/MCP_INTEGRATION.md`（新建）
- [x] `docs/PLAN.md` 增补 v2 已落地章节
- [x] `README.md` 同步更新（架构图 + 工具清单 + OKX × MCP 章节 + 已知边界）
- [x] `.env.example` 增加 OKX 4 件套 + 3 个子开关 + `MCP_SERVERS` + `MCP_TIMEOUT_MS` + `DAILY_FREE_OKX_CALLS`
- [x] `tests/setup.ts` 增加 `DAILY_FREE_OKX_CALLS` 默认值
- [x] `pnpm typecheck` 全绿
- [x] `pnpm test` 12 文件 / 48 测试全绿（原 19 + 新增 29）
- [x] `pnpm build` Next 路由生成成功（11 路由 / 0 错误）

## 验收（OKX × MCP）

- swap 比价：`OKX_SWAP_ENABLED=true` 后，`prepare_swap` 并发调 7K + OKX，按 amountOut 选优；SwapCard 显示 source label + 折叠比价
- portfolio fallback：`OKX_FALLBACK_ENABLED=true` 后，BV 抛 429/402/5xx → OKX 接管 → `result.source="okx"`；UI 透传 fallbackReason
- 跨链 bridge：`OKX_BRIDGE_ENABLED=true` 后，`prepare_bridge` 返回 quote + deeplink；OKX 不可用时仍返回 deeplink-only result
- MCP 框架：`MCP_SERVERS=[]` 时零开销；配置后 chat tools 注册表自动合并外部工具，response header `x-aisui-mcp-tools: <count>`
- 安全开关：4 件套缺失时所有 OKX 调用静默关闭（`okxConfigured()=false`）；MCP 任意 server 失败仅本地隔离，不阻塞主聊天
- 默认行为不变：所有开关默认 `false`，本轮改动不影响已上线流量；用户拿到 OKX key 后逐项启用

## 15. V6 迁移补丁（凭证就绪后实拉触发）

OKX 在 2025 年弃用 V5 *DEX* 端点（`50050 V5 API is being deprecated...`）；wallet API 保留 V5。

- [x] DEX 路径：`/api/v5/dex/aggregator/{quote,swap}` → `/api/v6/dex/aggregator/{quote,swap}`
- [x] DEX 参数：`slippage`（fraction `0.005`）→ `slippagePercent`（percent `"0.5"`）
- [x] DEX 响应：`priceImpactPercentage` → `priceImpactPercent`；`dexRouterList[*].router` → `dexRouterList[*].dexProtocol.{dexName,percent}`
- [x] Cross-chain：`/api/v5/dex/cross-chain/quote` → `/api/v6/dex/cross-chain/quote`；参数 `fromChainId`/`toChainId` → `fromChainIndex`/`toChainIndex`
- [x] Wallet：路径保持 V5（V6 返回 404 验证）；tx history 参数 `address` → `accountId`
- [x] env 兼容：`OKX_API_PASSPHRASE` ⇆ `OKX_PASSPHRASE` 双命名（用户 `.env` 用了短形式），auth.test 加 3 条配置断言
- [x] 测试 mock 字段同步迁移到 V6 schema
- [x] `tests/okx/live-smoke.ts` 一次性脚本：`OKX_SWAP_ENABLED=true pnpm dlx tsx --env-file=.env tests/okx/live-smoke.ts`
- [x] LIVE 实拉验证：1 SUI → USDC 通过 Bluefin 双跳路由，amountOut=943050（≈$0.94），priceImpact=-0.04%
- [x] `pnpm typecheck` ✓ / `pnpm test` 51 测试 ✓ / `pnpm build` ✓
- [x] `docs/OKX_INTEGRATION.md` 更新 V6 路径 + smoke test 段落

## 16. LIVE 联调修复（凭证 + 开关全部就位后跑出来的真问题）

- [x] **`SUI_RPC_URL` 与 BV gateway 绑死** —— 用户 `.env` 把 SUI_RPC_URL 指向 `sui-mainnet.blockvision.org/v1`，BV 配额耗尽时 Sui RPC 也 404。新增 `env.suiRpcPublicFallback()`（默认 Mysten 官方 fullnode），独立于用户主 RPC 选择
- [x] **`src/lib/sui/coin-metadata.ts`**：BV→Sui RPC 兜底 helper；BV 抛 403/429/402/5xx 时落 Mysten 官方公共节点拿 `getCoinMetadata`；prepare-swap / prepare-transfer 改用 helper（替代直接 `bvGet("/coin/detail")`）
- [x] **跨链 V6 真实 shape**：bridgeName / toTokenAmount / estimateTime 都在 `routerList[i]` 顶层（不是 `router.bridgeName` 嵌套）；`bridge.ts.normaliseRoute` 兼容两种 shape，输出统一 `BridgeRoute`
- [x] **prepare-bridge 测试 mock** 同步升级到 V6 shape
- [x] LIVE 三步实拉：
  - swap：BV 配额耗尽 → Sui RPC 拿 metadata ✓ → OKX X Routing 单源出报价 1 SUI → **0.943684 USDC**（min 0.938965，priceImpact 0.05%）；7K 在本环境不可达 (DNS 异常 `aggregator-api.7k.ag` → RFC2544 测试段)，按设计降级
  - wallet：endpoint + 签名 OK，"Wallet not exist" 是 OKX 真实响应（样本地址无活动）
  - bridge：10 USDC ETH → **9.996527 USDC Polygon**，路由 ACROSS V3，预计 50 秒
- [x] `tests/okx/live-smoke.ts` 扩展为 3 段（swap / wallet / bridge）；`SMOKE_SUI_ADDRESS` env 可覆盖样本地址

## 17. Chrome DevTools 全 chip 实测后修的真 bug（2026-05-07）

13 chip × 用户地址 0xc5de…4401 全套实拉，发现 3 个剩余真 bug + 1 个 UX 加固。

### 17.1 `get_token_metrics` 不接 fallback + 触发 LLM 幻觉
- **症状**：BV 403 → tool throw → DeepSeek 编造 SUI=$3.87、market cap $11.2B（实际 $0.99）
- **修法**：
  - `src/lib/tools/get-token-metrics.ts` 改用 `resolveCoinMetadata`（已自带 BV → Sui RPC fallback）
  - 价格新增 OKX X Routing 兜底：BV market 失败时调 1 token → USDC 报价折算 USD
  - 返回结构加 `priceSource: "blockvision"|"okx"|"partial"` + `unavailable.{market,ohlcv}` + `warnings[]`，让上层明确知道是否有数据
  - tool description 加 "Always returns valid result; check unavailable / priceSource"
- **测试**：`tests/tools/get-token-metrics.test.ts` 加 2 条 — OKX fallback 路径、双 fail 路径不编造数字
- **LIVE**：SUI price chip 渲染 $0.97994 真实价 + LLM 明说 "sourced via OKX X Routing"

### 17.2 `get_defi_positions` 没 fallback，BV 403 直抛
- **症状**：tool 抛 `BV 403 /account/defiPortfolio` 给 LLM
- **修法**：`src/lib/tools/get-defi-positions.ts` 用 `bvFallbackDecision` 接住 403/402/429/5xx，返回 `{ positions: [], unavailable: true, unavailableReason }` 而非抛错
- **LIVE**：DefiCard 渲染 "$0.00 / 0 protocol(s)" + LLM 诚实告知 "Data Unavailable - BV trial exhausted"

### 17.3 `get_object` 短地址 + RPC 双 bug
- **症状**：(a) `0x6` 没 padded → RPC 404；(b) `SUI_RPC_URL` 走 BV gateway 跟着死
- **修法**：
  - `src/lib/sui/rpc.ts` 新增 `normaliseObjectId`（短地址 padded 到 64 char hex）+ `getPublicSuiClient`（独立 Mysten 公共 fallback）
  - `src/lib/tools/get-object.ts` 调用前 `normaliseObjectId`；primary RPC 失败时自动 retry public fallback；返回 `rpcSource: "primary"|"public-fallback"`
- **测试**：`tests/sui/rpc.test.ts` 7 条 — short id padding / 完整 id lowercase / 非 hex 不动 / 边界
- **LIVE**：ObjectCard 渲染 Clock，ID 显示 `0x000…0006`，Type `0x2::clock::Clock`，Owner `Shared@v1`

### 17.4 system prompt 防幻觉 + coin type 完整
- 新增 "Honesty rules (HARD CONSTRAINTS)" 段：tool 返回 `unavailable`/`error`/empty 时 MUST 告知用户、禁止编造价格/balance/digest
- 列出常见 coin types（SUI / USDC native+wormhole / USDT / vSUI / CETUS）让 LLM 直接用而非传 symbol shorthand
- 强调 `priceSource`/`fallbackReason` 必须传给用户

### 17.5 共享 fallback predicate
- `src/lib/blockvision/fallback.ts`（新增）：`bvFallbackDecision(err)` 接受 403/402/429/5xx，三个 tool 共用，避免之前 portfolio/activity 漏 403 的 bug 重演

### 17.6 sui-price endpoint OKX 兜底
- `src/app/api/sui-price/route.ts` BV 失败时调 OKX V6 quote endpoint 拿 1 SUI → USDC 折算价格；都失败返回 200 + price=null（顶栏 chip 不渲染，避免 502 噪音）

### 17.7 chat route 注入 connected wallet
- 前端 page.tsx 把 `account?.address` 用 `useRef` mirror（解决 useChat 一次性绑 transport 不响应 prop 变化）
- chat route 读 `body.sender` 后追加 system prompt："连接钱包地址 = 0x...，'我的'指向它"
- 已连钱包用户问 "What's the asset in my address" 不再被反问

### 验收
- `pnpm typecheck` ✓ / `pnpm test` 13 文件 / **61 测试** ✓ / `pnpm build` ✓
- LIVE smoke ✓（swap / wallet fallback / bridge）
- 浏览器 LIVE：SUI price / DeFi positions / Object 0x6 三个修复均确认
- 控制台 console 0 错误

---

## 9. 设计落地（claude.ai/design 交接包 → 生产代码）

来源：`https://api.anthropic.com/v1/design/h/Qhud2M7aT7gG33mpTcR_9w` 的 `aisui design.html` 设计画布
（11 个 artboard：landing / wallet modal / token / portfolio / object / PTB / streaming / swap / bridge / history / mobile）。

按照交接包 README 指引："recreate them pixel-perfectly in whatever technology makes sense for the
target codebase"——把视觉系统、信息架构和组件骨架移植到现有 Next.js + Tailwind v4 栈，旧实现整体替换。

- [x] `globals.css` 全量替换：暗/亮主题、aqua/violet/lime/amber 4 个 accent 变体、density token、
  `mono`/`tabular`/`eyebrow` 工具类、`pulse`/`shimmer`/`caret`/`rise` 动画、`grid-bg` 和 `scrollbar`
- [x] `layout.tsx` 接入 `next/font` 加载 Inter + JetBrains Mono，inline boot 脚本在 hydration 前应用
  `data-theme` / `data-accent` / `data-density`，避免主题首屏闪烁
- [x] `lib/theme.ts` + `components/ThemeToggle.tsx` 暗/亮切换（localStorage 持久化、动效拨片）
- [x] `Header` 重构：aqua 渐变 SVG logo + SUI 价格 chip（带 ▲▼ 涨跌色） + usage 进度条 chip +
  ThemeToggle + dapp-kit `ConnectButton`（CSS 覆盖到设计 wallet pill 形态）
- [x] `Composer` 重构：accent-glow focus 环 + 自适应 textarea + 左侧 ModeMenu pill（icon + cost
  cv 标签）+ Auto-tools 静态指示 + 可选 hint 槽 + send/stop 双态按钮
- [x] `Landing` 新组件：landing-eyebrow + 56px 渐变 h1 + 副标题 + 4 组 ChipRow（Markets/Wallet/On-chain/Trade）
  + 4 个 FootStat 图标条；`grid-bg` 椭圆遮罩 + `rise` 错落入场动画（尊重 prefers-reduced-motion）
- [x] `MessageList`：用户气泡（不对称圆角 14/14/3/14）+ 助手 avatar（aqua 渐变 logo）+
  `ToolStatusRow`（mono 等宽工具名 + done/running 标记）+ followup 虚线 chip + streaming 占位
- [x] `Card` 升级到 GUICard：title + subtitle + source 元信息行 + footer 槽；新增 `StatRow`、
  `TokenLogo`、`VerifiedTick` 共享原语（覆盖未单独重构的 DefiCard / TrendingCard / NFTCollectionCard /
  ActivityList / TransferCard，自动继承新观感）
- [x] `TokenCard` 重构：1H/24H/7D/30D/ALL 时间窗 picker + recharts 面积图（涨绿跌红渐变填充）+
  3 列 stats grid + Swap/Holders/Pools/SuiVision 操作行
- [x] `PortfolioCard` 重构：分配比例水平条（按 USD 排序，Top6 + Other）+ 单行 token 列（Logo + 名称
  + 余额 + USD + 涨跌）+ 4-up NFT grid（floor 价单独一行）
- [x] `ObjectCard` 重构：2 列 grid（meta vs Display）+ Display 卡片 + 动态字段列表（带类型 chip
  + chevron）+ Raw fields 折叠
- [x] `TxExplainCard` 重构：summary 框 + Sender→Receiver flow strip（虚线 accent 边框 + 步骤数 pill
  + 三角箭头）+ 颜色编码 PTB 步骤行（SplitCoins / MoveCall / TransferObjects 等不同色）+
  净 balance changes（按 address+coinType 聚合）+ object changes 摘要 chip
- [x] `SwapCard` 重构：双 leg pay/receive（receive 高亮）+ rate 行 + 3 列 stats + aggregator
  comparison（BEST 标签 + 落差百分比）+ Cancel/Sign 双按钮 + signing/signed 状态
- [x] `BridgeCard` 重构：from/to chain leg（自定义 hue tag）+ ETA pill 流向 + Fee 行 +
  Progress 三步状态机（current/pending/done 圆形 marker）+ OKX 深链 CTA
- [x] `pnpm typecheck`：通过（修复 BridgeCard chainIndex 字符串解析、SwapCard formatPct 误传第二参）
- [x] `pnpm test`：12/12 文件、52/52 用例通过
- [x] `pnpm build`：成功，单页 First Load JS 432 kB（Recharts + dapp-kit 主导）
- [x] dev 服务器烟雾测试：`/` 返回 200、`landing-h1` / `grad-aqua` / `tt-track` / `data-theme` /
  `data-accent` / Auto-tools / "AI explorer for Sui" 等关键 DOM 锚点全部命中；`/api/sui-price`
  与 `/api/auth/usage` 正常响应

### Review

- 改动范围：`src/app/{layout,page,globals.css}.tsx`、`src/lib/theme.ts`（新）、
  `src/components/{Header,ThemeToggle}.tsx`、
  `src/components/chat/{Composer,ModeMenu,ChipBar,Landing,MessageList}.tsx`、
  `src/components/cards/{Card,TokenCard,PortfolioCard,ObjectCard,TxExplainCard,SwapCard,BridgeCard}.tsx`。
- 视觉系统单一来源：所有 token 在 `:root[data-theme]` 上集中定义，Tailwind v4 `@theme inline` 桥接
  `--color-*` 别名，旧 `var(--color-bg/-fg/-accent)` 调用全部沿用，避免历史卡片大改。
- 设计交接包里另有 9 / 10 / 11 号 artboard（History sidebar、cross-chain bridge 模态、mobile 框架）：
  本轮按"用户已有的功能/入口"映射，没有新增侧边栏路由或 mobile-only 视图（PWA 不是当前 MVP 范围）；
  布局已通过 `landing-wrap` / `chat-col` / `gui-card` 等容器在窄视口自适应。
- 风险与边界：
  - 暗/亮切换是 localStorage 持久化 + html 属性应用，未做 prefers-color-scheme 自动初始化
    （主项目默认 dark，可在 `themeBoot` 内后续补上）。
  - dapp-kit `ConnectButton` 用 CSS 覆盖维持设计观感，dapp-kit 升级时若类名变化要回归一次。
  - `BridgeCard` 进度三步是设计稿占位流程；实际 `PrepareBridge` 不返回执行进度，目前是静态展示。
- 回滚点：所有改动集中在视图层，运行时数据流和 API 未变；如需回滚可单独 revert
  `src/app/globals.css` + 上述组件文件即可恢复旧观感。

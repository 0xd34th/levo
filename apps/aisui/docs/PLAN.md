# aisui — Sui 版 Lana.ai 开发计划

> 当前实现状态（2026-05-08）：本文件保留早期 MVP 计划和历史阶段记录；线上 runtime 已收敛为单档 DeepSeek chat、钱包门禁、无 OKX/bridge、swap 由自建 `SwapCard` 调 `@7kprotocol/sdk-ts` MetaAg 处理，并过滤 OKX provider。下文涉及 `src/lib/sui/aggregators/*`、`swap-build`、OKX/bridge 的内容均是历史计划或已下线实现，不再是当前运行契约。

## Context

**问题/动机**：Lana.ai（Helius 团队的产品）证明了"Solana 上做 AI chat 探索器 + 生成式 UI 卡片 + 直接交易"是一个可行的 consumer 入口。Sui 生态目前缺少同等级别的产品：Suivision/Insidex 等只是传统 explorer，没有 chat 入口；钱包（Slush/Suiet）只能看不能"问"。

**机会**：
1. Sui 的差异点（Object-centric、PTB、zkLogin、sponsored tx）让 chat+解释这条路在 Sui 上比 Solana 更有价值。
2. 用户已有 BlockVision API key（Sui Indexing），覆盖了我们需要的大多数链上数据。
3. 用户当前以"产生收入"为优先目标 — Lana.ai 的 credits + swap 抽佣模型可直接复刻。

**预期产出（MVP）**：4 周内上线一个能跑通"自然语言 → tool 调用 → 渲染 TokenCard / PortfolioCard / SwapCard / TxExplainCard"全链路的 web app，部署到 Vercel，接 zkLogin + Slush 钱包，初始变现走 credits 制。

**仓库现状**：`/Users/admin/Desktop/3MateLabs/aisui` 是空 repo（git 已 init，无 commit），仅 `.env` 含 `SUIVISION_API_URL` + `SUIVISION_API_KEY`。

---

## 架构总览

```
Browser (Next.js client)
  ↓ POST /api/chat (NDJSON stream)
Next.js Route Handler (Vercel)
  ├── Vercel AI SDK 5.x  →  Claude Sonnet 4.6 (default)
  │                         Claude Haiku 4.5 (fast mode)
  │                         GPT/Gemini (PRO multi-model)
  ├── Tool registry (zod-typed)
  │   ├── get_token_metrics  →  BlockVision /v2/sui/coin/*
  │   ├── get_portfolio      →  BlockVision /v2/sui/account/*
  │   ├── get_recent_activity→  BlockVision /v2/sui/account/activities
  │   ├── get_trending       →  BlockVision /v2/sui/coin/dex/pools
  │   ├── get_object         →  Sui JSON-RPC sui_getObject
  │   ├── explain_tx         →  Sui JSON-RPC + Move metadata
  │   ├── prepare_swap       →  7K Aggregator API
  │   ├── prepare_transfer   →  @mysten/sui PTB builder
  │   ├── show_ui            →  emit React component spec
  │   └── suggest_followups  →  emit chip questions
  ├── BlockVision client (server-only, key in env)
  └── Cache + rate-limit layer (Vercel KV / Upstash Redis)
       ↳ Free-tier 30 calls 是硬约束，第 1 周就必须做：
         - 按 (endpoint, params) hash key
         - TTL：价格/市值 60s，holder/supply 5min，NFT 元数据 1h
         - stale-while-revalidate：旧值兜底，后台异步刷新
         - per-tool 配额护栏，超限优雅降级（返回缓存快照 + 提示"数据可能过期"）

Wallet flow:
  @mysten/dapp-kit + Slush adapter（默认且唯一，MVP 内不接 zkLogin）
  zkLogin / Enoki sponsored tx → v2，post-MVP（已有 BlockVision 配额吃紧，先聚焦核心）
```

**协议复刻**：直接套 Lana 观察到的事件流（`tool-call` / `tool-complete` / `show-ui` / `ui-ready` / `text-delta` / `followups` / `finish`）。Vercel AI SDK 5.x 的 data stream 已原生支持 tool calling + UI streaming，不必自己写 NDJSON。

---

## Tools / 数据源映射

| Tool | 数据源 | 渲染组件 | 说明 |
|---|---|---|---|
| `get_token_metrics(coinType)` | BV `/v2/sui/coin/detail` + `/v2/sui/coin/market/pro` + `/v2/sui/coin/ohlcv` | `TokenCard` | 价格/市值/流动性/holder + 1H/24H/7D/30D 折线 |
| `get_portfolio(address)` | BV `/v2/sui/account/coins` + `/v2/sui/account/nfts` | `PortfolioCard` | Coin + NFT 总览，按价值排序 |
| `get_defi_positions(address, protocol?)` | BV `/v2/sui/account/defiPortfolio` | `DefiCard` | 27 个协议（Cetus/Navi/Scallop/Bluefin…）的 LP/借贷仓位 |
| `get_recent_activity(address, limit)` | BV `/v2/sui/account/activities` | `ActivityList` | 最近交易，每条挂 `explain_tx` 跟进 |
| `get_trending(window)` | BV `/v2/sui/coin/dex/pools` + `/v2/sui/coin/trades` | `TrendingCard` | 24h volume / 涨跌幅排行 |
| `get_nft_collection(objectType)` | BV `/v2/sui/nft/collectionDetail` + `/v2/sui/nft/list` | `NFTCollectionCard` | floor/holders/recent sales |
| `get_object(objectId)` | **Sui JSON-RPC `sui_getObject`**（BV 不覆盖，走 Mysten 官方 RPC） | `ObjectCard` | **Sui 差异化核心** — 解析 type/owner/动态字段/display |
| `explain_tx(digest)` | **Sui JSON-RPC `sui_getTransactionBlock`** + Move 模块元数据 | `TxExplainCard` | **Sui 差异化核心** — PTB 反编译为人话 |
| `prepare_swap(in, out, amount)` | **7K Aggregator API**（BV 缺口） | `SwapCard` | 报价 + 滑点 + price impact，等待 wallet sign |
| `prepare_transfer(to, coin, amount)` | `@mysten/sui` 直接构 PTB | `TransferCard` | 含地址/sui ns 解析 |
| `prepare_stake(validator, amount)` | `@mysten/sui` + 系统状态 | `StakeCard` | 第二阶段 |
| `show_ui` / `suggest_followups` | LLM 内部 | n/a | 跟 Lana 一致的 meta-tool |

**BlockVision 缺口（MVP 内自建/外接）**：
- 价格图表 → BV OHLCV 已够用，前端用 Recharts/visx 画
- 新闻聚合 → RSS（Sui Foundation blog、The Block、Sui News）+ LLM 筛选；MVP 阶段静态 JSON 也行
- DEX swap 报价 → 7K Aggregator（首选，Sui 上唯一成熟的开放聚合器）；备选 Hop / Aftermath SDK
- 验证人 APR → Sui 系统状态 RPC 自算
- Sponsored tx → Mysten Enoki（zkLogin 自带）

---

## 仓库结构（待创建）

```
aisui/
├── .env                         (已存在)
├── .env.example                 ← 加入 ANTHROPIC_API_KEY / SUI_RPC_URL / NEXT_PUBLIC_*
├── package.json                 (pnpm + Next.js 15)
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             ← chat shell (chip 行 + 输入框 + 新闻轮播)
│   │   ├── api/
│   │   │   ├── chat/route.ts    ← Vercel AI SDK streamText + tools
│   │   │   ├── auth/
│   │   │   │   ├── session/route.ts
│   │   │   │   ├── usage/route.ts        (credits 余额)
│   │   │   │   └── fingerprint/route.ts  (匿名身份)
│   │   │   ├── news/route.ts
│   │   │   └── sui-price/route.ts        (顶部 chip 用)
│   │   └── chat/[id]/page.tsx   ← 历史对话
│   ├── lib/
│   │   ├── blockvision/
│   │   │   ├── client.ts        ← fetch 封装、key 从 env、错误重试
│   │   │   └── types.ts
│   │   ├── sui/
│   │   │   ├── rpc.ts           ← @mysten/sui Client
│   │   │   ├── ptb-explainer.ts ← PTB → 自然语言
│   │   │   └── aggregators/7k.ts
│   │   ├── tools/
│   │   │   ├── index.ts         ← 注册表 + zod schema
│   │   │   ├── get-token-metrics.ts
│   │   │   ├── get-portfolio.ts
│   │   │   ├── get-object.ts
│   │   │   ├── explain-tx.ts
│   │   │   ├── prepare-swap.ts
│   │   │   └── ...
│   │   ├── llm/
│   │   │   ├── system-prompt.ts ← 中英双语，约束 tool 调用
│   │   │   └── model-router.ts  ← Fast / Thinking / PRO 路由
│   │   └── credits/
│   │       └── tracker.ts       ← 按 mode 扣费（Fast 0 / Thinking 2 / PRO 5）
│   └── components/
│       ├── chat/
│       │   ├── MessageList.tsx
│       │   ├── Composer.tsx
│       │   ├── ModeMenu.tsx
│       │   └── ChipBar.tsx
│       └── cards/
│           ├── TokenCard.tsx
│           ├── PortfolioCard.tsx
│           ├── ObjectCard.tsx       ← Sui 差异化
│           ├── TxExplainCard.tsx    ← Sui 差异化
│           ├── SwapCard.tsx
│           ├── TransferCard.tsx
│           └── DefiCard.tsx
└── tests/
    └── tools/                       ← 每个 tool 一个 fixture-based 测试
```

---

## 4 周 Sprint

### Week 1 — 骨架 + 缓存层 + 第一条端到端
- 初始化：`pnpm create next-app`（App Router、TS、Tailwind）；安 `ai @ai-sdk/anthropic @mysten/sui @mysten/dapp-kit zod recharts shadcn @upstash/redis`
- **Day 1-2 关键护栏**：BlockVision client + Upstash KV 缓存 + per-tool 配额（30 calls/day Free 套餐硬约束）。无此层，下一步 demo 一跑就熔断。
- 实现 `get_token_metrics` + `TokenCard`；从 `/api/chat` 端到端跑通"How is SUI performing today?"
- 复刻 chat shell：chip 行（Sui / Portfolio / Trending / Trade / History）+ 输入框 + ModeMenu
- **验收**：本地输入"How is SUI performing today?" → 看到 TokenCard 渲染 + 流式文字解读；连续问 50 次只触发 ~1-2 次 BV 真实调用（其余命中缓存）

### Week 2 — 链上读路径全部打通
- `get_portfolio` + `PortfolioCard`（输入 0x 地址或 `.sui` 域名）
- `get_recent_activity` + `ActivityList`
- `get_object` + `ObjectCard`（**核心差异化**，仔细做 dynamic field / display 解析）
- `explain_tx` + `TxExplainCard`（**核心差异化**，Move 模块名 → 自然语言映射表）
- `get_trending` + `TrendingCard`
- 接 PostHog；新闻 RSS 拉取（cron / Vercel KV 缓存 1h）
- **验收**：5 类 prompt 全部能从空白页跑到完整卡片输出

### Week 3 — 写入路径 + 钱包
- 接 `@mysten/dapp-kit` + Slush wallet adapter
- `prepare_transfer` + `TransferCard`（地址解析、SUI / 任意 coin）
- `prepare_swap` + `SwapCard`（接 7K Aggregator）
- 完整签名 + 广播流；交易完成后自动回 chat 渲染 receipt
- **验收**：testnet 上完成 swap 0.1 SUI → USDC 全程

### Week 4 — 变现 + 上线
- Credits 系统（复用 Week 1 的 Upstash KV）：匿名用户 N 条/日，Fast=0/Thinking=2/PRO=5
- Stripe 接付费：$10/$30/$100 包；webhook 入账
- 7K swap 配 referral fee（10-30 bps，按其文档）
- Cloudflare Turnstile + 浏览器指纹（直接抄 Lana 的 cookie 方案）
- 部署 Vercel；自定义域；SEO meta；OG image
- **验收**：上线 → 自己跑通付费购买 credits → 跑完 swap 拿到 referral revenue

### Post-MVP / v2 backlog
- Mysten Enoki + zkLogin（Google 一键登录 + sponsored tx 首笔免 gas）
- Multi-model PRO（GPT/Gemini 并发查询）
- `prepare_stake` + Navi/Scallop 借贷 tools
- 升级 BlockVision Pro（500K req/月）+ 解除缓存激进度

### Post-MVP 增量（已落地，OKX × MCP 全套接入）
- **Step 1 OKX 客户端基础设施** — `src/lib/okx/{auth,client,chain,types,quota,wallet,bridge,index}.ts`，HMAC-SHA256 签名 + 5 头注入 + SWR 缓存 + 配额护栏
- **Step 2 swap 双源比价** — `src/lib/sui/aggregators/{types,7k,okx,index}.ts`：7K + OKX X Routing 并发报价，自动选优；`SwapCard` 显示来源 + 比价折叠区
- **Step 3 portfolio/activity 数据冗余** — `get_portfolio` / `get_recent_activity` 在 BlockVision 429/402/5xx 时自动回落到 OKX Wallet API（`OKX_FALLBACK_ENABLED` 开关）
- **Step 4 跨链 bridge** — `src/lib/tools/prepare-bridge.ts` + `src/components/cards/BridgeCard.tsx`：调 OKX cross-chain quote，渲染 BridgeCard + "Open in OKX Wallet" deeplink；v1 不集成非 Sui 钱包
- **Step 5 MCP 客户端框架** — `src/lib/mcp/{config,client,registry,index}.ts`：基于 `@modelcontextprotocol/sdk` 的 stdio/SSE/streamable-HTTP 三转输；`MCP_SERVERS` env 驱动；`src/app/api/chat/route.ts` 合并 local + MCP tools
- **配置开关**（默认全关，分步启用）：`OKX_SWAP_ENABLED` / `OKX_FALLBACK_ENABLED` / `OKX_BRIDGE_ENABLED` / `MCP_SERVERS`
- 文档：`docs/OKX_INTEGRATION.md`、`docs/MCP_INTEGRATION.md`

---

## 关键文件 / 复用清单

**外部 SDK / 库**（无需自写）：
- `ai`、`@ai-sdk/anthropic` — tool calling + streaming
- `@mysten/sui` — RPC client + PTB builder + 地址 / 域名解析
- `@mysten/dapp-kit` — wallet adapter + React hooks
- `@mysten/enoki` — zkLogin + sponsored tx
- `recharts` — 价格折线图
- `shadcn/ui` — 卡片 / 输入 / 菜单 primitives

**自写的核心模块**（按价值排序）：
1. `src/lib/blockvision/client.ts` + `src/lib/cache/` — Free trial 配额下的护栏，**Day 1 必须做**，后续所有 tool 的基础
2. `src/lib/sui/ptb-explainer.ts` — Sui 上没人做好，直接拉开差距
3. `src/lib/tools/get-object.ts` + `ObjectCard` — Object-centric 是 Sui 的核心心智模型
4. `src/app/api/chat/route.ts` — tool dispatch + UI streaming

---

## 变现/差异化（产品决策）

| 维度 | Lana | aisui (本计划 MVP) | aisui v2 |
|---|---|---|---|
| Read 模式 | Solana account | Sui Object-centric | — |
| Tx 解释 | Solana tx | **PTB 反编译**（杀手级，竞品无） | — |
| Onboarding | Connect wallet 才能 swap | @mysten/dapp-kit + Slush | **zkLogin Google 一键** + sponsored tx 首笔免费 |
| 计费 | credits + 多模型订阅 | credits + swap referral 10-30 bps | + multi-model PRO |
| 数据成本 | 自家 Helius | BlockVision **Free trial** + 激进缓存 | BlockVision Pro |

---

## 验证 / Test 策略

**Tool 层**：每个 tool 一个 fixture（mock BlockVision 响应），跑 `vitest`。
**端到端**：`/qa` skill + chrome-devtools MCP，跑 5 个 chip 的核心 prompt，对比生成的 UI 树和预期 snapshot。
**链上**：testnet 部署 → 完成 transfer/swap，记录 digest。
**回归**：每次合并前 `pnpm test && pnpm tsc --noEmit && pnpm build`。

**Definition of Done（MVP）**：
- [ ] 5 个核心 tool（token / portfolio / object / explain_tx / swap）全部能从空 chat 到完整卡片输出
- [ ] testnet 上 swap 跑通 + receipt 卡片
- [ ] @mysten/dapp-kit + Slush 钱包连上 → 看 portfolio
- [ ] credits 计费可工作（手动充值即可，Stripe 可第二阶段）
- [ ] BlockVision 配额监控 + 缓存命中率 > 90%（Free trial 必需）
- [ ] 部署到 Vercel 公网可访问
- [ ] PostHog / Turnstile 接好

---

## 已确认的关键决策

| 问题 | 用户答案 | 对计划的影响 |
|---|---|---|
| MVP 是否含写入路径 | **全包含 read + write** | Week 3 保留 swap + transfer，Day 1 即开始拉变现路径 |
| 登录策略 | **传统钱包优先** | MVP 只接 @mysten/dapp-kit + Slush；zkLogin/Enoki 移到 Post-MVP |
| BlockVision 套餐 | **Free trial（30 calls）** | Week 1 Day 1-2 必须先做缓存 + 配额护栏；缓存命中率写入 DoD |

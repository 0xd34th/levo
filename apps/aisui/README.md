# aisui — AI explorer for Sui

Lana.ai 在 Solana 上验证了"chat 入口 + 解释 + 直接交易"的可行性。aisui 把这套放到 Sui 上，并用 Sui 的差异化能力（Object-centric、PTB、SuiNS、aggregator 生态）拉开身位。

```
Browser (Next.js 15)
  → /api/chat → Vercel AI SDK 5 + DeepSeek (chat / reasoner)
       ├── BlockVision 索引（主，缓存 + per-fingerprint 配额）
       ├── OKX Web3 API（备援，BV 429/402/5xx 时自动接管）
       ├── Sui JSON-RPC（object / tx）
       ├── 7K Aggregator + OKX X Routing（swap 双源比价）
       └── MCP 客户端（任意第三方 MCP server，env 驱动）
  → @mysten/dapp-kit + Slush wallet（用户签名 + 广播）
```

## 功能

- 自然语言 → 工具调用 → 流式渲染卡片
- 9 个数据工具 + 3 个写入工具：
  - `get_token_metrics` / `TokenCard`（含 OHLCV 折线）
  - `get_portfolio` / `PortfolioCard`（含 NFT 缩略图，BV→OKX fallback）
  - `get_defi_positions` / `DefiCard`（27+ 协议）
  - `get_recent_activity` / `ActivityList`（点击挂载 explain_tx，BV→OKX fallback）
  - `get_trending` / `TrendingCard`
  - `get_nft_collection` / `NFTCollectionCard`
  - `get_object` / `ObjectCard`（**Sui 差异化** — 动态字段、Display）
  - `explain_tx` / `TxExplainCard`（**Sui 差异化** — PTB 反编译）
  - `prepare_swap` / `SwapCard`（**双源比价** — 7K + OKX X Routing 并发取优）
  - `prepare_transfer` / `TransferCard`（SUI / 任意 coin + SuiNS 解析）
  - `prepare_bridge` / `BridgeCard`（**跨链入金** — OKX X Routing，引导 OKX Wallet 完成源链签名）
- 远程 MCP 工具：通过 `MCP_SERVERS` env 接任意 MCP server（stdio / SSE / streamable HTTP）
- 三档模型路由（全部走 DeepSeek，可由 env 覆盖各档 model ID）：Fast (DEFAULT_PROVIDER, 0 credits) / Thinking (THINKING_PROVIDER, 2) / PRO (PRO_PROVIDER, 5)
- 缓存层：Upstash KV（缺省回落到内存），TTL + stale-while-revalidate
- 配额护栏：per-fingerprint 每日免费消息上限，避免 BlockVision 30 calls/day Free trial 被打爆
- Credits 系统：免费额度 + 付费余额（dev 端可 POST `/api/auth/usage` 补充；上线接 Stripe webhook）

## 本地运行

```bash
pnpm install
cp .env.example .env.local
# 必填：SUIVISION_API_KEY、DEEPSEEK_API_KEY
# 可选：DEFAULT_PROVIDER (fast 档 model id, 默认 deepseek-chat)
#       THINKING_PROVIDER / PRO_PROVIDER (默认 deepseek-reasoner)
#       DEEPSEEK_BASE_URL (走代理或自托管时设置)
#       UPSTASH_* / SUI_RPC_URL
pnpm dev
```

打开 `http://localhost:3000`，输入 "How is SUI performing today?" 看到 TokenCard + 流式分析即跑通。

## 验证

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # next build
```

## 部署

Vercel：

```bash
pnpm dlx vercel
# 配 Project envs：
#   DEEPSEEK_API_KEY
#   DEFAULT_PROVIDER / THINKING_PROVIDER / PRO_PROVIDER (可选)
#   SUIVISION_API_KEY
#   BLOCKVISION_API_URL=https://api.blockvision.org/v2/sui
#   SUI_RPC_URL=https://fullnode.mainnet.sui.io:443
#   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
```

## 架构要点

- `src/lib/cache/store.ts` — 全部外部调用先过 `withCache(key, fetcher, { ttl, swr })`；Upstash 不可用时落内存
- `src/lib/cache/quota.ts` — 按 fingerprint + 当天计数，超限返回 402
- `src/lib/blockvision/client.ts` — BlockVision 客户端，重试 + 兜底返回 stale 缓存
- `src/lib/okx/` — OKX OS API 客户端（HMAC-SHA256 签名 + 5 头注入 + SWR 缓存 + 配额护栏）；详见 `docs/OKX_INTEGRATION.md`
- `src/lib/sui/ptb-explainer.ts` — PTB → 自然语言反编译
- `src/lib/sui/aggregators/` — 共享类型（`types.ts`）+ 7K + OKX 两个 aggregator + `index.ts` 比价/dispatch 入口
- `src/lib/mcp/` — MCP 客户端框架，`MCP_SERVERS` env 驱动；详见 `docs/MCP_INTEGRATION.md`
- `src/lib/tools/index.ts` — 注册表 + 直接调用器（测试用）
- `src/app/api/chat/route.ts` — `streamText` + 本地 tools + MCP tools 合并，UI 流式响应
- `src/components/chat/MessageList.tsx` — 按 tool 名分发卡片渲染

## 模型说明（DeepSeek）

- `deepseek-chat`（V3 系，支持 tool calling）— 默认 fast 档
- `deepseek-reasoner`（R1 系，extended thinking）— 默认 thinking / pro 档
- 任何 DeepSeek 兼容 endpoint（自托管 / 代理）只要走 OpenAI-compatible chat completion 都可经 `DEEPSEEK_BASE_URL` 接入
- 重要：thinking / pro 档若指向不支持 tool calling 的纯 reasoner 模型，工具调用会退化成纯文本对话。需要工具体验时优先选 `deepseek-chat` 系或 R1 的 tool-calling 版本

## v2 / Backlog（不在本轮交付内）

- Mysten Enoki + zkLogin（Google 一键 + 首笔 sponsored gas）
- Multi-model PRO 模式（混合多家 LLM 并发请求 + 投票）
- `prepare_stake` + 借贷写入
- Stripe webhook 入账 + 支付页
- Cloudflare Turnstile + PostHog 分析
- 升级 BlockVision Pro，放宽缓存激进度
- 跨链 bridge 直集成 wagmi / @solana/wallet-adapter（取代当前的 OKX Wallet 跳转）

## OKX × MCP 集成

OKX 全套 + MCP 客户端框架已落地，所有开关默认关闭（按需启用）：

```env
# OKX 4 件套（在 https://web3.okx.com/build 申请）
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_API_PASSPHRASE=
OKX_PROJECT_ID=

# 子开关
OKX_SWAP_ENABLED=true       # prepare_swap 与 7K 双源比价
OKX_FALLBACK_ENABLED=true   # BV 配额耗尽时回落到 OKX Wallet API
OKX_BRIDGE_ENABLED=true     # 启用 prepare_bridge 跨链工具

# MCP 客户端：JSON 数组，例
MCP_SERVERS='[{"name":"kb","transport":{"type":"sse","url":"https://your.mcp/server","headers":{}}}]'
MCP_TIMEOUT_MS=3000
```

详见 `docs/OKX_INTEGRATION.md` 与 `docs/MCP_INTEGRATION.md`。

## 已知边界

- BlockVision Free trial 每天 30 次硬上限。主路径仍由 BV 服务；OKX Wallet API 作为 429/402/5xx 时的备援（`OKX_FALLBACK_ENABLED`）。
- 服务端不构建 transfer 的 PTB（需要钱包 coin 上下文），由 `TransferCard` 在客户端用真实 coin 对象重建。
- 7K Aggregator 与 OKX X Routing 报价/构建端点 URL 与字段以最新文档为准；如 schema 变化，调整 `src/lib/sui/aggregators/{7k,okx}.ts` 即可。
- 跨链 bridge：aisui v1 仅签 Sui-side 交易，`prepare_bridge` 第一版输出 OKX Wallet deeplink 引导用户完成源链签名。
- OKX 官方 MCP server 当前未支持 Sui（chainIndex 784）；接入后只增加 EVM/Solana 工具，Sui 数据继续由本仓库的 OKX REST 集成提供。

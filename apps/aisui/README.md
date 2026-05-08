# aisui — AI explorer for Sui

Lana.ai 在 Solana 上验证了"chat 入口 + 解释 + 直接交易"的可行性。aisui 把这套放到 Sui 上，并用 Sui 的差异化能力（Object-centric、PTB、SuiNS、aggregator 生态）拉开身位。

```
Browser (Next.js 15)
  → /api/chat → Vercel AI SDK 5 + DeepSeek
       ├── BlockVision 索引（主，缓存 + per-fingerprint 配额）
       ├── Sui JSON-RPC（object / tx / coin metadata 兜底）
       ├── 7K Aggregator（swap 报价 + 构建）
       └── MCP 客户端（任意第三方 MCP server，env 驱动）
  → @mysten/dapp-kit + Slush wallet（用户签名 + 广播）
```

## 功能

- 自然语言 → 工具调用 → 流式渲染卡片
- 9 个数据工具 + 2 个写入工具：
  - `get_token_metrics` / `TokenCard`（含 OHLCV 折线）
  - `get_portfolio` / `PortfolioCard`（含 NFT 缩略图）
  - `get_defi_positions` / `DefiCard`（27+ 协议）
  - `get_recent_activity` / `ActivityList`（点击挂载 explain_tx）
  - `get_trending` / `TrendingCard`
  - `get_nft_collection` / `NFTCollectionCard`
  - `get_object` / `ObjectCard`（**Sui 差异化** — 动态字段、Display）
  - `explain_tx` / `TxExplainCard`（**Sui 差异化** — PTB 反编译）
  - `prepare_swap` / `SwapCard`（7K Aggregator 报价 + tx 构建）
  - `prepare_transfer` / `TransferCard`（SUI / 任意 coin + SuiNS 解析）
- 远程 MCP 工具：通过 `MCP_SERVERS` env 接任意 MCP server（stdio / SSE / streamable HTTP）
- 单档模型路由（DeepSeek `deepseek-chat`，可由 `DEFAULT_PROVIDER` 覆盖）
- 缓存层：Upstash KV（缺省回落到内存），TTL + stale-while-revalidate
- 配额护栏：per-fingerprint 每日免费消息上限，避免 BlockVision 30 calls/day Free trial 被打爆
- 钱包门禁：未连接 Sui 钱包时无法发起 chat（前端弹连接 modal，后端返回 401）

## 本地运行

```bash
pnpm install
cp .env.example .env.local
# 必填：SUIVISION_API_KEY、DEEPSEEK_API_KEY
# 可选：DEFAULT_PROVIDER (默认 deepseek-chat)
#       DEEPSEEK_BASE_URL (走代理或自托管时设置)
#       UPSTASH_* / SUI_RPC_URL
pnpm dev
```

打开 `http://localhost:3000`，连上 Sui 钱包后输入 "How is SUI performing today?" 看到 TokenCard + 流式分析即跑通。

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
#   DEFAULT_PROVIDER (可选)
#   SUIVISION_API_KEY
#   BLOCKVISION_API_URL=https://api.blockvision.org/v2/sui
#   SUI_RPC_URL=https://fullnode.mainnet.sui.io:443
#   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
```

## 架构要点

- `src/lib/cache/store.ts` — 全部外部调用先过 `withCache(key, fetcher, { ttl, swr })`；Upstash 不可用时落内存
- `src/lib/cache/quota.ts` — 按 fingerprint + 当天计数，超限返回 402
- `src/lib/blockvision/client.ts` — BlockVision 客户端，重试 + 兜底返回 stale 缓存
- `src/lib/sui/ptb-explainer.ts` — PTB → 自然语言反编译
- `src/lib/sui/aggregators/` — 共享类型（`types.ts`）+ 7K aggregator + `index.ts` 入口
- `src/lib/mcp/` — MCP 客户端框架，`MCP_SERVERS` env 驱动；详见 `docs/MCP_INTEGRATION.md`
- `src/lib/tools/index.ts` — 注册表 + 直接调用器（测试用）
- `src/app/api/chat/route.ts` — `streamText` + 本地 tools + MCP tools 合并，UI 流式响应
- `src/components/chat/MessageList.tsx` — 按 tool 名分发卡片渲染

## 模型说明（DeepSeek）

- `deepseek-chat`（V3 系，支持 tool calling）— 默认
- 任何 DeepSeek 兼容 endpoint（自托管 / 代理）只要走 OpenAI-compatible chat completion 都可经 `DEEPSEEK_BASE_URL` 接入

## v2 / Backlog（不在本轮交付内）

- Mysten Enoki + zkLogin（Google 一键 + 首笔 sponsored gas）
- 重新引入 thinking / pro 档（接入支持 tool calling 的 reasoner 模型）
- `prepare_stake` + 借贷写入
- 跨链 bridge（直集成 Wormhole / Mayan SDK）
- Stripe webhook 入账 + 支付页
- 升级 BlockVision Pro，放宽缓存激进度

## 已知边界

- BlockVision Free trial 每天 30 次硬上限。主路径由 BV 服务；BV 失败时 portfolio / activity 直接抛错（无 fallback 数据源），coin metadata 会回落到 Sui RPC。
- 服务端不构建 transfer 的 PTB（需要钱包 coin 上下文），由 `TransferCard` 在客户端用真实 coin 对象重建。
- 7K Aggregator 报价/构建端点 URL 与字段以最新文档为准；如 schema 变化，调整 `src/lib/sui/aggregators/7k.ts` 即可。
- 跨链 bridge 已下线；用户若询问，引导其在自有钱包内完成。

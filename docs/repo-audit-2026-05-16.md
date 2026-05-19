# Levo 仓库审计 — 2026-05-16

四维并行分析：**死代码 / 性能 / 安全 / 架构**。基础路径 `apps/web/`（Next.js 16 + Prisma + Privy + Sui SDK + AI SDK）+ `packages/levo-agent/`（Move）。

---

## TL;DR

- **4 个 CRITICAL 安全风险，全部集中在新 agent 特性**，未阻断的话上主网会出事：privyUserId 绑定缺失、LLM 工具直接调用 execute、Move `create` 不校验 agent 地址、Privy session 验签弱。
- **性能 3 个 CRITICAL 是放大型瓶颈**：Privy 每请求 2-4 次网络往返、scheduler N+1 + 顺序执行、execute 路径多一次 `getObject` RPC。
- **架构 2 个 HIGH 是 race condition 类**：Redis 锁失败时 scheduler 静默跳过且无审计行；`execute_mandate_now` 工具绕过 Redis 锁，可能与 scheduler 双执行。
- **死代码 ~800–1000 LOC 可清理**；其中 `MandateSpec` 双定义（types.ts vs mandate-spec.ts）是 active confusion 源头，应立刻收口。

---

## 严重等级矩阵

| 优先级 | 类别 | 问题 | 关键位置 | 修复成本 |
|---|---|---|---|---|
| **P0 阻断主网** | 安全 | privyUserId 未与 xUserId 绑定 → IDOR 风险 | `app/api/v1/agent/mandate/{create,[id]/{init,revoke,destroy,execute}}/route.ts` | 中 |
| **P0 阻断主网** | 安全 | LLM 工具 `execute_mandate_now` 无显式用户手势就能转移资金 | `lib/agent/tools.ts:132-164` + `app/api/v1/agent/chat/route.ts:15-17` | 中 |
| **P0 阻断主网** | 安全 | `mandate.move::create` 接受任意 `agent` 地址 → 攻击者可成为合法签名方 | `packages/levo-agent/sources/mandate.move:155-242` | 中（链上） |
| **P0 阻断主网** | 安全 | Privy access token 无 audience 绑定 + identity-token cookie 非 httpOnly | `lib/privy-auth.ts:88-145` | 小 |
| **P0 阻断主网** | 死代码 | `MandateSpec` 双定义（types.ts vs mandate-spec.ts），导入路径分歧 | `lib/agent/types.ts:14-103` vs `lib/agent/mandate-spec.ts:15-63` | 小 |
| **P1 上线前** | 安全 | Seal 配置 `verifyKeyServers: false`（已标 TODO，未做） | `lib/agent/seal-client.ts:46` | 小 |
| **P1 上线前** | 安全 | `seal_policy::seal_approve` 不校验 `sender == mandate.agent` | `packages/levo-agent/sources/seal_policy.move:15-49` | 小（链上） |
| **P1 上线前** | 安全 | revoke 不获取 `agent-execute` 锁 → 与 in-flight execute 竞争，Seal 已释放 preimage | `lib/agent/mandate-flow.ts:342-384` + `executor.ts` | 中 |
| **P1 上线前** | 安全 | 三把 Sui keypair 明文存于 env，无 KMS、无轮换（agent signer、gas station、stable-layer manager） | `lib/agent/kms.ts`、`lib/gas-station.ts`、`lib/stable-layer-manager.ts` | 大（需 KMS 集成） |
| **P1 上线前** | 架构 | Worker 部署产物未提交（无 Dockerfile.worker / Fly process / K8s manifest），双实例会触发双执行 | `workers/agent-scheduler.ts` | 中 |
| **P1 上线前** | 架构 | Redis 锁失败时 scheduler 静默 skip 且无 `AgentAction.FAILED` 审计行 | `lib/agent/scheduler-runtime.ts:fireForMandate` | 小 |
| **P1 上线前** | 架构 | `execute_mandate_now` 工具不取 Redis 锁 → 与 scheduler 双执行可能 | `lib/agent/tools.ts:execute_mandate_now` | 小 |
| **P1 上线前** | 架构 | Sui 成功 + DB tx 失败时无对账回路，mandate 永久卡 PENDING | `lib/agent/executor.ts:executeNextStep` | 中 |
| **P1 上线前** | 性能 | `verifyPrivyXAuth` 每请求 2–4 次 Privy 网络往返（hot 页面 4 次） | `lib/privy-auth.ts:74-159` | 小（加 60s 缓存） |
| **P1 上线前** | 性能 | Scheduler N+1：每个 mandate 一次 `findFirst`；顺序执行 → 10 个 due mandate 30s+ | `lib/agent/scheduler-runtime.ts:44-77` | 小 |
| **P1 上线前** | 性能 | execute 路径多一次 `getObject` RPC（DB 已有镜像） | `lib/agent/executor.ts:73, 225-244` | 小 |
| **P2 短期内** | 安全 | `agent-chat` 接受 `z.any()` messages → 伪造 tool result 注入 | `app/api/v1/agent/chat/route.ts:15-17, 71-78` | 小 |
| **P2 短期内** | 安全 | rate-limit 在 Redis 故障时 fail-open，写路由也放行 | `lib/rate-limit.ts:88-99` | 小 |
| **P2 短期内** | 安全 | `metadata.schedule` 接受任意 cron 表达式（含 `* * * * *`） | `lib/agent/cron-util.ts:18-28` | 小 |
| **P2 短期内** | 安全 | `propose_yield_mandate` 不校验 vault 是否在服务端 allow-list | `lib/agent/tools.ts:50-130` | 小 |
| **P2 短期内** | 性能 | FloatingAgentButton 在每个 hub 页面同步导入完整 AgentDashboard | `app/(hub)/layout.tsx:3` + `components/agent/FloatingAgentButton.tsx` | 小（`next/dynamic`） |
| **P2 短期内** | 性能 | `payments/send` 递归调用自身路由 4–6 次（重复校验、HMAC、DB 查询） | `app/api/v1/payments/send/route.ts:8, 109-114, 252-318` | 中（抽函数） |
| **P2 短期内** | 性能 | `received-dashboard` 内联 `getAllBalances` RPC + 仅 cursor 路径用缓存 | `lib/received-dashboard.ts:308-329, 480-490` | 中 |
| **P2 短期内** | 架构 | `AgentSession.messages` 无大小封顶、无分页 → 单行 Postgres 可膨胀至 MB | `schema.prisma` AgentSession | 小 |
| **P3 整理** | 死代码 | 7 个 ad-hoc 调试脚本不绑定任何 pnpm script | `apps/web/scripts/{agent-smoke,chat-smoke,check-db,check-scheduler-state,debug-mandate,scheduler-single-tick,fund-gas-station}.ts` | 小 |
| **P3 整理** | 死代码 | `lib/vault-ownership.ts` 全无引用 | 同文件 | 小 |
| **P3 整理** | 死代码 | shadcn UI 组件 `badge/card/separator/skeleton.tsx` 全无引用 | `components/ui/` | 小 |
| **P3 整理** | 死代码 | `lib/agent/` 内 ~12 个未引用导出符号 | 见详细报告 | 小 |
| **P3 整理** | 架构 | `lib/` 平铺 65+ 文件无分组（earn/payments/privy 可分目录） | `lib/` | 中（重命名） |
| **P3 整理** | 架构 | 9 个 ad-hoc 脚本反映运维流程未沉淀 | `scripts/` | 中 |
| **P3 整理** | 架构 | `(hub)/layout.tsx` 被改为整个 client component 而非 client island | `app/(hub)/layout.tsx` | 小 |

---

## 各维度详细发现

### 1) 安全 — 4 个 P0、8 个 HIGH、8 个 MEDIUM、6 个 LOW

#### CRITICAL（P0 阻断主网）

**C-1 · privyUserId 未绑定 xUserId（IDOR）**
- 文件：`app/api/v1/agent/mandate/create/route.ts:56-78` 等所有 mandate 写入路由
- 攻击路径：支付路由（`payments/send/route.ts:378`）已经做了 `xUser.privyUserId === auth.identity.privyUserId` 防御性校验。Agent 路由没做。如果攻击者拿到与同一 X 账号关联的另一个 Privy 会话（账号合并 / 重新登录 / OAuth 回放），即可对原 wallet 的 mandate 进行 revoke/destroy/execute。
- 修复：在所有 agent 路由复制 payment 路由的 privyUserId 绑定模式；`loadOwnerWallet` 返回 `privyUserId` 字段；不一致就 403。

**C-2 · LLM 工具 `execute_mandate_now` 直接转移资金**
- 文件：`lib/agent/tools.ts:132-164` + `app/api/v1/agent/chat/route.ts`
- 攻击路径：聊天接受 `messages: z.array(z.any())`，可被注入伪造的 assistant/tool 历史，诱导模型调用 `execute_mandate_now`。当前路径仅靠 IP rate-limit + Privy session bearer，无显式用户手势确认，无第二次签名。
- 修复：(a) 工具内部加 privyUserId 绑定；(b) 把 execute 改为前端按钮 → 携带 CSRF token 的 POST，模型只能 propose 不能直接 execute；(c) 严格校验 `messages` role 仅限 `user/assistant`，丢弃 client-supplied tool/system 角色。

**C-3 · Move `mandate.move::create` 接受任意 `agent` 地址**
- 文件：`packages/levo-agent/sources/mandate.move:155-242`
- 攻击路径：API 层和前端可设 `spec.agent = attacker_address`。后续 `consume_witness` 只校验 `ctx.sender() == mandate.agent`，而 Seal `seal_approve` 不校验 sender（见 H-7），攻击者可绕过 Seal 委员会拿到 preimage 并自行 consume。
- 修复：链上将 agent 与 `AgentRegistry` 共享对象（持有平台签名公钥）绑定，或硬编码 `assert!(agent == PUBLISHED_AGENT_ADDRESS, EBadAgent)`。服务端 `MandateSpecSchema.agent` 必须严格等于 `getAgentAddress()`。

**C-4 · Privy session 验签弱**
- 文件：`lib/privy-auth.ts:88-101, 122-145`
- 问题：`verifyAccessToken(token)` 未传 audience；`privy-id-token` cookie 非 httpOnly（SDK 客户端读）；CSRF 仅靠 `verifySameOrigin`；access token 泄露即可重放至自然过期。
- 修复：(a) 加 audience 校验；(b) 对 execute/revoke/destroy 等高危路由强制 fresh Privy re-auth；(c) 文档化威胁模型并加 CSRF token。

#### HIGH

| 编号 | 问题 | 文件:行 | 修复要点 |
|---|---|---|---|
| H-1 | Seal `verifyKeyServers: false` | `lib/agent/seal-client.ts:46` | 上主网前打开 |
| H-2 | `propose_yield_mandate` 不校验 vault 是否在 StableLayer allow-list | `lib/agent/tools.ts:50-130` | 服务端维护 vault 注册表 |
| H-3 | `signSuiTransaction` 接受 `user_jwts: string[]` 数组路径 | `lib/privy-wallet.ts:374-446` | 删除该重载或显式绑定 privyUserId |
| H-4 | revoke 不取 execute 锁 → 与 in-flight execute 竞争 | `lib/agent/mandate-flow.ts:342-384` + `executor.ts` | revoke/destroy/setExpiry 都进同一锁 |
| H-5 | `executeNextStep` 不重检 ownership，依赖路由层 | `lib/agent/executor.ts:51-60` | 函数签名加 `xUserId` 并内部校验 |
| H-6 | 三把 Sui keypair 明文存 env、无轮换 | `lib/agent/kms.ts`, `lib/gas-station.ts`, `lib/stable-layer-manager.ts` | 主网前接 KMS/HSM |
| H-7 | `seal_approve` 不校验 sender | `packages/levo-agent/sources/seal_policy.move:15-49` | 加 `assert!(ctx.sender() == mandate.agent, ENotAgent)` |
| H-8 | dev/preview 环境 `verifySameOrigin` no-op | `lib/api.ts:88-133` | 强制 `APP_ORIGIN`，dev 限 localhost |

#### MEDIUM 摘录

- M-1：legacy HMAC fallback 仍接受（标 2026-Q2 移除）— 提前移除
- M-2：rate-limit Redis 故障 fail-open — 写路由改 fail-closed
- M-3：Redis 锁 unavailable 时 scheduler 继续跑 — fail-closed 并告警
- M-4：agent-chat `z.any()` messages — 严格 schema、丢 system/tool role
- M-5：env 控的 RPC/Privy/Seal URL — 启动期 host allow-list
- M-6：`extractMandateObjectId` 用 `endsWith('::mandate::Mandate')` — 改全路径匹配
- M-7：witness ciphertext 直接存 DB，无独立 at-rest key
- M-8：`metadata.schedule` 接受任意 cron 表达式 — 限定最短间隔 ≥1h

---

### 2) 性能 — 3 个 CRITICAL、7 个 HIGH、8 个 MEDIUM

#### CRITICAL（ROI 最高）

**C1 · Privy 每请求 2–4 次网络往返**
- `lib/privy-auth.ts:74-159` — `verifyAccessToken` + `users._get` / `users.get({id_token})`
- 热页面（`/`, `/activity`）并发拉 `payments/history` + `payments/received` → 单次落地 4 次 Privy RTT
- 修：60s 内存 / Redis 缓存 token → user 映射，hash 后做 key；不需 `username/profilePictureUrl` 的路由直接跳过用户拉取。

**C2 · Scheduler N+1 + 顺序执行**
- `lib/agent/scheduler-runtime.ts:44-77` — 每个 mandate 一次 `findFirst` + 顺序 `fireForMandate`
- 10 个 due mandate × 1-3s/次 = 30s+，1 分钟 tick 容易溢出
- 修：一次 `groupBy({by:['mandateId'], _max:{createdAt}})` 取最新动作；`Promise.all` 并行 4-8 个；新增索引 `@@index([trigger, mandateId, createdAt desc])`

**C3 · execute 多一次 `getObject` RPC**
- `lib/agent/executor.ts:73, 225-244` — 漂移检查每步 +150-400ms
- 修：信任 DB `mandate.witnessCommit`，让链上拒绝来暴露漂移；批量 `multiGetObjects` 也可

#### HIGH 摘录

| 编号 | 问题 | 文件 |
|---|---|---|
| H1 | `FloatingAgentButton` 同步导入完整 AgentDashboard | `app/(hub)/layout.tsx` |
| H2 | `payments/history` 每行运行时 URL 解析 | `app/api/v1/payments/history/route.ts:130-151` |
| H3 | `received-dashboard.getReceivedRecipientSummary` 内联 `getAllBalances` 且缓存仅 cursor 路径 | `lib/received-dashboard.ts:308-329, 480-490` |
| H4 | `payments/send` 内部递归调 confirm 路由 4-6 次 | `app/api/v1/payments/send/route.ts:8, 109-114, 252-318` |
| H5 | `paymentQuote.findFirst` 应改 `findUnique` | `payments/send/route.ts:385-396`, `payments/confirm/route.ts:163` |
| H6 | rate-limit Redis 失败 fail-open + 未 `await connect()` | `lib/rate-limit.ts:30-43, 89-98` |
| H7 | `list_my_mandates` 拉全字段（含大 JSON） | `lib/agent/tools.ts:24-35`, `agent/mandate/list/route.ts:28-32` |

#### MEDIUM 摘录

- M1：`agent/mandate/[id]` 两次串行查询 → `prisma.$transaction([...])`
- M2：`stable-layer-earn` 内 `$transaction` 包了多个 await → 释放后再开事务
- M3：`received-dashboard.findIncomingPaymentRows` 最多 10 轮分页过滤 → WHERE 下推
- M4：`getTransactionBlock` 一律 `showEffects+showObjectChanges+showBalanceChanges+showInput` → 按需
- M5：X 用户名 case-insensitive 全表扫 → `LOWER(username)` 函数索引
- M6：`paymentLedger.groupBy` 无上限 → 维护 `received_totals` 聚合
- M7：scheduler 每分钟 tick 无智能间隔 → 按 `nextCronRun` 动态 sleep
- M8：`confirmPendingStake` 串行 RPC → 后台队列

---

### 3) 架构 — 3 个 HIGH、3 个 MEDIUM、若干 LOW

#### HIGH

- **Redis 锁失败时 scheduler 静默 skip**（`scheduler-runtime.ts:fireForMandate`）：写入 redis counter 也失败，DB 无 `AgentAction.FAILED` 记录 → 整个 mandate 群体被静默忽略且无审计。修：先写 synthetic `AgentAction(status=FAILED, errorReason='redis_lock_unavailable')`，或 tick 入口做 health-check gate。
- **`execute_mandate_now` 工具绕过 Redis 锁**（`lib/agent/tools.ts`）：与 HTTP 路由不一致，同 mandate 并发可能两条 PENDING 行。修：把锁封进 `executeNextStep` 或 `lockedExecuteNextStep` 包装。
- **Worker 部署产物未提交**（`workers/agent-scheduler.ts`）：无 Dockerfile.worker / Fly `[processes]` / K8s manifest；双实例会双执行。修：加 Dockerfile.worker + 启动 health check（Redis 不可用就退出），单实例约束写入部署配置。

#### MEDIUM

- **`AgentSession.messages` 无封顶**（`schema.prisma` AgentSession）：长对话 → 单行 MB 级 JSON。修：写入路径 cap 历史长度，或拆 `AgentSessionMessage` 表。
- **`PendingEarnSettlement.status` 等字段未 enum 化**：新 agent 表已用 enum，老表用 String。修：迁移成 `EarnSettlementStatus` enum。
- **Sui 成功 + DB tx 失败 → mandate 永久卡 PENDING**（`executor.executeNextStep`）：后续 tick 会因 commit 漂移持续失败。修：drift 路径加对账例程，比对链上 `confirmedTxDigest`，匹配即幂等推进 DB。

#### LOW 摘录

- `lib/agent/types.ts` 与 `lib/agent/mandate-spec.ts` 双 MandateSpec 定义（同时也在死代码报告里）
- `markActionConfirmed` 不在同一 `$transaction` 内 → 故障窗口 PENDING 卡死
- `failed` outcome → HTTP 500 不区分瞬时/永久
- `MandateStatus.PAUSED_BY_USER` 枚举无写入路径
- `(hub)/layout.tsx` 整层 client component 而非 client island
- `AgentSession` 在前端 `useChat` 没 hydrate → 服务端历史白存
- chat tool 内 try/catch 缺失，错误不落 AgentAction 行

---

### 4) 死代码 — ~800–1000 LOC 可清

| 类别 | 文件 | 操作 |
|---|---|---|
| Ad-hoc 脚本（无 pnpm 绑定） | `apps/web/scripts/{agent-smoke,chat-smoke,check-db,check-scheduler-state,debug-mandate,scheduler-single-tick,fund-gas-station}.ts` | 删；保留 `agent-e2e`、`agent-flow-e2e`、`pregenerate-wallets`、`gas-station-maintenance`（已绑定） |
| 孤儿文件 | `apps/web/lib/vault-ownership.ts` | 删 |
| 未引用 shadcn 组件 | `apps/web/components/ui/{badge,card,separator,skeleton}.tsx` | 删（需要时 `pnpm dlx shadcn add` 再生成） |
| **重复定义（关键）** | `lib/agent/types.ts` 的 `MandateSpec/CoinLimitSpec` vs `lib/agent/mandate-spec.ts` 的 Zod 版 | 删 types.ts 那份，所有引用切到 mandate-spec.ts |
| 未引用导出（lib/agent/） | `flowPackageId`、`initialCommit`、`chainPackageId`、`buildUpdateExpiryTx`、`buildDeriveActionCommitTx`、`AgentToolName`、`AGENT_NETWORK`、`getMandateStructType`、`fetchMandate`、Move 事件类型、`ACTION_LABEL` 改 const | 单文件级删除 |
| Legacy HMAC fallback | `lib/hmac.ts:65`、`lib/wallet-auth.ts:70`、`lib/scoped-hmac.ts:7` | 计划 2026-Q2，建议提前完成 |
| 计划文档同步 | `tasks/levo-agent-frontend-plan.md` 中 Scripts 表 | 同步删除引用 |

---

## 推荐执行顺序

### 第 1 周（主网前阻断项）
1. 安全 C-1：所有 agent 路由加 privyUserId 绑定（复制 payment 路由模式）
2. 安全 C-2：execute_mandate_now 改为前端按钮 + CSRF token；chat messages schema 严格化
3. 安全 C-3：`mandate.move::create` 绑定 agent 地址常量或 registry，`MandateSpecSchema.agent` 服务端强制等值
4. 安全 C-4：Privy `verifyAccessToken` 加 audience；高危路由要求 fresh re-auth
5. 死代码：合并 MandateSpec 双定义（半小时）
6. 架构 HIGH：`execute_mandate_now` 工具入锁、scheduler 锁失败写 FAILED 行

### 第 2 周（上线前 + 性能基线）
7. 安全 H-1 / H-7：Seal `verifyKeyServers: true`，`seal_approve` 加 sender 断言
8. 安全 H-4：revoke/destroy 与 execute 共享 Redis 锁
9. 安全 H-6：Sui keypair 接 KMS（最大块）
10. 架构 HIGH：Dockerfile.worker + 部署配置 + Sui→DB 对账例程
11. 性能 C1 / C2 / C3：Privy 缓存、scheduler 批量 + 并行、删多余 getObject

### 第 3 周（清理 + P2）
12. 安全 M 系列 + 性能 H/M 系列分批
13. 死代码大扫除（脚本、孤儿文件、shadcn 未用组件、未引用导出）
14. `lib/` 子目录化（`earn/`、`payments/`、`privy/`）
15. 计划文档与 README 同步

---

## 参考路径速查

```
apps/web/lib/agent/
├── executor.ts           ← C-3, H-5, 性能 C3
├── scheduler-runtime.ts  ← 架构 HIGH、性能 C2
├── tools.ts              ← 安全 C-2、H-2、架构 HIGH
├── mandate-flow.ts       ← 安全 H-4、M-6
├── seal-client.ts        ← 安全 H-1
├── kms.ts                ← 安全 H-6、L-5
├── types.ts ⚠️ 与 mandate-spec.ts 冲突
└── mandate-spec.ts ✅

apps/web/app/api/v1/agent/mandate/[id]/
├── execute/route.ts      ← 安全 C-1
├── revoke/route.ts       ← 安全 C-1、H-4
├── destroy/route.ts      ← 安全 C-1、H-4
└── initialize/route.ts   ← 安全 C-1

apps/web/lib/privy-auth.ts ← 安全 C-4、性能 C1
apps/web/lib/rate-limit.ts ← 安全 M-2、性能 H6
apps/web/lib/redis-lock.ts ← 安全 M-3、架构 HIGH

packages/levo-agent/sources/
├── mandate.move          ← 安全 C-3
└── seal_policy.move      ← 安全 H-7

apps/web/workers/agent-scheduler.ts ← 架构 HIGH
apps/web/prisma/schema.prisma       ← 架构 MEDIUM
```

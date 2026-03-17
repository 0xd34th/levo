# Levo Testnet 上线清单

## Context

Phase 1-3 代码全部完成：Privy 认证、嵌入式钱包、发送 API、Gas 赞助、Claim 流程。
TypeScript 零错误，79/80 测试通过（1 个预存失败），数据库迁移已运行。
目标：列出从当前状态到 testnet 可用之间的所有待办事项。

---

## 已完成（无需改动）

- 16 个 API 路由全部实现（quote, send, confirm, claim, history, received, wallet/setup, lookup...）
- 嵌入式钱包双路径发送 (Privy server-side + DApp Kit fallback)
- Claim 流程 (Nautilus attestation → claim_vault → sweep → withdraw → transfer)
- Gas 赞助 (可选，`GAS_STATION_SECRET_KEY` 配置即启用)
- 前端所有页面 (Send, Claim, Dashboard Sent/Received, Lookup)
- 数据库 schema + 6 个迁移全部 applied
- 合约已部署 testnet (`deployed.testnet.json` 有完整 ID)

---

## 上线待办事项

### 1. Nautilus Enclave 服务部署

**为什么**：Claim 流程依赖 enclave 签署 attestation，当前只有客户端代码 (`lib/nautilus.ts`)，没有 enclave 服务本身。

**要做的**：
- [ ] 实现 Nautilus enclave HTTP 服务（验证 X 身份 → 签署 BCS AttestationMessage）
- [ ] 服务需要 Ed25519 keypair，对应的公钥已注册到链上 `EnclaveRegistry`
- [ ] 部署到可访问的 URL
- [ ] 配置 `NAUTILUS_ENCLAVE_URL` 和 `ENCLAVE_REGISTRY_ID`

**涉及文件**：
- 新项目：enclave 服务（不在当前 repo 内）
- `apps/web/.env` — 配置 URL
- `packages/contracts/deployed.testnet.json` — 确认 enclave registry ID

### 2. Gas Station 配置

**为什么**：嵌入式钱包新建后余额为 0，无法支付 gas。Gas 赞助让用户只需持有转账代币。

**要做的**：
- [ ] 生成 Ed25519 keypair: `openssl rand -base64 32`
- [ ] 将 base64 seed 填入 `GAS_STATION_SECRET_KEY`
- [ ] 启动 app 后从日志获取派生的 Sui 地址（或写个小脚本打印）
- [ ] 向该地址转入足够的 testnet SUI（用 faucet 或 Sui CLI）

### 3. 环境变量配置

**为什么**：13 个 env var 全部需要填写才能正常运行。

```
# 必填
DATABASE_URL          — PostgreSQL 连接串
REDIS_URL             — Redis 连接串（rate limiting）
TWITTER_API_KEY       — twitterapi.io API key
NEXT_PUBLIC_PRIVY_APP_ID — Privy Dashboard 获取
PRIVY_APP_SECRET      — Privy Dashboard 获取
HMAC_SECRET           — openssl rand -hex 32
APP_ORIGIN            — 部署域名 (e.g. https://levo.app)
NEXT_PUBLIC_SUI_NETWORK — "testnet"
NEXT_PUBLIC_PACKAGE_ID — deployed.testnet.json 中的值
NEXT_PUBLIC_VAULT_REGISTRY_ID — deployed.testnet.json 中的值
NEXT_PUBLIC_TREASURY_CAP_ID — deployed.testnet.json 中的值
ENCLAVE_REGISTRY_ID   — deployed.testnet.json 中的值

# 可选但强烈推荐
GAS_STATION_SECRET_KEY — base64 Ed25519 seed
NAUTILUS_ENCLAVE_URL   — enclave 服务 URL
```

### 4. 端到端测试

**要做的**：
- [ ] 启动本地 dev 环境 (`pnpm dev`)
- [ ] 测试 Send 流程：X 登录 → 嵌入式钱包创建 → 充值 → 发送到 @handle
- [ ] 测试 Claim 流程：@handle 登录 → 嵌入式钱包 → claim vault → 资金到账
- [ ] 测试 Dashboard：sent 页查看发送记录，received 页查看接收记录
- [ ] 测试外部钱包 fallback：DApp Kit 钱包连接 → 发送
- [ ] 测试错误场景：余额不足、quote 过期、rate limit

### 5. Enclave 测试密钥轮换

**为什么**：`deployed.testnet.json` 标注 "TEST ONLY — Rotate before production"。

**要做的**：
- [ ] testnet 阶段可暂用测试密钥
- [ ] mainnet 部署前必须轮换：生成新 keypair → `register_pubkey` 链上注册 → `remove_pubkey` 移除旧密钥

### 6. 遗留代码清理（非阻塞）

- [ ] `lib/hmac.ts:57` — TODO(2026-Q2): 移除 legacy HMAC fallback
- [ ] `lib/wallet-auth.ts:70` — 同上
- [ ] `send-form.test.ts` — 修复 1 个预存失败的测试（unsupported coin type test case）

---

## 验证方式

```bash
# 1. 类型检查
cd apps/web && npx tsc --noEmit

# 2. 测试
npx vitest run

# 3. 本地启动
pnpm dev
# 浏览器访问 http://localhost:3000

# 4. 手动测试 claim API (需要 enclave 运行)
curl -X POST http://localhost:3000/api/v1/payments/claim \
  -H "Cookie: privy-id-token=<token>"
```

---

## 优先级排序

| 优先级 | 事项 | 阻塞上线？ |
|--------|------|-----------|
| P0 | 环境变量配置 | 是 |
| P0 | Nautilus enclave 服务部署 | 是（claim 不可用） |
| P1 | Gas station 配置 + 充值 | 是（嵌入式钱包无法发送） |
| P1 | 端到端测试 | 是 |
| P2 | Enclave 密钥轮换 | 否（testnet 可用测试密钥） |
| P3 | 遗留代码清理 | 否 |

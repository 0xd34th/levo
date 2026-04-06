# Levo

Send stablecoins to any X handle on Sui — no wallet address needed. Recipients claim funds when ready.

## How it works

1. **Send** — Enter an `@handle` and amount in USDC. Levo derives a deterministic vault address from the X user ID, mints the incoming USDC into LevoUSD through StableLayer on mainnet, and deposits the settlement asset into the vault. The sender's Privy embedded wallet signs the transaction server-side with gas sponsorship.
2. **Claim** — The recipient signs in with X via Privy. A Nautilus signer produces an Ed25519 attestation binding the X user ID to the recipient's Sui address. The on-chain contract verifies this attestation, claims the vault, sweeps funds, withdraws LevoUSD, burns it back to USDC, and transfers USDC to the recipient.
3. **Dashboard** — Both senders and recipients can view payment history and track transaction status.

## Architecture

```
apps/web              Next.js 16 frontend + API routes
apps/nautilus-signer  Attestation signer (Node.js HTTP service)
packages/contracts    Sui Move smart contracts (XVault + NautilusVerifier)
packages/levo-usd     Standalone LevoUSD coin package for StableLayer settlement
```

### Smart contracts (`packages/contracts`)

- **XVaultRegistry** — Global registry, admin controls, pause toggle
- **XVault** — Per-user vault with deterministic address derivation (`derived_object`)
- **NautilusVerifier** — Ed25519 attestation verification with registered enclave public keys
- **LevoUSD** — Levo-branded StableLayer settlement asset (`levo_usd::LEVO_USD`)
- Key operations: `derive_vault_address`, `claim_vault`, `sweep_coin_to_vault`, `withdraw`, `withdraw_all`
- Claim requires a valid Ed25519 attestation signature from a registered enclave key

### Nautilus signer (`apps/nautilus-signer`)

Standalone Node.js service that signs claim attestations. Produces BCS-compatible Ed25519 signatures that the on-chain `nautilus_verifier::verify_attestation` accepts.

- `POST /attestation` — Accepts `{ x_user_id, sui_address }`, returns `{ signature, nonce, expires_at }`
- Requires `Authorization: Bearer <shared-secret>` header
- Designed to later move behind AWS Nitro Enclaves without changing the web app API

### Web app (`apps/web`)

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Send | `/` | Send funds to an X handle |
| Claim | `/claim` | Claim vault after X login |
| Dashboard | `/dashboard/sent` | Sent payment history |
| Dashboard | `/dashboard/received` | Received payment history |

Key API routes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/lookup/x-username` | GET | Public vault status lookup |
| `/api/v1/payments/quote` | POST | Generate HMAC-signed payment quote |
| `/api/v1/payments/send` | POST | Build, sign (Privy), and execute send transaction |
| `/api/v1/payments/confirm` | POST | Confirm payment after on-chain verification |
| `/api/v1/payments/claim` | POST | Request attestation, build and execute claim transaction |
| `/api/v1/wallet/setup` | POST | Provision Privy embedded Sui wallet |

### Tech stack

- **Frontend**: React 19, Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui
- **Auth**: Privy (X/Twitter OAuth + embedded Sui wallets)
- **Sui SDK**: @mysten/sui, stable-layer-sdk
- **Backend**: Next.js API routes, Prisma (PostgreSQL), Redis (rate limiting + locks)
- **Signer**: Node.js, @noble/curves (Ed25519), zod
- **Contracts**: Sui Move (2024.beta edition)
- **Testing**: Vitest (web + signer), Move unit tests (contracts)

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- Sui CLI (for contract deployment)

## Setup

```bash
# Install dependencies
git clone https://github.com/0xd34th/levo.git && cd levo
pnpm install
```

### 1. Configure `apps/web/.env`

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `TWITTER_API_KEY` | From [twitterapi.io](https://twitterapi.io) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | From Privy dashboard |
| `PRIVY_APP_SECRET` | From Privy dashboard |
| `HMAC_SECRET` | `openssl rand -hex 32` |
| `APP_ORIGIN` | `http://localhost:3000` |
| `NEXT_PUBLIC_SUI_NETWORK` | `mainnet` |
| `SUI_RPC_URL` | Mainnet fullnode URL, for example `https://fullnode.mainnet.sui.io:443` |
| `NEXT_PUBLIC_PACKAGE_ID` | Mainnet xvault/verifier package ID |
| `NEXT_PUBLIC_VAULT_REGISTRY_ID` | Shared `XVaultRegistry` object ID from the same publish |
| `LEVO_USD_COIN_TYPE` | Active settlement coin type, typically from the standalone `packages/levo-usd` publish |
| `GAS_STATION_SECRET_KEY` | `openssl rand -base64 32` (fund the derived address with mainnet SUI) |
| `ENCLAVE_REGISTRY_ID` | `NautilusVerifier` registry object ID from the same publish |
| `NAUTILUS_ENCLAVE_URL` | `http://127.0.0.1:8787` |
| `NAUTILUS_SIGNER_SECRET` | Shared secret with signer — `openssl rand -hex 32` |

### 2. Configure `apps/nautilus-signer/.env`

```bash
cp apps/nautilus-signer/.env.example apps/nautilus-signer/.env
```

| Variable | Description |
|----------|-------------|
| `HOST` | `127.0.0.1` |
| `PORT` | `8787` |
| `ENCLAVE_REGISTRY_ID` | Same value as web app |
| `NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY` | The registered mainnet signer public key; startup now fails if this is missing or mismatched |
| `NAUTILUS_SIGNER_SECRET` | Must match web app's `NAUTILUS_SIGNER_SECRET` |
| `NAUTILUS_SIGNER_SEED_BASE64` | Ed25519 seed matching the registered on-chain public key (stored outside repo) |

### 3. Bootstrap mainnet in one command

填好两份 `.env` 里的业务配置和密钥后，只需要额外提供一个管理员私钥环境变量：

```bash
export SUI_DEPLOYER_PRIVATE_KEY="suiprivkey..."
```

先做只读检查：

```bash
pnpm bootstrap:mainnet -- --check --json
```

确认输出正常后执行真实重配：

```bash
pnpm bootstrap:mainnet -- --confirm-mainnet --json
```

这个 bootstrap 会自动完成：

- 复用或重发 `xvault/verifier` 主网合约
- 复用或重发 standalone `LevoUSD` 包
- 执行 `stable_layer::new<BrandCoin, USDC>`
- 执行 `stable_layer::add_entity<BrandCoin, USDC, StableVaultFarmEntity<...>>`
- 注册 signer 公钥
- 回填 `apps/web/.env`
- 回填 `apps/nautilus-signer/.env`
- 更新 [`packages/contracts/deployed.mainnet.json`](packages/contracts/deployed.mainnet.json)

默认模式会优先复用链上有效对象，只补缺项；只有显式传 `--force-redeploy` 才会全量重发并写入历史归档。

约束和边界：

- `SUI_DEPLOYER_PRIVATE_KEY` 只用于链上交易，不会写回仓库文件
- `GAS_STATION_SECRET_KEY` 仍从 `apps/web/.env` 读取
- `NAUTILUS_SIGNER_SEED_BASE64` 仍从 `apps/nautilus-signer/.env` 读取
- gas sponsor 地址余额为 `0` 时 bootstrap 会直接失败；低于 `0.1 SUI` 只会告警，不自动转账

### 4. Database and services

```bash
# Database
cd apps/web && npx prisma migrate deploy && npx prisma generate

# Terminal 1 — signer
cd apps/nautilus-signer && node --env-file=.env --import=tsx src/server.ts

# Terminal 2 — web
pnpm --filter web dev
```

### 4.1 Manual rsync deploy to OVH

如果你不想让服务器自己 `git fetch`，可以直接从本机把当前工作树同步到 OVH，再在远端执行安装、构建、迁移和进程重启：

```bash
scripts/deploy-rsync.sh --host ovhsui.3mate.io --port 10122 --user root --remote-dir /opt/levo
```

如果服务器用的不是本地开发 `.env`，可以显式指定两份运行时配置：

```bash
scripts/deploy-rsync.sh \
  --web-env-file /path/to/web.prod.env \
  --signer-env-file /path/to/signer.prod.env
```

约束：

- 脚本会同步当前工作树，但会排除 `.git`、`node_modules`、本地状态目录和运行时 `.env`
- `apps/web/.env` 与 `apps/nautilus-signer/.env` 会在代码同步后单独上传
- 远端默认执行：`pnpm install --frozen-lockfile` -> `pnpm --filter web build` -> `npx prisma migrate deploy` -> `supervisorctl restart levo-signer levo-web`
- 只想先看变更范围时，可加 `--dry-run`

### 5. Manual subcommands

如果你不想走总控 bootstrap，仍然可以分别执行底层主网脚本：

```bash
pnpm publish:contracts:mainnet -- --confirm-mainnet --gas-budget 100000000
pnpm publish:levo-usd:mainnet -- --confirm-mainnet --gas-budget 50000000
pnpm onboard:levo-usd:mainnet -- --treasury-cap-id 0x... --brand-coin-type 0x...::levo_usd::LEVO_USD --max-supply-raw 1000000000000 --dry-run --json
pnpm add-entity:levo-usd:mainnet -- --factory-cap-id 0x... --brand-coin-type 0x...::levo_usd::LEVO_USD --dry-run --json
pnpm register:enclave-pubkey -- --package-id 0x... --enclave-registry-id 0x... --seed-base64 <BASE64> --dry-run --json
```

其中 StableLayer 的正确顺序已经固定为：

1. `stable_layer::new<BrandCoin, USDC>`
2. `stable_layer::add_entity<BrandCoin, USDC, StableVaultFarmEntity<...>>`

## Testing

```bash
pnpm --filter web exec vitest run              # Web app tests
pnpm --filter nautilus-signer exec vitest run   # Signer tests
cd packages/contracts && sui move test          # Move contract tests
cd packages/levo-usd && sui move build          # Standalone LevoUSD package build
```

## Design decisions

### Why Privy instead of zkLogin

zkLogin ties a Sui address to a specific OAuth provider nonce and epoch — if the user's JWT expires or Sui epochs rotate, the derived address changes and funds become inaccessible. This is a critical risk for a product where funds sit in vaults for an indefinite period before the recipient claims them.

Privy gives us a persistent, server-managed embedded wallet per user. The wallet address is stable across sessions and doesn't depend on OAuth token lifecycle. It also lets us do server-side transaction signing (for gas sponsorship and atomic claim flows) without requiring the user to install a browser extension or understand gas. The UX is "sign in with X, funds appear" — no wallet friction at all.

We can always add zkLogin as an optional advanced path later, but for the MVP the embedded wallet approach eliminates the largest class of "lost funds" edge cases.

### Why a local signer instead of AWS Nitro Enclaves

The attestation signer is built as a standalone Node.js service (`apps/nautilus-signer`) with the same API contract that a Nitro Enclave would expose. The external interface is identical: `POST /attestation` with a bearer secret, returning a signed BCS payload that the on-chain `nautilus_verifier` accepts.

Moving to Nitro is a deployment change, not a code change — swap the Node process for an enclave image, rotate the signing key, and register the new public key on-chain. The web app doesn't change at all.

For day-to-day development, standing up a Nitro enclave still adds operational complexity (EC2 instance, enclave build pipeline, PCR attestation) with zero local-productivity benefit. The signer service keeps the same API contract, but mainnet deployments must run with a dedicated seed, an explicit `NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY`, and a separately registered on-chain public key. Moving the process behind Nitro remains a deployment hardening step, not an application rewrite.

### Mainnet key prep helpers

```bash
# 1. Derive the signer public key (and its Sui address for bookkeeping)
pnpm derive:key-info -- --seed-base64 "$NAUTILUS_SIGNER_SEED_BASE64" --label nautilus-mainnet

# 2. Preview the enclave pubkey registration command
pnpm register:enclave-pubkey -- \
  --package-id "$NEXT_PUBLIC_PACKAGE_ID" \
  --enclave-registry-id "$ENCLAVE_REGISTRY_ID" \
  --seed-base64 "$NAUTILUS_SIGNER_SEED_BASE64"

# 3. Execute a mainnet dry-run once your Sui CLI env is switched to mainnet
pnpm register:enclave-pubkey -- \
  --package-id "$NEXT_PUBLIC_PACKAGE_ID" \
  --enclave-registry-id "$ENCLAVE_REGISTRY_ID" \
  --seed-base64 "$NAUTILUS_SIGNER_SEED_BASE64" \
  --dry-run --json
```

`register:enclave-pubkey` only executes when you explicitly pass `--dry-run` or `--execute-mainnet --confirm-mainnet`. Otherwise it prints the exact `sui client call` command for review.

## Historical testnet proof

The original claim/send flow was verified on Sui testnet before the mainnet migration — screenshots at [`infra/images/`](infra/images/):

| Screenshot | Description |
|------------|-------------|
| `sent.png` | 0.1 SUI sent to `@moore_expo`, confirmed on-chain transfer to the deterministic vault |
| `claim.png` | Recipient signed in with X, embedded wallet provisioned, funds claimed in one transaction |
| `proof.png` | SuiVision explorer confirming 0.1 SUI in the recipient's embedded wallet |

## License

Private — All rights reserved.

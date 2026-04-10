# Levo

Send stablecoins to any X handle on Sui, and let users earn yield in USDC with a Privy embedded wallet.

## How it works

1. **Send** — Enter an `@handle` and amount in USDC. Levo resolves a canonical Privy-backed Sui wallet for the X user and sends there directly.
2. **Earn** — Users stake USDC through StableLayer, keep a USDC-only UX, and can claim yield or withdraw back to USDC.
3. **Dashboard** — Users can view balances, recent activity, and direct wallet delivery status.

## Architecture

```
apps/web           Next.js 16 frontend + API routes
packages/levo-usd  Standalone LevoUSD coin package for StableLayer settlement
```

### On-chain package (`packages/levo-usd`)

- **LevoUSD** — Levo-branded StableLayer settlement asset (`levo_usd::LEVO_USD`)
- Current product flow uses direct Privy wallets plus StableLayer earn flows; there is no claim/vault signer sidecar in the repo

### Web app (`apps/web`)

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Send | `/send` | Send funds to an X handle |
| Deposit | `/deposit` | Fund the embedded wallet with USDC |
| Earn | `/earn` | Stake USDC, claim yield, or withdraw back to USDC |
| Activity | `/activity` | Sent and received payment history |
| Lookup | `/lookup` | Public recipient wallet lookup by X handle |

Key API routes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/lookup/x-username` | GET | Public recipient wallet lookup and recent incoming activity |
| `/api/v1/payments/quote` | POST | Generate HMAC-signed payment quote |
| `/api/v1/payments/send` | POST | Build, sign (Privy), and execute send transaction |
| `/api/v1/payments/confirm` | POST | Confirm payment after on-chain verification |
| `/api/v1/wallet/setup` | POST | Provision Privy embedded Sui wallet |
| `/api/v1/earn/summary` | GET | Load USDC balances, deposited amount, and claimable yield |
| `/api/v1/earn/preview` | POST | Preview a StableLayer earn action |
| `/api/v1/earn/execute` | POST | Authorize and execute a StableLayer earn action |
| `/api/v1/earn/confirm` | POST | Confirm earn settlement after on-chain verification |

### Tech stack

- **Frontend**: React 19, Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui
- **Auth**: Privy (X/Twitter OAuth + embedded Sui wallets)
- **Sui SDK**: @mysten/sui, stable-layer-sdk
- **Backend**: Next.js API routes, Prisma (PostgreSQL), Redis (rate limiting + locks)
- **Contracts**: Sui Move (2024.beta edition)
- **Testing**: Vitest (web), Move unit tests (contracts)

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
| `NEXT_PUBLIC_PACKAGE_ID` | Mainnet Levo package ID |
| `LEVO_USD_COIN_TYPE` | Active settlement coin type, typically from the standalone `packages/levo-usd` publish |
| `GAS_STATION_SECRET_KEY` | `openssl rand -base64 32` (fund the derived address with mainnet SUI) |

### 2. Database and services

```bash
# Database
cd apps/web && npx prisma migrate deploy && npx prisma generate

# Terminal 1 — web
pnpm --filter web dev
```

### 2.1 Manual rsync deploy to OVH

如果你不想让服务器自己 `git fetch`，可以直接从本机把当前工作树同步到 OVH，再在远端执行安装、构建、迁移和进程重启：

```bash
scripts/deploy-rsync.sh --host ovhsui.3mate.io --port 10122 --user root --remote-dir /opt/levo
```

如果服务器用的不是本地开发 `.env`，可以显式指定两份运行时配置：

```bash
scripts/deploy-rsync.sh \
  --web-env-file /path/to/web.prod.env \
```

约束：

- 脚本会同步当前工作树，但会排除 `.git`、`node_modules`、本地状态目录和运行时 `.env`
- `apps/web/.env` 会在代码同步后单独上传
- 远端默认执行：`pnpm install --frozen-lockfile` -> `pnpm --filter web build` -> `npx prisma migrate deploy` -> `supervisorctl restart levo-web`
- 只想先看变更范围时，可加 `--dry-run`

### 3. Mainnet publish steps

当前主网发布流程只保留 LevoUSD 相关步骤：

```bash
pnpm publish:levo-usd:mainnet -- --confirm-mainnet --gas-budget 50000000
pnpm onboard:levo-usd:mainnet -- --treasury-cap-id 0x... --brand-coin-type 0x...::levo_usd::LEVO_USD --max-supply-raw 1000000000000 --dry-run --json
pnpm add-entity:levo-usd:mainnet -- --factory-cap-id 0x... --brand-coin-type 0x...::levo_usd::LEVO_USD --dry-run --json
```

其中 StableLayer 的正确顺序已经固定为：

1. `stable_layer::new<BrandCoin, USDC>`
2. `stable_layer::add_entity<BrandCoin, USDC, StableVaultFarmEntity<...>>`

## Testing

```bash
pnpm --filter web exec vitest run              # Web app tests
cd packages/levo-usd && sui move build          # Standalone LevoUSD package build
```

## Design decisions

### Why Privy instead of zkLogin

zkLogin ties a Sui address to a specific OAuth provider nonce and epoch. If the user's JWT expires or Sui epochs rotate, the derived address can change and account recovery becomes harder to reason about for a consumer payments product.

Privy gives us a persistent, server-managed embedded wallet per user. The wallet address is stable across sessions and doesn't depend on OAuth token lifecycle. It also lets us do server-side transaction signing for gas sponsorship, direct-to-wallet delivery, and StableLayer earn flows without requiring the user to install a browser extension or understand gas. The UX stays "sign in with X, funds appear" with minimal wallet friction.

We can always add zkLogin as an optional advanced path later, but for the MVP the embedded wallet approach eliminates the largest class of "lost funds" edge cases.

## License

Private — All rights reserved.

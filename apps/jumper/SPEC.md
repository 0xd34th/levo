## Goal

修复 `jumper.krilly.ai` 浏览器侧对 upstream backend / pipeline / Strapi 的直接跨域访问，并收回浏览器公开的 Strapi token。

## Scope

- 为浏览器公开环境变量增加 same-origin 归一化，固定把：
  - `NEXT_PUBLIC_BACKEND_URL` 暴露为 `<site-origin>/api/jumper/v1`
  - `NEXT_PUBLIC_LIFI_BACKEND_URL` 暴露为 `<site-origin>/api/jumper/pipeline`
  - `NEXT_PUBLIC_STRAPI_URL` 暴露为 `<site-origin>/api/jumper/strapi`
- 保留 `backend` / `pipeline` 的 Next rewrites，但不再依赖 `next.config.mjs` 通过修改 `process.env.NEXT_PUBLIC_*` 作为浏览器真值。
- 新增 `/api/jumper/strapi/:path*` same-origin Strapi 代理，服务端读取私有 token 转发 GET 请求。
- 拆分 Strapi helper 的 server/client 责任：
  - client 只能拿 same-origin base URL
  - server 才能读取 upstream Strapi URL 和 token
- 改掉所有 client hook 中对 `NEXT_PUBLIC_STRAPI_API_TOKEN` 和 upstream Strapi API 的直接依赖。
- 更新类型定义和公开 env contract，移除 `NEXT_PUBLIC_STRAPI_API_TOKEN`。

## Non-Goals

- 不修改 upstream `api.jumper.exchange` / `strapi-staging.jumper.exchange` 的 CORS 配置。
- 不统一改造所有静态媒体/CDN 域名策略；本轮聚焦 API fetch 和浏览器公开配置。
- 不重构与本次 same-origin / token 问题无关的业务功能。

## Constraints

- 浏览器公开配置必须基于 `NEXT_PUBLIC_SITE_URL` 归一化；live 页面 `window._env_` 不能再暴露 upstream backend/Strapi 地址和 `NEXT_PUBLIC_STRAPI_API_TOKEN`。
- server 内部仍可继续使用 upstream backend / Strapi 原值，不得因为浏览器 same-origin 契约破坏服务端取数。
- Strapi token 只能保留在服务端私有 env；兼容过渡期可从旧的 `NEXT_PUBLIC_STRAPI_API_TOKEN` 回退读取，但不得继续下发到客户端。
- client hook / client component 不得再直接请求 `strapi-staging.jumper.exchange` 或附带 Strapi bearer token。
- 修复要覆盖主交易流、公告、feature cards、memelist 等当前 client-side Strapi 入口，不留新旧双轨。

## Acceptance

1. `getPublicEnvVars()` 与 client build-time fallback 产出的公开 env 已统一归一化，并且不再包含 `NEXT_PUBLIC_STRAPI_API_TOKEN`。
2. `layout.tsx`、`not-found.tsx` 和 `/api/env-config.js` 输出的 `window._env_` 中：
   - `NEXT_PUBLIC_BACKEND_URL = https://jumper.krilly.ai/api/jumper/v1`
   - `NEXT_PUBLIC_LIFI_BACKEND_URL = https://jumper.krilly.ai/api/jumper/pipeline`
   - `NEXT_PUBLIC_STRAPI_URL = https://jumper.krilly.ai/api/jumper/strapi`
3. `next.config.mjs` 仍保留 `/api/jumper/v1/:path*` 和 `/api/jumper/pipeline/:path*` rewrites，但其判定只用于服务端 rewrite，不再修改浏览器公开 env。
4. 新增 `/api/jumper/strapi/:path*` route handler，转发 query / method / 必要 headers，并在服务端追加 Strapi bearer token。
5. 所有 client-side Strapi fetch 已改为走 same-origin proxy，不再读 `getStrapiApiAccessToken()`。
6. `apps/jumper build` 通过。
7. 回归测试覆盖：
   - public env 归一化
   - Strapi proxy route
   - `getApiUrl()` same-origin 合约
   - 关键 client-side Strapi 请求不再依赖 token

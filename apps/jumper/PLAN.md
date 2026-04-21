1. 为 `src/config/env-config.ts` 增加公开 env 归一化 helper，并让 `getPublicEnvVars()` / `clientBuildTimeEnv` 共用同一真值。
2. 清理 `next.config.mjs` 中对 `process.env.NEXT_PUBLIC_*` 的副作用写入，只保留 rewrite 目标判定和转发规则。
3. 拆分 Strapi helper：
   - `strapiHelper.ts` 只保留 client-safe base URL
   - 新增 server-only helper 读取 `STRAPI_URL` / `STRAPI_API_TOKEN` 及过渡回退
4. 新增 `/api/jumper/strapi/[...path]/route.ts`，转发 GET 请求到 upstream Strapi，并透传 query 与必要请求头。
5. 把 `useAnnouncements`、`useStrapi`、`useMemelist`、`usePersonalizedFeatureOnLevel`、`usePersonalizedFeatureCardsQuery` 改为 same-origin Strapi proxy。
6. 将 server-side Strapi 读取逻辑切到 server-only helper，避免继续从 public helper 读取 token。
7. 更新 `new-types.d.ts` 等公开 env 类型，移除 `NEXT_PUBLIC_STRAPI_API_TOKEN`，补充私有 `STRAPI_URL` / `STRAPI_API_TOKEN`。
8. 添加回归测试并运行 `pnpm --filter @levo/jumper test:unit`、`typecheck`、`build` 验证。

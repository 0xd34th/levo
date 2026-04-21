## Goal

修复 `jumper.krilly.ai` 首页因可选营销/广告配置缺失或被后端拒绝的埋点请求而产生错误噪声的问题，并确保主交易流在缺少这些配置时仍可正常渲染。

## Scope

- 将 Spindl 配置改为 fail-open：
  - 缺少 `NEXT_PUBLIC_SPINDL_API_KEY` 或 `NEXT_PUBLIC_SPINDL_API_URL` 时不再抛异常
  - `useSpindlCards()` / `trackSpindl()` 在无配置时直接 no-op
- 仅在公开配置存在时才注入 Google Analytics 与 Addressable 脚本，避免浏览器请求 `id=undefined` / `tid=undefined`
- 将 Jumper 自有 analytics 请求改为显式开启的可选集成：
  - 新增公开 env 开关控制 `/users/events` 与 `/wallets/transactions` 是否发送
  - 默认关闭，避免当前 fork 在无后端埋点 contract 时继续触发 `403` / `429`
- 防止未注入 GA 脚本时的前端追踪调用再触发运行时错误
- 增加针对上述降级行为的回归测试

## Non-Goals

- 不为当前 fork 补配新的生产埋点 ID
- 不改造 upstream analytics backend 的 CORS 策略
- 不重构与本次线上错误无关的交易、钱包或 Strapi 逻辑

## Constraints

- 有效的 Spindl 配置存在时，现有广告卡片抓取和 impression tracking 行为必须保持不变
- 缺少可选营销配置时，首页和主交易流必须继续可用，不能再因为旁路功能失败而进入错误边界
- 变更应保持最小充分；如需新增公开 env 契约，必须默认 fail-open 并保持未配置时的线上稳定性

## Acceptance

1. 在 `NEXT_PUBLIC_SPINDL_API_KEY` / `NEXT_PUBLIC_SPINDL_API_URL` 为空时，首页不再因为 `Error fetching Spindl configuration!` 进入错误页。
2. `trackSpindl()` 与 `useSpindlCards()` 在无 Spindl 配置时静默跳过，不发请求、不抛异常。
3. 当 `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID` 或 `NEXT_PUBLIC_ADDRESSABLE_TID` 为空时，页面不再注入对应第三方脚本。
4. 当 `NEXT_PUBLIC_JUMPER_TRACKING_ENABLED` 未显式开启时，`useJumperTracking()` 不再向 `/users/events` 或 `/wallets/transactions` 发请求。
5. 未注入 GA 脚本时，`useUserTracking()` 的 GA 调用不会抛运行时错误。
6. 相关单测通过，且 `apps/jumper` 的 `test:unit`、`typecheck`、`build` 通过。

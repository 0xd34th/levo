1. 用用户给出的 `Ethereum 100 USDT -> ETH` 场景作为主验收真值，并补查 `/api/jumper/v1/users/events`，确认 fork 域名下不只是 pipeline，backend POST 也会被 rewrite 转发后的 upstream CORS 拒绝。
2. 抽出 shared proxy helper，在 `src/app/api/jumper/pipeline/[...path]/route.ts` 和 `src/app/api/jumper/v1/[...path]/route.ts` 统一实现服务端 proxy：解析真实 upstream、过滤 `origin` / `referer` 等 CORS-sensitive 来源头、保留请求体与必要业务头。
3. 删除已被 route proxy 替代的 Next rewrite 和相关旧 helper/test，避免新旧双轨与误导性配置。
4. 把仓库里唯一仍直连 `https://li.quest/v1/advanced/routes` 的 `useCheckWalletLinking` 收回 same-origin pipeline 合同。
5. 补 backend/pipeline/apiOrigins 回归测试，覆盖 POST `advanced/routes`、backend POST、GET 查询转发，以及 same-origin 公共 env 不会让服务端自循环。
6. 运行针对性单测与 `typecheck`，确认满足 `SPEC.md`。

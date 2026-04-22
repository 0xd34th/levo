## Goal

修复 `apps/jumper` 在 fork 域名下 same-origin API 代理不完整的问题：浏览器访问 `jumper.krilly.ai` 时，像 `Ethereum 100 USDT -> Ethereum ETH` 这类会触发 `LI.FI /pipeline/v1/advanced/routes` 的请求，以及 `/api/jumper/v1/*` 的前端 POST，都不能再被 upstream 以 `Not allowed by CORS` 拒绝。

## Scope

- 复现并修复 `NEXT_PUBLIC_LIFI_BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` same-origin 合同下的请求链路。
- 让 `/api/jumper/pipeline/*` 和 `/api/jumper/v1/*` 在服务端代理到真实 upstream 时，不再透传会触发 upstream CORS 拒绝的浏览器来源头。
- 保持浏览器公开 env、现有 widget URL 合同和前端调用路径不变。
- 清理仍然绕过 same-origin 合同、直接访问 `li.quest` 的前端路由查询调用。
- 为新的 proxy 增加针对 `advanced/routes`、backend POST 和 upstream 解析的回归测试。

## Non-Goals

- 不改动 widget 的 token / chain / route selection 产品逻辑。
- 不改动 Privy、钱包连接、Strapi proxy 或营销页面。
- 不要求本轮直接部署线上；部署属于后续显式动作。

## Constraints

- 用户侧 `window._env_.NEXT_PUBLIC_LIFI_BACKEND_URL` 和 `NEXT_PUBLIC_BACKEND_URL` 继续保持 same-origin `/api/jumper/*` 合同。
- 修复应优先落在服务端代理层，而不是通过改用户侧 integrator、关掉 same-origin 合同或回退到浏览器直连 upstream。
- 新代理不能把内部 upstream URL 或 server-only 配置重新暴露回浏览器。

## Acceptance

1. 在 `jumper.krilly.ai/en?fromAmount=100&fromChain=1&fromToken=0xdAC17F958D2ee523a2206206994597C13D831ec7&toChain=1&toToken=0x0000000000000000000000000000000000000000` 这类场景下，`/api/jumper/pipeline/v1/advanced/routes` 不再被 upstream 以 CORS 错误拒绝。
2. `/api/jumper/v1/users/events` 这类浏览器 POST 经过 same-origin 代理后也不再因为 upstream CORS 被拒绝。
3. 浏览器公开 env 仍然是 same-origin `/api/jumper/v1` 和 `/api/jumper/pipeline`，同类 route 查询调用不再绕过这份合同直连 `li.quest`。
4. proxy 回归测试覆盖 `advanced/routes`、backend POST、查询串转发，以及 same-origin 公共 env 不会让服务端自循环。
5. `apps/jumper` 的相关单测和必要 typecheck 通过。

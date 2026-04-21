1. 将 `Spindl` 配置读取改为可选返回值，并在广告卡片抓取/曝光埋点调用链上统一 fail-open。
2. 在根布局中仅在 tracking ID 非空时注入 GA / Addressable 脚本，并让前端 GA 调用在脚本缺失时安全 no-op。
3. 为 Spindl 配置降级和 tracking script 判定补充回归测试。
4. 运行 `pnpm --dir apps/jumper test:unit`、`typecheck`、`build` 验证，然后提交、推送、部署到 `jumper-web`。

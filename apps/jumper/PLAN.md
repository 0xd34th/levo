1. 将 `Spindl` 配置读取改为可选返回值，并在广告卡片抓取/曝光埋点调用链上统一 fail-open。
2. 在根布局中仅在 tracking ID 非空时注入 GA / Addressable 脚本，并让前端 GA 调用在脚本缺失时安全 no-op。
3. 将 Jumper 自有 analytics 请求改为显式开启开关控制，默认关闭并在共享 hook 层统一 no-op。
4. 为 Spindl 配置降级、tracking script 判定和 Jumper tracking 开关补充回归测试。
5. 运行 `pnpm --dir apps/jumper test:unit`、`typecheck`、`build` 验证，然后提交、推送、部署到 `jumper-web`。

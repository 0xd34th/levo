1. 为 received sender 展示补最小数据模型：在 incoming payment item 中加入可选 sender X 账号信息。
2. 先写失败测试：覆盖 received builder 的 sender 映射、recent 合流优先显示账号、展示回退地址。
3. 实现 senderAddress -> x_user 的批量查找与响应组装。
4. 更新 received 页和 recent 合流映射，优先显示 `@username`。
5. 运行相关测试，确认满足 SPEC。

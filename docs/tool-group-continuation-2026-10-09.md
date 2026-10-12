# 工具组加载后在同一任务继续

关联 F02 / PF03。2026-10-09 实际 SFA 新稿在加载工具组后称“工具组将在下一轮生效”，未执行浏览器截图就结束。现有 `next_turn` 表示同一 Run 中 Pi 收到加载回执后的下一次模型推理，不要求用户再发消息。

原生产 Pi 本机测试仅调用一次 `runtime.prompt`，加载回执后自动带出新组工具，随后调用 `get_prototype_acceptance` 得到真实宿主回执。这证明工具已在同一任务可用；不能据此认定云模型一定会完成截图或原型质量合格。

## 最小澄清

`main/tool-catalog.ts` 的目录提示与回执 notice、`main/agent.ts` 的 `load_tool_group` description 均明确：无需用户再发“继续”，收到回执后继续调用本任务所需的新工具，不要仅因加载就结束任务。`effective:'next_turn'` 保持兼容；同一次模型响应提前调用尚未启用工具继续失败。权限、工具选择、预算、取消和状态持久化未改变。

`main/prototype-guidance.ts` 在既有离线建议中重申：不依赖远程 CDN 或需要 eval/new Function 的运行时模板编译，采用离线可运行脚本或预编译资源，实际调用 `run_prototype_acceptance` 验收；未验证不能声称离线可用，不能放宽 CSP。实际 SFA 的 CDN/运行时编译问题由原型诊断证据另行记录，此处没有修改用户业务稿。

流程见 [Mermaid](tool-group-continuation-2026-10-09.mmd)。4 文件相关回归 40/40 通过，日志 `.test-data/tool-group-continuation-tests-20261009.tap`。最后统一 `npm run check` 与独占 `npm run build` 均退出 0，日志 `.test-data/tool-group-continuation-{check,build}-20261009.log`；renderer `index-BCYkJjNe.js`，构建有既有 bundle 大小和插件耗时提示。没有新增云请求、用户界面操作或便携版；主进程更新需稍后重启开发应用。

`tests/lazy-tools.test.ts` 在已有真实 Pi HTTP 链中验证提示、description、notice 的接续语义，并确认加载、后续真实工具调用时始终只有原来的一个用户输入。首轮新增断言误把 Pi 的文本块数组当成字符串导致测试夹具失败，已改为比较首个真实请求的用户消息身份，未改变生产传输行为。`tests/prototype-guidance.test.ts` 验证原型工作流确实携带离线和真实验收约束，其他工作流保持原范围。

简单说：取出一组工具后，Agent 应接着完成当前任务，不需要你再说一次“继续”；页面是否离线可运行仍要实际打开和操作后才算验证。

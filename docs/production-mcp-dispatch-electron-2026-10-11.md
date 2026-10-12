# 主进程 MCP 派发的真实桌面验收准备

需求：G1 外部副作用未知不可重放；G2 当前成果版本及交付核对；F18 MCP 发布。

脚本：`scripts/production-mcp-dispatch-electron.mts`，命令 `node --import tsx scripts/production-mcp-dispatch-electron.mts --execute`。脚本检查实际 dist 中的 beforeDispatch 接线，记录源码、dist 与真实 stdio fixture 的 hash，并在结束时复核字节未变。

首轮已在实际统一构建后运行，证据保留于 `.test-data/production-mcp-dispatch-electron-ec8b16ca-f4bf-481f-90ba-4f88f7b4061e/result.json` 和 `failure.png`，日志为 `.test-data/production-critical-candidates-unified-20261011/mcp-electron-attempt1.log`。当前成果场景一次发送且成功；成果变化场景真实零发送、官方 Operation 为 failed，安全拦截正确，但提示被 Pi 包装后误显示通用连接失败，导致脚本诊断断言失败。其余三场景未在该轮执行；不将该轮写成五场景通过。

最小产品修复位于 `main/integrations.ts`：在本地 beforeDispatch / assertMcpCurrent 闭包捕获真实拒绝事实，stdio 跨 Pi 错误包装、HTTP 均返回 failed 及固定 `MCP_PRE_DISPATCH_REJECTED` 安全中文提示。不按错误正文认定本地拒绝，不显示 callback 或远端原始异常；远端即使伪造相同代码也不能冒充本地 guard。已派发的丢回执继续为 outcome_unknown，无自动重放。`tests/mcp-dispatch-guard.test.ts` 使用真实 stdio/HTTP SDK 传输检查零发送、本地敏感异常不泄漏、远端敏感异常及伪装代码不泄漏。修复后另建桌面 attempt，不覆盖首轮。

修复后定向检查 15/15（50,845.2765 ms），`npm run check`、`npm run build` 均 exit 0。真实桌面 attempt2 已 exit 0、5/5，`pageErrors:[]`，`instanceClosed:true`；证据为 `.test-data/production-mcp-dispatch-electron-4928e60a-90d2-4bae-94c0-2f7f56ec7e2b/result.json` 和同目录五张 `*-actual-ipc.png`。日志位于 `.test-data/production-critical-candidates-unified-20261011/` 的 `mcp-guard-diagnostic-targeted.log`、`check-mcp-diagnostic.log`、`build-mcp-diagnostic.log`、`mcp-electron-attempt2.log`。三个零发送场景均读取官方 failed 状态和固定拒绝代码；丢回执场景官方 outcome_unknown、一次 received，无自动重发。该最小生产修复后的最终全量回归另行记录，不用修复前 1240/1240 替代。

最终全量 `npm test`（默认 concurrency=4，含 `.test.ts` 和 `.test.mjs`）exit 0，1244/1244，483,562.843 ms。日志 `full-test-mcp-diagnostic-final-tap.log`；`final-full-source-dist-verification.json` 确认封存的 557 个源文件和 447 个 dist 文件在测试后字节均未变化。新版真实模型批次使用独立 manifest 和 profile，不把本机合成桌面验证当模型业务质量通过。

复用产品真实链：隔离 Service 合成任务生成并保存 Markdown → 当前版本官方 read 全文 → Agent 逐项核对明确的合成要求 → 真实 Electron 官方 externalAction 审批 → main.executeMcp → 真实 stdio tools/list 等待 → 紧邻 callTool 宿主复验。所有种子均 `realModelGeneration:false`、`realUserAcceptance:false`；不使用真实账号，不把产品记录的 actor 字段当真人签字。

断言：

| 场景 | 真实收到调用 | 官方 Operation 终态 | 额外核实 |
| --- | --- | --- | --- |
| 当前成果与授权 | 1 | succeeded | 参数原文与成果字节 hash 相同 |
| 目录等待时成果文件实际变化 | 0 | failed | 当前文件与冻结 sourceHash 不同，拒绝旧 payload |
| 官方 permissionSet 撤销外部授权 | 0 | failed | state 读回 deny |
| 官方 connection 改动真实 args 绑定 | 0 | failed | 同一既有 stdio 服务进程，脚本不杀进程；旧目标 guard 拒绝 |
| 服务端收到后退出、丢失回执 | 1 | outcome_unknown | 不自动重发，保留未知事实 |

每项先观察真实 catalog-ready 标记与 main Operation executing，再释放 catalog。零发送反例同时检查服务端 JSONL 为零、主进程官方 Operation 为 failed；丢回执同时检查一次收到和 unknown。仅重复生成同版本自动报告未必撤销一个已绑定且仍有效的历史报告，因此不能人为将这种行为当“报告必然过期”反例；本脚本采用实际授权撤销，既有独立 stdio/HTTP 测试仍覆盖核对记录变化。

证据目录按运行 UUID 新建，保存官方 IPC 回执、operations、逐项依据、真实 received 参数、截图及实例关闭结果。首轮语法检查方式调用当前 TypeScript 包的精简 API 导出失败，原日志保留；改用已有 esbuild 做纯语法检查通过，不启动应用。日志：[首次方式失败](../.test-data/production-mcp-dispatch-electron-syntax-20261011.log)、[首次 esbuild 检查](../.test-data/production-mcp-dispatch-electron-syntax-20261011-attempt2.log)、[最终脚本语法检查](../.test-data/production-mcp-dispatch-electron-syntax-20261011-final.log)。

本验证仅证明合成单文本成果经真实桌面主入口和本机 MCP 的派发边界。真实云账号、多资产项目发布及 SMB 双机验收仍分别未验证，不能由本脚本代替。

参见 [主进程修补及隔离证据](production-mcp-dispatch-candidate-2026-10-11.md)、[Mermaid](production-mcp-dispatch-electron-2026-10-11.mmd)。

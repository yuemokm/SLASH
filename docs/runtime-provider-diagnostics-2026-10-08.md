# Pi 请求控制字段与 length 结果诊断

2026-10-08。关联：真实任务完成率、运行诊断与未知能力边界。

最新 VISUAL-COPY 真实 Run 返回 `length`、零草稿，最后响应只有 thinking 块；宿主思考档位是 off，但能力与 12000 请求预算均未验证。已核对其冻结构建包含既有 DeepSeek `thinking.disabled` 分支。另一次零云、同模型 ID 与 off/12000 的正式 runtime 本地 HTTP 试验确认当前代码会发送关闭参数，见 `.test-data/qe12-off-wire-audit/result.json`。这不是历史 Baishan wire 回执，更不能证明上游遵守关闭要求。

## 最小实现

复用 `session.agent.streamFunction` 与 Pi 官方 `options.onPayload`。在最终 provider payload 回调处先调用原回调，保留其异步返回、替换对象、原地修改、undefined、null 和抛错行为；再投影最终对象。诊断回调失败不影响请求。没有新请求器，没有改变模型参数、预算、重试或关闭控制。

`RuntimeObservedStatus` 增加可选字段，经现有 `runtimeObserved` 路径保存到 Run 并传入已有状态事件，不新增独立历史存储：

- `requestDiagnostics`：固定来源 `pi-on-payload`；`thinkingType`、`reasoningEffort` 为安全枚举，缺失与不识别明确区分；三个 max-token 字段只保留正安全整数。
- `responseDiagnostics`：复用现有安全块统计，仅记录 text/thinking/image/toolCall/unknown 数量、字符数、是否无可见正文及固定 stopReason。思考 token 仍是实际未知，不从 Pi 归一化值推断为零。

不复制、序列化或保存完整 payload；不记录 messages、tools、headers、URL、密钥、任意控制字符串、正文、思考内容/签名/hash。原 Pi 会话记录的既有行为不被改造，本次只限制新增诊断。

这些字段表示“最近一次经过该 streamFunction 的请求观察”和“此后观察到的响应”。每次新请求清空旧 `responseDiagnostics`，保留既有 numeric usage 语义，避免第二次传输失败时把旧响应与新请求配对。主 Agent 和通过相同 streamFunction 的 Pi 压缩/分支摘要可被观察；压缩/分支未产生主会话 message_end 时，响应字段保持缺失。独立 `reviewContent` 直接 completeSimple 路径保持原审查诊断，本次不改它。

`onPayload` 发生在 SDK 发送前，证明准备提交的字段；它不能证明网络送达或服务端执行。字段缺失不代表上游默认关闭。该记录没有追补旧 Run，历史无字段 JSON 继续可读。

## length 提示

`assertRuntimeSucceeded` 保留 `MODEL_OUTPUT_LIMIT`、interrupted 和可恢复语义，但改为准确表达“上游返回 length，响应未完整完成”。Service 根据本任务实际累计可见文本与本 Run 草稿记录数，区分无正文/未生成草稿，或已有正文/草稿。仍保留“12000 是宿主未验证兼容值，不代表上游真实限额”的现有提示，不承诺续作成功、不自动重发，也不声明思考已经关闭。

## 本机验证

新增 `tests/runtime-request-diagnostics.test.ts`：固定投影不读取敏感字段，未知字符串不透传；原 onPayload 各类返回/异常与诊断异常保持语义。两种正式 `Service → createRuntime → Pi → loopback HTTP` 场景验证 thinking.disabled 实际字段、预算不变、length 无正文/零草稿与正文/一份草稿提示、诊断持久化、安全输出及旧数据重开不补造或重放。

`tests/runtime-context.test.ts` 增加两请求回归：第一条成功，第二条传输失败；新请求观察清除旧响应，实际 error 响应不被历史 stop 冒充。既有压缩、重试和取消测试保持。

最终命令：`node --import tsx --test tests/runtime-request-diagnostics.test.ts tests/runtime-context.test.ts tests/runtime-events.test.ts tests/runtime.test.ts`，39/39 通过，12.518 秒。首次小组合曾因测试自身对 undefined 调用 includes 失败（28/29），修正测试后重跑；不把该初次结果说成通过。根代理另做六文件集成 29/29 及旧响应清空增量定向 10/10，日志 `.test-data/runtime-diagnostics-integration.tap`、`.test-data/runtime-diagnostics-stale-response.tap`；覆盖有重叠，不能相加计为不同用例。类型检查和统一构建由主代理负责。本子任务零云、未启动真实项目或应用、未 build/打包。

流程见 [Mermaid 源文件](runtime-provider-diagnostics-2026-10-08.mmd)。

17:24 补充：根代理首次统一 `npm run check` 在 `main/agent.ts` 两处诊断转发发现 `RuntimeObservedStatus | undefined` 类型错误，日志 `.test-data/field-context-runtime-check.log`。定向测试通过不等于类型检查通过。已仅增加与既有事件转发一致的 `if(observed)` 守卫，无强制类型断言；随后 `node --import tsx --test tests/runtime-request-diagnostics.test.ts tests/runtime-context.test.ts tests/runtime-events.test.ts` 19/19 通过，5.999 秒。统一 check/build 仍由根代理重做，未在本记录中预先宣称通过。

通俗解释：现在能区分“软件准备发送了关闭要求”和“上游是否真的照做”。如果额度用完却没有正文或草稿，提示会直接说清楚，不再让人误以为已经有成果。

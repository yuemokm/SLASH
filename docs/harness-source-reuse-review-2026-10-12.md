# 成熟 harness 源码复用评估

查询日期：2026-10-12。关联 F02/F10/F12、PF03/PF08/PF10、QE05/QE12。本次只读研究现代码和官方公开源码，唯一新增文件为本报告；没有安装依赖、运行候选框架、云模型测试、数据迁移或产品行为修改。以下“缺口”区分源码可见差异与尚未验收的能力，不能当成已复现缺陷。

结论：先保留 Pi，最值得借鉴的是**逐步骤持久恢复、长回执的可追溯读取、宿主工具协议，以及独立任务轨迹评估**。这些机制复杂、现成源码有参考价值；没有证据证明换 harness 会直接提升 PRD 业务准确性或原型设计质量。只有整体验证通过后才考虑替换默认路径。

## 固定研究版本及许可证

| 官方仓库 | 固定 commit | 本次读取的包清单版本 | 许可证 |
| --- | --- | --- | --- |
| OpenAI Codex | `6c372fbef45f730b6d8aa727b0ec8332365588db` | SDK 源码清单为 `0.0.0-dev`，不冒作发布版本 | [Apache-2.0](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/LICENSE) |
| LangChain Deep Agents JS | `389e8da2325cd726171a32f6f1ce9103c8789119` | `deepagents` 清单 `1.14.2` | [MIT](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/LICENSE) |
| LangGraph JS | `dd73920d799ee906705ae6985025f1d9ec14ce0d` | `libs/langgraph-core` 中 `@langchain/langgraph` 清单 `1.4.21`；SQLite saver 清单 `1.0.4` | [MIT](https://github.com/langchain-ai/langgraphjs/blob/dd73920d799ee906705ae6985025f1d9ec14ce0d/LICENSE) |

这些是查询时仓库源码状态，不保证对应 npm 已发布且可下载的版本。Deep Agents 清单要求 LangChain/Core/LangGraph 等 peer 依赖；不能仅因同为 TypeScript 就认定中间件能直接插进 Pi。LangGraph SQLite saver 依赖 `better-sqlite3 ^12.10.0`，Electron 原生 ABI 与现存 Store 联合使用没有测试。正式复制源码须保留许可证/归属，Codex 还需检查 NOTICE 与文件级声明。

本报告不选择新通用能力包。Pi 目录下载量、版本及候选优先级由同轮生态调查单独核对；下载量不证明取消、恢复、数据保留或模型协议稳定。后续真正新增或替换仍须先执行 pi.dev/packages 筛选，再做针对性验证。

## 1. LangGraph：真正困难的是“从确定完成的步骤继续”

官方 [Pregel loop 的 putWrites](https://github.com/langchain-ai/langgraphjs/blob/dd73920d799ee906705ae6985025f1d9ec14ce0d/libs/langgraph-core/src/pregel/loop.ts#L870)按 taskId 保留已产出的 pending writes；同文件的恢复分支将已保存结果交回任务，并跳过完成项。`sync` durability 在下一步前等待 checkpoint 写入。官方 [SQLite saver](https://github.com/langchain-ai/langgraphjs/blob/dd73920d799ee906705ae6985025f1d9ec14ce0d/libs/checkpoint-sqlite/src/index.ts#L529)按 thread、checkpoint namespace、checkpoint、task 和写入索引持久化，在事务中落同任务的写入。

Slash 已有 `main/service.ts:207` 的退出恢复、`:707` 的 RunCheckpoint、`:1074` 的恢复任务；`main/store.ts:24` 有操作绑定与首回执事务，`:65` 持久化 recovery；`main/run-recovery.ts` 保留未知副作用屏障。不能把“任务恢复”当成从零缺失。差异在于 Slash `resumeRun()`主要继承任务合同、Pi 会话和宿主检查点，提示模型核对草稿后继续；这并不等于 LangGraph 在稳定 task identity 上重放既有步骤结果的完整图执行恢复。

**接入性质：有官方 TS SDK，可作为隔离的有界工作流执行器；目前建议仅借鉴持久边界和故障测试。**不复制整套 Pregel、SQLite 表或另起竞争调度者。若真实长任务证明需要，先用只读“资料读取→审查”小流程验证 SDK，Service 继续拥有权限、Run 和 Operation 真相。还要验证节点拓扑/源码变化如何影响恢复身份。

验收重点：并行 A 完成、B 失败后重启，A 不重复执行；在“外部操作成功、checkpoint 尚未写入”窗口杀进程，仍进入 Slash 原核对流程。LangGraph 的持久化不会让无幂等外部服务获得 exactly-once；官方 [故障处理说明](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance)也表明重试是可配置策略，不能自动应用于结果未知的写入。

## 2. Deep Agents：长回执保存全文，只给模型导航和摘要

官方 [fs.ts 的 processToolMessage](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/libs/deepagents/src/middleware/fs.ts#L2189)把大回执写入 backend，回给模型路径和预览，并保留 tool_call_id、status 等字段。失败时回执明确保存失败，不能视为已持久化全文。其 [summarization.ts](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/libs/deepagents/src/middleware/summarization.ts#L498)保护调用/回执切点；`:720` 对一次模型产生的多工具大结果分配预算，避免整个成组结果被丢掉后反复调用相同工具。代码还保留历史 offload 与 summary event。

Slash `main/agent.ts:340/367/392` 已使用 Pi SessionManager、上下文估计和自动压缩；`main/session-compaction.ts`只补会话设置。`main/service.ts:714`保存来源 hash；任务验收已有带 fingerprint/cursor 的分页入口（`:1433`起），Word/Excel 处理副本和字段证据也已有。不要重新实现消息配对和压缩器。待验证的是工具一次返回很多长结果、跨模型恢复时，模型是否仍能准确找到原文及有效版本；本次没有证据证明当前普遍失败。

**接入性质：官方可插拔 backend 与 LangChain middleware；对现 Pi 不属于即插即用。建议借鉴“小回执→受控全文引用”，而非引入第二套上下文状态。**如局部移植，限纯预览/预算函数和其测试，结果保存、版本身份及授权仍通过 Slash 现网关。不能让第三方 FilesystemBackend 绕过 ChangeSet 直接写项目，也不能把目录路径当成已读全文证据。官方 [backends 文档](https://docs.langchain.com/oss/javascript/deepagents/backends)支持自定义 backend，但并不代替 Slash 权限适配验收。

验收重点：多工具回执合计超窗、历史压缩后原文读取、来源变化拒绝旧引用、取消后临时结果归属、无权限读取被拒；记录模型实际使用的引用与覆盖率。该机制改善信息可达性，不证明摘要保留了全部业务规则。

## 3. Codex：可嵌入，但必须选对工具协议入口

Codex 并非只能通过 TUI 使用。官方 [TS SDK thread.ts](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/sdk/typescript/src/thread.ts#L70)支持流式事件、thread 续接、结构输出 schema 和 AbortSignal；[exec.ts](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/sdk/typescript/src/exec.ts#L203)实际派生 Codex 可执行文件，属于 Node 包包装 sidecar。SDK 的本段公开入口没有 Slash customTools 注册参数，不能认为换一行 import 就复用现在的网关。

宿主工具更值得看 app-server：[DynamicToolCallParams](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/codex-rs/app-server-protocol/schema/typescript/v2/DynamicToolCallParams.ts)明确 threadId、turnId、callId、namespace、tool、arguments；[DynamicToolCallResponse](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/codex-rs/app-server-protocol/schema/typescript/v2/DynamicToolCallResponse.ts)定义 success 与多类型内容；[dynamic_tools.rs](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/codex-rs/app-server/src/dynamic_tools.rs#L18)等待客户端回执并校验解码。官方 [client README](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/codex-rs/app-server-client/README.md)也区分内部 typed hot path 与外部 stdio/websocket 序列化边界。

Slash 当前 `main/agent.ts`提供 Runtime/customTools，`main/service.ts:1140`附近包装工具调用、授权与 Operation，`main/store.ts`已有终态和绑定保护。适合借鉴明确 run/turn/call 身份、请求与回执分离、旧回执拒收。**接入性质：Codex 可作为 sidecar；完整 app-server 适配不是直接移植；Rust调度器仅借鉴。**本次没有安装 Windows 二进制或验证当前模型供应商与 Codex 协议相容，不能建议默认替换。

尤其要保留既有取消验收。[parallel.rs](https://github.com/openai/codex/blob/6c372fbef45f730b6d8aa727b0ec8332365588db/codex-rs/core/src/tools/parallel.rs#L262)区分 admission/handler 和已到终态的调用，有取消前后边界测试。Slash 三项对应修复已经完成，见[既有交付](harness-reliability-delivery-2026-10-10.md)；这次只是进一步核对协议，不重复列待办。

新协议若实验必须验证：等待队列取消、工具已经成功后取消、客户端断连、迟到回执、未知外部写入、撤权、重启后旧审批失效。sidecar 自带沙箱或审批策略不得另行授予 Slash 未授权目录。

## 4. 完成/验证循环：借鉴轨迹评估，保留 Slash 的业务门禁

Deep Agents 官方 [eval harness README](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/internal/eval-harness/README.md)定义 EvalRunner 与 AgentTrajectory；[matchers.ts](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/internal/eval-harness/src/matchers.ts#L122)把模型动作及工具观察按步骤解析，并断言工具调用次数、某步调用和最终文本。独立 runner 可比较不同执行底座，不只检查最后一句“已完成”。不过 [package.json](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/internal/eval-harness/package.json)明确 `private: true`，清单版本 `0.0.29`；带 Vitest/LangSmith 依赖。**它不是可承诺 npm 直接安装的公开稳定 SDK，也不是自动业务裁判。**

Slash `main/service.ts:1179–1208`已有生成→宿主检查→独立内容/视觉审查→最多两轮修正；`main/task-completion.ts`限制候选范围、来源版本、原始要求绑定及未知副作用。`tests/runtime-recovery.test.ts`、`tests/tool-outcome-service-pi.test.ts`、`tests/content-review-repair-scope.test.ts`等已存在。本次未重新跑，不将历史通过当成本轮检查。QE05业务与QE12整体设计质量仍以实际任务交付记录为准，不能因循环存在宣称通过。

**接入性质：优先借鉴通用 runner/trajectory 结构，必要时经许可证核对移植小段纯解析代码；不把内部整个包接入产品。**下一步最小实验是从现有 Run/Operation/Pi事件转换轨迹，在同一冻结输入上同时比较原文覆盖、误用来源、无效调用/重复调用、实际剩余工作、确定性回归、人工任务体验及成本。工具次数只作诊断指标，不能为了少调用而减少真实资料读取。新底座必须和 Pi 使用同一资料、同一工具权限和同一业务用例。

验收重点：模型宣布完成但必要输出缺失；视觉局部通过但业务回归失败；修稿删标准；无引文高置信意见；循环两轮后仍失败；故障后恢复是否重复发表或写文件。这样能定位质量差在资料、执行、审查还是任务定义，避免把“换引擎”当作未经验证的质量答案。

## 当前取舍

优先做第4项的真实任务对照和第2项的长资料可达性验证；第1项只在持久执行确有真实需求时试小流程；第3项作为可行 sidecar 路线和协议参考。OpenHands 的完整开发代理/沙箱平台与当前个人PM成果主流程重合收益本次没有证明，不为凑候选扩展产品范围。

通俗说：成熟 harness 最可借鉴的是让 Agent“记清做了什么、找得到长资料、把工具结果接稳、知道成果是否真正合格”。Slash 已有其中不少机制，先用真实任务找出薄弱处，再替换具体部件，才有依据判断是否更好。

# 运行中补充与原生运行状态（2026-10-07）

本次对应 F02 会话与成果编辑、F01 目录授权、F03 模型与权限配置生效范围及现有运行恢复要求。运行中的会话允许明确追加文字，沿用同一 Run、模型、研究/执行模式、权限、30 分钟运行预算和 120 次工具预算。附件及新的工作流仍由独立任务发起；追加接口不能传入这些参数。没有增加模型能力、供应商、OAuth、任意扩展或自建 Agent loop。

## 契约与存储职责

`shared/run-inputs.ts` 定义严格 schema：每 Run 最多 20 条，每条最多 20,000 字符，合计最多 100,000 字符；取消的记录也计入预算。展开技能后的发送内容另外限制 100,000 字符。`runInputEnqueue` 使用 UUID `requestId` 幂等：同一标识及相同正文/送达方式返回原回执，正文不同则拒绝。`runInputClearQueued` 清除本轮所有待发送内容，不支持通过清空后重排来删除单条。

```json
{"type":"runInputEnqueue","runId":"当前Run","requestId":"d9b4d067-621c-4c3d-beb4-263c2115a0bc","text":"请同时核对移动端布局","delivery":"steer"}
```

`steer` 在当前工具返回后、下一次模型请求前接入；`follow_up` 等当前工具链结束再处理。接口只准备授权技能输入并调用 Pi 0.86.1 的公开 `steer`/`followUp`，不再次调用 Slash 包装的初始 `prompt`，避免清除当前轮终态记录。宿主持久化原始正文、送达方式和关联标识；Pi 会话文件保存实际进入上下文的消息。二者不是原子事务，也不是 LangGraph checkpoint。

`queued` 表示宿主接受但尚未确认进入上下文；`submittedAt` 只表示调用 native API 前的发送意图。只有真实 native `message_start` 用户消息、宿主标识以及全文 hash 都匹配才标 `delivered`。`delivered` 不代表任务成功、工具执行或成果应用。native 拒绝、无法确认清除、以及重启前未确认的记录为 `unknown`，不会自动重发。明确未发送或被 native `clearQueue()` 回执确认移除的记录为 `cancelled`。

宿主接受输入和技能展开后均核对 Run 与授权快照。目录启停/写入授权变化、能力权限收紧时先清 native 队列再停止本轮；技能不存在或版本变化则取消对应补充并保留脱敏错误类别。异步 native 提交期间的取消设置清除栅栏，等旧 API 返回后再次清旧 session，避免迟到消息残留。结束后清理所有 `queued`；重新加载当前及其他项目分区都将旧 `queued` 转 `unknown`，不创建 runtime 重放。取消任务不可因此恢复或提升权限。

## 状态与界面

`main/runtime-events.ts` 只接受真实 native 事件白名单：工具活动、模型重试次数/配置上限/等待时间，压缩完成/失败/取消，摘要重试结束，以及数值 token usage。摘要重试结束不表示摘要成功。`getContextUsage()` 在 Pi 完成消息追加后的 microtask 读取，标为“上下文占用（估算）”；压缩后暂不可用的 tokens/percent 保持 `null`。没有任务百分比、思考正文、密钥或完整请求体。

当前快照保存在 Run `runtimeStatus`，安全事件通过原有事件日志及 replay 接口持久化。既有 `contextRecovery` 兼容保留。停止提示优先于最近一次工具/模型活动；历史中断记录标明停止前快照，不伪造结束事件。运行中输入区采用现有自定义 `ComposerPopover` 两选项，加发送补充和停止按钮；发送前明确显示本轮冻结配置，底部设置用于下次任务。记录默认折叠，历史回复的执行记录也可查看。

## 验证

`tests/run-inputs.test.ts` 与 `tests/runtime-events.test.ts` 覆盖幂等、有界预算、异步取消栅栏、清队列不重放、SQLite 重开及安全事件白名单。`tests/run-inputs-integration.test.ts` 使用真实 Service、已安装 Pi 0.86.1、SQLite 和本地 HTTP：验证工具回执后 steer 进入请求 2，followUp 进入请求 3，同 Run 不换权限/模型；取消与目录/能力撤权没有额外模型请求；技能失败类别、清除队列及重启不重放。`tests/runtime-context.test.ts` 的真实本地 HTTP 压缩/503 重试/取消同时核对新增状态回调，包括压缩后未知上下文。

相关 46 项回归及 3 项历史状态/停止提示界面专项（49 项）、类型检查和开发构建通过。`tests/runtime-recovery.test.ts` 中“打开旧会话以检查工具声明”固定使用独立测试 log executor：该只读 SDK 检查不能复用已经结束 Run 的授权网关。真实桌面验证使用严格 `.test-data` 隔离 profile、`PM_SLASH_TEST_HIDDEN=1`、异常写日志后退出；未 monkeypatch Electron，未访问真实用户资料，未调用云模型，未打包。桌面结果另附诊断报告，失败不视为通过。

流程源文件：[run-input-runtime-status.mmd](diagrams/run-input-runtime-status.mmd)。第五阶段分支/OAuth/任意扩展继续暂缓；当前持久化关联仅服务于追加送达。

桌面专项最终报告：`.test-data/run-input-runtime-status-20261007-064333-f13094/report.json`，5 组通过，真实 Pi 0.86.1 与 5 次 loopback HTTP 请求。`desktop-preview.png`（1440×900）、`narrow-preview.png`（1100×800）检查并排预览时输入区；`mobile-chat.png`（390×844）先关闭预览，再检查按钮和输入中心点命中实际控件，排除遮挡。`mobile-preview.png`仅记录已有窄屏预览覆盖行为，不称输入区可操作。最初两份诊断因为关闭详情/自定义popover选择器失配未完成，原失败报告保留；064046诊断的390旧几何结论由`interaction-clarification.json`更正，最终以064333报告为准。测试专属进程已退出。

最终集成发现终态可见到`finally`清理之间不能插入新等待：先完成输入清除栅栏及必要 drain，再发布validating/terminal，使用户看到终态时回复、检查点与active清理已经同步完成。该收尾修正由集成负责者执行，最终全量测试/构建以主代理报告为准；桌面报告保存校验时已编译runtime的hash，不将之后的source版本冒充同一构建。
收尾的实际顺序是：Pi当前prompt结束 → 停止接收追加并finish队列 → 拒绝未完成的技能准备审批 → 等待尚未返回的native提交、清除迟到旧队列 → 发布终态并在同一同步收尾完成assistant完成字段、检查点与active退出。正常返回与失败/cancel分支都遵循该顺序，审批必须在等待drain前拒绝，避免prompt结束却无限等准备审批。补充专项覆盖该边界；连接发现和项目上下文原回归也已通过。最初全量日志的4失败保留用于诊断，不作为最终验收结果，最终全量结果由主代理统一报告。
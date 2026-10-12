# Pi Harness 复用选项：Workflow、上下文、工具与检查修正

日期：2026-10-12。关联 PF03 / PF08 / PF10。状态：代码只读核对、公开文档与发布源码初筛；**未修改产品、未安装或升级依赖、未运行候选包或真实模型验收**。本记录不把调研当集成完成。

## 建议与范围

先验证现有 **pi-subagents 的公开委派与工作流执行协议**，其次在隔离项目验证 **pi-goal-x 的持续完成调度**；不要同时开启两套自动续跑/修稿循环。代码诊断继续扩展已接入的 pi-lens；上下文默认继续 Pi 原生压缩。Pi Durable 值得跟踪，但目前属于新发布的实验框架，不能凭官方身份或 1.x 版本号直接切换底座。

可以定向替换的是通用节点编排、续跑、代码诊断；Slash 的目录权限、ChangeSet、版本锁、来源证据、业务要求冻结和外部结果未知保护仍是必要产品适配。先比较实际效果与稳定性，再决定默认路径，不为候选另造同类执行器。

## 下载量与版本初筛

下表月下载是 2026-10-12 Pi 目录的 `/mo` 展示口径，**不是独立用户、安装实例、稳定性或成熟度保证**。目录最新版本与 Slash 已锁定版本分别记录；本轮没有升级。

| 候选/主来源 | 月下载 | 目录版本/许可 | Slash 当前与选择 |
| --- | --- | --- | --- |
| [pi-subagents](https://pi.dev/packages/pi-subagents) | 623K | 0.77.0 / MIT | 已安装并使用 0.76.1；公开协议优先验证，不必先升级 |
| [pi-goal-x](https://pi.dev/packages/pi-goal-x) | 141.2K | 0.32.3 / MIT | 未安装；发布 manifest 与源码已核对，持续完成候选 |
| [pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter) | 1.6M | 5.2.0 / MIT | 已使用 5.1.0 host-managed stdio；新版本仅目录初筛，升级兼容未验 |
| [pi-lens](https://pi.dev/packages/pi-lens) | 102K | 4.4.3 / MIT | 已使用 4.4.0 静态草稿诊断；新版本仅目录初筛，升级未验 |
| [billion-context](https://pi.dev/packages/billion-context) | 1.1M | 0.1.195 / 目录标 MIT；上游另有附加条款 | 未安装；已核对上游 master [LICENSE第21—50行](https://raw.githubusercontent.com/ranxianglei/billion-context/master/LICENSE)，仍有 MIT 之外的产品出处署名条款；具体0.1.195发布tarball许可仍须锁定复核，不能仅称纯MIT |
| [context-mode](https://pi.dev/packages/context-mode) | 104.2K | 1.0.169 / Elastic-2.0 | 未安装；README 的 Pi 部分已确认原生 lifecycle extension + MCP 服务入口，可经 MCP/headless 接入；SDK、路由、网关权限及许可适用未验；大输出检索候选，不自动取代原生压缩 |
| [pi-advisor-flow](https://pi.dev/packages/pi-advisor-flow) | 60.8K | 0.13.1 / MIT | manifest peer Pi `^1.0.0`，与 Slash 0.86.1 不兼容；暂不默认接入 |

其中 subagents、goal-x 的目录页面本轮直接打开核对，其余目录快照由本轮主调研提供；advisor-flow 的固定版本 manifest 另直接核对。未精查的候选明确停留在初筛。

## 现有代码已经复用了什么

| 能力 | 真实执行证据 | 实际边界 |
| --- | --- | --- |
| Pi 0.86.1 headless SDK | [agent.ts](../main/agent.ts) 的 `createAgentSession`、SessionManager、SettingsManager；[session-compaction.ts](../main/session-compaction.ts) | Pi 负责估算、切点、摘要、原生自动压缩及有界恢复；Slash 只补小模型近期 token 默认值与状态/取消桥接，不是自写压缩器 |
| 原生编辑、Shell、skills | [draft-edit.ts](../main/draft-edit.ts) 的 `createEditToolDefinition`；[agent.ts](../main/agent.ts) 的 `createPowerShellToolDefinition`；[skills.ts](../main/skills.ts) 的 `loadSkills` | 补草稿、CAS、参考原件保护、授权正文加载；不是复制通用匹配器/Shell 执行内核 |
| 中途补充与短上下文恢复 | [run-inputs.ts](../main/run-inputs.ts) 调用 steer/followUp/clearQueue；[agent.ts](../main/agent.ts) 的 `SessionManager.create(...,{parentSession})` | fresh 恢复需明确摘要，旧历史保留；不能称自动无损压缩 |
| pi-subagents | [pi-subagents.ts](../main/pi-subagents.ts) 的真实包 child-session 工厂；[agent.ts](../main/agent.ts) 的 `delegate_readonly` 接线 | 独立 fresh 内存会话，继承父网关工具/总预算/取消；3项/2并发/24工具每子任务；状态落父 Run。尚未接包完整 Workflow、chain、公开委派与恢复协议 |
| pi-mcp-adapter | [pi-mcp-runtime.ts](../main/pi-mcp-runtime.ts) `/host-managed`、SDK2 transport；[integrations.ts](../main/integrations.ts) stdio 调用 | HTTP 仍走原 SDK1 OAuth/elicitation；不能未经兼容证明删除现有授权和确认层 |
| pi-lens | [pi-lens.ts](../main/pi-lens.ts) 真发布 worker；[agent.ts](../main/agent.ts) 的 `check_draft_code` | 临时 pending 草稿副本、精确 hash；关闭自动修复、格式化、项目测试、LSP及安装。按需工具，不是整个任务验收自动跑 Lens |
| Plannotator | [pi-plan-review.ts](../main/pi-plan-review.ts) 官方 `startPlanReviewServer` 与 HTML | 只 Plan 批注；决定绑定 Run/计划 hash；没有接其另一套执行政策，批准不自动 Build |
| pi-memory | [pi-memory-worker.ts](../main/pi-memory-worker.ts) 捕获真实4个工具 | 项目隔离/来源绑定候选备忘；自动生命周期 hooks 未挂入主会话 |

上述安装版本已读取实际 node_modules manifest。历史真实本机协议与编译后 Electron 验收见 [六包集成](pi-package-integration-2026-10-08.md)、[子代理接入](pi-subagents-integration-2026-10-08.md)、[辅助包接入](pi-auxiliary-integration-2026-10-08.md)。本轮未重跑这些验收；历史本机通过也不代表复杂真实 PM 成果全部通过。

## 优先一：pi-subagents 公开协议，不把注册接口误当引擎

已安装 0.76.1 manifest 导出 `pi-subagents/workflow-resources`、`pi-subagents/delegation`、capability-ceiling 等入口；本轮 `rg` 未见 main/shared 调用这些公开协议。当前适配仍定位内部 `src/runs/shared/child-session.js`，版本已锁定，但不是稳定 export-map 入口。

`registerWorkflowResource` **只登记当前会话可用的名字、版本、参数解析及脚本展开**：resolve 必须同步、有界、无 I/O；此子路径不加载主扩展，没有自带执行器。实际执行由包主扩展的 subagent/scripted-workflow executor 承接。注册者负责 session_start/session_shutdown/reload 清理；注册接口不提供持久调度，也不保证宿主退出后存活。现有命令 grant 不等于 Slash 目录/权限或操作系统沙箱。见 [公开接口文档](https://github.com/nicobailon/pi-subagents/blob/main/docs/extension-api.md) 与 [固定0.76.1文档](https://cdn.jsdelivr.net/npm/pi-subagents@0.76.1/docs/extension-api.md)。

`delegation` 是结构化前台叶子委派：ownerRunId/nodeId/requestId 绑定逻辑节点和尝试；支持结构化 schema 结果、重复节点拒绝、精确取消及终结回执。它需要 active extension context，选择包配置的 agent，工具解析仍归包；不能仅用 event 名称替代现有受控子会话。包还提供 event-bus RPC 与独立后台路径；RPC spawn 异步，resume 核对会话归属/持久化元数据/租约。前台与后台不是同一接口。见 [工作流说明](https://github.com/nicobailon/pi-subagents/blob/main/docs/workflows.md)、固定版本 extension-api 的 RPC/delegation 章节。

最小验证：加载可信主扩展，验证通过公开协议注入/限定 Slash 网关工具、父模型与凭据、同 Run 预算、停止、撤权、版本变化及持久化恢复。若无法保留这些约束，先保留现有 child factory，不声称公开协议已可无缝替换。已安装版本 peer 范围容纳当前 Pi，声明兼容不等于新接口运行通过。

## 优先二：pi-goal-x 持续完成候选，必须隔离验证

本轮从 [npm固定0.32.3 manifest](https://registry.npmjs.org/pi-goal-x/0.32.3) 读取版本、peer 与发布 tarball，并只解压到系统临时目录审源码；没有 npm install，也没有载入执行。manifest 为 MIT，发布 LICENSE 为标准 MIT；Pi peer 为 `>=0.83.0 <2.0.0`，另有 typebox `^1.3.11`，声明容纳 Slash 0.86.1，但未验证类型/API/桌面兼容。包无稳定 exports SDK 表面，以 `extensions/goal.ts` 为 Pi extension 入口。[固定源码](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal.ts)、[许可证](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/LICENSE)。

源码有 non-UI 分支：proposal 的 `shouldAutoConfirmProposal` 在 `hasUI=false` 时自动确认；某些 task 确认亦有无界面分支，goal-clear 则拒绝无界面直接归档。因此不能因为有 TUI 就说无法嵌入，也不能直接把无 UI 等同 Slash 的确认语义。没有查到 goal-x 自带独立 RPC 服务或公开 createGoal SDK；可用路径是 Pi 的 SDK extension loader，或 Pi RPC `prompt` 执行已注册 `/goal-*` 命令。Slash 当前 `DefaultResourceLoader` 禁用环境扩展，仅挂自有 factories，必须显式接入可信 extension，不会因依赖安装自动启用。见 [固定questionnaire](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal-questionnaire.ts)、[commands](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal-commands.ts)、[Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)、[Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)。

它提供目标/任务/证据持久化、主动续跑、pause/resume、调度归属与中断保护；maxAutonomousRuns 未设时默认无限、0关闭自动续跑。源码 session_shutdown 停调度并保存状态；interrupted/claimed 调度要求明确恢复，不自动重放原派发。审查 AbortSignal 会桥接 session.abort，结束后再次检查取消。上述是源码事实，不是 Slash 崩溃/取消验收。见 [scheduler](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal-scheduler.ts)、[events](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal-events.ts)。

独立 completion auditor 通过 Pi createAgentSession 新建内存会话，默认隔离 loader，复用父模型 runtime；默认工具包括 read/grep/find/ls/**bash**，因此包称 read-only 不等于 Slash 网关安全边界。可注入 auditor createSession/extension runCompletionAuditor 的源码接缝需验证；不能让它直接读任意资料或运行命令。auditorProjectResources 可开启项目扩展/skills，也应保持默认隔离。审查通过只表示其判断，不能冒充用户确认或 Slash 业务验收。[auditor源码](https://cdn.jsdelivr.net/npm/pi-goal-x@0.32.3/extensions/goal-auditor.ts)。

对照实验只保留一个续跑所有者：goal-x 与 [Service两轮修稿循环](../main/service.ts) 二选一承担通用调度；保留 [task-completion](../main/task-completion.ts) 的引用/范围/未知副作用候选门槛。验证预算耗尽、暂停、中途补充、供应商失败、重启归属、撤权和部分稿保留，再用真实 PRD/原型任务比较完成率和耗时。现在尚未证明它能提高 Slash 实际交付效果。

## 检查、上下文及新底座取舍

- **Lens**：优先让现成 AST/代码诊断覆盖通用问题，避免另写 LSP。是否自动参与交付检查、自动修正需单独验收；PRD事实、来源引用、冻结业务回归和视觉体验不属于 Lens 静态代码检查。
- **工具设计**：[tool-catalog.ts](../main/tool-catalog.ts) 固定分组虽由 Slash 定义，底层已经用 Pi setActiveToolsByName；可以筛选更省上下文的发现方案，不必重写工具运行机制。
- **上下文**：保留唯一默认 Pi 原生压缩。billion-context 涉及压缩/路由所有权，且上游 master 许可仍有产品出处署名附加条款；context-mode 属大输出索引候选，其 [README Pi 部分](https://pi.dev/packages/context-mode) 提供原生 lifecycle extension 与 MCP 服务，可经 MCP/headless 评估，不因界面形式否定嵌入。均先在隔离副本比较工具大输出、路由/网关权限、取消、持久化、来源定位、模型协议与回退，不同时叠压缩。旧选型依据见 [上下文记录](pi-context-memory-selection-2026-10-08.md)。
- **Pi Durable**：官方 2026-10-01 与 Pi1.0 一起发布，明确 experimental、API可能变动。本轮 npm latest 为 `@earendil-works/pi-durable@1.1.0` / MIT，依赖 pi-ai `^1.1.0` 与 chord `^1.1.0`、Node>=22.19.0；属于另一个 Harness框架，不能当0.86.1的小扩展。提供 checkpoint、memory/SQLite/JSONL storage、可恢复任务和 context cancellation；没有内建 subagents，工具重放安全语义需要应用声明。Slash已有外部写入未知结果与草稿历史，迁移必须证明不重复副作用及可保留原数据。当前只跟踪、未运行/迁移。见 [官方发布](https://earendil.com/posts/pi-durable/)、[manifest](https://registry.npmjs.org/@earendil-works%2Fpi-durable/1.1.0)、[源码README](https://github.com/earendil-works/pi/tree/main/packages/durable)、[MIT](https://github.com/earendil-works/pi/blob/main/LICENSE)。

## 本轮交付与未验证

仅新增本调研记录；未改产品行为，不需要产品流程 Mermaid 或 schema/迁移。已核对现有代码/实际安装 manifest，联网读取目录及候选发布源码。未运行候选测试、模型、Electron、构建、外部发布或打包；未切换默认路径。包下载量、README功能及源码分支均不能替代 Slash 验收。

通俗解释：已有底层能力继续用。下一步重点是让现成工具更可靠地安排“查资料、制作、检查、修正”几步；先用副本证明能停、能恢复、不会改错文件，再减少现有胶水代码。

## 2026-10-12 后续开发与有限验收

上文“仅新增调研、未改产品”保留为当时阶段事实。后续已完成[固定goal-x生产适配与本机稳定性检查](pi-goal-x-validation-2026-10-12.md)、[长段落选段缺口修正](harness-long-context-2026-10-12.md)及[真实PRD有限验收](harness-prd-real-acceptance-2026-10-12.md)。真实候选可受控补读并识别隔离XLSX链缺失，但范围内一项说明错误漏检，尚未证明PRD语义质量提升；旧基线跨最终build，不作公平A/B。没有启用完整目标调度或新执行底座，也未恢复云知识库。

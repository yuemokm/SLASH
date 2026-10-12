# pi-subagents 公开委派协议隔离验证

日期：2026-10-12。关联 F02/F10/F12、PF03/PF08/PF10。范围为已安装 `pi-subagents@0.76.1` / MIT 与 Pi `0.86.1`，没有升级、迁移、开放写子任务、另造执行器或打包。代码：`main/pi-subagents.ts`；新实验：`tests/pi-subagents-public-contract.test.ts`；图源：同名 `.mmd`。

结论：**公开执行器能通过 SDK/headless 嵌入，但现有公开协议尚不能直接保留 Slash 的父网关闭包与临时模型凭据。默认继续现有受控 child-session factory。** 实验运行真实发布包、主扩展和前台执行器，仅供应商是 localhost SSE 协议夹具；这不是付费模型、PRD/原型业务质量或完整工作流恢复验收。

## 生态与公开契约

按工程约定再次读取 [Pi 包目录](https://pi.dev/packages/pi-subagents)，2026-10-12 此次页面为 **613.4K/mo、0.77.0、MIT**；与先前同日报告的 623K 展示值不同，按本次实际读取分别留证。月下载为目录 `/mo` 展示口径，不是用户量或稳定性证明；候选仍优先现有高使用量包，不升级已锁定版本。

实际安装的 manifest 包含 `./delegation`、`./agents`、`./capability-ceiling`、`./required-child-extensions`、`./workflow-resources`，peer Pi 范围容纳当前版本。公开请求 `SubagentDelegationRequest` 有 `requestId/ownerRunId/nodeId`、agent、task、model、cwd、timeout/toolBudget 等，没有 customTools、modelRuntime 或 childSessionFactory。`registerRequiredChildExtensions` 接收既存模块路径而非父闭包。资源注册只展开脚本，执行仍属于包主扩展，不将注册当执行器。参考[上游公开协议](https://github.com/nicobailon/pi-subagents/blob/main/docs/extension-api.md)，本次具体事实以已安装 0.76.1 的 `.d.ts/.js` 和回执为准。

主扩展通过项目已有 `loadPiPackage` / jiti 装载，Pi `DefaultResourceLoader` 仅显式加载该可信 factory，关闭环境扩展、skills、context、prompt templates；真实 `session.bindExtensions({mode:'print'})` 建立 active extension context。运行目录、agentDir、配置和会话均是系统临时目录，`PI_CODING_AGENT_DIR` 与关闭可选全局包发现的 `PI_OFFLINE` 在测试清理时恢复，不写用户配置。注册只读 agent 和 session-scoped capability ceiling，明确拒绝内建 Shell/读写工具与递归委派。

## 可重复证据

| 验收场景 | 真实包结果 | 对 Slash 的影响 |
| --- | --- | --- |
| 父 runtime 注册本机模型并设置临时 API key，公开 delegation 请求同模型 | `failed`，`No API key found for slash-public-fixture`；本机供应商请求 0、父网关读取 0 | 包会复制 provider 注册，但新建 child ModelRuntime，不能直接使用父 runtime 的临时凭据 |
| 仅实验 provider definition 补本机协议 key，保留父 `read_file` customTool 与白名单 | `failed`，`child tools were unavailable: read_file`，并明确 tools 白名单不加载扩展；请求 0、网关读取 0 | 工具名称限制不能注册父网关闭包；不能放开环境扩展或复制默认文件工具绕过 |
| 同执行器、同模型、隔离配置 key、零工具 leaf | `completed`，文本 `LOCAL-PROTOCOL-OK`；真实本机 SSE 请求 1、网关读取 0 | 证明主扩展/headless/公开 executor 实际可运行；不是工具继承成功 |
| 零工具真实请求阻塞，发送错误 owner 的取消，再发送完整精确身份 | 错误 owner 后尚未终结；精确 tuple 返回 `cancelled`，同请求仅 1 次 | 公开身份/取消契约可用；尚不能因此证明 Slash 带网关子任务全流程 |

包源码 `src/runs/foreground/subagent-executor.js` 传 `parentProviderRegistry: ctx.modelRegistry`；`src/runs/shared/child-session.js` 根据该 registry 新建 ModelRuntime、复制 provider/native-provider 注册，并创建新的 SDK session。这与临时凭据拒绝回执一致。模型名称可见不等于父运行时的认证和代理执行闭包都已继承。未来如要复用公开执行器，需先验证可信 required-child extension 与父 Run 的生命周期桥接，并明确提供受控凭据；不能用注册表或协议名字声称完成。

## 本次局部实现与兼容

默认工厂保留，补两处有界检查：每次子任务再次核对固定包版本/内部文件，即使模块已缓存也拒绝安装版本不一致；SDK 创建子会话后立即检查实际 active tools 集合、每项 ToolDefinition 的父网关对象身份以及 provider/model identity，异常或取消时先回收该会话，再返回失败，不启动 prompt。

现有严格 `task/purpose` schema、默认3项/2并发/24工具每子任务、父总工具预算、父/子截止、来源与目录逐次校验、fresh 内存上下文和父 Run 状态继续使用。本子任务没有新增模型可传权限字段或数据库结构，因此无需迁移；旧数据、会话与操作记录不变。本次回归包含真包授权读取/越界拒绝、父凭据、共享预算、父停止、父截止、独立上下文及数量/并发限制；后续宿主模型配置集成由唯一集成人实施，此文不将其差异认领为本子任务实现。

## 检查与限制

已通过：`node --import tsx --test --test-reporter=tap tests/pi-subagents-public-contract.test.ts tests/pi-subagents-runtime.test.ts`，本阶段11/11，收尾在叠加宿主模型配置的当前文件上最终 **13/13**；`npx tsx --test --test-concurrency=1 --test-reporter=tap tests/pi-subagents-public-contract.test.ts`，4/4，验证与工程现有 tsx CLI/TAP 入口兼容；收尾 `npm run check`、`git diff --check`，退出 0。

初次实验以工具缺失为预期，但先实际得到临时认证缺失，首轮断言失败；把认证和工具分别作为两个可重复限制后通过。初次 npx/原生导入尝试长时间未完成，被明确终止；没有将其记成功或认定其根因。正式隔离验证改用项目已有 jiti 包装与直接 Node 的 tsx loader。收尾并行复验曾出现首项冷加载超30秒、其余12项通过；夹具清理提前、关闭可选全局包发现，并将初始化测试时限设60秒，实际 delegation 的5秒与取消实验的10秒期限不变，最终13/13。本轮没有电子桌面、真实模型、端到端任务质量、带网关公开工作流恢复/来源变更/撤权验收，没有运行 builder。

通俗解释：现成工具确实能安排子任务，也能精确停止；但它现在接不到 Slash 正在使用的模型钥匙和受控资料工具。直接切换会让正常任务失败，所以先保留已有可靠路径，并在创建时核对没有接错模型或工具。

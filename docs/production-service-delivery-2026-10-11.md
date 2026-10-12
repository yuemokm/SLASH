# G2 · Service 正式交付接线

关联 A01/A02、PF03/PF09。本轮复用已有 `TaskAcceptanceDomain`、`TaskDeliveryDomain`、授权网关、草稿和外部操作提案；没有新增执行框架或依赖。正式导出/发布按真实任务成果、来源版本和人工核对结果放行，普通草稿保存继续可用。

## 宿主接口

| 接口 | 行为及调用者 |
| --- | --- |
| `taskDeliveryGet(runId, reportId?)` | 返回当前或指定报告的 `TaskDeliveryView`，包含门槛项、版本绑定与实际来源；IPC/UI 读取 |
| `reviewTaskDelivery(input)` | 按共享 Zod 契约保存用户处置依据；仅桌面 IPC，未加入模型工具 |
| `declareTaskAcceptanceOptional(input)` | 桌面按明确要求 ID 声明可选范围，刷新任务检查报告；不是任意授权摘录，也不移除已有失败门槛 |
| `prepareTaskDelivery({mountId,path,changeId?,expectedContentHash?})` | 返回 `{view?,assertCurrent}`；导出适配器必须在实际写入前调用闭包 |
| `prepareExternalTaskDelivery(proposalId)` | 审批和 MCP 实际派发前各执行一次，依据持久化提案身份重查；不会补造旧提案的已验事实 |

`TaskDeliveryDomain.snapshot` 传入合同、目标报告、报告历史、不可变首报时间、用户可选范围及 `contract.prd.sources` 与 `Run.sourceReads` 的真实来源合并结果。来源再次读取沿用 `taskSourceCurrentHash`。未知副作用、未知外部结果和已生成但缺合同/报告的成果不能静默按普通文件放行。

待保存文本草稿按真实 UTF-8 内容绑定；已保存文件和普通二进制文件按 `fs.readFile` 原字节 SHA-256 绑定。Office 转换文本与原容器版本分开验证，不能把提取文本 hash 当文件 hash。普通无 Run 所属的导入文件保留静态、权限、版本门槛。

`Service.exportTestCases` 在转换前检查正式交付，并在原子写入 `beforeCommit` 再查成果、权限和来源。其余 copy/ZIP/Word 及真实连接派发由 main 适配器接线，相关桌面证据由集成负责者记录。

## MCP 单文件文本绑定

模型只声明 `artifactBinding:{mountId,path,changeId?,argumentPath}`。宿主检查该定位属于本 Run 合同的真实成果，并要求 args 中该位置的现有文本叶子与真实成果完整相同。定位最多 8 层，每段至多 100 字符，拒绝 `__proto__`、`constructor`、`prototype`；不动态执行代码。

宿主保存 `deliveryBinding`，包含 Run、输出、报告 ID、真实原文 hash、整个 args hash、合同 hash、来源版本指纹和核对绑定。模型和普通请求 schema 不接受这些证明字段。审批修改已绑定工具或参数必须重建提案。

模型可先提出 pending 提案，Run 完成再生成最终报告。首次审批只有合同、来源、成果和 payload 版本完全一致且当前报告已核对通过时，才冻结当前报告；异版本核对不能转移。批准后保持冻结，实际 connector 调用紧邻前重验。旧提案缺绑定时明确要求重建。

自包含 HTML 原文与 Markdown 都使用同一真实文本绑定。当前范围是单文件原文文本参数；多文件包、结构化转换 payload 和平台特定内容适配尚未实现。不能因此声称所有 MCP 发布已完成。

## 恢复事实与检查未知

内部原型检查可能产生已保存报告但检查结果为 `unknown`。Service 只在匹配持久报告的 executionId、validationRunId、结束时间时登记宿主检查报告已保存的 settled 回执，原 operations 的 unknown 结果保持可见。这不证明浏览器或视觉检查通过，正式交付继续被检查门槛阻止。真正工具派发后写入而回执未知，即使工具名相同，仍须核对。

提案构建中仅允许当前 `propose_external_action` 自身的同步检查/提案元数据暂时在途；其余未决操作始终拦截。审批和实际派发不使用该构建例外。

## 定向证据

新增桌面入口 `Service.recheckTaskAcceptance(input:TaskAcceptanceRecheckInput):Promise<TaskAcceptanceView>`；输入为 strict `{runId,expectedContractHash,expectedReportId:string|null}`，null 明确表示尚无首报。它只复用自动检查，不启动模型、不改成果/合同、不调用人工核对。已有可信合同和输出的停止任务在首报前失败也可补检查；没有合同的旧记录不会被重建成已验证任务。

前置与每次异步等待后核对当前项目、停止状态、目录/权限、合同、最新报告及草稿版本，直接读取实际输出/依赖/来源。旧检查器或检查证据过期可重跑；实际成果、依赖或资料版本改变拒绝。首报/重检报告竞态拒绝旧请求，已保存的新报告完整通知 state。报告产生新 ID，人审记录仍保存并绑定旧报告，不迁移到新报告。

未知副作用可以读取新检查证据，但不自动核对、不重放原工具，`pending/may_have_run` 事实和外部 unknown 保留；正式交付仍经过 `assertReconciled`。调用链中静态/文本/模板/业务来源检查只读取；原型检查使用隔离快照浏览器，拒绝外部网络、权限、下载及弹窗，仅保存 Slash 检查报告与截图。该判断不把宿主报告持久写入说成“完全没有写入”。

错误码：`TASK_ACCEPTANCE_RECHECK_UNSAFE`（任务未停止、Plan、修改/重检在途、无可信输出）、`TASK_ACCEPTANCE_RECHECK_STALE`（合同/report 快照或实际版本变化）、`PERMISSION_DENIED`（项目/授权变化），缺合同沿用 `TASK_ACCEPTANCE_NOT_FOUND`。本入口不因 unknown 返回恢复错误，交付/继续任务仍保留 `RUN_REQUIRES_RECONCILIATION`。

- 最新重检 Service 12/12 + 既有交付 Service 7/7 合跑 **19/19**，日志 `.test-data/production-task-acceptance-recheck-service-20261011.log`，exit 0，`duration_ms 18474.9671`。覆盖停止任务报告持久化、state 通知、合同与草稿保持、人审不继承、真实校验等待期四类变更、首报前实际 runtime 异常、首报竞态、来源变化、证据过期与内容变化对照、unknown 保留且无模型重放。
- 本次 `npx tsc -p tsconfig.node.json --noEmit` 通过。独有恢复测试另见 `docs/production-g4-restore-acceptance-2026-10-11.md`，6/6。没有由本代理运行全量/build。

- `tests/task-delivery-service.test.ts`：7/7，9.019 秒；日志 `.test-data/production-task-delivery-service-20261011.log`。真实 Service.send/runtime 回调覆盖提案→完成→新报告→人工核对→批准，原字节 PNG、草稿保存、来源变化、旧提案、伪造正文/定位、撤权、参数变化及相同工具名真实写后 unknown。
- 既有外部提案回归：4/4，5.907 秒；日志 `.test-data/production-external-proposal-regression-20261011.log`。
- 自包含 HTML 样本 `publishHtml` 与 runtime 种子位于该 Service 测试中；确实绑定原文，缺真实浏览器 runner 时不能宣称可发布。该测试未伪造浏览器通过、截图或远端成功。
- Service 修改后 `npx tsc -p tsconfig.node.json --noEmit` 已通过；随后共享工作区新增 `production-agent-evaluation.ts` 导入大小写错误使最后一轮检查失败，已交集成负责者处理。这一轮没有由本代理 build 或打包。

真实模型完整任务、真实 Electron HTML 门槛成功流程、连接账号的实际云发布、多文件 payload、SMB 双机由后续集成验收证明；上述定向测试不替代这些证据。

通俗说明：草稿可以继续保存。导出或发布时，程序会再次确认“你刚核对的就是现在这份文件和资料”，外部发布正文也必须与文件一致；处理中改过内容，就需要重新核对。

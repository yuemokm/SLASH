# 任务验收领域契约（2026-10-07）

本模块将运行结束、具体自动检查和业务覆盖分开。`Run.succeeded`继续描述模型执行；`TaskAcceptanceReport.status`描述已执行的具体自动检查；`businessCoverage`保留完整需求语义覆盖与假设的核对状态。自动检查通过时显示“自动检查通过，业务覆盖尚待确认”，不要求每次任务弹确认表单。保存未验证草稿不能升级为验收通过。

实现位置：`shared/task-acceptance.ts`、`main/task-acceptance.ts`。数据存入现有 SQLite KV 的 workspace/run 分区，不新增数据库或模型循环。自动记录、候选规格、历史报告均保留；模型定义输入严格禁止状态和证据字段。

流程源图：[任务验收](diagrams/task-acceptance.mmd)。

## 集成接口

```ts
const domain = new TaskAcceptanceDomain({
  store,
  workspaceId: () => currentWorkspaceId,
  guard: write => assertCurrentAuthorization(write),
  readTarget: async target => ({content: currentOrdinaryArtifactText, dependencies}),
  readSourceHash: async source => currentAuthorizedSourceHash,
  check: async input => trustedHostCheckerOutcome,
});

domain.begin({runId, request: {id: userInputId, text, source: 'initial'}, scope: 'deliverable'});
domain.appendRequest(runId, {id: inputId, text: actualDeliveredText, source: 'steer'});
domain.define(runId, {expectedRevision, outputs, criteria, prd});
domain.freezeBaseline(runId, frozenPreviouslyVerifiedCases); // 仅宿主
const report = await domain.validate(runId, {signal});
const view = await domain.get(runId);
const currentReport = await domain.getReport(runId, report.id);
```

`begin`、`appendRequest`、`define`、`freezeBaseline`、`getContract`、`listReports`同步执行。`validate`、`get`、`getReport`异步。权限和Plan边界由现有Service/Pi网关决定；domain的guard在每次await后、写记录前再核对workspace/授权。guard的write参数表示验收记录变动，不是对成果文件写入，不能因此要求只读成果挂载可写。源资料只读核对，模块没有文件应用/编辑接口。Plan只能读取已有契约与报告，不运行或生成新记录。

`outputs`含稳定id、成果kind和明确版本target。草稿target包含`source: 'draft'`、mountId/path、changeId、contentHash、baseHash；正式target为`source: 'applied'`、mountId/path/contentHash。readTarget必须由宿主校验草稿归属、当前changeId、权限和原件保护，不接受模型提供正文。domain对实际UTF-8正文重新计算SHA-256，未匹配不运行通过。dependencies由宿主真实快照提供，包含mountId/path/contentHash；按每份输出分别冻结，新增、删除或hash改变都会使旧报告过期。

criteria只追加，不因模型遗漏而删除；同id不允许修改expected、步骤、required或绑定。修改输出的当前hash会变更contractHash，使旧报告失效。用户明确改变要求时可由宿主调用`amendCriterionFromRequest`，要求引用已冻结输入中的原文授权摘录并保存旧definition。摘录存在只能验证绑定，实际授权语义由Service判断；此接口不得暴露为模型工具，也不修改原始输入或旧回归基线。

模型可定义`static_quality`、`text_assertion`、`prototype_cases`、`business_provenance`和`human_review`候选检查。静态检查复用`qualityCheckForArtifact`；文本断言只证明文本表现。prototype/business通过已有宿主checker回调，不接受模型自评。没有检查器保持unverified。原型passed需要当前entryHash、manifest、与冻结定义一致的caseDefinitions、实际断言observed及截图hash。已有required用例可以由原型领域追加，必须包含并完成任务请求的具体用例。

## 来源、覆盖和回归

PRD证据复用WorkflowSourceReceipt，包含source snapshots、假设和原始请求到criterion的候选覆盖映射。覆盖摘录必须出现在真实输入中，criterion必须引用对应requestId；映射存在不等于完整语义覆盖。没有映射的原始输入、假设始终在businessCoverage中列出。来源hash改变/不可读使记录stale/unavailable。新增steer/follow_up使旧contractHash失效；接入方只登记真正用户输入，取消未送达内容不可假装已执行。

baseline为宿主冻结的旧case definitions及版本，独立于当前候选规格保存与执行。报告的`results`和`regression`分别展示；旧关键用例失败会使自动检查失败。调用方修改原对象不会改变持久基线。已有基线不可被模型替换，即使新增用例通过也不会忽略旧用例。

普通聊天默认scope=conversation且无output，返回not_applicable。明确交付scope=deliverable但无实际output保持unverified。只要登记output就进入deliverable；自动静态检查始终执行，但默认不会要求模块PRD具备完整七章，显式模板requiredSections才严格执行。

报告不可由模型写入，持久历史保留当时观察。getReport动态核对当前契约、成果/草稿、依赖和来源；旧passed在当前视图上失效为unverified，versionState标明stale或unavailable，持久历史不改写。重启仅恢复记录和核对版本，不自动重放模型/浏览器任务。

## 专项验收

`npx tsx --test tests/task-acceptance.test.ts`覆盖普通聊天、真实用户输入保留、候选不能弱化、用户明确变更的历史记录、draft/applied版本失效、只读成果检查、依赖新增/删除/改hash、来源和假设、覆盖摘录、独立回归失败、宿主证据完整性、未接检查器、撤权/取消、并发追加输入、workspace隔离，以及真实Store关闭重开后不重放。

## Service / Pi / 界面接线

Service在每个Build创建契约，冻结原始输入和真正送达的steer/follow_up；resume继承原请求及授权祖先草稿，Plan确认保留原研究请求。write_draft/edit_draft回执自动绑定实际Change/hash；正文由宿主从真实草稿读取，读取来源由read_file回执登记，模型只能选择sourceIds。普通聊天无输出时not_applicable，不新增成果读取审批。

模型工具为define_task_acceptance/get_task_acceptance/check_task_acceptance。get在Plan只读可用；其余仍走Build权限。候选、状态与证据严格分开。静态、文本、业务来源与真实原型检查复用现有模块；字段维度、假设和跨成果语义没有宿主证据时继续标待核对。

主Pi session正常结束后，宿主执行validate→可确定修复的失败反馈→至多两轮同session prompt→recheck，共享原timer、tool budget、取消信号与模型。每轮assertRuntimeSucceeded；未知外部结果不重放，修正阶段不能执行外部写入、进程、安装技能或请求新网页。未验证/需人判断不盲目自修。Run.succeeded仍是执行结束，不能替代验收status。

HTML自动执行1440×900可见性与整页no-horizontal-overflow断言；组件内部滚动不等于整页溢出。真实runner同时列出脚本异常和被阻断依赖，截图存在不抹去错误。修改前冻结人工required规格以及同成果最新current、passed任务报告中实际执行的关键caseDefinitions。只排除基础host:render冒烟用例，具体交互回归独立保存。保存仍可由用户明确执行；保存后只把target重绑定正式hash并重新运行宿主检查，不启动模型修正、不因保存成功直接改passed。

回复尾部质量检查展开显示当前版本、具体问题、来源、假设及独立回归；get动态刷新旧证据。宿主标准改动接口amendCriterionFromRequest/amendBaselineFromRequest保留原标准与真实输入摘录，不暴露给模型。未来的人工作用入口必须明确核对授权语义，当前模型无法自行改变旧标准。

`tests/task-regression-service.test.ts`使用真实Store/Files/Service及模拟runtime，验证冻结旧规则、有限修正仍失败、合法续作与子目录依赖。`tests/global-skills-service.test.ts`验证授权本地安装、同Run立即读取技能附件、global只读及父mount保护、旧Run撤权与异步read guard。流程模拟不代表真实模型或浏览器业务正确，真实UI、GitHub安装、DOM执行和用户资料多轮验收由根代理统一记录。

## 独立内容审查接入

资料研究、PRD及依据实际来源生成的相关成果，在原Pi生成结束后追加无工具的独立内容审查。宿主从真实输出快照和实际read_file/工作流回执读取正文，绑定完整原始请求、正文SHA-256及Office原文件字节hash；模型不能提供替代正文或伪造来源。算法只选真实段落构成预算内的审查packet，截选和无法读取的来源明确保留partial限制。普通聊天无成果时不新增审查调用。

`main/agent.ts`复用当前Pi配置的completeSimple，保留用户选择的模型、协议和思考档位，不启用工具或建立第二套agent循环。请求的正文输出预算为min(4096, model.maxTokens)，Pi可能按协议另加思考预算，不能将其描述为所有协议总输出硬上限4096；真实usage、耗时和正常stop终态独立记录。原任务deadline和取消仍约束调用，取消、长度截断、无效JSON或预算不足保持unverified，不换协议重试。上下文扣除正文输出预留与2048余量后不足1000时不发请求。

`automaticStatus`保留结构/DOM的确定性结果，contentReview记录模型意见；有真实引句绑定的问题使整体needs_human，确定性失败仍failed。模型未发现具体问题也不升级businessCoverage，partial审查不能称全业务覆盖。只有宿主绑定的高置信局部意见可以进入原有两轮修正，范围或事实推断只能澄清为假设/待确认解释，不能根据摘录中缺席的规则建立新事实。跨成果候选需引用两个实际成果身份。

模型回执以新报告保存，旧确定性报告和审查回执保留历史。get/apply/reload仅本地核对并复用准确绑定的回执，不暗中调用模型；请求、成果、依赖或来源改变后旧意见stale。撤权或来源不可读时当前视图清除旧引文和发现，历史数据不改写；界面切换Run或请求失败也清空旧视图。

`tests/content-review-service.test.ts`使用真实Service、SQLite/Files、createRuntime/Pi和本地HTTP SSE模型fixture，验证独立无工具调用、同session局部修正、修正期间新网页请求被拒绝、apply/get零额外调用、来源变化失效、原Run取消及普通聊天零审查。fixture响应为显式模拟，仅证明Pi接线和流程，不代表远程模型已经正确理解用户资料。`tests/task-acceptance.test.ts`另验证撤权视图隐藏引文且旧持久回执不变。真实QE05/QE16由根代理统一运行并记录。

通俗解释：生成结束后，软件会再对照已经读过的资料审稿。检查意见必须指出真实原句，修改也只能处理有证据的局部问题；不会擅自打开新网页找理由，更不会把“审稿人没发现问题”当成业务已经全部确认。保存和打开结果不会悄悄再用一次模型。

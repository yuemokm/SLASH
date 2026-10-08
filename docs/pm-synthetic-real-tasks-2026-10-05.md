# 合成资料真实任务验证

最终结果：五次真实模型任务（含一次验收反馈）均完成，草稿真实应用，原件hash和历史版本保留，四任务关闭重启恢复通过，pageErrors为空。反馈后HTML经独立Edge实际操作12/12通过（9项业务、3项补充），无浏览器错误或外部请求。测试还发现并修复项目元信息读取误切换项目的产品缺陷，桌面回归4/4通过。PRD保持40字基线而HTML按明确反馈改为30字，文档同步仍待后续；不把本地演示通过扩展为真实后台通过。

本轮使用新的 `.test-data/pm-synthetic-real-<timestamp>` 项目与 profile。资料仅为脚本生成的中文工单需求 Markdown、3 条工单的小型 Excel；不会读取业务原件或写入用户 profile。工具和模型走真实开发版 Electron、正式 IPC、Service 与 Pi 循环，未用模拟模型代替执行。

## 运行入口

根代理统一构建后，先离线准备，再明确授权发起云任务：

```powershell
node scripts/pm-synthetic-real-tasks.mjs --prepare --source-profile "$env:APPDATA\PM Slash"
node scripts/pm-synthetic-real-tasks.mjs --run --allow-cloud --test-dir "<prepare返回的testDir>"
```

脚本每段默认最多 600 秒，可用 `--timeout-seconds` 设置 30—900 秒。实际 Service 自身预算仍生效。启动目录必须为 `.test-data` 下新生成的直属目录；`run-once.lock` 防止同目录自动重复发送。失败或超时后取消当前任务并保留真实状态，不自动重试。

模型只读选取显式给定源 profile 的默认模型字段及其密文；旧版仅迁移 legacy model/key，新版仅迁移所选模型、对应密文与能力缓存。Local State 复制至独立 profile，由真实 Electron safeStorage/ModelSettings 初始化处理；明文凭据不会打印或写入测试回执。不会复制用户会话、Run、共享、连接或工作空间。准备时核对源数据库与 Local State 哈希前后相同。

## 四段验证与范围

1. Plan 读取 Markdown，提出待确认方案；Excel留待Build处理。核对 awaiting_plan、无成果草稿、默认成果目录清单未变。
2. 用户确认只编写一份简洁 PRD。Excel通过真实处理副本和内置文本提取；测试操作员只应用当前 Run 有真实登记回执、来源哈希吻合且落在过程目录的提取文本，再应用指定 PRD 的单一草稿。
3. 生成离线 HTML：标题必填且最多40字、申请人必填、普通/紧急优先级、新建待审批、校验错误保留输入、成功实际新增行、状态筛选改变可见列表。
4. 明确反馈仅将 HTML 标题上限改为30，要求实际 read_draft/edit_draft、不完整重写页面。应用后核对 HTML 哈希变化、PRD及合成原件不变；PRD同步为后续待办。

关闭应用后重新启动同一隔离 profile，只读核对 Run、会话、已应用草稿、版本和文件仍存在，不重新发送云任务。详见 [执行流程图](diagrams/pm-synthetic-real-tasks.mmd)。

## 回执与独立验收

`manifest.json` 给出合成事实、3条种子、资料哈希、路径和实际构建模块哈希；`result.json`记录真实 Run 起止、终态、工具名/状态、草稿应用、版本、来源核对、重启结果和数值用量。`snapshots/baseline-prd.md`、`baseline-html.html`、`revised-html.html`保存真实生成字节，以便独立实际 DOM 验证40/41与30/31边界、字段校验、输入保留、新增行与筛选。`screenshots`保存实际 Electron 会话页面。测试回执不复制原始 thinking、消息或工具参数；应用自身的原生会话记录只保留在独立 profile。

`completed_pending_independent_business_review`只表示宿主执行与保存闭环完成，不能当作业务验收通过。实际PRD规则和HTML交互由另一验收任务读取真实产物、按实际 DOM 操作并记录失败/未知。真实后台、外部发布、SMB和用户原件均不在本轮测试范围。

静态验证：`node --check scripts/pm-synthetic-real-tasks.mjs`与`--help`通过。首轮在`.test-data/pm-synthetic-real-2026-10-05T14-18-42.135Z-y4LvKL/result.json`保留启动检查失败：正常桌面启动自动建立profile内部空默认项目，脚本原断言过严；`cloudExecuted=false`、0 Run、无pageErrors。随后仅放行当前隔离profile内的空默认项目及内部mounts，仍拒绝已有消息、Run、草稿或连接，并使用全新目录重测。

第二轮`.test-data/pm-synthetic-real-2026-10-05T14-20-47.642Z-JPDe15/result.json`记录`WORKSPACE_BUSY`：UI显示时后台默认项目初始化尚在进行，依然0 Run且未发云请求。随后仅在预云初始化workspace明确被该忙状态拒绝后，最多等待45秒再尝试；成功后核对当前root，不重试云请求、草稿应用或结果未知的操作。关键IPC阶段写入progress与lastIPC。第三轮使用新目录`pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm`，并完成下列真实执行。

第三轮Plan真实完成待确认（61,355毫秒），随后重载发现并修复项目元信息effect误用切换项目IPC的[产品缺陷](project-refresh-fix-2026-10-05.md)。原Plan和会话保留在项目分区，通过`--continue-from-plan`核验后直接确认，没有重新计费发送Plan；旧失败回执完整保留。续跑记录当前renderer入口SHA256为`f2803083fea8746a8beec6bf789b925c002c952bc07dabef1b57538c3b6b9830`。

真实执行与关闭重启已完成，最终回执为`.test-data/pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm/result.json`，状态`completed_pending_independent_business_review`、pageErrors为空：

| 阶段 | 真实终态 | Run耗时 | 宿主实效 |
| --- | --- | ---: | --- |
| Plan | awaiting_plan | 61,355ms | MD读取与待确认方案；无成果草稿写入 |
| PRD | succeeded | 103,886ms | copy_for_processing/process_processing_copy真实Excel链；提取文本与指定PRD草稿实际应用 |
| HTML | succeeded | 84,255ms | 单一离线HTML草稿实际应用，保留基线字节快照 |
| 局部修订 | succeeded | 35,231ms | read_draft、edit_draft及Pi diff记录；无write_draft完整重写，修订实际应用 |

PRD基线2794字节，SHA256 `2412acfeb1fcb649b1f0eac5cd5f5a565ae2f4fbb300252fe5e944eea40b8de8`。HTML基线/修订均7131字节，基线SHA256 `bafc4b8a94faf3277aba77dda88ad47ed7b9af2c30bfc76270f1ed1fdf15d1ab`，修订SHA256 `a468e051093611e30fc44a94bb536af088b3be6e0b1910f4edf1afb422c9124d`。修订历史快照与基线hash一致，PRD和合成MD/xlsx原件hash保持不变。重启后同Run/会话/applied草稿、文件和版本均保留，无新Run；实际当前文件hash与对应快照一致。已目视`05-restart.png`，会话、真实修改说明与当前项目布局正常。

模型最后静态文字称前两份草稿尚未应用，与宿主真实applied记录不一致；不能用模型自述证明应用状态，报告以state/版本/磁盘hash为准。独立PRD与DOM业务验收另行执行，以上不表示真实后台或全部规则已通过。PRD本轮保留40字基线，HTML修订30字，文档同步仍为明确后续工作。

独立浏览器确认两个具体反馈：标题/申请人中的无害`<b>测试</b>`、`<i>合成验收人</i>`被列表解析为元素；maxlength把粘贴31字截为30后允许创建。后者原有上限仍有效，根代理根据独立验收补充测试反馈，要求保留完整超长输入并报错；这不是系统权限问题，也不是人类用户另发的新需求。组合第五任务只执行一次：

```powershell
node scripts/pm-synthetic-real-tasks.mjs --run --allow-cloud --feedback-text-render --test-dir ".test-data/pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm"
```

该模式只复用已完成的隔离profile，先核实4轮回执及当前HTML哈希、原件哈希和路径；一次真实反馈要求纯文本渲染、完整保留超过30字输入、提交时明确错误且不新增工单，保留其它行为与PRD。必须有真实read_draft/edit_draft且无write_draft才应用单一HTML草稿。原result不覆盖并另存result-four-runs.json，新feedback-once.lock防重复，新回执feedback-result.json包含Run、工具、应用、版本、前后hash与数值用量；成果快照为snapshots/text-safe-html.html。

第五Run `4e49a13d-4cf9-4bd3-b975-4a5656d5e880`真实succeeded，84,557ms；read_draft/edit_draft/edit_draft_diff均succeeded，无write_draft整页重写。唯一HTML草稿`5e5634d6-5fdf-4b0e-a360-de7e55d8ebe1`已应用，快照7360字节、SHA256 `cd8748cc1f0b4efbd502a0fbda5d25655e6877012d119432a0f38b83bb5f84ea`。PRD及两份合成原件hash未变；先前两份HTML历史快照仍保留；pageErrors为空。执行回执`.test-data/pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm/feedback-result.json`保留当时宿主的`completed_pending_independent_business_review`终态，业务结论由后续独立证据补充，不改写原回执。

独立复验[artifact-inspection.json](../.test-data/pm-business-acceptance-1791209356221/feedback-fixed/artifact-inspection.json)为passed，12项均pass：真实31字输入保留31字、错误明确、列表仍3行；30字合法新增、必填/优先级/种子/筛选/成功反馈正常；标题和申请人标签原文显示，实际b/i元素数均0；无浏览器错误、无外部请求。已实际目视[超长输入错误与保留](../.test-data/pm-business-acceptance-1791209356221/feedback-fixed/BA03-overlength-real-input.png)和[纯文本显示](../.test-data/pm-business-acceptance-1791209356221/feedback-fixed/quality-literal-user-text.png)，与DOM回执一致。基线和第一次修订的原失败证据仍保留在baseline/revised目录；完整业务记录见[独立验收结果](../.test-data/pm-business-acceptance-1791209356221/验收结果.md)。

PRD核心10项资料/规则符合合成来源，但仍记录两项轻微问题：章节引用“按4的数据模型”应为3；编码按序生成且不可编辑应标作演示实现安排或假设。PRD本轮未继续修改，也未将未确认的去重规则当作已确认。真实后台、账号、外部发布和SMB不在验收范围。

最终独立验收统计：第五轮Edge **12通过、0失败、0未知**（业务必需9/9、补充3/3），pageErrors与外部请求均0。原基线及首次30字修订稿各10通过、2失败、0未知，证据原样保留。完整结果已保存于`.test-data/pm-business-acceptance-1791209356221/验收结果.md`；最终HTML为`cd8748cc…`，PRD仍为`2412acfe…`且保留40字规则，HTML为30字，文档同步明确留作下一步。至此本轮真实任务与已限定界面行为验收完成。

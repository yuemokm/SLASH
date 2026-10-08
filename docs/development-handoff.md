# slash AI 开发交付规范

状态：开发任务与验收基线；不代表实现、真实联调或安装测试已经完成。

2026-10-08 最新增量：内置DOCX提取改为保留标题、列表、表格行列和链接等结构；明确合并格与未知格式边界。内置Office提取新增同项目、同版本可信已应用结果复用，脚本/普通文本/未应用及无可信标记的旧结果不复用；不产生虚假阅读回执。实际桌面模板经过隔离正式Service链路和根代理GFM回读，26标题/11表/45行/251格与OOXML基线零差异；文本4994→3946字符，现有4000单来源预览可完整提供，不提高预算。首次解析1次后独立副本及重启复用累计仍1次。根代理合并专项30通过，随后新增GFM边界修复对应8项通过；最终类型检查、构建exit0。日志 `.test-data/docx-reuse-v4-{check,build}.log`，真实证据 `.test-data/docx-structure-replay-NUgXlN`。详见 [Word结构读取与提取复用](docx-structure-and-processing-reuse-2026-10-08.md) 及同名Mermaid源。尚未实现显式模板角色→冻结结构契约→成果绑定→漏项修正，整体业务/视觉质量目标仍active；未追加云任务、PPT、视频或便携版，主进程更新需重启启动BAT。

本轮额度核对：普通周额度已100%，账号额外余额快照62,454.5275225点，已按用户此前授权继续；不得降到31,250点保留线以下。此为账号共享余额，不能把余额差额准确归因本线程；未调用限额重置或购买额度。

2026-10-08 最新桌面模板复测：Run `1713890f-76ed-4922-8601-971003764571` 单次发送，494.487秒首次写稿，保留7392字符Markdown；600.362秒由测试宿主取消，不是自然成功。相比上次461.257秒首稿，未证明提速。导航20次中使用find_rows两次，字段核验15成功/2失败，没有12000字符上限错误；仍重复转换已读取模板。独立审读发现定位D7规则混入图商D19、H9误说合并、名称/编码混用及模板默认值列/6.2缺项处理不足，自动passed不代表业务通过，最终unverified。674项保护记录不变，测试应用和所属进程已退出。详见 [复测一页结果](../.test-data/prd-template-findrows-retest/ONE-PAGE-RESULT.md)。

随后依据实际失败，仅增强 `OFFICE_VALUE_MERGE_AMBIGUOUS` 的索引、值格、字段格、主格和合并范围诊断，仍整次严格拒绝且不返回部分证据。真实Excel离线复现准确指出F9:F18，单独重读H9返回原值“是”，原件未变；不是新的云模型验收。最终字段专项22/22、类型检查及根代理构建通过，日志在 `.test-data/prd-template-findrows-retest/diagnostic-fix`。未制作便携版，主进程更新需重启启动BAT。整体输出质量目标仍未完成，下方记录保留各历史时点。

2026-10-08 后续效率增量已集成：locate_spreadsheet新增find_rows批量字面字段定位，指定名称列及最多3个归属/类别列，保留同名不同类别候选，原目录/行读取、权限、证据链和10000字符上限保留。PRD工作流补原值/解释、模拟/真实实现区分及已读正文复用提示。类型检查、构建及72项针对性测试全部通过；真实XLSX解析回放8字段查找分2页列出11候选，D8/D24同名详细地址类别分别保留，原件不变。未跑新云任务或制作便携版，云端速度与PRD语义改进仍未验证。详见 [表格导航](spreadsheet-navigation-2026-10-08.md)，重启启动BAT可加载主进程增量。完整质量目标仍active，不能以此宣布16项业务基准/整体输出质量完成。

2026-10-08 用户桌面PRD模板真实测试已收束：隔离Run `7c703201-888c-4402-9b47-2247e24a1bc5` 单次发送，经正式copy/process链读取《千禾prd模板.docx》和《05 网点主数据.xlsx》，461.257秒生成8413字符Markdown草稿；宿主600秒取消，实际20:45:42Z结束为 `host_cancelled`，不是产品超时或自然成功。七章及F首次录入/P后续变更分列已具备；独立正文核对发现位置信息与图商信息的同名“详细地址”混用、F4原值改写、定位只读与手动补充矛盾、模拟范围与真实集成建议混写、正式落库/必填条件未厘清，不能交付。应用报告 `automaticStatus=passed`、最终 `status=unverified`，不可当作业务审查通过。另有一次重复模板转换生成同内容pending TXT，与既有处理文本逐字节一致；原始scope检查因此false，但不代表修改参考原件或新增第二份业务成果。测试应用已正常关闭，最终673项保护记录未变、所属进程退出，生产冻结解除。证据在 `.test-data/prd-template-location-proposal/case-PRD-TEMPLATE`。仅验证Markdown中间稿，未验证Word模板排版。

该Run暴露的下一优先点：表格完整回执预算仍令默认16列每页只能返回约3行，模型多次改起始行扫描，并出现rowLimit超限、漏sheet、cursor与范围不匹配错误。此前模型投影压缩已减少回执字符，但不能声称解决分页效率；后续应优先改进有界字段定位/续读提示、区分同名字段类别及复用现有转换结果。不要为了验证重复发长云任务；未确认的业务事实应保留未知。额外额度最近核对仍62,500点、普通周额度已用97%，未设置或调用账户限额重置。

2026-10-08 用户追加约束：本对话普通限额用尽后可使用额外额度，起始余额62,500点，最多使用31,250点（至少保留31,250点）。额度查询确认当前余额62,500、周额度已用96%、普通用量仍允许；该工具只读，不能设置账户硬限额，后续执行应持续核对余额并预留余量。此为本对话预算，不是模型token预算。PRD后续测试改用用户桌面 `C:/Users/yuemokm/Desktop/千禾prd模板.docx`；原件只读，处理先复制，离线模板结构读取不能冒充Slash真实任务的读取证据。

该模板离线准备已完成：70段、11表（45行）、七章，原件和处理副本hash一致。结构与一页标准在 `.test-data/prd-user-template/{template-structure.json,TEMPLATE-TEST-STANDARD.md}`。模板中销售订单、制定活动、3秒/100并发等示例不能当作当前业务事实；未附完整流程图/原型规范，相关标准保持未验证。下一真实PRD任务须由Slash正式copy/process/read模板，检查场景→功能→字段/状态/接口关联及实际来源，不能仅用宿主离线JSON声称完成。此准备没有启动应用、模型或生成正式DOCX。

2026-10-08 表格导航模型回执精简已集成：同一真实5份回执33,688→15,217字符，正文1,634字符及来源/游标/例外完整无损；完整宿主记录不变。类型检查、26项专项及build通过，未追加云请求或重复全量测试。实现与图见 [表格导航](spreadsheet-navigation-2026-10-08.md)。用户可重启启动BAT查看本轮主进程更新；云任务提速效果仍待验收。

2026-10-08 短局部修订实测：Run `01847ed7-f05c-401d-ae7c-23cb58448176` 一次发送，宿主在600秒发出一次官方取消，602秒实际结束为cancelled（不是产品30分钟超时）。生成HTML与PRD两份pending，未应用、无越界改稿；对新HTML执行3项正式浏览器用例、39步全部通过。PRD正文已区分首次采集与后续变更，但原“变更”表头仍与首次采集只读值混用，语义验收保留未验证。首次工具约12秒、首次编辑411.831秒，发生1次Pi压缩；不能宣布整体效率达标。5次表格定位响应33,688字符，单元格正文1,634字符，是下一步精简重复元数据的实际依据，不代表唯一耗时原因。隔离应用已正常关闭，755项保护记录不变、相关进程退出。证据目录 `.test-data/qe12-location-short-proposal/case-LOCATION-SHORT`；完整质量目标继续进行。

2026-10-08 按需工具加载已集成：Build使用17核心工具＋固定组加载入口，55原工具完整注册；Plan仍为原只读集合。修复受控PowerShell被同名排除的接线问题，补齐自动修正阶段命令/外部提案的执行前拒绝。类型检查、50项定向、构建及全量683/683通过，0失败/跳过/取消；100个测试文件按图片单独、其余并发2运行，无遗漏。真实本地Pi HTTP首包18工具、tools JSON13544字符，下一turn可调用加载组；不能据此证明云模型业务任务已提速。见[工具按需加载](agent-tool-loading-2026-10-08.md)。下方“仅提案”保留为先前时点，业务登记缺口审计仍暂缓。主进程更新需重启启动BAT，未制作便携版。

2026-10-08 评审后修订真实任务结束：隔离 Run `e845e969-ce28-497e-be91-b1108e54f4a9` 一次发送，30分05.409秒后以 `TIME_BUDGET_EXCEEDED` 失败；无新草稿、无编辑或写入，三份正式种子未变。全局 frontend-design 实际加载成功，但读取资料和现稿后仍未进入修改；Pi 完成6次压缩，第7次在超时期间中断。10项原型回归因没有新HTML均未执行，不能用旧稿回填通过。应用正常关闭，保护记录一致、进程退出。证据在 `.test-data/qe12-review-revision-proposal/case-QE12-revision/{terminal.json,runtime-safety-summary.json,app-close-proof.json}`。这不否定摘要工具的本机验收，但本Run没有调用该工具，不能声称已验证云端提速。

下一步优先减轻固定工具输入：静态54项工具定义共53,663字符，其中参数schema43,299字符；Build注册总数55，PowerShell参数未纳入本次静态总量。见 `.test-data/task-input-size-audit/AUDIT.md`，不是实际HTTP输入或token测量。按需工具加载仅提案，准备复用Pi原生活跃工具API，保留能力发现、原网关与Plan限制。业务登记缺口先收窄为宿主确定性审计，不默认追加模型请求；两项均未实施，不能计为已完成。

2026-10-08 模型验收摘要集成完成：`get_task_acceptance` 默认摘要、按需详情与连续分页；`check_task_acceptance` 仍真实执行并保存完整报告，再返回摘要。文件版本与读取身份分开，同来源重选保留冻结回执；原 Excel 变化而 TXT 未变时，各详情入口隐藏失效依据。类型检查、65 项定向、正常构建和串行全量 **675/675** 通过，零失败/取消/跳过（441980.0083 ms）。日志 `.test-data/task-model-view-integrated-tests.tap` 和 `.test-data/task-model-view-integrated-build.log`。契约和图见 [模型验收摘要](task-acceptance-model-view-2026-10-08.md)。真实旧任务隔离回放另记，不以本机测试证明云模型提速或业务质量通过；QE12 既有业务与交互失败仍保留。主进程更新需重启启动 BAT，未制作便携版。下方“当前仅设计”为之前时点记录。

同轮真实回放：生产 Service 在无密钥的新隔离 Store 中恢复 24 条真实读取及 25 个唯一字段证明；默认摘要 3311 字符，88 次调用最大响应 8270 字符，169 项旧资料与案例文件不变。撤权、TXT 变化、原 Excel 变化而 TXT 不变的过期处理通过。原合同 PRD 来源/基线为空，回放未导入原型报告/截图完整依赖，相关非空场景及完整报告正文仍未验证；没有重新调用云模型。详见 [一页结果与边界](../.test-data/task-acceptance-projection-real-proposal/ONE-PAGE-RESULT.md)。接续的评审后修改验证仅有已审方案与脚本，准备或启动均不代表任务通过。

2026-10-08 最终集成：原型自检工具输入与宿主目标修复完成；类型检查、正常构建及串行全量 **664/664** 通过，零失败/取消/跳过（423256.0328 ms）。初次并发全量的图片测试 worker 原生异常保留，单文件与串行全量均未复现，不能宣称已查明原因。日志 `.test-data/prototype-tool-contract-final-serial-tests.tap`；本次没有重发完整云任务，真实 QE12 的业务与交互质量仍未通过。下一项待做的是模型专用验收摘要与阅读证据按需查询，当前仅设计，不能计已实现。

2026-10-08 原型自检工具修复：11 处 Zod 工具参数采用 `io:input`，默认参数可省略、执行继续严格校验；原型 define/get 返回宿主核验的 `target/runRequest`，明确 specId/outputId/artifactId/changeId 区别，pending 无需先应用或注册。历史失效报告保留，撤权、目标冲突、hash/base/依赖变化继续拒绝，来源变更在浏览器执行前拦截。类型检查、45 项专项及正常构建通过；本机 Pi 工具链的模型回复/浏览器观察为夹具，不是新云任务验收。完整回归先发生图片测试原生进程异常，单文件复跑 4/4 通过，串行全量结果见最终记录。契约、成本与测试边界见 [工具输入与草稿目标](prototype-tool-input-targets-2026-10-08.md)。此修复不把下方真实 QE12 的业务/交互失败改为通过。主进程改动需重启启动 BAT，未制作便携版。

2026-10-08 完整 QE12 导航复测已结束：同一真实资料、原任务、配置模型及 30 分钟预算下，一次 Run 在 29 分 39.594 秒内生成 PRD、HTML 和来源对照三份 pending 草稿；正确选择机会门店工作表，产生 25 条唯一字段证据。运行 succeeded **不代表业务验收通过**：任务总验收/业务覆盖仍 unverified，独立复核发现四组文档问题；同一终态 HTML 的正式浏览器检查 10 项中 8 项通过、2 项失败（定位后提交被自身校验拒绝，重复门店仍可新建）。计划 72 步、实际执行 69 步，其中 67 通过、2 失败，另 3 步未执行。全局设计技能实际加载，但专业视觉质量未确认。11 次 Pi 压缩及最大 56,319 字符的验收查询响应暴露效率问题，不能据此调整或另建上下文循环。隔离应用已正常退出，749 条保护记录/717 个唯一文件不变，未保存测试草稿或重发任务。见 [独立质量结论](../.test-data/qe12-navigation-independent-review/FINAL-ONE-PAGE.md) 与 [真实任务与后续修复](qe12-navigation-real-result-2026-10-08.md)。下方“待执行”保留为该轮启动前历史记录。

2026-10-08 表格导航增量：新增只读 `locate_spreadsheet`，复用已登记 XLSX 原件／副本／提取稿校验链；工作流先提供真实工作表目录，再按需定位行、单元格并走原字段证据核验。修复 Pi 输入 schema 将默认分页参数错误列为必填的问题。类型检查、40 项导航／字段／Office 专项、32 项工作流专项、正常 build 及有界并发全量 **655/655** 通过，零失败／取消／跳过（224401.531 ms）。真实资料本地零模型预检通过：5 张工作表→机会门店表→编码／名称各 5 条字段证据；这尚不能证明云模型任务或业务解释合格。新完整 QE12 复测待执行；旧失败记录保留。见 [导航契约](spreadsheet-navigation-2026-10-08.md)、[来源首包](workflow-source-preview-2026-10-07.md) 和 [真实导航预检](../.test-data/qe12-navigation-retest-proposal/NAVIGATION-PREFLIGHT-RESULT.md)。集成日志 `.test-data/spreadsheet-navigation-final-build.log`、`.test-data/spreadsheet-navigation-final-tests.tap`。没有制作便携版，主进程更新需重启启动 BAT。

2026-10-08 最新集成：HTML审查选段和字段工具参数/错误提示修正已进入正式构建；类型检查、31项专项、正常构建及有界并发全量636/636通过，零失败/跳过。原QE12完整任务自然达到30分钟时限而失败，仅产出PRD和对照，无HTML；实际加载了全局设计技能，但反复读表、16次字段工具参数失败，文档还存在对象/编码/列轴错误。隔离应用已正常关闭，721项保护记录不变。修正后的真实完整任务尚未重跑，不能宣称整体质量达标。见[字段工具修正](spreadsheet-tool-guidance-2026-10-08.md)与[最新完整实测](quality-real-followup-2026-10-07.md)。接下来优先补有界工作表/字段定位和准确来源对象导航，避免泛读整表；不盲改Pi压缩或增加另一套harness。主进程改动需重启启动bat，未制作便携版。以下旧结果保留历史。

2026-10-07 审查输出上限补充：取消独立审查额外4096截断，沿用当前模型已解析上限，实际请求仍由Pi原生上下文夹紧；Service原资料选段保留，兼容小窗口。类型检查、构建及全量624/624测试通过，0失败、0跳过。同一D冻结输入真实对照从length/正文0变为正常stop/正文430，但仍0发现且部分上下文未覆盖，不算业务审稿合格。见 [实现与边界](content-review-configured-budget-2026-10-07.md)。当前继续优化HTML审查选段并准备原QE12完整真实任务，尚未执行的新任务不得计通过。

2026-10-07 最新实测补充：全局技能的安装、管理、跨项目读取已接通；来源预览/续读、审查短文档容量分配、表格字段证据及原型已确认范围隔离均已进入正式构建。当前类型检查、正常构建通过；有界并发全量616项测试通过，0失败、0跳过。真实Excel副本10组字段/列头/原值证据验证通过，但不等于模型已能正确解释业务。真实任务仍有文档与原型不一致、视觉反馈不完整、独立审查截断等问题；E测试额外定位提示也造成修改范围歧义，不能全部归因于模型。当前应区分运行、可用性、业务准确性，不以执行结束判定交付合格。最新结果和局限以 [真实资料后续验收](quality-real-followup-2026-10-07.md) 为准，下方历次数量保留为历史记录。

最新增量契约见 [表格字段证据](spreadsheet-field-evidence.md) 和 [原型必检与候选隔离](prototype-confirmed-scope-2026-10-07.md)。最终集成日志为 `.test-data/quality-evidence-final-build.log`、`.test-data/quality-evidence-final-tests.tap`（130521ms）。主进程已修改，用户需退出旧开发应用，再运行“双击启动开发环境.bat”；没有修改版本号、正式用户profile或制作便携版。原真实E回归保持未验证，不用测试runner通过回填真实任务。

2026-10-07 用户优先要求的Slash全局技能已接通：设置安装/启停/更新/卸载、会话安装、跨项目只读发现与Pi正文加载，项目同名优先。真实公开GitHub子目录安装、隔离Electron点击、本地真实技能跨项目及重启验证通过，正式用户profile未修改。入口、边界及证据见 [全局技能](global-skills-2026-10-07.md)及[架构源图](diagrams/global-skills.mmd)。当前正常build及487项测试通过；实际云模型成功调用load_skill读取全局frontend-design已留证，完整原型视觉/交互尚未验收。为减轻运行输入压力，自动索引投影已限定6000字符，完整磁盘索引及人工规则保留，见 [索引上下文](agent-index-context-2026-10-07.md)。

质量优先六项范围以 [输出质量开发与验收账本](quality-first-development-2026-10-07.md) 为准。任务验收与主Pi最多两轮草稿修正已接通；真实资料基准和独立业务检查仍需继续，不要将全局技能完成误记为整个质量目标完成。

2026-10-07 成果卡片支持文件名普通点击预览、Ctrl + 左键 / Ctrl + Enter 通过授权主进程定位；缺文件只打开已有父目录并提示，不隐式保存。待提交按钮由“应用修改”改为“保存到项目”，明确草稿尚未写入。契约、定向验收和系统资源管理器未实开边界见 [成果卡片定位与保存文案](change-card-navigation-2026-10-07.md)。

2026-10-07 按 Pi 接入五项顺序完成的修复及剩余架构缺口见 [Agent 架构检查](agent-architecture-review-2026-10-07.md)。具体契约与证据分别见 [授权项目技能](authorized-project-skills-2026-10-07.md)、[授权图片与原型视觉反馈](authorized-image-reading-2026-10-07.md)、[运行中补充与运行状态](run-input-runtime-status-2026-10-07.md)。Pi 继续拥有模型上下文与原生循环；Slash 保存业务状态和授权。分支、OAuth、任意扩展本轮仅评估，不作为已实现功能。测试辅助程序的隐藏窗口机制仅对严格隔离的测试 profile 生效，不改变正式启动行为；本轮不制作便携版。

2026-10-05 增量草稿沿用 Pi `createEditToolDefinition`/`EditOperations`，由 `shared/draft-edit.ts` 定义分页读取和哈希约束，`main/draft-edit.ts` 只在内存编辑，Service 保留权限、锁、同步提交检查和既有 apply 版本流程。见 [设计与离线验收](draft-edit-2026-10-05.md)；真实模型和打包结果单列，不能由离线夹具推定。

0.3.9 的处理回执采用可选项目 ID / 输出哈希及确定性输出索引；业务查询与交付预检共用 `processing-provenance.ts`，权限变化不能吞成仅警告。契约、代码位置和回归证据见 [原始资料版本核对](source-freshness-2026-10-05.md)。

2026-10-05 的业务规则增量采用既有需求记录的可选字段，工具与 IPC schema 在 `shared/business-rules.ts`；Pi 工具链、权限、分页、版本和界面证据见 [业务规则与成果落实核对](pm-business-trace-2026-10-05.md)。旧记录兼容，规则保持候选或未知，不增加独立 harness。

0.3.7 用户确认采用 Pi 原生上下文计算、压缩与自动恢复，删除 Slash 的重复压缩调度及固定输出预算拦截。正确解析并配置模型能力；保留 prompt 真实终态和参考原件保护。当前实现与验收以 [Pi 原生上下文与模型能力](pi-native-context-2026-10-05.md) 为准，覆盖下方 0.3.6 上下文条款。

0.3.6 参考资料原件必须只读，转换先生成有来源记录的独立副本；存在原件时禁止任意宿主脚本绕过。模型请求使用 Pi 上下文估算、一次压缩和最终输出预算守卫，length 必须可区分且保存部分结果。设计、边界和验收见 [参考原件保护与输出截断恢复](reference-protection-and-run-recovery-2026-10-04.md)。

0.3.5 命名修订优先：项目文件统一为 AGENTS.md，人工说明与自动资料索引分区更新，旧单数文件安全迁移。读取、草稿和写入须避免重复注入、跨项目写入及互相覆盖，当前规范见 [统一 AGENTS.md](agents-document-standard-2026-10-04.md)。下方旧文件名说明仅作历史。

0.3.4 默认资源调整为 skills、模板、参考资料；新项目只创建空目录和 agent.md 索引，停止默认 AGENTS.md 与示例文件生成。旧项目仅清理完整匹配的内置文件，迁移保留用户资料和自定义结构，验收见 [资源三分类](resource-layout-2026-10-04.md)。

2026-10-04 的 0.3.3 项目结构、系统提示词、资料索引与会话控件变更见 [最新设计和验收](project-resources-agent-design-2026-10-04.md)。默认项目使用资源、成果、过程文件三个分类根；旧目录保留。手工 `AGENTS.md` 与自动资料索引 `agent.md` 用途不同，均须按最新运行链路处理。

## 1. 资料优先级

最新用户要求 > pm-focus-delivery-plan.md（2026-10-02 个人版聚焦范围）> product-spec.md > sharing-network-drive.md（共享专章）> architecture-baseline.md > architecture.md。冲突需修正文档，不允许仅在代码中悄悄选一种解释。

F01—F19 保留为历史索引；用户已授权个人版功能减重和工作流扩展，当前范围见 pm-focus-delivery-plan.md。设计包为可选逻辑集合；会话为全部成果编辑入口；目录授权决定访问边界，逻辑归组不决定访问权限。

## 2. 工程结构与技术验证

按 desktop、contracts、domain、application、agent-runtime、tool-gateway、integrations、storage、workers 组织单仓库。domain 不依赖 Electron/Pi；UI 不直接访问 SQL、文件系统或子进程。工程构建工具与具体版本由开发阶段验证并写入锁文件和 ADR；已有架构方向不得无依据替换。

### 本地启动命令约定

`npm run dev` 是桌面开发入口：它依次运行 Vite 构建和 TypeScript 编译，生成 Electron 主进程及 preload，再启动 Vite 开发服务（默认 `127.0.0.1:5173`），等待 HTTP 就绪后通过 `PM_SLASH_DEV_SERVER_URL` 启动 Electron。窗口加载开发地址，因此渲染进程支持 HMR；主进程或 preload 代码修改后需重启该命令。Ctrl+C 会清理 Electron、Vite 及其 Windows 子进程；端口被占用时直接报错，不会连接到其他服务或改用未知端口。可通过 `PM_SLASH_DEV_PORT` 指定 1024–65535 的端口。

`npm run dev:renderer` 只运行 Vite，不能提供 Electron preload、IPC 或本地业务服务，适用于渲染层调试。`npm run build` 生成 `dist/renderer` 和 `dist/main`；`npm run start` 先构建再让 Electron 从 `dist/renderer/index.html` 启动生产模式。打包命令继续使用 `npm run pack`。

实现开始先跑通 Electron → Pi 自定义工具 → 网关 → 授权草稿文件，验证流式事件、取消、恢复、Windows 路径和扩展是否绕开网关。随后验证官方 CLI 状态与一个真实发布 MCP 的能力。无账号或服务可做契约测试，但真实联调单列为待验收，不能算已通过。

共享使用受限管理助手与普通用户映射分离。预览不注入通用业务 IPC；构建任务不得继承无关密钥。

## 3. 必须落地的可执行契约

开发第一阶段在 contracts 中提供 TypeScript 类型、运行时 schema、有效/无效示例，在 storage 中提供 SQLite 初始迁移。下表是设计约束，不代替机器可执行 schema。

| 对象 | 必需数据与约束 |
| --- | --- |
| Workspace | id、name、schemaVersion、defaultOutputMountId；输出挂载必须可写 |
| FolderMount | id、workspaceId、canonicalRoot、kind(local/smb)、access(read/read_write)、excludedPaths、enabled；真实路径归一化后做授权 |
| Conversation | id、workspaceId、title、status(active/archived)、piSessionRef、createdAt、updatedAt；可关联多个成果 |
| Artifact | id、workspaceId、mountId、relativePath、kind、currentVersionId；路径必须落在授权挂载内，移动不得重建身份 |
| DesignPackage | id、workspaceId、title、artifactIds、requirementRefs；可为空集合；成果不必属于集合 |
| ArtifactVersion | id、artifactId、contentHash、snapshotRef、createdAt、originRunId（外部导入可空）；不可变 |
| ContextManifest | runId、规则/技能版本、sourceRefs、截断记录；每条 sourceRef 含 mountId、相对路径、hash、locator、读取时间 |
| ChangeSet | id、runId、targets、state、checks；targets 包含 artifactId、baseVersionId、beforeHash、draftRef、operation；新文件基准为空 |
| Run | id、conversationId、workspaceId、packageId(可空)、attempt、state、scopeSnapshot、contextManifestRef、lastEventSeq |
| Operation | id、runId、tool、target、inputDigest、effect(read/write/publish)、state、receiptRef、remoteId(可空) |
| DeliveryRecord | id、artifactVersionIds、targetId、operationId、status、remoteId/url/outputPath(按渠道)；不得只绑定当前工作文件 |
| ShareMount | id、folderMountId、uncPath、localDrive、persistent、status、credentialRef(可空)；盘符是本机属性 |

跨设备不能用裸 resourceId 作为可信身份，引用至少包含来源设备/主机和共享目标；路径修改产生重新绑定记录。时间统一存 UTC，UI 本地化。未知字段兼容规则、字符串长度和路径限制由 schema 明确写出，禁止到处使用 any。

## 4. 命令与事件目录

所有命令使用已有版本化信封，payload 运行时校验。下列字段为最小要求；实现扩展时同时更新契约。变更类命令携带 requestId 去重和所需 expectedVersion。

| 命令 | payload | 返回/事件 |
| --- | --- | --- |
| Workspace.Create | rootPath、folderBindings | workspaceId、初始化冲突列表 |
| Mount.Register | path、kind、access、excludedPaths | mountId、能力与扫描状态 |
| Mount.SetAccess | mountId、access/enabled | MountAccessChanged；后续读取重新校验 |
| Conversation.Create | title、initialRefs | conversationId |
| Run.Start | conversationId、message、refs、outputTargets、scope | runId，随后 RunStateChanged |
| Run.Steer | runId、message | 已接收事件；不保证撤销已执行副作用 |
| Run.Cancel | runId | 进入 cancelling；终态由执行结果决定 |
| Run.Resume | runId | 新 attempt；先核对未知 Operation |
| Resource.Search | query、mountIds、filters、cursor | 带来源结果、nextCursor、解析限制 |
| Artifact.Preview | artifactId、versionId | 有限预览句柄，不返回任意执行入口 |
| ChangeSet.Apply | changeSetId、expectedVersions、selectedTargets | applied/conflict/check_failed；关联变更不能任意拆坏依赖 |
| Artifact.Restore | artifactId、versionId | 创建恢复 Run/ChangeSet，不直接覆盖文件 |
| Template.Upgrade | templateId、targetArtifactIds、expectedVersions | 返回迁移 Run 与影响清单 |
| Review.Submit | versionRefs、feedback、sourceRefs | reviewId、review Run |
| Delivery.Start | versionRefs、targets、授权引用 | 各目标 operationId 与独立状态 |
| Connection.Test | connectionId | auth/health/capabilities/diagnostics |
| Share.Create | canonicalPath、shareName、principals、access | shareId、邀请文本或明确错误 |
| Share.Connect | invitation、drive、persistent、credentialRef | mappingId、状态；不回传密码 |
| Share.Disconnect | mappingId | 解除所选映射，不删除文件 |

持久事件包括 RunStateChanged、ContextSelected、ToolOperationChanged、ChangeSetPrepared、ArtifactCommitted、DeliveryChanged、MountAccessChanged、ShareMappingChanged。token 展示流可丢弃并由消息历史恢复；业务事件按 streamId/sequence 补读。重复命令返回原记录，不再次执行。

## 5. Agent 工作规范

| 任务 | 必要动作 | 完成判断 |
| --- | --- | --- |
| 调研 | 先检索授权目录；证据与推断区分；矛盾显式呈现 | 结论有来源，未解决问题可见 |
| 需求与方案 | 明确目标、角色、流程、规则、状态、异常和验收 | 产出结构完整；未知项标记而不捏造 |
| PRD | 应用指定模板和规则版本；引用原型/流程 | 文件有效、章节检查通过、关联可定位 |
| 原型 | 读取调研与规则，建立模拟状态，生成交互项目 | 可启动、关键流程可操作、页面与规则引用存在 |
| 评审 | 检查完整性、一致性、可验收性；定位版本 | 问题有位置与依据；建议不冒充确定错误 |
| 关联修改 | 搜索显式关联并补充语义候选；修改授权范围 | 差异可查看，冲突不覆盖，受影响检查通过 |
| 知识 | 提取候选，保留来源与适用范围 | 未确认内容保持 draft |
| 交付 | 检查版本、目标能力与已有授权 | 本地文件存在或远端回执核对完成 |

技能可指导方法，不能跳过权限、状态机和提交校验。格式化、文件哈希、路径检查、导出验证由确定性代码完成。Agent 不可因工具返回文本建议而增加权限。自动修复默认最多 3 次，达到上限保留草稿并给出失败原因；用户可主动继续。

## 6. 实施阶段与完成门槛

| 阶段 | 范围 | 完成门槛 |
| --- | --- | --- |
| D0 契约与技术验证 | 数据 schema、迁移、IPC、Pi/网关验证、集成能力核对 | 可重复启动与测试；记录真实能力和版本；不以设计说明代替实验 |
| D1 工作台 | F01—F04、F14、F17、F19 基础 | 会话及跨目录资料引用可持久化；有真实任务和成果 |
| D2 业务生产 | F05—F10 | 参考目录到 HTML/PRD/draw.io 的完整链路；模板迁移可检查 |
| D3 评审修改 | F11—F13、版本与恢复深化 | 一项规则变更能修改多类成果，冲突可处理，知识有确认状态 |
| D4 交付共享 | F15—F18 完整 | 各交付渠道分别真实验收；双机盘符共享可用 |
| D5 全量验收 | F01—F19 回归、安装升级与诊断 | 所有条目可追溯证据；缺账号/设备项明确未完成，不默认为通过 |

阶段可内部穿插，但每个功能必须登记 requirementId、实现位置、用例、状态和证据路径。任务完成报告列出实际通过、失败和未验证项，不能只汇报代码已生成。

## 7. 验收用例

| ID | 操作与前置 | 预期结果 |
| --- | --- | --- |
| A01 | 在有同名文件的目录初始化 | 不覆盖；显示复用或冲突选择 |
| A02 | 会话生成原型，调研在另一授权目录 | 实际读取并引用调研；无设计包也能运行 |
| A03 | 用 junction 指向未授权目录；运行中撤销权限 | 越界读取被拒，撤销后新读取被拒 |
| A04 | 在成果页选择段落或 HTML 元素提出修改 | 引用带入会话；修改只在授权目标提交并可追溯 |
| A05 | 模板章节提一级并更新两份有人工编辑的 PRD | 层级变化正确、正文保留、冲突可见 |
| A06 | 生成客户准入原型 | 销售提交、主管审批、重复代码校验、退回原因均可操作 |
| A07 | 高风险增加风控复核 | 原型、PRD、流程和验收一致；普通客户路径保留 |
| A08 | 两会话同时修改同文件，期间外部编辑 | 不静默覆盖；保留草稿与冲突信息 |
| A09 | 修改中取消并重启应用 | 已提交成果保留；未完成任务可诊断恢复；不自动重放写操作 |
| A10 | 同时导出 Word、Markdown、HTML、源码包 | 文件存在且可打开；静态包关键路由可用；版本可查 |
| A11 | 飞书和钉钉分别创建再更新同一目标 | 更新绑定正确 remoteId；不重复创建；未登录有明确入口 |
| A12 | MCP 发布被远端接受后本地超时 | 进入待核对；查询或人工核对后归档，不盲重试 |
| A13 | 双机粘贴邀请并选择盘符 | 普通权限资源管理器可读写；连接端完成实际写入探测；退出应用不主动移除映射 |
| A14 | 盘符占用、共享离线、凭据冲突 | 不影响其他映射；显示准确状态与恢复动作 |
| A15 | 资源管理器写共享目录 | 指定授权账号可以创建、修改和读取文件；未授权账号被服务端拒绝；解除映射不删除源目录 |
| A16 | 调研资料指令要求读取密钥 | 作为资料处理，不能提升权限或读取未授权文件 |
| A17 | 从知识候选到确认再失效 | 检索标识状态，失效条目不当作当前权威规则 |
| A18 | 干净 Windows 设备安装并升级 | 缺依赖有明确修复路径；升级保留内容与配置 |

开发时建立虚构样例文件和可执行用例；网络、账号、双机相关验收保留实际步骤与结果。不能把 mock 的成功用于证明真实渠道或系统行为。

## 8. 开发 AI 的执行要求

先读产品规格，再读架构与共享专章。先提交契约和样例，再按阶段开发。普通技术细节自行选择并记录理由；只有无法从默认方案推导、会改变业务范围的冲突才询问用户。

每阶段运行适用的类型检查、契约测试、核心业务测试及 UI 验证。验证命令须随工程脚本建立后写入开发说明，不虚构尚不存在的 npm 命令。依赖版本在安装验证后锁定；外部服务不可用不得用假数据完成验收。

全文未规定的像素尺寸、普通文案与内部函数命名可由开发 AI 自行决定。产品范围、会话入口、权限、跨目录检索、成果保存和外部副作用语义不能自行改变。

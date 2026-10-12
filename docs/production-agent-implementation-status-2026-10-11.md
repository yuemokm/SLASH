# 生产级 Agent 方案实施记录

目标：保留 `production-agent-plan-2026-10-11.html` 的全部计划；按2026-10-12用户最新顺序，当前优先完成G2成果质量。状态：G2进行中，不以局部通过替代整体完成，也不继续扩展云平台或媒体范围。

已确认：质量优先，保留30分钟任务上限；非关键未知项经用户绑定具体版本接受后可带说明交付，关键业务、权限、版本冲突、未知副作用不得豁免。代码实现与对应检查由 GPT-6.1 Sol / High 子代理执行，主代理设计、审查与集成验收。

## 完成判据与当前证据

| 阶段 | 完成判据 | 当前状态 |
| --- | --- | --- |
| G0 回归基线 | 最新产品断言、明确阶段同步、时序场景10次重复、check/test/build与日志 | 发布合入前基线check/test/build均exit0，1334/1334（599749.0373ms），三阶段源码未变；证据production-word-ui-root-integration-20261011/unified-result.json。发布前编译小DOCX阅读桌面通过；此前MCP六场景/导航四场景仍按各自版本留证，不升级为当前真实远端验收 |
| G1 安全恢复 | 派发记录与迁移、未决副作用核对、各崩溃窗口/取消/撤权/版本反例 | 后端20/20及副本真实续作专项2/2、组件/IPC及真实桌面恢复路径通过；发布合入前基线1334项全过，恢复专项/桌面按各自证据范围留存，真实云任务质量仍单独验收 |
| G1 连接边界 | OAuth发现/注册/交换/刷新同策略，地址/DNS/重定向/授权内网与单次派发夹具 | 后端21/21、设置UI保存重开/改URL清空及发布合入前基线1334项全过；真实账号仍未验 |
| G2 成果质量 | 来源规则覆盖、实际操作与多视口、同版本图审、限定修稿和冻结回归、带限制交付记录 | 2026-10-12已合入XLSX完整页检查点及字段超预算准确恢复诊断；8文件SHA精确匹配，组合54/54、check/build exit0，三阶段源码不变。证据production-g2-spreadsheet-root-20261012；不是全量。前一根版本1409/1409+build及桌面通过仅对应其版本。最新真实QE05 trial2仅单一导入标准satisfied，整稿跨列/业务对象误读仍不通过；QE12约17分钟首稿未达10分钟目标，pending验收定义重复targets触发ENOENT，后续真实提交Runtime SyntaxError，宿主两项加载/控件检查不证明业务提交可用。两旧试次不回填，wire4及权限/来源/引文/预算边界保持；G2尚未完成真实完整业务验收。 |
| G3 运行隔离 | 宿主独占业务状态、受监督Pi工作进程、取消与崩溃/迟到事件/草稿保留验证 | 待实现与验证 |
| G3 预算与复用 | 时间/工具/修稿预算、实际耗时与费用、缓存失效、固定依赖兼容比较 | 待实现与验证 |
| G4 真实任务 | 16例×3轮≥44/48完整通过；QE05/12/16共9/9；固定分母与同版本证据 | 原批全部失败和独立身份保留，尚未完成48项。最新KsaclG QE05 trial2单项satisfied不等于整稿通过；QmULcE QE12草稿、提交异常与耗时按真实版本留证，不能用Run succeeded或host两项passed替代完整任务质量。当前先收敛G2，不新增付费调用或真实云发布。 |
| G4 发布恢复 | 备份恢复、旧数据、迁移重启、版本导出重开、回退保持数据 | 隔离数据库/文件与旧Store恢复6/6通过；真实模型成果重开、旧exe及SDK会话加载等仍待验，非真实profile替换 |
| G4 外部渠道 | 真实模型、MCP发布与未知结果核对、飞书/钉钉往返、SMB双机普通用户盘符 | 飞书离线认证过期、DWS已认证但未发布；用户确认暂无第二台Windows电脑，双机验收保留未验证，不妨碍其余开发 |
| G5 后续优化基础 | 失败样例入回归、独立保留资料、质量/人工修正/耗时/费用可比较 | 待实现与验证 |

当前共享工作区有大量既有修改，全部保留；本轮不打包。并行代理文件所有权已划分；全量测试与构建在集成后统一执行，避免并发争用。

### 当前集成窗口（历史通过不能代替本窗口结果）

2026-10-12 G2当前窗口：两已父审候选各4文件已按全部base/final校验合根，guidance未合；Service SHA `6a096331ef20ad3c3e2e5055173c48b56264bed521d63548a3afdaf07206da33`，导航SHA `31af65d4fd43c4f5922438cfbb739cff4da04af9cfd73b4e66b1954b1c050331`。owner97621实际exit0：check0（5872ms）、七文件组合54/54（TAP26586.0511ms）、build0（5021ms），sourceUnchanged=true；回执 `.test-data/production-g2-spreadsheet-root-20261012/{integration,result}.json`，日志check/targeted/build.log。本轮未跑完整npm test、未打包、未commit；旧1409不作为新版本全量证明。完整页计入游标/扫描元数据，保持10000/16列上限；字段仅唯一12000预算refinement给减values指引，结构/权限错误不改。详见[分页](production-spreadsheet-page-checkpoint-2026-10-11.md)和[字段](production-spreadsheet-field-response-limit-2026-10-11.md)及各自Mermaid。

前一窗口已完成：`production-content-repair-final-unified-20261011/result.json` check/test/build均exit0，1409/1409（620353.2322ms），Service当时为7fe0d3…7b18。其根built管理桌面6项通过仅合成凭据/本地确定性Runtime，0远端发布；原失败两轮harness均保留。该历史整体验证不能覆盖本窗口两项新代码。

前一集成窗口详细过程（以下历史时点不代替上段当前结果）：

当前根已合入发布aggregate 28文件（seal28885931…088c / patchc31bbead…2478），逐项base与最终SHA一致，Word方法/模板校验及Office v6保留；回执`.test-data/production-static-publishing-root-integration-20261011/integration.json`。发布合入后check exit0；必要定向54524已退出1，45项44通过/1整文件失败（89792.1929ms），仅operation测试依赖私有ZIP和loader。夹具改为同字节自包含ZIP与tsx公开入口，原52565退出0，operation13/13（34639.3583ms）；原失败不拼成整组通过。目录ID恢复已按两文件局部补丁合根，Service仅三处hunk，保留发布/Word/模板；回执production-mount-id-root-integration-20261011/integration.json，check exit0（5400ms），原38801已退出0，自包含目录15项及Files/tool14项联合29/29，0失败/取消/跳过，61734.6686ms。完整日志及终态JSON同回执目录；此目录稳定基线已交oauth隔离修稿并随后按父审整合，真实任务收益仍待验。原统一31128已自然退出1：check0（5788ms），1389项1386通过/3失败，720161.0815ms，源码始终未变，未build；三处均为目录ID未知语义的旧断言（搜索未知ID、工作流未知ID、项目一使用项目二目录ID），不是撤权或移除项目失效。原日志保留。三断言已精确适配MOUNT_ID_UNKNOWN并确保读取错误无保存恢复名单，禁用/越界/移除项目及零模型调用原检查保留。已批准局部修稿9文件按所有base/final hash合根，Service精确3c557ae6…9a7b2，回执production-isolated-repair-root-integration-20261011/integration.json；wire4提示/模型/引文/两轮预算不变、分类候选未合。原4385已退出0：check0（6029ms），真实Service/TaskCompletion及三处断言完整文件53/53，41190.5067ms。原整体统一48686已实际退出1：check0（6166ms），1409项1408通过/1失败、0取消/跳过，633530.0611ms，sourceUnchanged=true，未build；唯一失败为无可修候选的静态资料读取拒绝任务被修稿刷新额外挡住，旧测试期望保留。原日志SHA de2cddcc…069f及终态在production-isolated-repair-unified-20261011。父审最小预检三文件已精确合根：Service7fe0d3d4…7b18，只在无候选/已达两轮时提前结束，原后刷新权限、版本、取消、预算与候选复算不变；三个测试字节未改。回执production-content-repair-preflight-root-20261011/integration.json，隔离原失败1/1及20项安全保护通过（同源，不重复拼算）。该唯一统一检查现已结束，check/test/build均0、1409/1409；此处保留前一窗口过程，不打包。不把下述发布前1334基线称为新根通过。发布管理隔离真实IPC5/5仅合成凭据，无正向云核对/发布。分类候选AB全部invalid已结束，不启默认；平台取舍按用户最新澄清：HTML分享优先复用既有Vercel，数据/登录/存储按需Supabase，Netlify仅保留可选适配，停止专属新增及真实账号验收主线，不要求用户注册；通用快照/恢复/防重发保留。该历史冻结窗口已结束；当前两项G2修复结果以上段为准。

发布合入前的Word阅读基线：Word 阅读 UI 已按封存最小补丁合根（integration.json：abebeb0b…e0ec），保留模板字节复核、v6正文身份和浏览器v8；唯一串行检查会话72982已实际退出0：`.test-data/production-word-ui-root-integration-20261011/unified-result.json`：check/test/build均exit0，1334/1334、0失败/取消/跳过，599749.0373ms，三阶段源码快照不变；未打包。发布合入前root built Word桌面会话33451退出0，result.json位于`built-desktop-5676b17e-9fcd-4b42-89f0-3e3e577c4269`，正式IPC/可信点击1440/390小DOCX阅读通过、pageErrors为空、实例6584关闭；父代理已目视两张top图。`docx-ui-read-isolated-58c59d8008cd49d5a1d05f1adf2ed38d/word-regression.log` 为 52/52（19672.7778ms）；主进程与 renderer 类型检查通过。真实 Electron 经正式 `readDocument` IPC 及资源中的“阅读”操作，在 1440/390 两视口保留全部 12 个测试正文见证，实际文字 Range 证明单元格两行分开，横向溢出为 0；用户原有 HTML 字面文字保留且没有执行。父代理已目视 `desktop-1b81d960-36df-4461-bea5-f3912dfa5ee0` 四图。范围是合成小 DOCX 的阅读，根完整构建另由上述统一记录证明；不代表长文滚动或真实业务质量验收；前两轮测量脚本失败保留。旧新 Agent 文本/结构/诊断深相等，根基线差异已确认仅 Git 的 CRLF/LF 归一化。

本窗口保留的前轮失败：DOCX 直接读取身份已合根，根类型检查与定向 46/46 通过；随后统一全量已实际结束，1326 项中 1321 通过、5 失败，0 取消/跳过，耗时 687454.5531ms。证据为 `.test-data/production-docx-read-v6-unified-20261011/test.log` 及 `result.json`（test exit 1，未启动 build）。四项失败来自 PRD 模板路径：模板原件/副本的字节版本复核复用了正文身份核验，缺少正文解析身份而提前失败；修复必须区分模板结构与业务正文，不能放宽真实正文来源校验。另一项真实 Electron 可见性测试停在 initialization，约 3014ms 后超时，12 个交互步骤均未执行；这既不证明交互错误，也不证明只是测试偶发。上述问题已按本窗口下段完成最小修复与专项，修复及Word UI合入后的发布合入前基线全量1334/1334和build已通过；原失败与未build事实保留，不回填旧轮结果。

规则适用范围按用户澄清执行：项目 Skill 中的需求前置条件是该项目/任务的要求，不作为通用 Agent 架构缺陷，也不据此增加全局“先读资料”策略；保留原 Skill。Agent 通用能力仍按权限、来源版本、恢复、成果质量与真实交付证据验收。

本窗口后续修复已落根：明确PRD模板仅复核当前原字节、授权路径与结构/解析身份，未放宽真实业务DOCX正文身份；浏览器runner v8初始化10秒、其他阶段3秒、总60秒保持。负责者实际确认32393退出1（未build）；原样visibility单独重放退出0，不能据此判偶发根因。修复后模板/DOCX身份/browser诊断/真实Electron visibility组合33/33、内部确定性计时15项及`npm run check`退出0，会话64651已结束。证据`.test-data/production-template-init-repair-20261011/targeted-{1,2}.log/result.json`；最终全量/build已在上述72982完成，原五项失败均在当前全量实际复验通过，历史失败不删除。

历史发布 Service 分层候选的新增九项本地检查已完整通过（`netlify-service-operation-candidate-c11c1ea1-1b1f-4872-81f9-c8c7e46bc4fd/service-tests-attempt3.log`，71946.3223ms）。范围包括真实 Service/SQLite/Pi stdio 的批准后发送、已知部署仅 GET 查询、丢失创建结果不重发、其他未决操作阻断、授权/连接/站点/回执身份变化拒绝及批准后成果变更拒绝。原先把守卫错误吞掉并返回旧 ready 的路径已在候选中删除。当前恢复检查仍为同一 Node 进程内重建 Service/Store；独立宿主进程恢复、生产私有入口及凭据接线、真实远端发布尚未验收；此历史分层已由上述28文件aggregate合根，不能重复叠加。

历史发布候选的13项隔离测试与类型检查已通过，当时正式接入仍有实质缺口：现有交付守卫会把发布操作自身的`may_have_run`作为未决副作用拦住；`classifyInterruptedOperations`会向Operation结构化result追加说明文本，破坏JSON重读；候选scopeHash目前是发布绑定，而正式人工核对使用宿主授权指纹。已要求按现有机制接线：只对当前绑定操作设置精确自身例外、保留结构回执、将发布绑定与授权scope分开，真实Service重启链路验收后再注册。该历史阶段的隔离通过不代表当时兼容问题已解决；后续28文件aggregate及其单独回归证据见当前窗口开头。

根布局与夹具集成证据：紧凑布局v6三个文件已与封存候选逐字节一致，见`production-grid-review-identity-root-integration-20261011/v6-integration.json`；根针对性9/9（1153ms）、主进程类型检查退出0。临时审查版本夹具补充系统TEMP目录的ESM包边界后，原失败文件6/6通过（14691ms），见`identity-esm-recheck.log/json`。这些定向复验不替代完整全量；DOCX直接读取身份现已合根，并与v6完成46项组合验证，随后1326项全量的5个失败已定位及完成上述最小修复。

历史FWRJBb真实任务：`.test-data/quality-evaluation-FWRJBb/manifest.json` SHA `7ad0ba56ba2d6c50f52f1d5898b35148b2fb4bfad5f1e31a31debd8fdfdfd8fc`，576份来源代码与发布合入前统一检查输入逐SHA一致，后续根改动不回填该试次。QE05原业务任务/30分钟/120工具/2修稿/wire4保持，session47297已退出0、一次send1、416491ms；Run01ea6a64-443a-4f08-84d1-dad44bc70b1f succeeded、10次provider请求不等于10次用户发送。首个观察稿与最终稿hash均9fa6c0e2…bb72b，未修稿；缺制度上线初期/后续SFA限制，且将上下游过程误判明确冲突，独立Agent业务结论违反。正式审查completed/一条绑定意见，但category=cross_artifact_consistency的两引文属于同一成果，repairEligible=false，原>=2成果守卫保留。生成实际资料片段没有覆盖v6制度第323行，审查选段已覆盖该句；不是全部来源已读。证据cases/QE05/final-official-report-and-read-evidence-v2.json及independent-observations/business-review-agent.json。Collector session68067退出1，官方export真实TASK_DELIVERY_BLOCKED、0send/0reviewWrites、两个实例关闭/无ownerLock/无完整trial；不确认错误版本。分类最小候选已隔离33/33和类型检查通过，完整原input双hash重建一致；A/B各两次只读对照已结束（53989 exit0，实际4请求/零重试）：四份均invalid/unverified，零可修意见；B分类适用但结构/原句问题未解决，候选不合根且默认不变。ab-final-seal.json SHA6d0a7989…bf8ce保留actual body/usage/闭环。

### 历史集成与失败过程（以下时点不代表当前状态）

发布候选集成审查暂未通过：Service 层 seal `090308e3c2cdc23be9c82c1a770d3cf3c49792d472db59a4c960c491ac3c45d6` 的 `service-integration-attempt2.patch` 以已合入 Word UI 的根版本为基线，却从旧候选生成差异，实际删除 `readWordDocument` 并恢复旧 Mammoth UI 读取。父审已阻止合入，根全量测试不受影响；候选需重新生成仅包含发布接入的差异并验证既有阅读功能保留。原 seal 与测试证据保留；`git apply --check` 成功不等于集成行为正确。

上述回退问题已在后续 `word-preserved-seal.json`（SHA `6d370b406ff4a963894c7da44dc9f894147f87a85ec937d72ab70fc2acb7864a`）纠正并经父审核对：新补丁保留 Word 入口与 Service 方法，六项阅读依赖与根逐字节一致，必要类型检查及 Word 8/8 通过。原错误 seal 仍标记拒绝。此批准只解除该集成回退问题；生产入口、凭据与链接交付组合仍在隔离验收，尚未合根。

统一检查会话10747已中断，原PID3888不存在；`production-grid-review-identity-root-integration-20261011/test.log`止于776项附近，没有最终汇总或退出回执，build未启动。check已退出0；全量测试不能计通过，且日志已明确记录`tests/content-review-identity.test.ts`的`ERR_PACKAGE_PATH_NOT_EXPORTED`失败。父审定位其临时版本夹具在系统临时目录生成TS文件但缺少项目ESM包边界，负责者现已修复并定向6/6验证；不能把这一失败归为只有中断。此段保留10747历史，下一轮统一检查按当前窗口UI合入和修复状态执行。

来源v6真实对照亦受中断影响：`source-v6-cloud-attempt-513cb9ae-ff0a-4532-bfd2-ab51be9c1e31`第一槽已有派发记录但缺少响应及结束回执，结果未知，不自动重复；第二槽经负责者确认未派发后已完成既定单次调用，正确控制稿completed且0finding；后续独立错稿90秒与180秒均无有效正文，保留unknown，不计整稿业务通过。原中断槽1不补写、不重试；局部单元诊断结果也不替代完整业务结论。

直接DOCX读取的隔离候选正在贯通宿主解析身份、工作流来源回执和验收合同。父审发现一个读取时序缺口：工具已返回资料A后，`recordContextSource`再次读取文件，若此时资料变成B，会把B误记成模型已读来源。已要求使用`authorized-read`的同一次读取回执，经`taskSourceRead`写入DOCX上下文，禁止事后二次读取覆盖；需要确定性A/B交错与恢复拒绝用例证明。此项尚未合根或验收通过，非DOCX路径未纳入该候选变更范围。

缓存身份修复与DOCX布局增强现已合入根源码，回执`.test-data/production-grid-review-identity-root-integration-20261011/integration.json`。三个批准补丁均check/apply成功，父审独立读取实际根hash：Service为`596afb98be3ca2e8797a0ff1c3089f58772fbfbd6c3185a2cdd9859b189d973c`，Office版本已升v5，wire4协议hash仍`160ac8d75871acb8443e3eec5e40380019219bf863a3836177abcaad71244d4f`。六文件仅CRLF差异已逐字归一核对，两文件与候选字节完全相同；既有改动保留。当前根统一check/test/build正在安排，本段不把隔离通过当作新根全量通过，dist尚未更新。直接Files.read(DOCX)仍为旧原始文本入口，结构增强的实际业务收益及该入口统一另验。

最新质量结论：wire5三次真实格式探测完成，但真实错稿/正控制对照出现误判；仅显式增加high参数后两稿均零意见，已知错稿仍漏报。默认wire4保持，开始隔离评审提示改进；见[格式、业务与推理对照](production-wire5-real-probe-2026-10-11.md)。多文件交付已局部合根，check及55项专项通过；独立Electron/浏览器/IPC与本机stdio验证正常发送和未知状态整进程重开，真实远端及当前根统一构建仍未验。

提示v2的两次真实对照也已结束：错稿零意见、保留来源结构未知；正确控制稿90秒预算超时、空响应，不能计算误报或判为业务通过。新提示不启用，下一步核对既有Mammoth/Saxes转换的合并单元格布局与原DOCX；仅补可证明的结构，不把转换节点当Word网格，也不修改项目Skill。缓存最小候选正在验证，已通过真实Service复用/更新及Domain过期交付阻断；在途提示变化先stale后因旧协议拒绝新输入而unavailable，尚须分阶段核验，不以更改预期集合掩盖原因。

缓存候选第三轮新增6/6已实际exit0：在途检查拒绝后先得到stale/零意见，旧协议Domain刷新新协议合法输入明确返回CONTENT_REVIEW_INPUT_CHANGED，最终unavailable并阻断版本交付。两次前序失败为无效severity夹具和未分清两层状态的测试断言，完整保留；生产schema未放宽。父审已读三处最小身份比较改动、分阶段证据及既有内容审查回归125/125日志。隔离类型检查通过，长期回归夹具正在整理，尚未合入根代码；这些检查不证明模型业务判断改善。

新增父审发现：内容审查输入的资料hash不含prompt，而缓存复用/过期刷新/在途检查只比较资料hash，可能在提示更新后沿用旧结论。已委派独立最小修复，旧收据不改写；尚待代码与专项验收。发布隔离链路第三轮9/9已实际exit0，证明本机Pi/stdio/受控HTTP下原字节上传、断线禁止重复创建、取消及错误site身份不发后续GET；不是云平台联调完成，并发状态边界仍在审查。

Wire5候选已封存于`.test-data/review-wire5-isolated-10d04e7102e5417d915a3b187011e27e`，补丁SHA256 `9ab0d2ae32b976afc1e7d104039bec398b3a9a99a8270c8569aecc069c2a3b4a`；默认wire4的schema/input/prompt身份保持，57项兼容检查通过，新边界及Pi实际序列化最终组合19项通过。候选仍未合根或启用默认。真实Wangshu探测目录`wire5-supplier-probe-preparation-20261011/cloud-attempt-dea09a64-b27c-4c3a-b127-0a6feaac8f99`已记录两次独立单请求：分别13381ms、6578ms，均200/stop，符合仅transport schema提供的随机nonce与maxItems约束，零重试；第三槽完整wire5尚待执行。该结果支持本次路由观察到格式遵循，不证明供应商内部实现、长期稳定性或业务准确率。

第三批收尾：`quality-evaluation-yBbJ0q`的QE05与collector均已终止，两个采证实例关闭，无owner lock；562个源码文件、runtime及原件哈希无变化，运行冻结已解除。collector在既有授权目录上的官方导出返回`TASK_DELIVERY_BLOCKED`，零模型调用、零审查写入；这证明质量门禁生效，不证明自动识别了具体业务错误。详见[第三批真实任务证据](production-real-task-review-batch3-2026-10-11.md)。当前根仍使用wire4，wire5的后续真实探测见上段独立记录。

用户澄清：Requirement Gate属于其项目级业务Skill，不是通用Agent设计要求。取消将“先读资料”扩展为通用host/system/skill策略的候选，并撤回AGENTS中的对应通用条款。QE12遵循该项目Skill停止不能被判定为Agent架构缺陷；本批没有生成成果的事实仍保留，但需区分项目输入/技能前置条件与产品执行故障。此前资料优先选择只用于该项目任务的明确指令，新试次若改变指令须保留新prompt身份，不修改原Skill或回填旧成绩。

第二批三个真实任务均已结束，实例关闭采证完成，根源码冻结已释放。单文本末次等待后的同步校验候选已封存：当前根依赖下27/27通过，清理测试导入与补齐测试凭据回调后5/5复验通过，产品与测试类型检查均通过。安全审查诊断与该校验已由唯一集成人按局部补丁合入；回执为`.test-data/production-safe-review-and-fence-integration-20261011/integration.json`，合并后Service SHA256为`64163f5dc04c1842253a277d76b2e2116190cc826bb47a443f833c07d34f6c06`。合入后类型检查通过，组合专项仍待终态；旧1244项不能代替当前版本全量验证。

导航修复候选已最终封存并批准同窗口集成，补丁SHA256为`ed9920a286a30a9c126de1d407daf64522393c5f627eb2e758cc4fad2b4d730e`。隔离真实浏览器证据和边界仍见下文，不自动升级为根应用IPC或真实远端发布通过。用户再次确认没有第二台Windows电脑，SMB双机继续明确标记未验证。

导航现已合根，回执为`production-navigation-root-integration-20261011/integration.json`；六项事件协议测试已移入默认测试范围。离线设备权限说明也已按封存字节合入，回执为`production-device-guidance-root-integration-20261011/integration.json`，仅澄清现有执行器限制，没有改变权限或项目Skill优先级。Collector已改为在既有授权过程目录内创建独立导出目录，并核对重开后的ID、路径及写权限；必要专项执行中，真实正式导出与新构建尚待验证。

Collector与设备说明专项现已终态19/19、26898.0206ms，父审核读日志。唯一构建负责人已启动`production-safe-fence-navigation-unified-20261011`统一检查：类型检查通过，全量测试仍运行中，不能提前登记整轮通过。

该统一检查现已真实终态：session3390 exit0，类型检查通过，全量1269/1269、0失败/取消/跳过、489451.8207ms，build exit0，无打包。主代理已核读result.json、test.log汇总与build.log。构建有既有大chunk提示，不属于构建失败；性能目标仍另验。当前built桌面序列session45067正在执行，包含MCP最后读取后合同变化、授权过程目录正式copy及跨页导航；尚无该序列通过声明。

桌面首轮45067最终exit1，证据`production-mcp-dispatch-electron-1ba88f19-9d6c-40bf-bfd8-f5860569fc0a/result.json`：前五场景实收1/0/0/0/1，发送后失联为unknown；当前合格合成成果通过正式IPC导出到既有过程授权目录，导出hash与原文一致。第六项在app.evaluate动态import处失败，尚未注入目标合同变化，不记为产品派发失败或通过。实例关闭且pageErrors为空。仅.test-data脚本改为当前主进程createRequire加载实际compiled模块后，原独立六场景加导航四场景以87053复验；生产源码及构建未改，首轮失败保留。

桌面复验87053现已exit0：MCP六场景（46748ms）与导航四场景（22260ms）通过，实例关闭、pageErrors为空，源码/运行时前后hash不变。父审已读`production-mcp-dispatch-electron-14f9cbd1-47f2-479e-afd1-a8534c5d2e7b/result.json`：末次真实读取后测试注入合同变化，count=2、正文不变、合同hash变化、实收0；这是隔离故障注入，非官方用户改规则操作。随后正式导出返回TASK_DELIVERY_BINDING_STALE，已有目标原字节不变；正常版本copy先已成功。导航正式main/preload报告为41d0d0c4-207b-4512-9794-586f3977841a，父审目视`production-navigation-main-electron-d5202b6c-b818-4a58-82ab-c34a635ae379`四张1440/390截图，文字/控件完整、保存反馈可见，无明显裁切覆盖，仅证明合成导航流程而非真实业务或整体设计质量。下一步新manifest的QE05真实质量复测，旧批不改。

新真实试次QE05现已启动一次：`.test-data/quality-evaluation-yBbJ0q/manifest.json` SHA256 `71de2d456869e8d136e134dd3e87d777820d5b090f1adfafae179e46e7d8166f`，v2/observed-wire-v1，session34399，execution.realSendCalls=1。准备时562份源码及runtime逐SHA核对通过；原业务输入、30分钟/120工具/最多2轮修稿、引文总上限与strict关闭均不变。main/shared/src/scripts/tests/public/dist及package再次冻结，只允许docs/.test-data独立工作。尚未有真实业务通过结论。

多文件候选在`prototype-publish-integration-2e790c2a3ce6423cbdc4168cca559e2e`重新基于当前Service合并封存，十文件补丁SHA256为`1717343c8530eaf700ecbc0be77ce03ad20c4a4adcfd972d600b9be74ff7300c`，暂不打断本轮冻结集成。关键stdio6/6、其余15/15、helper22/22分别记录；最后单文件兼容修订后的7/7、lost干净关闭重建1/1、ZIP逐字节复验1/1不合并为虚构总数。父审发现原lost测试在旧Store仍打开时重建且手动写Operation，已要求补干净关闭；新版也仅证明显式持久API后的Service/Store重建，正式IPC自动状态写入和真正进程崩溃恢复仍未验证。生产codec registry仍空，不能宣称真实平台发布可用。

最新安全审查补记：根单文本路径同类时序漏洞已由隔离副本证实。`.test-data/single-text-contract-race-b1719f01f9034f7cb0e6cee6a9e497f7/single-text-contract-race-evidence.json`绑定根Service SHA `2a2bdd178c89ad544073b53e059c1b2e7b1148705d16d350caac027b0811e614`。最后一次readOutputSnapshot实际读取后、异步返回前新增required核对项，正文hash不变；真实本机stdio收到了1次调用，随后新的assertAllowed则报TASK_DELIVERY_BINDING_STALE。主代理已读证据；此前1244项及桌面5项不覆盖此窗口。修复在独立副本进行，复用现有合同、版本、参数、连接和businessAuthorization权限绑定，在所有等待之后同步重验；当前冻结根版本尚未修复。真实云任务不做外部发布，继续保留同批版本，窗口结束后由唯一集成人合入并复验。

最新质量结论见`production-real-task-review-batch2-2026-10-11.md`。QE12运行自然结束仅代表模型回复结束：实际没有任务成果，评测器以EVALUATION_NO_SAVED_ARTIFACT失败收尾，浏览器未执行。不能将宿主提供的来源上下文误说成完全未读资料，也不能将仅有工作表catalog视为读取了字段正文。QE16正在同冻结manifest独立首试，不重复QE12试次或向评测注入答案。

单文本修复隔离证据已核读：`single-text-contract-race-b1719f01f9034f7cb0e6cee6a9e497f7/single-text-fence-final.log`为5/5、24680.1401ms，包括合同变化、当前版本、同版本报告、目录撤权和发送后失联。代码在最后一次读取返回后同步复验合同/版本/参数/locator与businessAuthorization权限。候选尚未封存或根集成，原反例保留。多文件候选最终组合4/5，失败是撤权诊断文案断言不符；撤权单独复跑1/1，不冒称整组5/5。原负责子代理异常结束，后续由唯一集成人核对文件来源及依赖后接手，当前根冻结不变。

审查诊断及覆盖候选父审补记：隔离目录`content-review-safe-diagnostics-candidate-49f04f9a-fe96-4589-8769-8ec45c6e5211`的专属最终10/10（6592.7113ms）、含选段与协议回归36/36（7609.4024ms）、类型检查exit0均已核读。保留无效finding的有界引文数量及安全schema码，不保存无效原文；新诊断纳入resultHash、旧回执兼容。真实Service夹具审查读到15530字全文，原生成两条partial回执未改；DOCX/PDF容器仍不宣称图片等全覆盖。PDF首轮夹具因无成果失败已保留，补齐合法成果后通过；无文字PDF不冒称真实扫描图片。候选批准封存，根须待当前评测窗口结束后按小diff合并，尚未集成。

独立多文件真实浏览器验收正在`.test-data/prototype-browser-fd30662619384bbdba32ba25970b3b7c`准备，复用现有Domain、runPrototypeAcceptance及ZIP导出；此范围不包含正式IPC或远端发布。根源码、依赖与当前dist保持冻结。

多文件实测发现原浏览器在跨页点击后等待旧文档paint而超时，原样复验与导航事件日志保留。隔离导航修复最终`candidate-final/process-result.json`exit0；4个真实页面用例44步骤、5文件manifest及同快照ZIP逐字节相等，缺CSS/JS/PNG均拒绝通过，自包含单HTML回归通过，父审已目视四张1440/390截图。`navigation-regression-v3`的9场景期望均满足，其中禁止导航/取消/超时按真实unknown保留，不能写成9个业务通过；结束监听0、窗口和activeBrowser0。首版修复真实命中取消清理遗漏，已补destroyed事件幂等清理，失败原日志保留。当前仅隔离候选，正式IPC、真实发布、React构建和真人验收仍未完成。

最新集成补记：来源准备hook九文件与请求观察三文件已逐文件核对封存后合入根目录，回执分别为`.test-data/production-helper-hook-root-integration-20261011/integration.json`及`.test-data/production-wire-observations-root-integration-20261011/integration.json`。真实旧数据库只读验证发现Store将空text持久化为NULL、JSON保留空串；观察器正在按该既有规则适配，仍拒绝所有非空不一致，不修改历史数据。首次拒绝结果保留。请求身份评测接线及新版本统一回归尚未完成，旧全量通过不代表当前版本通过。用户再次确认暂时没有第二台Windows电脑，SMB双机验证保持未验证。

上述Store兼容修订现已根合入，回执为`production-wire-observations-root-integration-20261011/store-normalization/integration.json`。SQL仅将payload空串按既有Store规则归一为NULL；真实Store反例在内14/14及类型检查通过。旧QE05/QE12只读重验完整窗口1277/1498项均可比较，前后数据库hash一致；不回填旧业务成绩。默认`npm test`已覆盖TS及MJS两类测试，MJS兼容专测14/14、65714.1517ms通过（`production-test-suffix-integration-20261011/mjs-compatibility.log`）；依赖不变，统一全量与新真实模型批次仍待最终评测接线。

请求身份接线已审阅批准集成：`wire-overlay-seal.json`为`b95990db7001803b174e9083f01bc47a7bb6dc34becc7bac3714b1e407c2060b`，六文件新manifest/start/step/collector/汇总按完整SQLite事件窗口绑定；原reasoning仍逐项核对，供应商内部能力单列unknown。最终专项17/17、9124.2746ms，含自洽伪造证据与实际库不符仍拒绝。父审随后发现编译测试依赖外设TEMP目录，独立测试修订`wire-portability-seal.json`为`61473e03776a16d3be67b3646b30a8b95b1b0e83a71a1845cba7050539558d50`；普通系统TEMP下3/3、8510.1234ms，测试自身创建并清理项目内唯一编译目录。旧seal和原日志保留。baseline获准串行合入两层后统一check/test/build，不打包；实际根全量与新真实任务尚无终态。

新接线现已根合入（`production-wire-overlay-root-integration-20261011/integration.json`）。统一类型检查首次因共享TS导入与renderer配置不兼容失败；仅noEmit renderer启用allowImportingTsExtensions后复验通过，Node发射配置未变。首轮全量实际终态为1235项、1230通过、5失败、440900.5216ms（`production-critical-candidates-unified-20261011/full-test.log`）；三项实验迁移测试固定旧wire3，另有proxy文件异常和索引状态超时。三组原样定向17项14通过/3失败，只有wire硬编码稳定复现；proxy五项与索引八项在原时限内通过。并发资源争用仅为待证假设。已批准显式并发4、保留全部用例及15秒/6秒断言，修实验目标版本适配并让索引夹具走正式授权入口、失败时留实际状态。第二轮全量和构建尚待执行，不能以定向复验冒充整轮通过。

第二轮统一终态已核读：`full-test-attempt2-tap.log`为1240/1240、0失败/取消/跳过、462000.9656ms，类型检查和`build.log`构建均通过，没有打包。新增历史默认测试首轮误改冻结对象的失败保留，改为测试自身克隆后协议5/5；生产冻结对象保护不变。`build-source-and-vision-compatibility.json`核对557个源码/配置文件不变，aggregate为`67bbf0683e646190845b2b573cce6faceba90ab69120c58b8a6b67b521f7a212`；model-runtime/proxy/settings构建字节与此前一次真实图片probe相同，可复用新评测profile的图片能力证据。新真实Electron MCP五场景已启动，终态和新模型业务结果仍待验。

新桌面首试`production-mcp-dispatch-electron-ec8b16ca-f4bf-481f-90ba-4f88f7b4061e/result.json`已核读：current一次实收且succeeded通过；asset等待期间实际改文件后零发送、Operation failed，但诊断被Pi适配器及safeMcpMessage泛化成连接失败，脚本因此失败并关闭实例，后三场景未完成。已批准仅补宿主派发前拒绝的本地安全分类，禁止原样回显远端错误；保留零发送/failed与已派发unknown语义。该修订后的代码尚未验证，原1240项通过对应修订前快照；不会把首试当五场景全部通过。

派发诊断修订现已完成：`main/integrations.ts`仅由本地闭包记录hostRejected，stdio/HTTP统一返回failed及固定`MCP_PRE_DISPATCH_REJECTED`；远端相同错误文字不能伪造该分类。真实传输专项15/15、50845.2765ms及check/build通过，敏感本地拒绝零发送、远端敏感错误一次发送且unknown均留证。真实Electron第二次五场景5/5（`production-mcp-dispatch-electron-4928e60a-90d2-4bae-94c0-2f7f56ec7e2b/result.json`），pageErrors为空、实例已关闭；current一次成功，asset/permission/connection零发送且failed，lost一次且unknown无重发。父审已读终态与asset截图；这是合成单文本、本地MCP/真实IPC机制验收，没有真实模型或远端发布。最后全量`full-test-mcp-diagnostic-final-tap.log`已启动，557源码和447构建文件已冻结；尚无该轮终态。

最后全量已自然结束并核读：1244/1244、0失败/取消/跳过、483562.843ms。`final-full-source-dist-verification.json`确认557源码及447构建文件逐字未变，aggregate为`9f37194738160cf04ba72eaae21a55095e7699595c656f0b5ccabbf53e452ec6`。新manifest为`.test-data/quality-evaluation-qb1ZWl/manifest.json`（SHA `ffdd35baf375968fabda58457c7dc0f724fae81577b9e9f88faec5111f19040b`），v2、observed-wire-v1及official_registered_xlsx_v1，原文预检7/7、原件未变。新QE05唯一执行进程已启动，日志`production-critical-candidates-unified-20261011/new-QE05-run.log`；尚未得到成果或业务通过结论，旧QE05/QE12失败及旧manifest保留不回填。

新QE05运行期间继续隔离审查尚未合入的多文件候选：`.test-data/prototype-multifile-contract-race-19c63683d8d2423d9fd29391ae57cc76/contract-race-reproduction.log`定向反例实际失败（预期0发送、实际1次，18222.206ms）。最后一次guard等待真实本机catalog期间，通过既有define新增required必检项，合同hash变化而五文件manifest不变；随后的assertAllowed能拒绝，但发送前该异步窗口未再次同步核合同。主代理已核读证据，批准仅在新隔离副本修此时序缺口，原seal和根评测冻结版本不改。真实模型/浏览器未参与该机制反例；根单文件路径是否存在同类窗口另作有界核查，尚无结论。

2026-10-11 09:27:48Z三项根集成回执：`.test-data/production-three-candidate-integration-20261011/integration.json`记录MCP派发前重验、跨表选段、验收工具调用说明共八个文件均applied。原文件hash及git apply --check先核对；Git autocrlf使部分实际字节hash与候选不同，逐字比较仅允许CRLF/LF归一化且八文件全部相等，实际字节hash分别留存。首次严格字节守卫因此停止的记录没有删除。集成后的类型/专项检查尚在进行，旧1154项和旧桌面证据不冒充本次新版本验收。

根集成类型检查`npm run check`已exit 0，日志同目录`check.log`。九文件必要专项`targeted.log`记录67项、65通过、2失败、101773.9105ms；两项验收调用说明的真实Pi/Service测试因夹具直接在不存在的`temp`父目录下mkdtemp而ENOENT，未执行预期行为。已要求修复测试自身的临时目录准备并重跑失败项，不用手工预建目录掩盖新checkout缺陷；失败日志保留，本次尚非全套通过。

测试夹具已改为在os.tmpdir下创建专用父目录，主代理核读实际源码及`guidance-temp-fixture-retest.log`：调用说明三项复跑3/3、9347.8544ms，两项原失败的真实Pi/Service路径现已执行通过。这里是原65项通过加修复后的三项文件复跑，不伪称重新跑出单次67/67；生产代码未因该夹具问题改变，后续稳定版本仍统一完整构建与验收。

图片配置只读诊断`.test-data/production-vision-route-audit-20261011.json`已核读：当前评测source profile的supportsVision=false；此前同配置ID/供应商/模型/端点/代理/协议/限额曾单次真实小图6/6、HTTP200，但当前dist/model-runtime hash已变化。设置仅有图片声明，testModel只验证文字，不能自动补造图片已验证记录。已授权用既有probe在全新隔离profile做一次当前适配器实测（1请求、0重试）；成功后只供下一新评测配置使用，旧profile/失败回执不改，图片输入成功不代表原型视觉质量合格。

当前适配器图片实测已完成：`.test-data/vision-capability-551a0450-dc1d-40ce-821e-8ae0c09849dd/cloud-result.json`记录一次请求、零重试、HTTP200、stop、9864ms，随机小图六格颜色与数字全部匹配。主代理已核读；同目录preflight的本地协议夹具结果不混作云图像证据。实际dist/model-runtime SHA为`ed7bf010cb928659dfb25a90c1bc769de2f9503289afb84a8021915e4d4f763b`，与本次manifest一致；旧source profile仍supportsVision=false。已批准仅为下一新评测profile通过既有配置入口启用图片声明并关联此证据，构建后仍需核对相关运行文件身份，不能把一次小图测试当作全部视觉任务通过。

资料准备helper已封存于`.test-data/registered-source-preparation-candidate-20261011/frozen.json`：最终11/11、12725.3114ms，语法检查通过；helper SHA `f464b723a9d56c05206cd57c0554ea04bd0cc08446ae73d436a4d8b3491fe4f3`。主代理已读实现、全部反例与真实Service Run断言：完整工作簿登记、拒重复掩盖缺源、拒旧Run补登记、撤权/只读process/字节变化/部分失败保护；准备Change严格绑定user-processing，不进入本Run合同成果或deriveFirstDraft。该运行使用确定性模型夹具，没有真实Electron IPC或云生成。已批准根集成，runner实际接线与编译桌面路径仍待验证。

helper与对应测试现已根集成，主代理直接核对两根文件SHA与封存完全相同；`root-integration.json`记录09:40:09Z create-only复制，fullTestBuildPending=true。新评测source profile为`.test-data/production-agent-profile-8e13e809-4c57-41c8-a47c-8c016dc0720a/profile`；其`vision-configuration.json`经主代理核读，实际Electron官方modelUpsert已保存图片声明，同模型路由保持、实例已关闭，用户默认配置和旧profile均未修改。下一manifest才使用此配置，不回填旧试次。

评测候选编译路径补证：`isolation-patch2-compiled-native-attempt2.log`实际编译领域/共享模块、隔离Electron原生八项浏览器检查及SQLite报告后，plain-node编译CLI成功，并拒绝同ID弱化定义；1/1、35746.6338ms。首次harness关闭最后窗口提前退出的失败保留。源码脚本普通Node加载也已验证，稳定版本领域/原型回归与来源helper接线尚未全部结束，不将此机制夹具算真实业务通过。

v4协议候选改用三个最小超限数量组合的等价not约束，避免冗余JSON Schema；旧8000预算夹具恢复可运行，9000短稿仍从全文852字变为703字partial，明确保留此覆盖边界，不改预算。主代理已核读`content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/qe05-wire4-budget-audit.json`：同真实QE05 snapshot/59392上限下，目标字段选段仍7784字且03范围40775–42415不变，D2/K2/D3/K3完整原句仍在；新prompt33420字，新身份与旧回执不混用。常规测试的私有历史目录依赖已要求移出，改为自包含旧协议夹具后再封存。

DOCX结构显示固定A/B十二槽已全部自然结束，原session19850 exit 0，无追加槽或外层重试；主代理核读`docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/batch-completed.json`。最终网络诊断补充：实际fetch为13次，slot11首次transport failed、未收到响应字节，Pi既有maxRetries=1随后第二次成功；不能把十二个逻辑调用写成十二次网络发送或完全无重试。主代理已读该槽`network-diagnostics.json`及`manual-adjudication.json`。整回执completed为A 3/6、B 2/6，其余invalid；这些数字仅表示协议与引用可用性，不能当作业务准确率。真实QE05两个目标缺口两组两轮均未明确检出；B通用错误稿第二轮虽在原响应指出步骤号不等于转换行号，但拼接原文导致引文绑定拒绝。当前证据不支持将结构显示候选默认启用或合入生产，继续隔离关闭；完整人工逐条裁定另存，下一步先解决已证实的协议表达容量及引文问题，不通过删除无效意见或增加试次挑选成功。

2026-10-11 后续审查：初始阶段评测候选原先仅验证八个浏览器用例ID及自洽hash，仍可能接受同名但弱化步骤；首轮prompt的profile追加文字也未充分冻结。已要求复用既有完整用例生成器比较定义与实际步骤，冻结追加文字并精确核对SQLite中的Run.input，补同名空步骤/删除断言反例。候选尚未合入，这些缺口未宣称修复完成。

审查协议另有待诊断的表达容量问题：当前每项最多三处引文；跨成果问题需两处成果引文，若另需来源依据及自动修稿授权原句，合计四处。真实A/B出现QUOTE_TOTAL_LIMIT，正在逐条区分是否属于此组合，尚不能认定所有无效回复都是该原因。固定十二槽实验不改协议或重试；后续方案需保留逐字绑定、范围判断及旧回执，不能靠丢弃必要证据冒充有效审查。

后续协议候选设计已明确：v4将每项总引文上限显式调整为4，各数组最多2、单引句160字、三项发现及既有输入/输出预算保留。容量不得与high置信度、in_scope或candidate绑定；仅记录的双来源对照、同一成果两句矛盾也可能需要完整四处证据，不能迫使模型提高置信度或请求自动修稿以获得引用空间。JSON Schema与宿主验证必须一致；5处以上、拼接/伪造原句和身份不符仍拒绝，是否可修仍由既有授权与逐字绑定决定。新wire/schema进入输入身份使旧缓存失效，旧已签回执保持历史，不回填实验。已授权独立副本实现与离线验证，尚未合入或证明云效果改善。

首轮依据：`agent-architecture-audit-2026-10-11.md`。历史1052/1056及复跑13/14不是当前集成结果。之后每阶段补入实际命令、输出、证据及未验证项。

协议候选最终封存与复核：`content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/wire4-capacity-candidate.patch` SHA256为`8beaf42fdcf9356a4cc8effb63d91e2301153030b7701856c66dc686581ed084`。隔离必要回归76/76（3252.8795ms），无私有历史目录的干净复制回归76/76（4009.1398ms），类型检查通过。主代理已读协议及新增测试，覆盖64种引用数量组合、原文绑定、修稿权限、旧签名回执不变与旧输入在模型调用前拒绝；批准baseline按原文件哈希集成。此处记录的是候选与审查结果，根版本全量及真实模型收益仍待验。额外历史离线重放与常规自包含测试分开，不作为新云评测通过。

09:44:15Z协议根集成已完成：`production-wire4-integration-20261011/integration.json`逐项保存八文件原hash、候选hash及实际根hash，补丁预检查成功；文本完全一致，CRLF/LF字节差异单列。主代理已核读回执与定向终态日志：11文件96/96、5769.7214ms，node类型检查exit 0。DOCX实验仍未合入；整套构建、真实桌面与云任务复验尚未执行，等待评测runner稳定后统一开展。

评测补丁第二轮稳定回归已核读终态：`isolation-patch2-final-regression.log`为23/23（291930.4052ms），`isolation-patch2-final-stage-prototype.log`为29/29（66631.327ms），独立cleanup日志为4/4（1921.1853ms）。这些是不同命令的证据，不与第一补丁27项合并成一次运行。新鲜成功态浏览器反例覆盖错误前缀、9/11位数字、未分配及可编辑编码；取消和超时不虚构已结束Run。编译CLI测试还需移除对预存`.compiled`目录的依赖，改成测试自身唯一目录编译后复验，再封存供根集成；此修正不改变业务验收定义。真实48项仍未跑完。

评测patch2现已封存（`patch2-seal.json` SHA `a16158615a71464fdad60752705092cedc2138af2475d99717ccc5652723ee84`），19份最终文件、16项相对补丁，明确根→patch1→patch2的原hash与顺序。唯一临时目录实际编译及CLI复验1/1、32412.2523ms，清理已断言。父审另发现新增prepare常规测试依赖用户私有资料目录，已要求独立修订而不覆盖旧封存：`patch2-portability-seal.json` SHA `863d88ba7a78a7a8c2768718f5db25ff208bfc2d5a0734d6e5ae52e4a65c0ad5`，改用临时有效DOCX/XLSX并走原factChecks，定向1/1、7349.4024ms。主代理已读实际fixture、封存与测试结果，批准baseline按基线核对集成这两层；来源helper的runner接线另行补丁，统一构建与新云批次尚未启动。

新版评测三层已实际根集成：`production-evaluation-root-integration-20261011/integration.json`记录19份文件原基线全部吻合、最终字节与封存完全相同，以及随后可移植测试的独立hash。原补丁绝对Windows路径导致apply预检查拒绝，失败记录保留；派生补丁只规范三个路径头后检查通过，没有改业务内容。根node类型检查exit 0，自包含prepare定向1/1、9375.7229ms，主代理已读回执和终态日志。来源准备hook及请求身份分层尚待完成，未启动新全量构建或云批次。身份核对还须防止将最后一次provider_request样本误称整Run全部请求；既有事件流最多保留5000项，出现缺口不能伪称完整。

请求身份后续诊断已有真实只读证据：`production-event-window-audit-20261011.json`记录旧QE05事件1277项、sequence 1–1277、provider_request 12次；QE12为1498项、1–1498、25次。两窗连续且未触5000裁剪，原SQLite前后hash相同。主代理已读回执；两者均观察到thinking/effort明确absent，但maxOutputTokens分别为12000×11加8192×1、12000×24加8192×1，证明最后一次样本不能代表完整请求集合。8192用途尚待实际事件关联，不以数值猜压缩或判模型切换；请求次数不能作为跨任务配置一致性的相等条件。供应商内部能力仍未验证，旧试次结论不回填。

阶段关联已核读：`production-event-window-phase-correlation-20261011.json`显示QE05的seq324/325/326、QE12的240/241/242分别为实际compaction_start→provider_request→compaction_end，请求时activity为compacting，两段最终completed，持续79122ms/69296ms。故8192请求可按真实事件关联到原生压缩窗口，不能因额度不同就判主生成配置漂移，也不能把8192当任意请求的豁免值。现有记录无typed purpose，仍明确这是宿主事件窗口证据，非供应商内部能力证明。已批准仅在新manifest中实施基于完整窗口的请求身份分层；来源helper与此补丁分别封存，不改路由、额度或旧回执。

来源hook隔离实际Service验收已核读`isolation-helper-handoff-attempt2.log`：6/6、19205.398ms，真实官方prepare/process/apply→创建唯一绑定→start→send顺序、已存在Run拒绝、部分处理失败、来源/绑定/归属/时序变化和精确宿主段落归一化均有反例。首轮4/6的夹具模型配置与Windows转义反例错误保留，修正后复验；证据父目录显式创建，不依赖旧测试目录。原件、XLSX登记副本与普通文本来源分别记录；确定性本机runtime不算真实模型或Electron验证。相关评测/collector/cleanup/helper回归仍运行，尚未封存或合根。请求完整性新模块交由baseline在独立副本实现，oauth负责既有评测接线，文件所有权分开；不更换模型、预算或运行底座。

默认回归入口审查补项：根`npm test`当前仅匹配`tests/*.test.ts`，新增的初始阶段及成功编码两份`.test.mjs`不在其范围。已要求最后集成时沿既有tsx入口加入这两类后缀并实际验证命令，确保未来默认回归也覆盖新保护；尚未改成已通过声明。helper关联回归出现cleanup夹具墙钟断言失败（含异步证据写盘），须保留原失败、读完整终态并原样独立复验，不借此放宽生产取消或超时预算。

多文件候选审查修订：初版新增“非pending提案只能使用最新reportId”限制，没有既有产品语义依据；父审要求移除，保持同版本且仍有效的人审核对可沿用，真实合同或必检定义变化才使旧绑定失效。初轮Service＋本地stdio组合23/23（188834.2605ms）仅作为原候选记录，不能当修订后通过；同版本重检允许、真实新增必检合同拒绝及同snapshot ZIP/payload逐文件一致性正在新一轮验证。浏览器runner在此是机制夹具，真实浏览器、Electron主入口与远端发布仍须另验。

helper hook已最终封存并获父审集成许可：`helper-hook-seal.json` SHA `b068bdbc88330bf8f8ba91b7e8364d136ab24953b8a9b06b0d538bf9af81fe3b`，九文件基于不可变patch2-source，原helper及其测试hash保持不变。主代理核读真实Service顺序回执`source-handoff-real-run-886d1387-20c7-4f62-b882-3bb9f4065298.json`：两份XLSX经真实处理后才start/send，普通TXT仍是只读文本来源，合同仅含一项Run成果，catalog includedCharacters=0。关联回归终态38/39、332726.8011ms，唯一失败为未改cleanup夹具包含写盘的墙钟<1000ms断言（实际1342ms）；原样独立复验4/4、1533.0619ms。失败保留，不拼成单次39/39，亦未放宽生产预算。等待baseline实际根回执及wire最后接线后统一完整复验。

请求观测模块已封存并获父审集成许可：`production-wire-observations-isolated-20261011-319aa5/wire-seal.json` SHA `ff3958a9ee636976e7e3118c147aeffd0526167e2ca0947f49a96edc8211f13f`。最终13/13、1299.1592ms，类型检查通过；实际只读SQLite反例覆盖5000项截窗、重复/错Run、坏payload、未知诊断、未闭合或重叠压缩及自洽伪造证据。额外校验列text与payload.text一致，只返回布尔值、不输出任意正文。内部hash重算不是DB真实性证明，collector仍须重读完整窗口并严格相等；当前未找到需要允许同Run追加的真实宿主操作，暂不增加宽松前缀例外。真实旧Run的reader适配与评测overlay接线仍待验。

## 接口审查发现与实施约束

- 已读当前 `main/delivery-gate.ts`：人工清单只有内容审阅/目标确认，未保存逐项非关键限制接受记录；现有结构质量开关还可跳过部分质量阻断。G2必须核对各交付入口、明确关键检查不可豁免，不能只新增未被调用的判定函数。
- A01当前没有普通Operation的宿主核对入口。recovery负责共享契约、持久化、Service查询/核对；随后需接真实IPC与会话操作界面，只有内部接口不能算完成。
- A02登录与后台刷新分别走网络请求路径；Pi当前host-managed仅stdio。统一政策须覆盖真实HTTP传输，保留单次派发。保存的内网连接只授权自身origin，额外私有OAuth origin需可信设置；模型不得添加，连接目标变更应清除旧授权。
- 已读实际评测脚本：执行前严格核对源码/运行时/资料哈希并固定一次尝试，改动后需重新准备清单。不得复制旧manifest冒充当前结果，也不得删除失败尝试来重用编号。
- G0仍在修改与验证，G1仍在实现；本轮尚无新测试通过声明。
- 新恢复契约已开始落盘（`shared/run-recovery.ts`、`main/run-recovery.ts`、`main/store-migrations.ts`），尚待测试和接线。审查要求补新版库缺表拒绝、终态一致、核对上下文/权限/版本绑定和旧库备份验证。
- G2入口审查：`main/main.ts` 的本地 export 分支分别处理HTML与文档；普通docx/copy未调用CLI的DeliveryGate。`main/service.ts` 的原型必检函数还有质量开关提前返回。后续需用统一的任务交付判定覆盖正式交付，同时保留明确的草稿保存语义，不能拿CLI门禁通过代表全渠道完成。
- G0首轮定向日志已产生：`.test-data/production-g0-baseline-20261011/after-first.log`；代理报告15/15，新增发送前取消覆盖，10轮重复仍在进行。未跑全量/构建，不视为G0完成。
- 恢复代码审查发现：`finishOperation`将failed/cancelled一律记为verified_not_done，会混淆“执行失败”和“没有副作用”。已要求修改并补“先写入后抛错/取消”反例；在该问题修复与验证前不能放行G1。
- 失败语义修订已开始：只有成功、明确未派发、只读失败可自动收敛；已派发副作用失败保留pending并停止Run。还需证明参数/前置版本拒绝仍可修正，不能以一律阻断替代正确派发记录。要求成对验收“前置拒绝后可改正”与“写入后抛错须核对”。
- A02代理报告首批18/18定向通过：实际接线McpHost→broker→登录/transportFetch→connectMcp，刷新使用同一fetch；真实Request兼容问题已被夹具发现并修正。剩余恶意元数据与TLS测试及最终集成待完成，不能等同真实账号验收。
- G0重复验证的测试与夹具版本冻结，但共享Service/Store/MCP仍随G1改变。`.test-data/production-g0-baseline-20261011/shared-edit-window.json`记录该窗口；重复测试只作为对应场景稳定证据，最终集成全量另验。
- G2进一步审查 `TaskAcceptanceDomain`：businessCoverage默认unverified，视觉审查也不会自动证明完整覆盖。统一交付门禁须同时补宿主人工核对路径；记录具体规则/报告/合同、来源及输出哈希，变更失效。不能仅要求旧report.status全绿而形成永久阻断，也不能用全局确认布尔位掩盖所有未知。关键人工核对与接受非关键限制分开留证。
- baseline已获准在冻结G0测试版本的同时接会话RunPlanCard核对界面和OAuth高级地址设置。核对后继续仍是单独操作；加载/错误/过期响应不能绕过门槛，项目切换不能串写。
- A02最终后端专项日志已由主代理读取：21 tests、21 pass、0 fail/cancelled/skipped，6695.9354ms。证据与边界见 `production-network-policy-2026-10-11.md` 及 `diagrams/production-network-policy-2026-10-11.mmd`。真实账号和企业网络未验；系统浏览器后续导航无法由Slash固定DNS，严格目的地保证只适用于Slash协议请求。oauth_policy转入G2接口梳理，不能将A02专项通过当作整套方案完成。
- G2契约审查已同意独立追加式人工记录，绑定reportId、contractHash、输出/来源/依赖哈希；自动报告保持原结论。人工判断逐规则/假设/视觉目标/finding留依据。必检的模型审查或截断覆盖不能自动列为非关键；关键unknown只能补足真实证据，不能只接受限制。Service/main入口由当前拥有者协同接入。
- 恢复界面首版已接IPC；审查要求将verified_not_done的“未完成”改为明确“未执行且未产生修改”语义，防止部分完成被误放行。界面实际验证尚待完成。
- G1恢复专项日志已读取：`production-recovery-20261011-tests.log` 18/18，60063.5166ms；来源版本保护追加定向 `production-recovery-20261011-guards.log` 3/3。主代理发现待修边界：处理脚本实际修改副本后崩溃时，执行前哈希不能永久阻止用户核对执行后的结果；须绑定核对时用户看到的版本，并继续阻断核对期间外部改动。已要求真实修改副本夹具，不以只写计数器替代。
- 用户已明确授权真实模型评测使用桌面认证TXT中的Wangshu配置，并明确不设费用额度上限。仅在隔离评测配置中使用，不输出凭据、不修改默认模型；仍记录实际可核实用量，供应商实际账单未知时不得捏造费用。
- G2人工核对代码审查发现内容审查来源ID算法与交付来源键不同，初版映射会静默产生空来源证据要求；已要求统一映射、映射缺失阻断及真实Service路径测试。内容审查还可能包含run.sourceReads中的资料，必须一并绑定和核对当前版本，不能只覆盖合同列出的部分来源。
- G3只读设计核验：已读当前安装Pi的README/SDK入口与RPC文档，以及`main/agent.ts`、`main/pi-auxiliary-worker.ts`。现有`createAgentSession`公开接口支持自定义工具，继续作为底座；不能因其有TUI就否定嵌入能力。当前Service依赖prompt、只读reviewContent、steer/followUp/clearQueue/prepareUserInput和事件回调，工作进程协议必须保留这些行为。现有辅助进程的环境隔离、父进程退出联动可复用；它的临时目录清理不能直接套用到必须保留的主Agent会话文件。运行隔离仍须在G2完整任务证明后实施及验收，此处不是已完成声明。
- G2来源修订已落代码：复用`taskModelSourceId`，包括实际读取资料并逐份核对哈希，缺失映射阻断处置；专项测试尚在执行。追加审查发现最近50份报告滚动截断会使“首次检查前已授权非关键”时间判断失真，已要求持久化可信首报依据及超过50次验证的反例。
- UI浏览器夹具首轮在React依赖加载阶段失败（Fragment导出错误），0个场景执行；该结果不算UI通过，baseline正在修复测试装载并重跑。
- UI重跑结果已由主代理读取并目视核对成功状态截图：6个真实组件交互场景通过、无pageErrors，涵盖手动继续、未执行语义、跨项目迟到响应、内网地址读回及清除。证据：`.test-data/production-g0-baseline-20261011/ui/result.json`。该夹具没有真实Electron IPC或云请求；完整桌面接线仍待验。
- G2宿主接线审查要求区分普通外部导入文件与已有Agent归属但缺报告的成果，后者不得通过缺少acceptance字段而绕过未决操作/交付核对。G1副本变更修订还须验证核对后真实resumeRun到send可继续，不能只证明核对记录保存。
- UI后续补充手机无横向溢出、读取失败保持禁止继续两项，最新结果为8场景；主代理已目视390宽度截图。2项IPC契约与1项包含8场景的浏览器测试共3/3，类型检查日志由baseline留存。尚不覆盖真实Electron端到端。
- baseline继续负责正式本地导出的最终写入钩子（复制/ZIP/Word/Excel），复用原有暂存与冲突控制；验收失败不得先写目标或删除已有用户文件。recovery保留Service所有权，oauth_policy保留领域门禁所有权，三方接口协调后再统一构建与端到端验收。
- G1恢复扩展日志现为20/20（68158.355ms），新增记录工具前置拒绝可修正、实际副本变化后可核对。修改副本的专项2/2；测试已补核对后调用真实resumeRun/send（仅模型runtime注入），读取当前副本、Run成功且副作用计数仍为1。主代理已读代码与日志；后续集成改动仍须最终复验。
- G2 Service门禁2/2通过（5950.5495ms）：草稿正常保存、正式交付逐项核对、编辑后确认失效；已知生成Run缺acceptance摘要不绕过、缺报告/未知副作用阻断，普通导入文件保留既有静态路径。
- G2 MCP接线采用现有提案的显式成果绑定：宿主验证参数中的文本与实际成果完全一致，保存宿主版本/输出身份/参数哈希，批准及派发前重验。模型不自报可信hash，也不按工具名字猜是否发布。当前先覆盖自包含HTML/文本；多文件或结构化转换需真实适配验证，不能宣称所有MCP渠道已完成。
- accepted_with_limits须存在真实可信的非关键声明入口，不能只在领域测试中直接调用修订方法。已要求三代理按领域/Service/UI所有权补检查前声明、首报后禁止降级的真实路径。
- 上条入口时机经实际流程核对后调整：模型生成检查后会自动执行，要求用户首报前点击会造成“抢时间”入口。最终采用首次检查前由宿主冻结普通非关键候选定义，模型required:false仅候选，用户在检查面板后续逐项确认范围及接受当前版本限制。原required:true、来源/用户/模板/宿主必检、冻结回归、曾明确失败均不可降级；不可裁剪的候选/失败账本防止滚动报告丢历史。定义变化与旧数据缺锚点不得继承资格。此调整满足已接受方案的可用性，不降低关键门槛。
- G2导出适配专项已检查日志7/7：拒绝Word/ZIP/普通字节/原型写入时保留已有目标，临时文件清理；包含IPC和真实组件检查。后续又补二进制源版本与转换正文版本分离，避免docx/pdf提取正文摘要被误当原容器版本。G2 UI最新6场景通过，已保存项收起并可重核，候选范围选择不会自动接受限制；真实Electron仍待验。
- 后续统一构建由baseline唯一负责：其他代理发稳定信号后check、相关集成、全量test、build（不pack），再真实Electron和新manifest云评测。oauth_policy转入固定48分母的离线评测汇总器，先新增独立文件，避免与构建窗口争用已有运行代码。
- 已读G2领域最终日志32/32（12996.7277ms）；Service最新专项先5/5（8012.2792ms），包括真实runtime先提发布提案、任务结束生成新报告、核对同版本最新报告后批准，以及替换发布正文被拒绝。新增反例仍由recovery补齐后交集成。
- 回退边界审查：HEAD旧版Store无schema上限检查且无条件设置user_version=2，因此当前新代码不能保证旧二进制拒绝新库。当前运行时只保证拒绝未来schema；旧程序不能直接对真实迁移后profile试回退。G4须在隔离副本验证回退/恢复、保留新增数据，当前不宣称回退已验。
- Wangshu评测隔离配置已准备，baseline使用真实Electron safeStorage核对桌面认证文件的域名/密钥/模型完全匹配，未调用云服务；源配置数据库和Local State前后哈希不变。安全摘要：`.test-data/production-agent-profile-prepare-20261011.log`。不得在交付说明输出密钥。
- 统一集成开始：check通过，相关集成51/51通过（`.test-data/production-g2-integration-targeted-20261011.log`）。baseline已启动全量npm test，日志`.test-data/production-g2-integration-full-test-20261011.log`，随后顺序build；当前仍在执行，不能先写全量通过。生产源码/scripts/tests在该窗口冻结。
- 全量测试进行中已出现 `pi-memory-service.test.ts` 的真实Service来源绑定场景失败，完整错误待当前测试收尾后定位；保留本次结果，不以增加超时或隐藏失败取得通过。
- G4环境只读记录见 `production-g4-environment-2026-10-11.md`：飞书和钉钉CLI文件已安装，默认profile连接为空；当前普通用户会话无网络盘映射，尚未识别第二台设备。安装与服务运行不代表实际交付成功；继续核对只读账号状态，真实渠道和双机验收仍未完成。
- 本次全量已结束：1110项中1099通过、11失败，297614.5163ms。实际失败分为记忆撤权恢复/取消/参数错误的派发语义3项、测试用例导出旧夹具未经过新增人工核对6项、SSR加载CSS2项。已解除冻结并分工修复；不放宽未知副作用或正式交付门禁，不覆盖本次日志。修复后定向与全量复验，再构建和真实Electron验收。
- UI/测试用例导出修订定向13/13通过，18848.6294ms（`production-g2-integration-ui-case-fix-20261011.log`）。去除组件重复CSS导入，主界面保留原样式加载；导出夹具逐项经真实核对接口，明确仅自动化测试输入。未核对时拒绝并无目标文件；来源变化、覆盖原件及别名反例在允许交付后单独测试，避免被前置门禁掩盖。恢复派发语义仍在修复。
- G3预算实现前核实：现有 `main/run-limits.ts` 已统一30分钟与120次调用，Service自动修稿已有最多2轮，内容/视觉审查共用计数及主任务取消信号。后续优先补持久化预算/真实用量与缓存失效验收，复用现有机制；不因评测费用不限而移除单任务硬上限，也不另造一套计数器。
- 派发修订已核读：PiMemory在真实mutation send前由宿主留派发记录；输入/来源/权限拒绝保持未派发，未知handler进入后抛SyntaxError或取消仍按未知副作用处理。最新日志恢复20/20（`production-recovery-final-boundaries-20261011.log`），工具结果10/10（`production-tool-outcome-final-20261011.log`），真实记忆Service2/2（`production-memory-service-final-20261011.log`）。此前组合夹具因中途撤权触发正确的任务取消而失败，日志保留；改为真实Files前置越界拒绝验证可纠正，不削弱撤权取消。
- 用户明确确认“暂时没有，先记录双机未验证”。SMB功能保留，不用本机映射冒充双机验证；该缺口如实进入交付限制，其余本地开发和模型评测继续。
- 评测机制专项9/9通过（`production-agent-evaluation-20261011.log`，36060.1486ms），包含固定48分母、关键项门槛、失败身份变化、后补运行前快照及修改证据拒绝；这是离线机制验收，不是业务48/48。第二轮check已通过，全量测试日志 `production-g2-integration-full-test-2-20261011.log` 正在运行，仍未构建或启动付费模型任务。
- 评测测试覆盖复核更正：现有关键失败夹具实际为43/48，标题的47/48不准确；43本已低于44总分门槛，不能独立证明关键项阻断。下一非冻结窗口补真正47/48且关键失败反例，现9/9不视为该独立门槛已验。固定分母及其他已执行断言证据仍有效。
- 第二轮全量终态已核读：1125 tests、1125 pass、0 fail/cancelled/skipped，301327.4429ms；check与build通过，首轮失败日志保留。当前开始真实Electron，尚未付费模型运行。G4恢复独立测试可推进，不改正在验收的main/shared/src/scripts/dist。
- 运行器只读审查发现：模型轮询超时或意外审批在step加入前抛错时，已有start但缺step身份。汇总会保守记未知；仍须在付费首轮前补finally采集实际Run状态与取消结果，不能事后猜参数或虚构完成。该修补由oauth_policy独占runner，Electron完成后实施、定向验证，再准备新manifest。
- 真实Electron第二次6/6通过，主代理已读 `production-g2-electron-24577c9e-e8a1-4b07-969a-2a5d1c0c2297/result.json` 并查看截图：真实preload/main核对、旧token拒绝、不重放、未核对禁止导出且保留旧目标、核对后copy、Word重新提取关键正文、stdio MCP单次派发与版本绑定、变更后旧核对失效均通过。页面错误为空；这是Agent执行的合成夹具，未真实模型、未云发布、未真实用户验收，原生保存对话框未操作。首次脚本误定位成果卡的失败保留，修正选择器后重跑，生产源码未改。
- 评测异常采证修订13/13通过（`production-agent-evaluation-finally-20261011.log`，39648.9789ms）：观察超时、意外审批、取消失败、IPC不响应均有界留实际状态，不虚构终态；另已补真正47/48且关键8/9、可比较为true时拒绝的独立反例。此前43/48覆盖不足已修正，原9例日志保留。
- HTML真实桌面追加验收发现产品入口缺口：Service已有真实浏览器后端及checkTaskAcceptance，但停止任务仅能读报告，缺同合同重检IPC/UI；Agent工具仅检查当前Run，apply会正确改变合同身份，不能以apply冒充重检。已安排host-only taskAcceptanceRecheck包装与按钮，绑定预期合同/报告并拒绝活跃任务、撤权、未知副作用；只重跑已有自动检查，不生成/改成果、不调用新模型、不自动人工通过。修复后再做新集成与云manifest，付费首轮尚未启动。
- 再核对ADR-010：默认原型成果是多文件HTML项目的静态包，单HTML只是可选导出。当前MCP单文本绑定及单HTML验收不能代表全部原型项目发布；后续复用现有构建/导出适配补多文件不可变产物绑定，保留此缺口而不缩小产品范围。
- 隔离恢复演练6/6通过（`production-g4-store-backup-restore-20261011.log`，6334.5974ms）。主代理核读测试与日志：迁移前后完整表内容/文件字节比较、WAL一致快照、固定旧Store源码仅打开隔离副本、新版新增数据恢复、回退同路径修改不覆盖、unknown恢复后仍阻断且runtime零调用。v0/v1是合成历史schema，v2来自固定Git旧源码；这是可重复恢复演练，不是新增产品恢复UI，也不证明旧exe、Pi SDK会话加载或真实profile替换已验。
- 重检unknown约束进一步按调用链细化：若已有浏览器/质量检查完全隔离只读，应允许获取核对证据，同时保留未决操作并阻断正式交付；不能把一切读取锁死。尚待Service实现与反例证明，没有以新报告消解未知副作用的授权。
- G3接口拆分审查补记：当前Service的工具log闭包在await handler后更新phase，finally会删除cancelled/controller；迁移到工作进程后不能让迟到工具回调把已结束Run改回generating。应保留已派发工具的真实Operation事实，同时用attempt/生命周期屏障拒绝旧阶段事件，覆盖“worker崩溃但宿主工具稍后返回”的真实反例。此为迁移前发现的边界，未宣称已完成隔离。
- 重检入口追加必要边界：已有草稿但首报前崩溃时，不能因无report而隐藏按钮。采用必填nullable expectedReportId显式绑定“当前无报告”，仍要求已有可信合同；等待期间出现新报告按过期拒绝，不重建或伪造旧合同。UI/Service正在补真实路径与反例。
- 采证collector提交时机经审查修正：先保存独占候选证据，第二实例真实关闭成功后才提交最终production-trial.json；关闭失败保留失败/候选证据，不留下会被汇总误认完整成功的最终记录。机制专项含cleanup共9/9（`production-agent-collector-commit-20261011.log`，2986.5377ms）；仍不是实际模型任务的保存/重开/导出通过。
- 实际评测source版本快照包括main/shared/src/scripts/tests/public。此前设想云任务期间可继续独立scripts开发不适用，已更正：这些目录须在prepare之前全部稳定冻结，云执行期间仅写docs/.test-data证据；后续代码修改使用新manifest与独立试次，不混用版本。
- 重检最终Service与交付边界合跑19/19通过，18474.9671ms，主代理核读日志`production-task-acceptance-recheck-service-20261011.log`。旧检查证据过期可重检，但真实成果/来源变化拒绝；没有自动人工通过。第三轮check已通过，全量测试运行中，随后构建及HTML/OAuth真实桌面；此前1125/1125不能代替新增代码的本次全量。
- 多文件发布只读审查发现可复用不可变快照与ZIP机制；另须在真实MCP调用紧邻处重新验证交付绑定，不能只在连接/catalog等待前验证。列入下一代码窗口，当前源码冻结，不将该缺口记为已修复。
- 第三轮全量终态主代理已核读：1154 tests、1154 pass、0 fail/cancelled/skipped，296438.4867ms；check通过，证据`production-g2-recheck-entry-full-test-20261011.log`及`production-g2-recheck-entry-check-20261011.log`。唯一builder继续构建及HTML/OAuth桌面，不以该全量结果代替真实模型验收。
- G3代码前设计已补`production-runtime-isolation-design-2026-10-11.md/.mmd`，基于当前RuntimeHandle、Pi公开SDK与辅助进程接口，明确原生输入/只读审查兼容、显式终态协议、单写者、持久预算和迟到宿主工具结果边界。尚未实施，仍以前置G2真实任务证明为门槛。
- 评测只读设计新增首稿准确性约束：增量编辑保留旧createdAt，不能用最终可运行内容的hash反推最初创建时已可运行。固定48槽的性能目标须绑定真实当时版本和运行证据，未知不从分母剔除；下一窗口补输入/版本内容与性能采证，不改已冻结源码。
- 第三轮build通过（`production-g2-recheck-entry-build-20261011.log`，没有打包）。HTML/OAuth桌面attempt1发现脚本误读重检中间报告：持久库随后最终报告current且host render通过，视觉仍unverified；脚本需等待官方Run报告ID与最新报告一致并结束busy，75秒上限不变。attempt1保留，attempt2运行中；生产代码未改。主代理目视attempt1合成说明页桌面/手机截图可读无重叠，这不代表真实复杂原型质量或本次桌面整体通过。
- HTML/OAuth真实Electron attempt2终态6/6通过，pageErrors为空；主代理已读取result并目视当前四张截图后给出逐项Agent审阅。证据目录`production-g2-html-oauth-4f1b91e2-365a-4111-85f7-ab84216ce74c`。真实UI重检/同版本业务与视觉记录、改稿后旧绑定拒绝零发送、当前单HTML本地stdio精确字节一次派发、OAuth配置实际保存重开读回及改URL清空旧授权均通过。虚构连接未联网登录，无真实模型/云发布/真人验收；多文件和派发前等待窗口缺口不由此消除。随后准备新manifest并顺序执行QE05/QE12/QE16初步真实质量闭环。
- 首批真实任务已准备manifest `.test-data/quality-evaluation-ypLMK9/manifest.json`，七条资料事实preflight通过；QE05以隔离Wangshu配置启动，日志`production-three-task-QE05-20261011-attempt-1.log`，未有任务通过结论。主代理独立读取本次实际提取：制度“仅上线初期批量导入/后续SFA手动”位于TXT第176行、表格行18格3；流程后台导入在步骤20、第18行。manifest历史定位“制度行332”不能当作本次精确坐标，按当前原文/表格坐标审阅，保留原manifest而不事后修改试次。
- QE05运行中已见12条成功Operation和未保存流式正文，确实识别了导入阶段冲突；未保存文本不计成果或通过。实际推理配置回执unverified-endpoint，provider请求的thinking/reasoning字段未出现，不能宣称高推理已启用。保留原Run及30分钟预算，不因暂时无事件另发请求。
- 为并行推进已确认缺口，recovery与oauth_policy获准在`.test-data`下各自唯一的隔离源码副本开发MCP派发前重验及评测证据补强。根项目main/shared/src/scripts/tests/public/dist和依赖配置持续冻结，不改共享依赖；临时副本检查仅证明候选变更，未合并不计根项目完成。本批云任务结束后按文件原hash检查再集成与复验。G3仍不提前实施。
- MCP隔离候选`.test-data/mcp-dispatch-isolated-3635abf9a8e74a82af4920a2fefea2e9`的派发专项13/13、65363.4799ms，主代理已读日志和断言。复用真实Service/TaskDelivery绑定，本地stdio/HTTP catalog等待后实际成果变化、核对证据缺失、连接禁用均0调用；当前绑定1调用，派发后失联1调用且outcome_unknown、不重试。模型为注入夹具，“核对证据撤回”由隔离库移除记录模拟，不是新增用户撤回UI；main仅静态接线检查，Electron主入口仍须集成后验收。候选未合并，根版本缺口尚不能记已修复。
- 上述MCP候选必要既有回归4/4通过（4667.6471ms），node noEmit通过，4文件patch及原/新hash已保留，未合并。主代理独立核对本次manifest记录的533个根源文件SHA，全部一致；该核对不替代最终新文件清单/完整runtime核验。
- QE05首试已终态：一次真实send，1197396ms（约19分57秒），一轮自动修稿，实际文件已保存。Run succeeded不等于业务通过；当前report15b8f2eb为unverified，独立业务观察violated，完整证据见`production-real-task-review-2026-10-11.md`和试次目录`independent-business-review.json`。未为错误内容保存TaskDelivery confirm。oauth_policy独占已关闭QE05 profile运行冻结collector，检查真实重开及正式导出阻断；baseline继续独立QE12 profile首试，保留production-trial和prototype-checks，同一manifest不变。
- QE05冻结collector真实尝试失败，回执`production-collector-attempt-7a0e33a9-35fe-4a88-8ba4-834e7ac3d38e.json`仅记录`PRODUCTION_OFFICIAL_IPC_REJECTED`；不能由通用错误单独认定具体交付门禁已验证。终态检查确认两实例均退出、owner锁释放、无导出文件及完整`production-trial.json`、模型调用为0，未添加人工通过记录。后验hash与修改时间已留存，但没有事前另取hash，不能将其写成前后hash一致性验证。
- collector阶段证据进一步核读：`production-collection-mpsoIo/versions-1.json`保留第二实例读回的current版本，hash与最终文件`3d39c0bd…`一致、17100字节。按冻结`production-agent-trial.mjs:74`及`production-agent-collect.mjs:22`的顺序，该文件写入后的下一次官方IPC是copy导出，因此可推断拒绝发生在导出阶段；具体TaskDelivery错误响应未保存，不推断是哪条质量规则。真实重开读回有证据，正式导出仍未完成。
- 跨表审查候选已完成隔离验收：`spreadsheet-selection-isolated-b3031ae22dae463389a56aed1e333bab`四个通用反例旧实现0/4、新实现4/4，表格选择合计24/24、必要回归161/161（153831.1866ms）、noEmit通过。主代理已读实现、反例和终态日志：未精确指定完整sheet名时，草稿引用不能将候选池缩到错误单表；原请求相关性优先，保留原预算和八段上限。冻结QE05输入离线重放现包含03范围40775–42415，仍partial、各表平分quota；不等于全部规则已读或字段关系已核验。两文件patch SHA256 `388FE8C914610BD9FC8A775ADA7A72B271CA2499DB292FC6B755EC54301F88C7`尚未合并，生成阶段漏读、制度列范围误解及流程步骤错标仍待解决。
- QE05制度范围错误另经真实上下文核验：生成的初始0–4000字符与后续4000–15530字符、审查369–5527段均包含表2的“空白门店/机会门店”表头及第18行相关规则。主代理已读`qe05-docx-context-20261011-3635abf9/context-audit.json`，输入/提示hash与原回执一致。故此项是已提供上下文下的作用域解释错误和审查漏报，不能归因于选段截断，也不能称跨表selector已修复。现有通用范围/行号约束已存在，下一步需真实回放比较实际收益及正确稿误报，不能仅追加提示词后宣称达标。
- 评测证据候选第一patch已封存于`production-evaluation-strengthening-a27e5d6c-ad2f-409e-a436-0fb5934761f3/patch1-source`：最终27/27（256475.5793ms），类型检查/独立编译通过，主代理已读终态日志与`patch1-seal.json`。覆盖失败试次输入可比性、真实版本内容/完整文件集绑定和固定48分母的性能统计；首稿出现与核验完成分开计时。第一patch尚未接入runner，不能据此宣称已能自动采齐真实48项首稿指标。下一隔离patch补实际接线及运行前冻结的首阶段要求，旧manifest缺少首阶段锚点继续unknown，当前冻结试次不追认。
- QE12运行中发现真实工具参数拒绝：`define-acceptance-validation-1.json`保存native schema错误，模型误传顶层sourceIds与空outputIds，Service没有应用定义。实际契约为`prd.sourceIds`且criteria必须引用已登记outputIds；当前工具说明只说sourceIds、没有明确新成果尚无output时先写草稿自动登记再获取ID的顺序。下一独立候选仅澄清准确位置和合法顺序，不放松schema、不凭空补ID；不干预当前试次。另`compaction-native-observation-1.json`证明两次get_task_acceptance仅2985/4130字节，不能将连续压缩归咎于该工具返回大量全文。
- 初步任务执行顺序调整：QE05与QE12首稿已分别暴露目标表漏读，QE16的首prompt与QE12完全相同。当前QE12保持原session/版本/预算直到自然终态，保存最终业务及浏览器证据后，暂不启动旧版QE16，交回根集成窗口。候选通过审查并集成后，用新manifest完整执行QE05/QE12/QE16；QE16三轮与逐轮实际浏览器要求不减。此调整只避免已知缺口下重复旧版长跑，不删除旧失败、不将旧新版拼成同版本结果，也不缩减后续固定48项验收。baseline已确认执行顺序。
- 工具调用说明候选已审阅：`acceptance-call-guidance-isolated-58074c6af32a4c2ca8e66585b17f177b`仅澄清`prd.sourceIds`及新草稿自动登记后再取outputIds；schema未变。真实Pi+Service本地传输3/3（40822.0237ms）、既有权限/来源/视图回归8/8（22110.7872ms）、noEmit通过，主代理已读patch和终态日志。patch SHA256 `fbc15da2277087719153ebe717805afb0b779e3648e2e5bdfbf42360df8adeef`待根窗口集成；未声称真实模型误调用率已改善，初次测试错误码断言失败保留。
- 下一批生成资料准备采用现有官方`copyForProcessing → processProcessingCopy(extract_text) → apply`，使真实登记链和现有工作表导航可用，无需新增通用工具。只适用于新manifest/隔离试次，须验证原件/副本/提取文本字节、权限与真实处理回执；准备产物不能混计成果，宿主准备不能算模型已读取目标表或业务已正确。当前方案只读核查在`production-registered-source-plan-20261011.md`，实现待QE12终态后接线。
- DOCX结构显示实验已审查固定材料与计划：`docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477`保留真实QE05首稿、跨业务错误稿与正确稿，A/B各两次共12槽。A沿旧prompt/hash，B仅增加源字节绑定的转换行格/跨度显示，正文选段完全一致，均在原59392字符上限内。默认实验关闭；不认证Word网格、业务表头或步骤含义。真实只读回放获准启动，尚无收益/稳定性结论；不计正式48项。

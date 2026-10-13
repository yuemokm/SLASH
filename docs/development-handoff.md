# slash AI 开发交付规范

2026-10-13 PF03/PF09/PF10/PF11：旧云发布类及网页导入只有历史测试调用，已完整归档网页、本地配置、退役发布源码和旧编译产物；当前源码/启动/构建不再依赖 `knowledge-web/`。保留退休入口拒绝、旧数据回归和本机集合兼容，无数据库迁移或远端操作。详见[本轮源码清理](knowledge-source-cleanup-2026-10-13.md)及同名 Mermaid。

2026-10-13 F02/F03、PF03/PF09：新增宿主只读 `modelDiscover` 和前置校验、逐项回执的 `modelBatchAdd`，沿用 ModelEntry/加密凭据，无新依赖或数据库迁移。新增表单一框一个 ID、可增删行，仅获取目录成功后显示逐行下拉；同供应商新增使用 endpoint/protocol 约束凭据引用，旧项/default/Subagent 引用保留。代码、真实检查、隔离 UI 及未验证范围见[本轮记录](model-discovery-and-batch-add-2026-10-13.md)与同名 Mermaid；需要重启开发应用，未打包。

2026-10-13 F02/F03/F10、PF03/PF08/PF09/PF10：输入工具栏分组、固定发送/停止和顶部队列已接原真实 RunInputQueue；默认 follow_up，立即单条不污染后续发送方式。修复已销毁窗口仍收队列清理通知及重复 dispose，真实活动队列关窗自然退出0、原文持久化通过。检查、实际 Electron/Pi 证据及夹具失败记录见[本轮交付](composer-toolbar-and-queue-2026-10-13.md)与同名 Mermaid；主进程修复需重启，未打包。

2026-10-13 F02/F10、PF01/PF03/PF08/PF09：四个浏览页与会话/设置紧凑字号已实现；只读本机Codex CSS参照，UI14/辅助12/聊天14/页题20。真实Electron、首行CSS y对照、17项定向和检查边界见[本轮记录](compact-workspace-typography-2026-10-13.md)及同名Mermaid。保留未提交功能与用户数据，未打包。

2026-10-13 F02/F10、PF01/PF08/PF09：图片按可信ID绑定固定来源：152原组件截图、33官方poster，3项明确无图；本地静态资源、哈希验收、大图/来源入口见[本轮记录](design-preview-source-images-2026-10-13.md)及同名Mermaid。原正文/hash未变；主进程更新需重启。

2026-10-12 Subagent 最新交接：列表与独立新增/编辑页、工作指令和 composer 总开关已接真实配置；profiles/defaultAgentId schema 兼容无损迁移旧单配置，delegate_readonly 可选 agentId，未知项拒绝，共享 Run 预算与启动快照。enabled-only IPC 不覆盖配置；所有启用项模型须有效。代码、检查、失败排错及截图在[Subagent 交付记录](subagent-settings-2026-10-12.md)/同名 Mermaid，覆盖旧单配置设计；主进程/IPC修改需重启开发应用，未打包。

2026-10-12 最新导航收口：设计体系为左侧同级主导航和独立宽页，右上/右栏设计入口删除；应用返回原会话且未发文字/引用保留。Slash四项PM提示词预设及同链隐藏解析移除，真实skills、plan/help、业务工作流和历史保留。check/build、12项定向、隔离Electron设计/命令11组、真实Service/IPC skills UI六组通过；桌面主审截图通过，390px页面响应验证不代表隐藏侧栏可访问。交付与Mermaid见[设计导航与命令收减](design-navigation-and-command-cleanup-2026-10-12.md)。本轮仅renderer变化，无新云质量验收、无便携打包，既有未提交工作保留。

2026-10-12 完全访问目录浏览修复：绝对directory省略mountId由宿主绑定原电脑scope；shallow列直接子文件/空目录，已登记子directory实际限定范围；文件/目录类型及coverage分开，目录不登记正文。真实Pi父/子Agent及旧IPC子任务复用原Files/网关，标准/自动拒绝、Plan只读、模式切换/撤权/deny/禁用及原件/版本/锁保留。60/60定向、check/build通过，16次本机Pi协议请求、无云模型/永久挂载/用户资料读取，未打包。详细证据、夹具失败及未验边界见[说明](full-access-directory-browsing-2026-10-12.md)/[mmd](full-access-directory-browsing-2026-10-12.mmd)；重启开发应用生效。

2026-10-12 增量交接：已实现[子 Agent 设置](subagent-settings-2026-10-12.md)与[右侧设计体系](design-systems-delivery-2026-10-12.md)，对应契约、代码、定向验收、截图和 Mermaid 见两份交付文档。子模型凭据由宿主解析，模型失效不静默回退；保持受控只读子任务与既有 Pi 底座。设计库按选定ID/hash加载，聊天只展示有色描边集合小卡，不平铺模板全文，Plan/恢复继承引用并拒绝过期版本。真实云模型设计质量与外部渠道仍未验证；未打包、未改用户数据，重启开发应用后查看。本条不登记最终集成检查结果，待统一构建负责人单独回报。

2026-10-12 PF10：开发 BAT 原生退出 `0xC0000409` 未重现、具体原因未证实；启动器补同步阶段/PID/退出码及本地有界日志，BAT失败指向诊断文件。21/21定向与check通过，用户最新默认5173双击确认窗口可用；旧隔离截图仅加载壳，不作视觉通过。见[事实与边界](dev-startup-native-diagnostics-2026-10-12.md)及[mmd](dev-startup-native-diagnostics-2026-10-12.mmd)。未打包。

2026-10-12 用户明确目录读取修复：fresh 完全访问请求中的精确资料文件夹沿既有工作空间目录路径登记只读范围，显式禁止/禁用、Plan只读、真实根身份、恢复不重新授权保留；权限与恢复组合29/29、新目录与索引12/12、既有索引4/4，真实Service在独立profile列举用户指定7文件并核原字节不变，未调用付费模型或重跑原PRD任务。npm run check/build均0，未打包；新增回复Markdown呈现指导仅作用于聊天。最终证据与失败日志区分见 [说明](full-access-explicit-read-directory-2026-10-12.md) / [mmd](full-access-explicit-read-directory-2026-10-12.mmd)。主进程修改后需重启根BAT。

2026-10-11 本轮生产修复集成：旧 Wangshu QE05/QE12 的真实失败留证，旧 QE16 不启动。MCP 真派发前重验、审查跨工作表选段、验收工具合法登记顺序三个封存候选已根合入，类型检查通过；首轮专项 65/67（两项新测试缺临时父目录），修夹具后相关 3/3，通过范围与原失败均保留。统一全量/build 待资料登记 helper 与评测接线稳定后进行，不打包。详情与图源：[MCP](production-mcp-dispatch-candidate-2026-10-11.md) / [mmd](production-mcp-dispatch-candidate-2026-10-11.mmd)、[跨表选段](content-review-spreadsheet-selection-2026-10-08.md) / [mmd](content-review-spreadsheet-selection-2026-10-08.mmd)、[工具说明](production-acceptance-call-guidance-candidate-2026-10-11.md) / [mmd](production-acceptance-call-guidance-candidate-2026-10-11.mmd)。没有第二台 Windows，SMB 双机验证继续保留未验证。

2026-10-10 本轮终态：fresh恢复两轮均由正式Electron IPC创建新Pi上下文，父会话关联及原资料/旧会话/草稿哈希保护通过，但连续返回上游502无正文。一次恢复重试已用尽，停止继续云请求，当前等待模型服务恢复；不是额度阻塞。唯一4278字符草稿仅含七章骨架与V01考勤正文，27流程未完成，未apply/export/Word排版验收，不标完整交付。两处软件修复根48项回归、check/build通过，实际PRD生成效果仍未通过。最终仍只交付一份Word，不拆模块文件。

2026-10-10 用户新增优先要求：原型UI只保留业务内容与必要反馈，不显示演示/非实际产品/后台与接口限制等制作注释；实现边界在Slash交付说明中如实记录。旧元说明断言依明确需求变更另存新版，业务规则不删；实际体验和设计质量仍须新稿证明。见[产品质量审查与改进目标](prototype-product-quality-audit-2026-10-10.md)。

2026-10-10 新验收：QE12从保留稿限定修正V3/V4，Astra单次264.665秒自然完成，宿主3/4与冻结业务9/88分别通过；新稿独立23/202通过，主代理实际看8张图，原七项界面目标限定通过。40ID、业务JS与57控件/option保持；正式任务仍needs_human，内容partial与手机提示换行候选保留。隔离交付v2已通过同版本应用、历史读回、应用后回归、导出及过期版本拒绝，原启动失败证据保留；用户最新指出整体设计感与实用性仍不足，七项限定通过不能作为整体质量合格。QE05同稿新选段审查86.584秒正常结束，1有效/1结构无效，原业务violated不变；安全格式诊断已实现、待根集成；原型Agent的任务导向设计与体验审查已成为当前重点。见[原型实际证据](qe12-astra-full-visual-validation-2026-10-10.md)、[文档审查限制](qe05-independent-validation-2026-10-10.md)。整体目标active，16基准及外部验收未全部完成。

2026-10-10 最新集成：原生details可见性、宿主与冻结回归分批、检查器版本失效和通用选段标题背景已修复。根21文件186项定向、check/build通过；真实编译版Service独立3/4与9/88全部通过，说明新2/30通过，原失败记录保留。见[可见性](prototype-native-visibility-2026-10-10.md)、[分批与旧证据保护](task-host-check-baseline-separation-2026-10-10.md)、[QE05与标题选段](qe05-independent-validation-2026-10-10.md)。主进程修改需重启开发应用；未打包。当前QE05正式评分violated，QE12仅V3/V4文案待完成，完整16基准与外部验收仍未全部完成。

2026-10-10 续作前集成完成：Responses可选字段兼容与草稿parentRunId回执已实现，根两批15文件106/106（47+59）通过，类型检查与正常build通过，仅既有大chunk提示，未打包。真实strict:false隔离请求1次、7.623秒、677tokens、合法{}，服务端tools回执同样strict:false/required[]；这不等于完整工具执行或复杂任务通过。详见[调用修复](task-tool-input-usage-2026-10-10.md)、[草稿归属](draft-owner-receipt-2026-10-10.md)。先前“尚未切换默认”为历史过程；现仅Responses默认使用公开兼容值，显式退出优先。接下来从ee5bf320…保留稿只续改未完成说明，原7项/15业务例/六状态验收不减。主进程改动需重启根BAT。

2026-10-10 新一轮真实结果：完整QE12原600秒测试宿主取消，pending与原件保留，原15/150加六状态22步共21/172本地检查通过；主代理独立查看六张状态图，V1/V3/V5通过、V6部分、V2/V4/V7未完成。无最终云图审、无apply/export，应用已正常关闭且保护文件一致，运行冻结解除，见[真实记录](qe12-astra-full-visual-validation-2026-10-10.md)。PRD v3单次审查114.246秒断流，非240秒超时；旧v2成功证据仍有效，新范围分类未验证。根补充11/11测试通过（与此前124项有重叠，不相加）。20次任务查询全部可选参数填齐的真实反例正在核验Pi公开strict:false兼容路径，尚未切换产品默认。

2026-10-10 本次质量修复集成：内容审查范围门槛、真实报告视口优先选图、任务查询最小调用说明与基准代理继承已实现；主代理17文件124/124、check/build通过（仅既有renderer大chunk提示，未打包）。编译版对旧Astra回执复核hash有效、旧候选为0；来源/历史未变。详见[范围修复](content-review-repair-scope-2026-10-10.md)、[选图修复](prototype-screenshot-selection-2026-10-09.md)、[工具说明](task-tool-input-usage-2026-10-10.md)。当前dist冻结用于新的真实v3审查及完整QE12视觉任务；尚未以本机测试代替其业务结论。主进程修改需重启根BAT。

2026-10-10 Astra续作交付：用户指定Wangshu `gpt-6-astra` 已配置为默认、文字连接通过；随机图片6/6正确后正式启用图片输入，其他设置和加密凭据保留，见[配置证据](wangshu-astra-validation-2026-10-10.md)。PRD真实审查179.721秒完成，两条提示均有依据，范围内一句说明修正到 `output/prd-delivery-20261010/`，范围外编码展示问题保留。SFA真实自动CSS修订、原10/77、新7/46/24、版本保护及同版本导出通过，主代理复核7张实际截图；见[PRD](prd-review-real-diagnostics-2026-10-10.md)与[SFA](sfa-focused-automatic-revision-design-2026-10-10.md)。本轮新增诊断/验收脚本，定向测试两批11+4共15项通过，最终check通过；未重新打包。根BAT实测16.743秒，限一次样本。完整业务/跨成果与外部集成仍未全面验收，下方旧“未确认看图/审查未完成”保留为历史。

2026-10-10 最终验收记录：根全量首次981项中10项测试夹具/解码契约失败已定位修复，最终受影响10文件85/85通过，类型检查与构建通过；本轮备忘派发未知也纳入停止与核对。SFA独立离线改进稿在`output/sfa-delivery-20261010/`，10组77步通过且原件保留。正式PRD真实审查60秒未完成，保留unverified，不宣称业务通过；未确认看图能力。见[本轮完整状态](harness-reliability-delivery-2026-10-10.md)。下方执行中状态为历史过程，最后产品编译已完成，重启根BAT查看。

2026-10-10 最新续作：三项harness改进（已完成工具事实不被后续取消覆盖、错误分级与致命中止、Pi原生写工具顺序声明）已实现，专项与根check/build通过；全量回归尚在执行，见[本轮记录](harness-reliability-delivery-2026-10-10.md)。按用户要求先阅读[12-factor-agents](12-factor-agents-review-2026-10-10.md)，现有架构无须推翻，优先小任务与真实上下文质量验证。用户已撤销旧额度保留要求。开发启动去掉重复生产renderer构建，Vite忽略.test-data的运行时文件变化，正常源码HMR有真实WebSocket测试；整体启动速度仍未验收。主进程已变，需重启根BAT；无便携打包。

2026-10-10 用户追加Codex harness源码对照：固定官方commit，确认取消终态覆盖、工具错误分级、写工具顺序声明值得优先补；上下文压缩与中途输入继续复用Pi。本次只读研究，未换底座或提前标记修复，证据与后续验收见[源码评估](codex-harness-review-2026-10-10.md)。

2026-10-10 最新集成：原型离线静态门禁、只读unknown不阻止明确失败修稿、安全运行错误定位、本地导出版本与授权复核已完成。主代理check/build、90项合并回归通过，renderer index-BOxB7XFc.js；原稿未变、云模型生成/完整视觉业务未验证，详见[交付可靠性](prototype-delivery-reliability-2026-10-09.md)。Vite仅扫描产品入口，扫描成本降低但总启动时长两组结果不一致，不宣称已解决启动慢，见[性能证据](dev-startup-performance-2026-10-09.md)。重启根BAT，未打包。

2026-10-09 云知识库收减已验收：云发布与向量相关IPC/初始化退出产品，资源内仅保留资料集合及有效历史索引查看。最终check/build、37项相关回归、隔离Electron7组均通过（13种旧请求拒绝、0外部请求、0页面异常），renderer index-BDUFdkAi.js。源文件、索引、历史回执与加密设置保留，未删远端网站/数据库。重启根BAT加载主进程；详见 [实现与证据](knowledge-retirement-2026-10-09.md)。

2026-10-09 最新范围：用户要求移除云知识库。云发布、独立问答及专用向量配置/构建/查询/导出已退出当前产品；资源中保留资料集合与有效历史索引查看，普通会话原文检索和项目备忘保持。已有数据、加密凭据及远端部署未删除，云403与问答验收不再列为开发待办。实现、边界及验证见 [云知识库移除与向量取舍](knowledge-retirement-2026-10-09.md)。本条优先于下方历史记录。

2026-10-09 模型连接后续：同 wangshu/gpt-6-astra 原域名，经显式代理流式请求 HTTP 200、完整 OK；不能再将此前直接请求失败一概归咎供应商。已增加模型可选 proxyUrl，官方 Pi fetch 注入供测试/会话一致使用，58/58 相关回归及check/build通过；正式dist文字测试 15,971 ms 返回“连接成功”，不证明工具/视觉，未改实际用户配置。收尾与用户设置路径见[模型代理](model-proxy-2026-10-09.md)；此前数据快照仍保留，禁止擅自覆盖恢复。

2026-10-09 本轮索引：[模型错误标识](model-test-provider-identity-2026-10-09.md)已修真实供应商/协议与522说明，实际wangshu云522未恢复；[原型截图选择](prototype-screenshot-selection-2026-10-09.md)去同版本/视口重复PNG，不能当作最新SFA视觉验收通过。[工具接续](tool-group-continuation-2026-10-09.md)澄清同Run下一次模型推理无需用户再发继续，并重申离线脚本/预编译资源及真实验收要求；不放宽CSP、不新增云请求或便携版。主进程改动需稍后重启开发应用。

2026-10-09 F02/F10/PF08：会话 `/` 菜单接入当前授权项目及启用全局skills，复用原Pi解析/受控正文加载；设置入口更名skills，独立质量页并入通用→交付检查，原偏好和后台门禁保留。35项专项、真实Electron与本机Pi请求验收通过；最新菜单定向复验及边界见 [技能命令与设置](slash-skills-and-settings-2026-10-09.md)，流程见同名Mermaid。主进程/IPC更新需重启开发应用，无云模型/便携版。

2026-10-09 实际 BAT 就绪检测修复：旧750毫秒期限误伤慢首页已复现，真实冷首页HTTP200需4.92秒。改为连接/完整首页分阶段有界等待、保留真实错误和取消清理，12项专项及check通过；默认5173原BAT完整UI/IPC、退出0通过。该轮总151.99秒，窗口创建前约135秒延迟仍待性能排查，不能称启动速度已优化或此前隔离成功已证明稳定；无云调用/便携版，保留全部未提交修改。证据与夹具失败边界见 [本轮修复](dev-renderer-readiness-2026-10-09.md) 及同名Mermaid。

2026-10-09 最新字体与比例：统一全应用字号/间距，导航60+220、头52、正文16/26/最大760、输入72；设置总题20/26与内容24/32。用例/知识库项目说明去重、主题边界和窄预览操作已修。check/build、11项针对性测试及原会话UI9/9通过；隔离Electron三主题18截图及真实Noto字形通过，结果 `.test-data/typography-layout-ui-1791481758892/result.json`。无云调用/便携版，不关闭用户应用；首轮测试旧label超时保留。详见 [字体与比例验收](typography-layout-2026-10-09.md)。

2026-10-09 新功能导航：最左新增测试用例、知识库（知识库问答），明确当前项目并可切换。用例复用真实文件/待保存及冲突草稿、原预览导出；创建仍进入会话选资料，不自动调用模型。知识库复用原集合/发布页，资源旧入口跳转同页；未配向量与云403不标成功。最终check/build、11项定向单测通过，Electron8组导航及1组预览定位通过；导出文件/回执和最终notice2组另行核实通过，脚本SQLite并发锁与追加旧invalid IPC回归中断如实保留failed。最终renderer `index-Dg2xNhAG.js`，自建应用均关闭，用户应用保留。截图、限制与Mermaid见 [功能导航](feature-navigation-2026-10-09.md)。

2026-10-09 会话UI修复：旧成果常驻根因是全会话Change统一在消息末尾渲染，现精确归属所属Run最后回复/活动流式/原历史锚点，不删版本。运行与补充记录收进原生成与执行，唯一主按钮随生成切为停止，文字补充入口保留；单行标题与可增长输入节省正文空间。check/build及14项关联回归通过，隔离Electron完整9/9、最后成果动作布局局部5/5通过（最终`.test-data/chat-round-ui-1791480491018`，renderer `index-PgP0ks7T.js`），截图见 [会话轮次与布局](chat-round-layout-2026-10-09.md)。无云调用、无便携版，用户原应用保留。

2026-10-09 启动修复：原 BAT 可启动，但一次隔离冷加载到完整 UI/IPC 用时约 51 秒，原首页空 root 没有状态；用户当时具体报错未提供，不能宣称其报错根因已定位。已加中文加载占位、入口失败重试、React 错误边界及页面加载失败/renderer 退出的重试对话框和安全 startup.log；同 URL 重新加载放行，其他导航仍阻止。check/build 通过，7 组真实 Electron 专项通过，默认 5173 原 BAT 完整工作台及 IPC 通过并正常退出。全部测试隔离 profile、无云/模型请求，原用户进程保留。证据与早期夹具失败记录见 [启动修复](dev-startup-recovery-2026-10-09.md)；流程见同名 Mermaid。主进程更新需重启原 BAT，无便携版。

2026-10-09 三张当前架构生图已保存 `docs/architecture-images/`（application / system / technical），对应说明见该目录 README。

本轮收尾：本机生产网页连接真实Supabase与edgefn的完整合成业务链已通过（问答200、引用200、停止分享后404）；仅测试脚本自动清理失败，根已按随机ID精确清理并验证云集合/索引/片段/答案/回执/测试用户均0，原失败及单独恢复证据保留。网页根最终check与30项单测通过。真实网页首页200、登录UI存在、无fixture/缺配置页。本机生产测试服务已关闭。此项不改变云Vercel→edgefn向量403结论，用户选择保留现状。

2026-10-08 云知识库最新：桌面发布/更新/邮箱预检/未知结果恢复/停止分享已实现，21项相关自动测试、实际Electron5组通过；最终renderer index-v9-JjPus.js，无便携版。用户授权删除旧CODE、在yuemokm免费新建slash-knowledge（apxdejyicmuzfhbtckup）；真实迁移与27项数据库权限/事务测试通过。Vercel网站 https://slash-knowledge.vercel.app 已Ready；用户指定GLM-5.3-Flash，BAAI/bge-m3 1024向量。但云端edgefn向量请求明确HTTP403，问答不可宣称可用。用户决定保留配置先完成软件，不再盲试云模型或换出口。完整证据与真实失败见 [云发布验收](knowledge-cloud-deployment-2026-10-08.md)。网页29单测、既有8组UI/新增4组注册UI通过；实际同事邮件投递与业务问答质量仍未验收。所有云试验仅合成数据，已精确清理；密钥不在仓库中。

2026-10-08 本轮最新：按“长期记忆→本机知识库→独立问答页面”完成本机开发与验收，`billion-context` 不替换、Pi原生压缩保留。真实pi-memory0.4.2已接项目隔离/来源绑定候选备忘，根8项专项＋compiled Electron五项通过；知识库11项专项＋实际桌面6组通过；网页25项＋实际Chrome8组＋生产构建通过；相关既有回归33项通过，集合不重复累计为77项自动测试，界面组数另列。最终桌面check/build通过，renderer index-C8xGjBeY.js。记录见 [本轮验收](memory-knowledge-continuation-2026-10-08.md)。取消回执边界、IPC创建传输type错误、折叠必填项及异步身份切换均已修，原失败证据保留。

用户提供edgefn专用测试服务后，根只做models目录及两句合成embedding探测，BAAI/bge-m3返回1024维/29 tokens；随后用户要求先做原任务、不改顺序，故真实检索脚本留备未执行。密钥未写代码/文档/测试结果。实际Supabase迁移/RLS、真实问答效果和云部署仍未验收，Docker守护进程不可用，无线上链接、无真实资料上传。新记忆非语义qmd搜索，候选不能自动成为业务规则。重启根BAT查看桌面，无便携版。原型/PRD总体输出质量目标仍active；本轮不将页面本机成功冒充已完成真实输出质量或云交付。

2026-10-08 收尾补充：父进程正常退出/强停时 Plan、Langfuse、web stdio 回收已实测；根专项与回归合计更新为 79 项不重复测试通过，最终 check/build 通过。billion-context 对照已完成并决定暂不切换默认：固定0.1.188真实本机代理的压缩/还原、流式工具、取消、可配置重试及重启状态通过；未证明真实PM任务的语义/总成本胜出，Slash受控回读、权限和回退尚未接线。不是判定该包不稳定。详见 [比较与准入](billion-context-comparison-2026-10-08.md) 和 [真实代理结果](billion-context-local-comparison-2026-10-08.md)。本轮不继续云试验，保留原生与候选测试；总体质量目标继续active。

2026-10-08 最新：用户指定的六项 Pi 包已接入真实路径并完成本机验收（web-access、mcp-adapter、subagents、lens、Plannotator、Langfuse）。根 check/build 通过，22 项新专项＋55 项相关回归通过；真实 Electron 设置/父子任务/Plan 批注、辅助三包、原 HTTP MCP 流程通过。公网 DDG 搜索/分页/来源检查通过，正文抓取因本机 DNS 返回保留地址被安全拒绝，未放宽保护；Langfuse 默认关闭、仅统计信息、真实云账号未验证。Pi 0.86.1 / Electron 44.0.0 保持不变。详见 [六包验收](pi-package-integration-2026-10-08.md)；重启启动 BAT 查看，不制作便携版。

用户随后要求比较 `billion-context` 与现有 Pi 原生上下文，若更适合可直接替换，并明确稳定性是硬门槛。正在固定发布物的隔离真实代理对照；不得拿下载量、包方宣传或一次本机协议成功当成效果/长期稳定性证明。核对取消、工具与 reasoning 配对、故障/重启恢复、数据隔离及退回原生。现阶段尚未替换默认压缩。长期记忆已完成 [候选比较](pi-context-memory-selection-2026-10-08.md)，尚未安装记忆包；知识库网页原 WIP 保留，未部署。总体输出质量开发目标继续 active。

2026-10-08 最新开发方向：用户明确要求pi.dev/packages高下载现成模块优先，重要遗漏可补；已写AGENTS.md，并完成[下载量及复用审计](pi-package-reuse-audit-2026-10-08.md)。优先pi-web-access、pi-mcp-adapter，再评估pi-subagents、pi-lens/Plannotator；未安装或实际接入。不要继续先从零扩写通用层。知识库本轮已写本地domain/安全embedding配置/集合UI接线及独立knowledge-web骨架，因新指令停止扩展并保留，根及子项目typecheck通过但尚无专项/桌面/向量验收；未新build、未云调用。网页无API/UI/发布链、迁移为空，不可部署。用户明确embedding服务稍后提供，当前仅配置入口。主质量目标继续active，不将开发方向调整解释成整体暂停。

2026-10-08 最新用户扩展（本机集成完成）：测试用例创建与Markdown/Excel导出，以及Slash内Vercel/Supabase官方MCP预设、OAuth、分页及服务商确认已实现。根check/build、31项功能专项和42项相关回归通过；实际Electron测试用例3/3、MCP本机协议7/7通过，应用正常关闭，无云调用。设计、证据及首轮脚本失败记录见 [新增功能架构](test-cases-and-knowledge-qa-2026-10-08.md)。知识库索引/问答服务仍仅设计、未部署；下一步实现Vercel+Supabase独立问答网站。官方账号授权及Vercel客户端审核未验证。原型复测离线准备保留且未启动；不把此次延期记为旧任务取消或整体目标暂停。主进程有变动，重启启动BAT查看，不制作便携版。

2026-10-08 当前最新状态（优先于下方历史记录）：草稿参数拒绝可观测性及匹配失败恢复已实现，复用原 Pi 编辑器与既有 Run/检查点；失败计入原预算，保留权限/版本/原件和原子保护，折叠执行记录显示真实可读原因。根代理相关46项及新增9项回归均通过，check/build、独立编译 Service→Pi 本机回放5请求/7检查及实际桌面4/4通过，应用正常关闭；本轮0云调用、无便携版。证据与兼容边界见 [草稿修改恢复](draft-edit-recovery-2026-10-08.md)。历史真实云视觉修订仍零新稿，模型看图能力未知；本地链路通过不等于原型已变好。下一目标是明确可用视觉反馈路径后，验证完整修改落稿和同版本业务/手机截图；不重复长云任务或盲改预算。完整质量目标仍active，主进程改动需重启启动BAT。

2026-10-08 前次真实试验（历史审计时点）：一次同Run完整七项视觉修订仍零稿；601.675秒由600秒测试宿主取消，不是产品超时或本轮自然length。实际已完整读Skill/HTML，先缺修改参数被Pi收到错误后自行继续，再提交21项但第8项漏抄g-name属性，Pi原子拒绝正确。新文本也漏同一ID，不能放宽匹配。根重算831项保护一致，正常关闭应用及所属进程；该次只实测/审计/文档，无产品代码/构建。后稿业务/视觉均未验收。详见 [真实结果与失败审计](qe12-real-visual-local-result-2026-10-08.md)。该次提出的参数拒绝可观测性及精确修改恢复反馈现已按上段完成；不重复当前长云任务、不叠提示或盲改预算，完整质量目标仍active。
2026-10-08 同日前次验收：已修模型文字测试把length/空正文误判成功的问题及旧成功残留，根代理39项相关回归、check/build通过；实际编译设置按钮→官方IPC/Pi本机回归4/4通过，源码/dist身份复核，应用正常关闭。两次短云工具请求均成功，更换上限字段无明确改善；原生reasoning历史本地回放正常，未改兼容默认。详见 [测试修复与接入核对](model-text-test-integrity-2026-10-08.md)。前次真实局部视觉修订仍是351.204秒length中断、0新稿，看图能力未知，不能宣称质量改善，见 [真实结果](qe12-real-visual-local-result-2026-10-08.md)。下一目标为保留全部要求的分段落稿及最终完整回归，不重复加提示词/装Skill/盲试参数。完整目标仍active；主进程更新需重启启动BAT，无便携版/PPT/视频。
2026-10-08 同日前序记录（恢复与因果审计时点）：恢复输入来源去重已通过根代理35项回归、类型检查、构建及独立编译版Service→Pi本地回放；连续恢复输入不再嵌套旧包装，原生历史保留。frontend-design因果审计已完成：原始原型完整加载Skill，但没有截图进入模型，实际自动验收仅桌面可见/无横向溢出；后续局部修复保留旧样式，最新视觉任务零草稿。下一质量重点是同版本截图反馈、真实主任务与移动可用性检查→修正→复查；先核定视觉能力，不能以加Skill或DOM通过代替。本轮未追加云任务、未改业务稿，完整目标仍active。详见 [因果审计](qe12-skill-visual-causal-audit-2026-10-08.md) 与 [后续开发目标](active-development-goals.md)。
2026-10-08 最新集成完成：主请求安全诊断与跨表字段候选补段已完成根代理回归、类型检查、构建和编译版真实资料回放。正文预算不增，3个候选/22格完整，旧PRD14格及输入身份不变；没有新云审查或视觉稿。新请求不会关联旧响应，length按真实正文/草稿记录提示。连续恢复说明嵌套已用正式Pi本地fixture证实，下一步修恢复输入来源，不清除原生历史。证据与剩余目标见 [后续开发目标](active-development-goals.md)。下方“正在实施/尚待构建”均为历史时点，不代表当前状态。
2026-10-08 当前状态更新（优先于下方历史记录）：真实视觉修订已结束，304.269 秒后因 length / 输出上限中断，未生成草稿，未触发宿主取消。正式 Pi→本地 HTTP 零云核验表明当前会发送 thinking.disabled 与 max_completion_tokens=12000，但历史上游接收/执行未知。主请求白名单诊断及跨表字段候选补段正在实施，未验收；不提高限额或重复发送任务。最新状态统一见 [后续开发目标](active-development-goals.md)。

2026-10-08 最新集成：表格 nextInput 与原型指导补强已完成。35/35 根代理组合回归、类型检查、构建及编译版真实工作簿续页回放通过。保持原数据与权限/版本校验；指导实际进入默认请求和 prototype 工作流，自定义普通提示不覆盖。无新云调用，尚不能宣称任务提速或视觉变好。当前目标与证据见 [后续开发目标](active-development-goals.md)，下一步真实视觉/文案修订与回归。重启启动 BAT 加载主进程。

状态：开发任务与验收基线；不代表实现、真实联调或安装测试已经完成。

2026-10-08 用户授权持续推进后续目标。当前顺序与完成标准统一见 [后续开发目标](active-development-goals.md)：业务准确性→完成率与耗时→原型视觉与交互→跨成果修改一致性。已实现能力优先补可靠性，不重复建设；完整子 Agent、跨机锁、执行隔离和会话分支按实际需要后续推进。第四阶段团队功能暂缓。

2026-10-08 后续增量：显式 PRD 模板选择已接入宿主冻结结构、Markdown 成果绑定、漏章节/漏表头检查和现有有限修正。Plan 保持只读，Word 仅处理登记副本，模板不混入普通业务来源回执。重启/续作、撤权、版本变化和大模板分页均有针对性验证。当前桌面模板已更新为 28,522 字节，使用新隔离副本正式 Service 回放仍捕获旧 PRD 的默认值列和 6.2 缺失；历史 13,238 字节模板结果只代表旧版本。普通云模型生成、业务语义、Word 版式及整体质量仍未验收，不以结构检测代替。实现与本轮最终验证见 [PRD 模板选择与结构验收](prd-template-acceptance-2026-10-08.md)。下文保留此前时点记录。

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

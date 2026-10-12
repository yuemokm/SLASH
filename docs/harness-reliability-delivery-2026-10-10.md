# 执行可靠性与未完成质量任务续作

日期：2026-10-10。关联PF03/PF08/PF10/PF11、QE12。用户授权推进Codex对照的三项改进，并继续完成之前待办；代码由GPT-6.1 Sol / High子代理实现，主代理审查、统一构建与集成验收。中途用户要求先读12-factor-agents，已在安全边界暂停后续工作，阅读并完成[对照取舍](12-factor-agents-review-2026-10-10.md)后继续。三项实现和专项已通过；全量回归及后续真实质量验证分别记录，不混同完成范围。

## 本轮契约

1. 工具完成事实与Run取消分开。已完成操作保留结果，停止后续执行；提交前取消不能产出写入，未知外部结果保留核对流程，恢复不可盲目重放。
2. 工具错误分为可修正、权限拒绝、取消、宿主致命故障、外部结果未知。普通业务错误保留Pi原回馈；明确致命与未知外部状态通过既有Run/AbortSignal停止，不仅让模型收到isError后继续。
3. 复用Pi公开executionMode为有顺序依赖的写/状态工具声明sequential；纯只读批次保留parallel。Pi当前行为是混合批次含任一sequential时整批顺序执行，不宣称同批读工具仍并行。
4. 开发启动沿Vite开发页面，仅编译必需main/preload；生产构建与便携打包仍保持独立契约。应验证无dist/renderer的新环境、失败/退出与完整UI/IPC，不能只用文件存在证明启动。
5. 新表格选段与候选补段后的PRD真实审查单独验证，不重复已经完成的两行改稿。SFA新版以用户实际原型为基线，离线、业务交互、视觉及跨成果分别记录证据。旧重复建档局部修复不再列作未开发。

用户本轮明确“不用管额度，直接用”，替代此前至少保留31,250点的限制。使用当前已配置模型做有界真实验证，不新增或猜测密钥、不修改用户模型设置、不把文字能力当看图能力。真实接口失败保留证据，不在相同条件盲目重复。

## 复用核对

2026-10-10查询 [Pi目录](https://pi.dev/packages)，月下载为目录展示/mo口径，非独立用户数：pi-mcp-adapter 1.6M、pi-subagents 599.4K、@langfuse/pi-observability-plugin 307K；与本轮相关的既有宿主执行/取消及观测能力继续复用。现有锁定Pi agent-core/coding-agent 0.86.1、pi-subagents 0.76.1、Langfuse插件0.1.2均为MIT；subagents声明容纳当前Pi，实际稳定性仍以本地测试为准。目录新出现beta harness不作为替换候选，未安装或更换底座。上下文压缩与中途输入接续已有，不重复建设。

实际缺口是Slash的Operation终态、错误映射及工具执行声明；已安装Pi公开接口可满足，故没有引入新依赖或自行开发调度器。Codex源码仅作机制对照，固定版本及许可证见[评估](codex-harness-review-2026-10-10.md)。

## 验收记录

### 已完成实现与专项

- `shared/tool-outcome.ts`提供分类schema/接口例子；`main/service.ts`记录首个阻断故障并中止既有Pi/授权等待，普通输入错误保留可修正回馈；`main/agent.ts`在原工具对象包装保留故障原因，阻止下一工具及下一模型请求。JSON、URL和普通SQLite约束错误不凭JavaScript异常类误判fatal；明确宿主契约故障、损坏/IO类错误才停止。
- `main/store.ts`新增定向`finishOperation()`，只用于结束一个工具attempt，首个真实终态不被后续取消或记录失败覆盖。通用`operation()`未变，历史unknown可由原核对路径更新；无数据库列变更或破坏性迁移。旧结果字符串仍可读。
- `main/tool-execution-policy.ts`用schema描述现有工具的效果与执行模式，覆盖Build及Plan目录。保留受控PowerShell对象身份、懒加载/reload及只读子代理边界；复用Pi既有调度。
- 子代理 `npx tsx --test tests/tool-execution-policy.test.ts tests/lazy-tools.test.ts tests/draft-edit.test.ts tests/draft-input-rejections.test.ts tests/pi-subagents-runtime.test.ts` **43/43通过**，包含真实Pi本机HTTP写串行/纯读并行/取消/版本冲突/撤权/lazy reload/致命与未知中止/资料伪错误码。
- 子代理 `npx tsx --test tests/tool-outcome.test.ts tests/draft-recovery-service.test.ts tests/runtime-recovery.test.ts` **20/20通过**。首次19/20因fixture缺正常最终回复失败，已修fixture后复跑；未放宽产品判定。
- 子代理 `npx tsx --test tests/tool-outcome-service-pi.test.ts` **2/2通过**：默认真实Service→Pi→localhost SSE，同批双写首写完成后取消，Run cancelled但唯一operation succeeded、检查点成功、pending保留且第二写/第二HTTP均无；明确fatal保持Run failed、不可自动恢复、零草稿、第二写/HTTP均无。没有用mock runtime代替默认createRuntime。
- 主代理 `npm run check` / `npm run build`通过，日志 `.test-data/harness-final-{check,build}-20261010.log`。renderer仍`index-BOxB7XFc.js`，主进程已更新；service.js SHA256 `1d6154830a155deb2e8deaa793a1a9a491e759abdb3a37b1997a92f1ac09f96a`，agent.js `bb0612a3221f2adddf1738d0bdc03cbc1ae2c05e49a7d8e364251f34f26f115a`。构建保留大chunk提示，无便携打包。

上述集合有重合，不叠加成独立覆盖总数。主代理全量单并发首轮共981项：971通过、10失败、0跳过，耗时857.448秒，保留`.test-data/harness-full-regression-20261010.tap`。10项均已定位为旧测试夹具/契约未同步并定向修复，见下段；不能将首轮记录改称全量全绿。启动17项与真实BAT/新环境UI证据见[启动记录](dev-startup-performance-2026-10-09.md)最新段；总耗时仍约69秒，不宣称稳定提速或旧135秒根因已解决。流程见同名Mermaid。

### 开发热重载隔离

真实启动日志发现测试HTML写入导致两次full reload，故`vite.config.ts`增加`server.watch.ignored:['**/.test-data/**']`，不关闭HMR、不排除正常源码。`tests/dev-vite-watch.test.ts`以真实Vite及WebSocket验证测试HTML无重载、合法src修改收到update，1/1通过。69.3秒样本中建窗到页面加载为46.9秒，不能把其余全部归为页面加载；共享schema导入图虽大，尚无耗时因果证据，本轮不做未经验证的拆分优化。

### SFA独立交付稿

输出`output/sfa-delivery-20261010/异动端SFA主要界面-改进版.html`，入口SHA256 `0be9757b651548831a19853a53fc79e0c6cc4799c14659450981b970989a6232`。内嵌已锁定Vue3.5.43/MIT、预编译模板，无远程运行依赖；合并首页重复指标区、突出门店行内动作、SVG导航，修复toast挂载到文本根节点的问题。原件SHA256 `e6400601f02bbc100bcc86f30c36a59c518c0f216c319e88b05e7ffe20847c94`未变。

正式受限浏览器最终10组77步通过，原5组27步逐字保留，入口与截图同hash；主代理查看320/390/1440首页、异常弹层与复盘截图。证据`.test-data/sfa-delivery-20261010/final-browser/report.json`及截图，使用说明/验收记录/范围对应/当前界面流程图随稿交付。首次runtime阶段一张截图超时unknown保留，后续原门槛通过，没有增大期限或删断言。

这是独立制作的交付稿，不能证明Slash自动云生成质量已通过。原型操作仍为模拟；原数据待整改汇总1与两条列表不一致保留说明。实际成果目录没有已交付PRD/流程图，参考模板不冒作已确认需求，因此没有宣称PRD/HTML/流程三者业务一致性全部验收。配套新流程图只描述已核验的当前界面动作。

### 全量发现的测试模型问题

初次全量发现7项草稿/恢复用例失败：其模拟runtime在宿主要求修正残缺HTML时无差别重放原任务handler，导致重复建卡或旧hash。修复仅限制mock初始prompt执行handler，后续必须精确识别宿主修正消息，返回正常最终消息但不伪造修复，其他后续prompt报错。网关用例同时断言仅1草稿、质量仍failed，保留源版本/锁/恢复断言。另一项旧测试仍硬编码quality-4，改用实际导出版本常量，同时保留历史quality-3不迁移。

`npx tsx --test tests/draft-edit-service.test.ts tests/draft-resumption-service.test.ts tests/exact-continue.test.ts tests/html-script-bindings.test.ts`35/35通过；此项未放宽产品门禁，未用于证明自动修正能力。

另外2项真实Pi字段证据用例的旧解码器不认识模型结果新增`nextInput`，严格schema拒绝导致测试HTTP500及Pi重试。修复先以严格请求schema核对nextInput原来源/hash/范围/cursor，再用原严格响应schema解压；不使用passthrough，不延长15秒截止。`npx tsx --test tests/spreadsheet-field-evidence.test.ts tests/spreadsheet-navigation-model-view.test.ts`26/26通过，真实本机build/plan约1.96/1.37秒。仅修测试。

### 备忘未知结果补漏

审查发现既有`PI_MEMORY_OUTCOME_UNKNOWN`未纳入结构化未知分类。`shared/tool-outcome.ts`定向补入，保留PiMemory原核对能力；已派发但未确认的备忘写入不会作为普通输入错误继续重试。`npx tsx --test tests/tool-outcome.test.ts tests/tool-outcome-service-pi.test.ts tests/tool-execution-policy.test.ts tests/pi-memory.test.ts tests/pi-memory-service.test.ts`31/31通过，含实际Pi同批次无第二写/第二HTTP、Service取消后unknown保留和拒绝恢复、原真实备忘下一次读取核对不重放。根随后重新build通过，agent/service哈希不变，dist/shared/tool-outcome.js为`0c5313eb37f340ae60dd74f829fdda60acc43c28f9d5b96117ad2c763b265dee`。

分类只处理执行异常，不处理正常资料返回正文；兼容既有错误仍从异常消息起始码识别，尚未全面改为严格来源认证的异常类型，不能宣称对任意第三方透传异常具备此认证。

### 聚焦PRD真实审查

首次夹具在Electron启动阶段死锁，未进入review；已修入口异步等待与同步隔离profile初始化，见[启动故障记录](prd-focused-review-bootstrap-2026-10-10.md)。最终零云preflight2.218秒通过，再由主代理执行一次真实审查，目录`.test-data/prd-focused-review-33d4fb34-c8b8-43f3-832d-3ed2a8dc6ed7`。

模型baishan/DeepSeek-V4-Flash-0731，正式reviewContent输入与来源版本已核验，14个关键单元格覆盖。结果在独立60秒审查截止取消：实际60.134秒、status unverified、completion cancelled、合法回执；usage/stopReason未知，没有完成的语义结果，0 findings不能记为业务通过。外层调用1/重试0，Pi内部maxRetries1保持，实际HTTP次数未知。未改用户模型设置、未覆盖PRD、未再次盲重跑。

剩余：PRD语义准确性、Slash自动云生成SFA及完整综合任务效率、真实跨成果业务一致性仍未全部验收；目前模型看图能力未确认。正式MCP外部交付与SMB双机需要相应服务/设备，不能由本机测试替代。云知识库已退出范围，无须继续其云问答验收。

### 最终集成复核

主代理在上述修复后合并运行10个受影响测试文件，共85/85通过、0跳过，日志`.test-data/harness-final-affected-regression-20261010.tap`；覆盖全量首轮10个失败及本轮终态/分类/真实Pi/工具顺序/watcher。最终`npm run check`通过，产品最后变更后`npm run build`通过。未重复14分钟全量运行，因此记录为首轮全量问题均有修复及定向复核，不改写首轮失败记录；测试集合不重复相加。主进程更新需重启开发BAT，未制作便携版。

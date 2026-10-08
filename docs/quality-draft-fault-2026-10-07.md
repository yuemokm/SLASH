# 独立草稿故障与原自动修正测试工具

对应质量目标第3项的真实故障→自动修正证据准备。scripts/quality-draft-fault.mjs 与 scripts/quality-fault-retest-driver.mjs 是显式测试函数库，未接入正常产品/quality-evaluation runner；导入不启动应用、不发模型请求。替换的旧初稿从未执行，原候选及历史证据保留在 `.test-data/quality-fault-development`。

根复用官方隔离 Electron/IPC、新 `.test-data` profile 与用户当前同模型协议，提供真实原型副本、原 core8 证据和 freshprepare manifest。driver 在新profile通过官方Save→Run→Required重新执行8例69步；旧截图不能替代新浏览器执行。源码/skills/dist/用户原件/复制件/提取文本及正式原型前后均核验hash，不读凭据或SQLite。

根审查一个小修改后才显式调用一次 send。首次生成完成、同Run进入validating、repairRounds=0时，测试工具只包装真实 Service.prototype.checkTaskAcceptance，先读本次pending草稿并等待根的本地 reviewed plan，沿用原Run取消/期限。根必须用官方本次 pending preview 确认唯一readonly input、未disabled、非contenteditable、可见且实际可操作、无其他锁定方式；若移除readonly不实际改变编辑限制，本次注入不适用/not_executed。不能用上一正式HTML的DOM或正则猜节点。

模块核对当前hash、唯一完整input起始标签/精确属性区间、required规格、当前正式通过报告、任务冻结baseline和保护文件，再调用真实 readDraftForRun/editDraftForRun仅一次去掉readonly。仅改同Run pending草稿，不写正式文件或直接写数据库；不自行prompt、修稿、apply或重试。注入回执包含host_fault_injection身份、精确diff、草稿前后hash、正式/依赖/来源保护记录，humanConfirmed=false。

原产品checker继续正式浏览器→同Pi session最多两轮修正流程。driver保留每次原checker报告与同Run草稿快照。只有绑定本次缺陷hash的真实readonly失败，随后原1/2轮修正及原core8完整重过、Run正常完成、保护文件不变，才记录`repair_evidenced`；不等于业务通过或用户人工确认。缺链条保持unknown/failed/not_executed/verification_invalid。观察60秒不足返回running，不取消或关闭app；仅显式取消走官方cancel，原30分钟/120工具预算不变。

接口和根reviewed plan格式可参考保留的 `.test-data/quality-fault-development/RETEST-DRIVER.md` 与 README.md。工具移入scripts后使用正式模块导入；tests/quality-draft-fault.test.ts 使用真实Service/Store/Files/native Pi edit，浏览器/DOM报告明确是本地模拟；tests/quality-fault-retest-driver.test.ts 仅测证据分类和观察边界。与静态质量专项合跑 **56/56通过、零skipped**，脚本语法与相关TypeScript检查通过，47733.2147ms。记录在 `.test-data/quality-fault-development/integrated-verification.json`。离线通过不代表真实故障已经被模型修复，后续专轮仍由根显式执行。流程见同名 `.mmd`。

真实专轮暴露了启动回执问题：官方send已成功，后续Electron观察钩子安装失败时，调用者未收到start结果。driver现在在send回执后立即保存可恢复身份；后续读Run状态、写start回执或安装观察器失败，均抛出`QualityFaultRetestStartError`，携带`code`、`stage`、`startReceipt`、`realSendCalls:1`、`existingRunPreserved:true`及脱敏`diagnostic`。诊断只包含安全阶段分类、标准错误类型、原错误文本的SHA256与长度，不回传原始文本/cause。`startReceipt`含Run/会话身份、原模型/预算、保护记录；状态读取失败时`scope.deadlineAt=null`，不编造期限、不安装钩子。已存在的`retest-start.json`与发送once锁不覆盖，写入失败也通过异常保留身份。调用者应继续保留app、读取已有回执/锁并如实记录基础设施失败；不得认为未发送而close/cancel或再次send。本次15/15定向离线测试通过（1720.4247ms），覆盖三种发送后失败、正常启动、重复启动及观察仍running；脚本`node --check`通过，没有启动Electron或调用模型。真实自动修正链仍未验证。

随后用全新无密钥profile实际启动生产Electron定位根因：Playwright `app.evaluate` 的UtilityScript中直接`import()`抛出`TypeError: A dynamic import callback was not specified`。原失败证据保留在 `.test-data/fault-observer-real-probe-QZ6gt7/probe-result.json`。测试库增加共享`evaluateQualityFaultMainAction(app, callback, input)`，通过官方`evaluateHandle`提供`{app,importModule}`，使用Node主上下文的[默认ESM加载器](https://nodejs.org/api/vm.html#vmconstantsuse_main_context_default_loader)，callback调用`await importModule(url)`；finally只释放JSHandle，不关闭app或取消Run。formal driver和case pending观察共用入口，不修改生产应用，也不另建浏览器/模块加载框架。最终正式入口无云真实复验证据为 `.test-data/fault-observer-real-probe-cJlUyj/probe-result.json`：真实Service/脚本导入成功、钩子安装/卸载成功、原checker恢复、marker清除、`finish=not_executed`、runs/changes均0、hasKey=false、send0、appClosed=true、source/dist完整hash不变。中间加载器复验6sHRwV也保留，最终共享入口以上述cJlUyj为准。定向离线回归16/16通过（2107.3234ms），含真实Node模块身份/handle释放检查；正式脚本语法通过。这证明安装兼容问题已修复，尚不替代真实pending DOM、故障注入和原模型修正链验收。

LpWegu真实专轮随后暴露Windows目标比较错误：Change/TaskReport记录`QE16\index.html`，scope记录`QE16/index.html`，测试工具raw字符串比较导致`QUALITY_FAULT_PENDING_NOT_UNIQUE`和空host snapshots。该轮原故障未执行证据完整保留，不补造注入或修正成功。仅修两处runtime目标匹配：继续限定同mount、同Run/pending或draft HTML，在现有`Files.resolve`授权解析后确认目标位于case workspace且realpath与原路径一致，再比较同一物理目标和唯一性；无正式文件的其他新pending成果不做无关realpath。plan/DOM原字符串绑定、changeId、完整草稿hash、正式/依赖保护检查不变。Windows真实Service离线回归38/38通过（108904.1541ms），另定向越界组4/4通过（26772.0496ms），均零skipped：混合分隔符正常注入一次、同目标重复卡片拒绝、不同mount/Run/目录不匹配、路径越界/absolute/escaping junction不编辑；报告混合路径保存完整真实readDraft快照且hash绑定，重复目标、错误hash、撤权与越界拒绝。浏览器/模型报告仍为明确模拟，未启新Electron或云请求；两正式脚本语法通过。源码仅测试helper/tests及本文档调整，产品main/dist保持原版本。真实自动修正仍需新prepare后的专轮证据。

通俗解释：工具可以在测试草稿里放入一个事先核对的小错误，然后让软件原来的检查和模型修正流程自己处理。必须留下真实报错、真实修正、同一批检查重新通过的证据；工具不能替模型改好，也不能把任务完成当作业务合格。

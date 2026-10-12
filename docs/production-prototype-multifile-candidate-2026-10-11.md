# G2 原生静态多文件交付候选

候选目录：`.test-data/prototype-multifile-delivery-isolated-a4e1ced1cc4249cb9d708765aebd2263`。此批仅隔离修改，根工程由唯一集成人员写入。当前候选已封存，未合根；统计按实际运行版本分别记录，不把旧轮全部改称最后源码验证。

## 契约与范围

复用 PrototypeAcceptanceDomain.snapshotForTask 的真实字节、父目录网页资源边界、草稿覆盖与权限检查。宿主生成 prototype-static-delivery-v1 manifest，记录 entry_parent_web_assets 和 native_static_snapshot；该字段不证明 React/Vite 已构建，不把 packageHtmlProject 的 source_zip 改名为可信构建包。

模型仅声明已有任务 HTML 输出位置和宿主注册 codec ID。真实入口、完整规范路径清单、逐文件 bytes/hash、参数hash、真实工具schema身份、连接政策、合同/来源/report/人审身份均由宿主绑定。路径不静默归一化；大小写冲突、重复、越界、符号链接与体积门禁复用既有快照并补严格schema。完整文件列表须表达每个文本/二进制的准确字节，不允许仅入口替代。

生产registry默认空；当前默认profile的只读公共连接清单为空，没有真实发布候选工具schema。fixture codec 只在隔离Service构造注入时启用，模型、UI和环境变量无法开启。测试服务真实stdio接口明确为 fixture-only，不能据其回执宣称已发布到真实平台。

单文件旧绑定明确记录 single_file_text / not_asserted。目录旁的PRD、另一个独立HTML不是依赖证明，不直接使单文件兼容失效。复用静态资源解析中已明确声明的本地加载URL阻止单文本冒充多资产交付；该正向检查不证明没有动态依赖，也不据此裁减完整项目清单。同目录网页资源仍全部纳入目录级项目快照，边界限制明确保留。

审批和真实派发前重复快照、完整参数、schema、连接、权限与TaskDelivery guard，复用已集成beforeDispatch，不创建第二执行框架。提案前的权限预览没有Run绑定；真正createExternalActionProposal才持久绑定。模型工具仅登记pending提案，外部发送仍由IPC审批完成。unused executeExternalAction hook未改。

## 实际验证及历史失败

helper契约最初8/8。真实Service与stdio首轮曾在前置request预览无Run时拒绝；随后改成预览保留locator、提案才绑定。第二诊断发现MCP SDK重排JSON对象keys，已改schema结构canonical hash，仅排序对象key，值和数组顺序不变。首次失败日志保持，不能删作全绿。

父审明确：同版本重检不必作废仍有效的历史审批。初始组合新增latest-report-only守卫没有明文语义，已移除；同版本重检保持可用、真实宿主新增必检条件改变合同后零发送。新报告未继承旧人审记录；有效历史审批仍绑定同一原报告。该初始组合即使全绿，也不是最终批准行为证据。

真实Service测试的浏览器结果使用明确标注的checker fixture，只验证交付绑定与传输guard，不当作浏览器验收。真实Electron IPC、真正浏览器、发布平台与在线入口仍未验。临时测试profile不含用户数据，不触碰旧QE资料。

## 封存证据

| 实际运行 | 终态 | 边界 |
| --- | --- | --- |
| prototype-delivery-schema-validated-final.log | 24/24，146472.5319ms，exit0 | host生成/消费Zod、14种Service/stdio等待场景、2兼容/严格入口场景、8helper。此为最终raw枚举修正前结果 |
| prototype-delivery-enumeration-regression.log | 22/22，1751.3522ms，exit0 | raw/normalized修正后9helper与13已有quality；编码字面量不得二次解码误阻断，comments/script正文/CSS字符串不误作加载 |
| prototype-delivery-after-enumeration-current.log | 1/1，20109.1603ms，exit0 | 最后源码的真实Service→stdio发送完整五文件，同snapshot ZIP每文件hash一致 |
| prototype-delivery-existing-regression.log | 70/70，59767.676ms，exit0 | raw修正前已有artifact/快照/草稿归属/任务交付/Pi定向回归；其中quality另有最后源码13项复验 |
| prototype-delivery-typecheck-seal.log | tsc node --noEmit exit0 | 没有编译/打包输出 |

不合并以上重叠用例为一个虚构总数。初始23/23组合包含已废弃latest-only约束，第二24/24组合尚无connectionHash实际schema校验，分别保留但不替代最终契约证据。核对网络绑定本来为hash+换行+grantrevision；现新宿主记录使用其SHA256，满足64hex schema。生成及消费完整binding实际Zod parse，坏hash拒绝不发送。schema canonical只排序object key，保持值、array顺序与严格实际工具名称。

最终证据 `evidence-v2/` 保存每个模式原manifest、完整expectedArgs、服务器实收args与实际状态。current和report_same_version为一次；资源改/添/删、来源、必检合同、schema、读撤权、禁连接、人审持久证据缺失、late unknown、args改动为零；lost一次并持久unknown，观察期无重试。删除人审记录模拟持久证据缺失，不能称已实现用户撤回按钮。浏览器在该Service测试仍明确fixture-only。

10文件补丁 `prototype-multifile-candidate.patch`，SHA256 `0167d4253fd798f4a141b76365080246343247495037bb305ec52c6942d0e89f`；原/新hash分别见 `patch-original-hashes.json`、`final-hashes.json`，运行/限制/证据hash见 `candidate-manifest.json`。封存时5个既有文件原hash与根对应文件全部相等；git apply --check exit0，仅检查未应用。

变化文件：shared/prototype-delivery.ts、main/prototype-delivery.ts、shared/types.ts、main/agent.ts、main/service.ts、main/main.ts、main/quality.ts、tests/prototype-delivery.test.ts、tests/prototype-delivery-service.test.ts、tests/prototype-delivery-stdio-fixture.mjs。

quality复用差异仅将既有HTML标签/内联style/style正文的同一资源枚举提取。每项保留raw与normalized；checkHtml继续走raw做原一次解码，single文件判定用normalized。没有JS执行、完整依赖闭包或来源权限提升。其他静态检查逻辑保留。

小型payload已完整持久在现有提案JSON中，避免重复创建第二个快照存储框架；审批与真实send重取当前snapshot并逐字节对照。大包或directory/upload真实codec将另需受控封存目录/产物接口，不因本批内联file-list得出通用大包发布完成。

定向命令：候选cwd设置TEMP/TMP至candidate/temp，`node --import tsx --test --test-reporter=tap tests/prototype-delivery.test.ts tests/prototype-delivery-service.test.ts`；最后枚举修正后仅helper+quality及Service current复验。node_modules只读junction复用现有包，没有安装、root全量或build。

## 复用调研

2026-10-11 读取 pi.dev/packages?name=mcp 与官方npm。继续使用已锁定 pi-mcp-adapter 5.1.0 / MIT / Node >=20；官方 last-month 1,608,890，区间2026-09-10至2026-10-09，为滚动期下载次数，不是自然月或用户数。复用现有Pi调用hook和宿主快照/ZIP；没有安装或更换依赖。精确返回保存在候选 pi-prototype-publishing-reuse.json。

## 后续未覆盖

真实远端provider codec/tool schema、目标账号/权限与线上所有资源/业务流程验证；React/Vite受控构建、源/配置/锁文件与可信构建回执的版本绑定；大于现有100KB MCP参数限额的上传协议。此批原生静态小项目链不能代替这些目标。

通俗说明：这一批先保证发布前确认的是整份网页文件，而不是只检查一个HTML。还没有可用的真实发布服务，所以本机收到完整文件不等于网站已经上线。

## 当前根集成窗口（2026-10-11）

父审后的最终整合候选为 `.test-data/prototype-publish-integration-2e790c2a3ce6423cbdc4168cca559e2e`，补丁 SHA256 `1717343c8530eaf700ecbc0be77ce03ad20c4a4adcfd972d600b9be74ff7300c`。上述早期隔离记录保留，不替换为当前根结果。

已核全部十文件封存hash，按局部patch合根，五个新文件为create-only。原Service安全诊断与单文本末次读取后同步fence保留；agent设备权限说明独立增量准确合并。实际Service `82acbf85992072f01ae3dc12e81d3388957f3595c81a8d3d0ac84061ceed7af9` 与封存候选仅行尾差异；agent `d43adfec8ff42294bffe6e19896c0b351af0417573b6e9dacc25a0e68002be8a` 额外保留已批准设备说明。完整原/候选/实际hash及逐字规范化比对见 `.test-data/production-multifile-root-integration-20261011/integration.json`。

根 `npm run check` 已exit0；相关专项session90904已实际poll确认exit0，55/55通过（TAP 270529.8267ms），终态见同目录targeted.log/checks-result.json。覆盖新manifest/codec、Service真实stdio、原单文本fence及TaskDelivery/quality回归。当前没有本窗口全量或构建；原dist对应上一冻结批次，不能用它宣称新多文件主进程完成。当前生产codec registry保持空，无真实发布provider、账号或新的用户权限配置；完整静态项目范围及正式桌面正/负向链仍待当前built版本验证。

对应流程源迁入 [prototype-multifile-publish-binding-2026-10-11.mmd](diagrams/prototype-multifile-publish-binding-2026-10-11.mmd)，保留所有await之后的最终同步重验与unknown不重放边界。原候选的浏览器夹具和显式状态持久API不能代替实际桌面自动Operation状态写入或进程崩溃恢复。

另有父审封存的隔离真实桌面组合：`.test-data/prototype-ipc-composition-242c09c0b99d42559660994e7f0793b4/candidate-manifest.json`（SHA `4274d66ba2d73a314173dd2807af2b83dfbc77aeae5fadd0b8bb99743a546d4c`）。默认main真实IPC空registry拒绝、零catalog/call；仅testmain注入fixture codec的版本复用生产handler，current五文件原字节匹配且Operation自动succeeded；lost实际收到一次后失联，Operation自动unknown。整Electron关闭、同profile重开后unknown保留，再批准被RUN_REQUIRES_RECONCILIATION拒绝，实收仍1。证据位于该目录`.test-data/execution-437e68c6-4fd6-4cb5-9f43-c2798563c5fd/`的result、five-file-byte-equality及closed-profile-readonly-audit。此处三场景是独立隔离版本，不能冒称当前root built、真实远端发布或真人验收；实际操作者为Agent，测试actor:user仅为产品核对API身份。

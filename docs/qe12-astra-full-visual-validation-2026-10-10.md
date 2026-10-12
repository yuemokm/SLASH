# QE12 Astra 全七项视觉修订与逐轮验收

## 最新有限修订：七项界面检查通过，正式审查仍需核对

2026-10-10，新独立case为 `.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4`。输入沿用上一轮736495…保留稿，仅修V3编码提示与V4静态批注，不重做页面。Run `f3911bf0-7a83-4155-ab52-f8e1bc4a8120` 一次正式send后**264.665秒自然succeeded**（北京时间02:49:33.180至02:53:57.845），取消0、`repairRounds=0`。正式[终态](../.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4/terminal.json)仍为 `acceptance=needs_human`、`businessCoverage=unverified`，自然结束不等于机器宣称全部质量通过。

最终pending为 `9b8809b7-c7da-4235-98c1-885b9d4b9b19`，22,001字符，SHA-256 **`bae4d668d9de3ba3edadda219c48184f4bc370d5b204ae9f006ae3731017d016`**。[静态支持审计](../.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4/static-root-support-audit.json)核对：原40个ID各一次且顺序不变，一份script逐字不变，未新增事件属性/javascript URL；57个控件及option的属性、文本与父级不变，所有动态`.err`及`carrier-hint`原文和父级不变，CSS逐字不变，原说明段落完整保留。V3旁提示现在明确“真实编码分配时机待核对；此处为本地演示。”，原literal仍在说明；V4两处业务对象括注与GPS接口待确认集中进入现有说明，定位操作旁仍明确本地模拟。未修改业务JS、PRD、约束或来源原件。

正式宿主当前稿的3例/4步渲染检查和冻结9例/88步回归分别实际通过，报告为 `2a3d5b0e-6801-493a-861b-e53f63c52eb0`、`be89780f-cfbd-49c5-aa67-5df3e5a3903c`，均绑定bae4d668…；未以减少用例规避单批上限。独立编译版零云[最终QA](../.test-data/qe12-astra-visual-v3-v4-20261010/qa-after-revision-U53JSo/report.json) **23例/202步全过**：原15/150、六状态6/22、正确说明折叠2/30分开计数。runner为v6，活动浏览器0；此为新稿新报告，旧23/202失败证据没有重写。

主代理实际看八张当前稿PNG（桌面/手机初始、定位后、重复阻断，及说明再展开末图）并复核SHA-256，记录为[七项限定视觉检查](../.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4/root-visual-final-review.json)：**V1—V7均passed，限冻结七项界面改进及本次状态证据，`humanConfirmed=false`**。手机定位placeholder将“编辑”跨行，主代理确认完整可读、无截断，实际定位结果完整，记为非阻断观察；保留模型原意见，不提升正式TaskAcceptance状态。

正式[内容与视觉回执](../.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4/task-acceptance.json)均实际执行且版本current。内容审查37.232秒、completed/unverified、零findings，但仅提供16,000/22,001字符、没有已读取来源，未声明cross_artifact_consistency覆盖，不能证明完整资料事实正确。视觉审查30.199秒、completed/needs_human，实际三图为1440×900 `host:render`、390×844 `host:control-usability:390`、1440×900 `repair-duplicate-blocked`；三张PNG的实际hash、bytes、稿件hash及changeId经静态审计核验。另六图未纳入有界模型审查。模型提出上述手机placeholder的medium legibility候选，`repairEligible=false`，未自动修稿；本轮**没有“图审意见→自动修正→新图审”证据**。

应用已正常关闭、保护清单unchanged。旧隔离交付helper因ESM入口顶层等待Electron ready而未启动完成，根代理核对自有进程后停止；保留startup-abort证据，旧尝试没有新执行、apply或export，不能归因产品交付失败。随后v2改为异步child入口并记录分阶段诊断，主代理重跑退出0：[同版本隔离交付回执](../.test-data/qe12-astra-visual-v3-v4-20261010/case-VISUAL-V3-V4/isolated-delivery-v2-result.json)为 **`passed_isolated_same_version_delivery`**。在本case隔离profile与workspace中完成pending核对、apply、版本历史核对、应用后9项冻结回归、同hash导出及旧版本拒绝；云调用0、新模型Run0。1962项检查多数是保护hash断言，不能称为1962项业务测试。输出为 `workspace/成果/交付/QE12-完整视觉修订.html`，hash仍为bae4d668…；未覆盖真实用户profile、原件或历史失败记录，正式needs_human与humanConfirmed=false保留。

通俗说：这一稿剩余两处说明问题已修好，原操作和折叠功能都通过了新检查，也已在独立测试目录保存并导出同一版本。但用户最新指出整体实用性与设计感仍不足；七项限定检查通过不代表达到新的“可用以上”质量目标。后续需评价主要任务、页面布局与操作效率，并优化Agent生成和审查方式，不能只继续修零散文案。

流程源：[qe12-astra-full-visual-validation-2026-10-10.mmd](qe12-astra-full-visual-validation-2026-10-10.mmd)。以下保留前两轮的真实失败、部分完成及未交付记录。

## 历史首轮：局部草稿，未完成交付

2026-10-10。关联 QE12 / 真实原型视觉与交互质量目标。**本轮保留了一份局部修改的 pending 草稿，完整七项目标未完成。** 原业务回归15例/150步通过，最终六个状态截图22步通过；主代理实际看图后判定V1/V3/V5通过、V6部分完成、V2/V4/V7失败。Run达到预先冻结的600秒测试上限后由宿主取消；未apply、未export，不是完整视觉闭环验收通过。

通俗说：页面的手机状态、编码提示和定位阅读有所改善，原交互也保住了；但长说明、来源收纳和重复弹窗措辞还没做好。因此保留草稿和证据，没有把半成品当作完成稿交付。

## 输入、配置与保护

新独立case为 `.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED`，复用旧VISUAL-STAGED正式Electron/IPC/Pi驱动。保留完整七项目标、同Run A→B小批精确编辑、业务脚本逐字不变、三份来源原件/PRD/约束对照只读，不用SFA按钮尺寸修订替代此任务。

原HTML为重复阻断已修的最新QE12稿，19,192字符，SHA-256 `f966a552213bfbaf64a843637a2db4f31240c2b7ebed2f2c6a5769cd65e6996b`。PRD为6,653字符，hash `83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36`；约束对照为3,057字符，hash `25f9d1f574af0a0f95d948a24865f1f7ca7205628528b3dea07e893dc3ca0ca1`。原before/after业务QA15/150及七项视觉清单逐字保留。

从正式用户profile只读绑定已验证的Wangshu `gpt-6-astra`，条目 `cbfc4c25-c0f2-460e-99fa-4cd62e7a0553`、`openai-responses`、`https://wangshu-api.com/v1`、既有 `http://127.0.0.1:7897` 代理、`supportsVision=true`。运行时仅复制所选加密条目及Local State，没有读取认证txt明文或修改真实用户配置；此前PRD/SFA用的最小来源profile仍保持其冻结输入。看图能力依据见[正式模型验证](wangshu-astra-validation-2026-10-10.md)，能力确认不等于本任务实际收到图片。

发送前正式Save+Required保留原6例/77步，末尾追加手机初始、手机原模拟定位、桌面同店阻断三例/11步，合计9/88，不替换、不重排原例。独立最终QA保留原15/150，再追加桌面1440×900、手机390×844各初始/定位后/阻断弹窗六状态22步。冻结时959项保护和主代理指定四个dist hash一致。准备记录见[READY.json](../.test-data/qe12-astra-visual-staged-20261010/READY.json)及[执行说明](../.test-data/qe12-astra-visual-staged-20261010/README.md)。

## 实际运行与草稿差异

Run `fd3b7557-9fea-436e-8540-c7208d05b7a4`，北京时间01:31:28.474开始、01:41:29.144结束，**600.670秒、cancelled**。一次正式send、一次官方cancel，取消IPC已确认；没有续发、第二Run或测试超时后重发。600秒是本次既有测试观察上限，不是产品默认30分钟限制，也不是供应商自然输出上限中断。一次send可以包含多次Pi模型请求，本报告不将其称为单次云HTTP。

实际模型路线固定Astra，无fallback；运行回执为thinking off、端点能力未验证，兼容contextWindow65536/maxTokens12000，不把兼容值当作上游真实最大能力。全局frontend-design确实于01:31:47.255加载，9,363字符、正文hash `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3`；安装或加载本身不证明制作完成。

两次 `edit_draft` 均已成功：01:34:19.375及01:38:47.330。首次观察到的中间稿hash为 `227a585526f462af305e5e4487a6a43e547a1249f3c41adbba27a7619af3f522`；最终21,530字符，增加2,338字符，hash为 **`ee5bf320509e23d2fcd502fc3d099cfd8b744ff1bea37a959a14d9de64bd6249`**。同一changeId `5b1237e2-f7ea-40c4-8018-a8359c0434ea`，仍pending。仅一个HTML目标、scope有效，原40个ID全部保留且各一次；一份script标签全文逐字不变，未新增事件属性或javascript URL。

源码差异包括：状态改为纵向分组、badge不逐字换行；编码去必填星号并显示“系统生成，无需填写”，旧说明留在原生details；定位input改为同ID/readonly的textarea；增加手机断点、单列控件和多行定位；提交动作移到基础信息之后，并分出选填补充。顶部长声明和来源技术批注仍在普通界面，重复弹窗“经现场确认”仍保留，不能把A阶段局部修改记为七项全部完成。具体见[diff-1.json](../.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED/diff-1.json)、[最终pending](../.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED/pending-1.html)、[实际安全审计](../.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED/actual-run-safe-audit.json)。

终态列出22条持久操作记录：read_draft成功5、edit_draft成功2、edit_draft_diff成功2、load_tool_group成功2、load_skill成功1、check_task_acceptance成功1、run_prototype_acceptance成功1、task_acceptance成功1、get_prototype_acceptance失败2；另有索引/规则/技能发现及compaction executing/succeeded记录。该数量是操作行数，**不包含所有网关前参数拒绝**，不能当作全部模型工具调用或全部成功次数。本轮20次get_task_acceptance Zod拒绝及2次当前artifact查询失败由另一专项独立诊断，原因/修复结论待补，不据此猜测模型或供应商根因。

## 图审未实际启动

正式[TaskAcceptance回执](../.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED/task-acceptance.json)明确 `visualReviewRequired=true`、`visualReviewNotice=截图视觉审查尚未执行，具体DOM通过不代表视觉通过`。没有 `visualReview` receipt，SQLite该Run的 `visual_review` 操作为0，`repairRounds=0`。**没有本任务实际送审图片列表，也没有“视觉意见→自动修稿→新图审”证据。**

原因有直接控制流证据：正式Service只在初始 `session.prompt` 正常结束、取消检查及运行成功检查通过之后，进入最终自动验收→内容审查→视觉审查循环。本轮600秒取消发生于生成期间，随后取消检查退出；`generationFinishedAt=01:41:29.071` 是prompt的finally在中止时记录，不证明模型自然完成。不能把“模型已支持视觉”或浏览器确有截图解释为已调用 `reviewContent`。

模型中途手动调用验收，留下报告 `47145596-3a90-45ee-9e0d-2e02a41fcf5e`（01:37:02.806），对应中间hash227a585…；第二次编辑后，该报告相对最终pending变为stale，status/automaticStatus仍unverified。只读用当前正式选择函数重放这份历史浏览器证据，会选：

| 可选历史图片 | CSS视口 | 身份范围 |
|---|---|---|
| repair-duplicate-blocked | 1440×900 | 中间稿227a585… |
| visual-initial-mobile | 390×844 | 中间稿227a585… |
| repair-duplicate-return-retry | 1440×900 | 中间稿227a585… |

其余6张独立图片省略。这只是**选择函数重放**，三张均未实际送审，也不能给最终ee5bf320…提供当前视觉证据。选图多视口修复本身的真实持久报告重放与17项测试见[截图选择证据](prototype-screenshot-selection-2026-10-09.md)，不是本轮真实云图审完成证明。

## 最终同稿业务QA与主代理看图

最终独立零云QA目录 `.test-data/qe12-astra-visual-staged-20261010/qa-after-revision-lQqqIX`，全部绑定最终ee5bf320…：**原15例/150步全过、追加六状态22步全过，合计21/172**。runner为 `electron-snapshot-cdp-v5`，activeBrowserCount0，960项保护unchanged。上述状态用例证明真实动作执行与截图取得，不证明视觉、美学或全部业务规则正确。前稿基线同为21/172全过，两批为不同稿，不能相加作独立质量通过数量。

主代理逐张查看六张最终PNG并复核SHA-256，按云前七项清单给出[独立看图记录](../.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED/root-visual-final-review.json)，`status=partial_not_deliverable`、`humanConfirmed=false`：

| 项目 | 实际判断 | 保留的限制 |
|---|---|---|
| V1 手机转换状态 | passed | 390px完整独立一行，桌面清晰；仅本次状态证据 |
| V2 短模拟提示/折叠详情 | failed | 顶部长模拟声明仍展开 |
| V3 编码系统信息 | passed | 无必填星号、旧说明保留、readonly/ID与原业务QA通过；未另测点击details展开 |
| V4 来源/技术批注收纳 | failed | 03-D2/D3/D5/D7等仍散布普通表单，未完成统一收纳；未删除 |
| V5 定位长地址 | passed | 原模拟定位后390px完整地址/经纬度分行可读，ID及脚本保持 |
| V6 必填/选填/主动作层级 | partial | 分区与主提交改善；完整折叠收纳未完成，details展开未单独验收 |
| V7 本地模拟与重复弹窗消歧 | failed | 模拟提示保留，但仍有无真实来源支持的“经现场确认” |

实际图片为 `visual-initial-{desktop,mobile}.png`、`visual-location-{desktop,mobile}.png`、`visual-duplicate-{desktop,mobile}.png`，位于上述最终QA目录；每项看图记录绑定对应PNG哈希，安全审计再次对实际文件哈希核对。此判断来自主代理，**不是人类用户批准**，也不提升机器TaskAcceptance为passed。

## 准确命令与交付边界

实际运行的主要命令：

```powershell
npx tsx .test-data/qe12-astra-visual-staged-20261010/offline-adapter-check.ts
node .test-data/qe12-astra-visual-staged-20261010/run-zero-cloud-baseline.mjs --root-approved-zero-cloud
node .test-data/qe12-astra-visual-staged-20261010/start-task-location.mjs --execute-once --allow-cloud --reviewed-by-root --case-dir E:/code/slash/.test-data/qe12-astra-visual-staged-20261010/case-VISUAL-STAGED
node .test-data/qe12-astra-visual-staged-20261010/run-local-regression.mjs --root-reviewed-case-diff
```

离线adapter6项通过；前稿21/172通过；真实云运行600.670秒cancelled，局部pending；后稿21/172通过。主代理统一check、17文件124项定向回归及正常build已通过，属于发送前代码集成证据，不代表本云Run成功。没有再次build、打包、发送云任务或自动续发。

原应用于01:43:30.259正常关闭，`app-close-proof.json`记protection unchanged、send1、Run1、重发0。本轮未执行 `verify-isolated-delivery.mjs`；它要求成功终态及七项全passed，本次两项前置条件均不满足。未apply、未export、未覆盖用户成果，原件、正式seed、PRD/对照和历史保留。原型整体视觉质量、真实截图反馈自动修正与同版本完整交付仍未完成；下一步应依据实际工具拒绝诊断与未完成三项/部分层级处理，不靠延长观察、降低七项门槛或把pending当完成稿。

## Responses兼容修复后的真实续作（2026-10-10）

续作复用上一轮ee5bf320…部分稿；不是从零任务。Run `d044924e-cf00-4630-a145-2563eda53394` 一次发送后523.519秒自然完成，没有取消或续发。Astra实际12次工具调用中10成功、2次精确编辑匹配失败后恢复；任务查询以`{section:"summary",limit:10}`省略无关参数成功，未再出现旧版20次参数拒绝。四次草稿读取及四次成功编辑使用真实hash/归属回执，但模型未主动调用原型验收，因此模型复制owner用于该工具仍未覆盖。

最终pending为`7364956246b0c80a1cdd571df062719783fe86f4fd60b4730bb6913c4c17f7b9`、21,985字符。原40个ID和全部业务JS保留；短提示、说明收纳及本地模拟弹窗已有实际改善。原15例150步及六状态22步通过。新增说明展开桌面/手机2例30步在各自第2步失败，仅4步实际通过，点击展开尚未执行；原报告保持23例中21通过、202步中176通过，不能改记全部通过。

发现两项程序问题：浏览器检查只用矩形/样式，误判原生关闭details的正文可见；宿主3项渲染检查又拼接冻结9项回归，超过单批10项限制。冻结9/88本身通过，合并渲染检查未验证。另有新说明测试将原合写`03-D5/D7`错误要求为连续`03-D7`，属于尚未执行到的独立夹具定位问题，不能用它解释第2步失败。上述问题正在分别修复，历史失败不覆盖。

主代理查看六张最终桌面/手机PNG并绑定文件hash：[独立看图记录](../.test-data/qe12-astra-visual-continuation-20261010/case-VISUAL-CONTINUATION/root-visual-final-review.json)。V1/V5/V7通过；V2/V6部分；V3/V4失败。V3新增了未限定的“提交后自动生成，前端不展示”事实提示，不能推断真实分配时机；V4两处业务对象标签及接口待确认说明仍未集中。完整标准未降低。

内容审查真实完成102.291秒，当前版本回执校验通过，发现上述编码语义1条高置信风险但明确record_only，不进入自动修稿。视觉审查真实完成47.334秒，仅接收3张当前截图（桌面阻断、手机初始、桌面返回重试），另6张未覆盖；0发现仍为unverified。`repairRounds=0`，未证明“图审反馈→自动修订→新图审”闭环。检查操作成功不等于内容或整体质量通过。

证据目录：`.test-data/qe12-astra-visual-continuation-20261010/case-VISUAL-CONTINUATION`；最终QA：`qa-after-revision-mLU9fm`。应用正常关闭、保护清单unchanged，没有apply/export或覆盖用户成果。源码冻结在该应用关闭及并行QE05结束后解除，后续检查修复须另建新证据，不能追溯更改本次结果。

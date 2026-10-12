# G4/G5 · 生产评测汇总与完整试次采证

状态：领域schema、离线汇总、运行前start和每轮结束step采证已写入，既有runner已接入可选 `--production-trial`。首版机制测试9/9及node类型检查通过；原日志 `.test-data/production-agent-evaluation-20261011.log` 保留。第二轮统一check/test/build与桌面集成完成后，新增finally失败采证及独立关键门槛反例，定向13/13通过（39,649ms），runner/trial两脚本语法检查通过；新日志 `.test-data/production-agent-evaluation-finally-20261011.log`。完成后collector独立入口亦已实现，先4/4机制验证，随后新增第二实例关闭失败反例，最终collector5项+cleanup4项共9/9通过（3,362ms），最新日志 `.test-data/production-agent-collector-final-commit-20261011.log`；全部入口再次冻结供云manifest准备。真实桌面保存→独立重开→正式导出闭环仍待验证；不能把本说明或机制夹具当作48次真实业务验收完成。未执行新的云任务或计费请求。

冻结源码快照为 `.test-data/production-agent-evaluation-sourcehashes-20261011.json`，含新领域/schema、两份采证/汇总脚本、现runner及专属测试实际SHA-256。

finally修补版本另存 `.test-data/production-agent-evaluation-finally-sourcehashes-20261011.json`，未覆盖首版快照；collector初版另存 `.test-data/production-agent-collector-sourcehashes-20261011.json`，最终提交修补版本另存 `.test-data/production-agent-collector-final-sourcehashes-20261011.json`。

## 复用边界

继续使用 `shared/quality-evaluation.ts` 的16例、独立预期及 `evaluateBenchmark`，使用 `main/quality-evaluation.ts` 的实际文件SHA-256和受限路径核验。原prepare、run、review执行器及基准不改写。新索引仅记录轮次1/2/3对应的既有隔离目录，结果固定生成QE01—QE16各3次共48项；缺目录、缺成果、失败和blocked都保留位置。

硬门槛为至少44/48完整通过，并且QE05/QE12/QE16的9次全部通过。只记录execution.generated不能算业务通过。汇总再次核验原件、副本、提取文本、真实prompt文件、成果快照及独立人工/浏览器/运行证据hash，并按原check重算；不能修改基准、缩分母、选择有利轮次或把未知算满足。

三个轮次核对相同运行版本、相同业务输入、相同模型路由与配置。提示中的两个官方临时mount UUID可按生成器固定头部规范化，其余正文必须一致。模型参数unknown不能因为三轮都unknown就称已固定版本。费用未知单列，不作为业务完成率失败原因。

## 新采证适配器契约

`scripts/production-agent-trial.mjs` 已导出 `startProductionTrial`、`captureProductionTrialStep` 和 `collectProductionTrial`，接受既有执行器的官方IPC调用函数与隔离实例关闭/重开函数。运行前start独占落盘，随后每个实际Run完成后、失败throw之前保存step；失败也保留实际运行身份。有效参数来自原Run请求诊断，`absent`表示宿主已观察到省略；原生payload未提供输出上限时记录 `provider_default_observed_omission`，不能用设置上限填成实发值。

独立完成后入口为 `scripts/production-agent-collect.mjs`：

```text
node --import tsx scripts/production-agent-collect.mjs --test-dir <隔离轮次目录> --case QE05
```

QE12、QE16使用同入口，只改case。一个profile必须只有一个进程拥有：先检查execution确已finished且无关闭错误、SQL与官方state无活动Run、当前实际dist hash一致，并获取独占owner锁；既有Run结束并关闭实例后才开始采证，首次读取保存内容后必须等待旧实例完全关闭，再启动同profile的新实例。只进行state/read/versions及官方本地copy导出，不发send、resume或云请求，不读取供应商密钥或修改模型配置。正式copy继续走原TaskDelivery门禁，没有核对完成时明确拒绝，collector不会替用户填写确认。

每次尝试独占保存 `production-collector-attempt-<UUID>.json`，保留原原因与实例身份，原execution/result不覆盖。读/重开/导出后先写 `production-trial-pending-<UUID>.json` 候选；第二实例关闭成功、durable准备记录写入且owner清理完成后才独占提交最终 `production-trial.json`。准备记录状态为ready_to_commit，只有最终文件真实存在才表示提交；提交失败另留失败回执。第二关闭失败则没有最终trial，保留候选与failed attempt，关闭持续失败时保留owner锁。旧成功文件始终不删不覆盖。

collector专项5项通过：完整读/版本/导出hash回调、关闭完成后才重开、活动Run与并发owner在启动前拒绝、门禁失败保留回执、缺已结束回执拒绝及关闭失败保留锁、第二实例关闭失败不提交最终trial。部分测试同时覆盖多个条件。回调及观察是机制夹具，真实Electron collector未由此验收；baseline负责实际任务和业务核对，采证只在其关闭profile后进行。

正常terminal失败保存step；轮询观察超时或unexpected approval异常先于step保存时，finally已通过 `captureUnfinishedProductionStep` 补采证：保留原异常，取消失败单独记证；对已创建但缺step的Run有界读取官方真实状态，仍未终态时保留running/waiting及未知结束时间，不补造完成记录。单次取消/读取亦有截止时间；请求不响应或宿主信息不完整仍保持unknown。定向超时、approval、取消失败和不响应4项反例已通过，写入新日志，未覆盖首版9例证据。

1. 读取execution回执，定位实际Run与末轮成果；通过官方read与versions核对已保存字节及版本，不自动apply未知草稿。
2. 记录实际独立实例身份，关闭并用同一隔离profile重新启动；再次读取成果和版本，与保存快照逐项比对。仅刷新同一个页面不能称重开。
3. 通过官方export请求导出copy，沿用真实交付门禁。隔离测试实例的保存对话框仅选择新建采证目录；不跳过TaskDelivery或DOM/版本门禁，不代替用户确认业务。核对导出字节与对应成果hash，并保存IPC回执。
4. 记录实际运行时文件版本、当前公共模型路由配置及原Run的思考配置；不读取或输出密钥。参数缺失保持unknown，不能由采证时间的模型设置冒充历史运行配置。

首稿定义优先采用“官方宿主首次创建该Run成果草稿的createdAt，相对Run.startedAt”，依据真实ChangeSet及Operation/Checkpoint记录；这表示首份可保存草稿出现时间，不是完成验收时间。Operation.createdAt若仅表示派发开始，不能冒充写入完成。没有对应真实时间记录保持unknown。人工修正次数需要单独计数记录；供应商费用必须有账单/计费依据文件，不能从token数、宣传价或耗时推算真实费用。

采证只新增独立文件，`production-trial.json`独占创建，不覆盖旧execution/result/observations、失败尝试、原件或基准。失败保留采证尝试及原因。QE02允许研究回复：无正式文件时需核对回复在独立重开实例仍存在；保存/导出要求按既有requiresSavedArtifact契约明确不适用，不替造文件。

## 待完成的专项验证

首版9项机制测试覆盖：48空槽分母不变、48完整文件夹具、4个非关键失败仍为44/48且关键9/9、再增加关键失败降为43/48并拒绝、generated/模型自报不能替代独立观察、实际prompt/成果/原件/证据变化拒绝、事后补start拒绝、失败尝试的真实模型参数变化仍破坏可比性、费用无账单保持unknown但不改业务完成率、官方只读start/失败step及独占文件保留。43/48已经低于总分门槛，这一拒绝只能证明总分门槛，不能独立证明关键项门槛生效。夹具是真实本地文件和宿主Run记录，业务观察本身是机制合成数据。

随后新增精确条件：仅QE05一次失败，其余47完整通过，汇总verified=47、critical.verified=8、comparable=true且releaseGatePassed=false，已独立证明关键9/9硬门槛不能被总分覆盖。原首版日志未改，精确条件与新增cleanup4项合计13/13记录在finally新日志。

尚需补：完整collector的真实桌面闭环、所有已运行失败槽的输入一致性、汇总器版本证据内容绑定，以及性能目标达成情况的实测分列。费用与缺首稿时间仍单列unknown，不伪称零费用或性能达标。

独立保留集优先从既有已授权资料中选择未参与调参的样本并冻结独立预期，没有合适资料时再请求补充。先记录已有授权路径中的候选及与门店基准的重合风险，再决定是否适用；当前不扩大资料云发送范围、不擅造资料、不将已有门店样例另存一份冒充独立泛化测试。48次是小样本发布门槛，不是生产成功率统计保证。

## 既有授权资料中的候选

已只读列出 `E:/code/slash test/资源/参考资料` 并重新计算下列原件hash；没有复制/修改原件或新增云发送。业务域判断目前基于文件名，完整预期尚未冻结。

| 候选 | 实际原件SHA-256 | 与当前门店基准的重合风险 |
| --- | --- | --- |
| 考勤流程设计V2.0.docx | `851961abf90af6b3336baf3034663fbaa9927782eeae571b05f917dccdc43786` | 考勤流程看起来不同于机会门店，但同一SFA项目的人员/角色和流程约定可能重合；还需核对实际正文 |
| 考勤管理流程v1.0.docx | `acd579d3cbf6ebbe980021cc7dfd8844c99d2b55b3a01c4b20d2c1801a7931c5` | 可做流程版本冲突/边界样本，不能仅凭v2/v1编号认定新版本有效；需独立业务预期 |
| 导购销量目标与上报V1.0.docx | `76c417899dbca7e6bee3c4966f31445566528428eb95a1ee94c8ce8459d63001` | 销量上报与门店创建不同，但人员/门店关联可能复用旧规则；需排查历史真实任务是否已调参 |
| 导购行为SOP-前置边界.docx | `cd4646ef8b3c3b77f1704086ada927b9ba129baebbef46c066289f649ed5d41a` | 前置边界可能适合规则研究，仍需与既有导购任务来源回执核对 |
| 字段梳理/07 产品主数据.xlsx | `24542b3b96f60477b652d69f5b4a62a1259af76509ec305475763484bea1036b` | 产品对象区别于网点，能测试不套用网点字段；相同主数据表头/模板可能降低独立性 |

历史 `.test-data/office-corpus-2026-10-04T22-57-25-731Z/report.json` 已记录考勤v2、导购销量及产品字段表的提取；`evidence-search-corpus-2026-10-04T22-55-34.156Z/original-search-report.json` 出现产品字段表。因此它们不是“从未打开”的新资料。现有16例prepare仅用新增终端流程、门店制度和05网点表，但“未参与这16例”不等于“从未用于其它调参”。后续应按实际Run sourceRead与调参记录复核，再决定独立保留资格；没有合格候选时再请求补充。

进一步只读核对已保存quality-evaluation目录内9份execution：实际step.sourceReadEvidence去重仅出现05网点表提取、门店制度提取、新增终端流程提取以及QE16/约束对照.md，没有发现上述候选。两个pm-operations-real历史manifest明确使用synthetic-sources，并非本批原业务资料。这说明在本次已检查的这些任务中未发现候选参与，不能证明所有历史任务都未使用。当前可优先考虑07产品主数据作对象迁移挑战，但同项目表头和公共技能的先前暴露仍需标明；独立预期应从其实际正文冻结，不能复用网点JHWD/名称50规则作为产品答案。

产品品牌H01的实际正文、独立输入与单元格预期已另存 `docs/production-agent-holdout-2026-10-11.md`；原件只读重提取核对，不启动云任务，也不替换既有48槽。

## 完整48次汇总的下一轮最小修补设计

本段为2026-10-11冻结期间只读设计，没有修改源码、脚本、测试或执行检查。当前三项真实任务可运行已冻结采证入口；以下修补需在其结束后另约源码窗口，不能在同批云任务之间更新scripts/tests。旧回执、候选、失败尝试及原预期均保留。

| 缺口 | 最小代码落点及复用 | 待执行的真实验收反例 |
| --- | --- | --- |
| 失败/blocked槽遗漏输入比较 | `main/production-agent-evaluation.ts::trial` 在任何失败/unknown提前return前，复用来源实际hash、prepared完整prompts/checks及 `verifyFile/comparablePrompt` 核实输入。区分完整计划输入hash与实际已发送的逐step prompt hash；失败只执行前1步时不能用1项数组与成功3项数组硬比。已运行但实际prompt缺失必须使可比性unknown；失败原因和failed状态保留。`summarizeProductionEvaluation` 的输入冲突分支也应像身份冲突分支一样只将verified降为blocked，不能把原failed改写成blocked。必要时只扩展专属summary类型，不改基准或执行底座。 | 真实隔离Run失败后，把prompt正文改变并同步修改回执文件hash：另两轮成功也不得掩盖差异。失败Run的prompt文件缺失时不得称可比；第一步真实失败、其余轮次三步且共同第一步相同，不得误报“输入不一致”。同一异常须保留原失败原因、48分母及回归项。 |
| versions文件只有hash，没有内容/对象绑定 | `main/production-agent-evaluation.ts::trial` 在 `verifyFile(versionsEvidence)` 后解析既有JSON `{mountId,path,contentHash,versions}`；对照receipt末轮 `after.path/relative/versions`、官方IPC返回以及受限profile mounts，建立唯一的mount+相对路径映射，要求所有末轮成果逐个覆盖。复用 `main/artifacts.ts::listFileVersions` 与 `VersionSummary`；官方 `id=current,runId=null` 合法，不能强制当前版本带Run ID。collector目前按hash找首个snapshot，下一窗口改为末轮step+实际文件身份唯一匹配，并把同一身份写入IPC证据；不能凭两个文件字节相同合并成一份。新专属字段仅在无法由既有证据唯一推导时添加，歧义旧记录保持unknown。 | 真实保存A/B两个同字节文件：只留下A的版本/重开/导出证据，必须拒绝完整trial。把版本JSON改为空数组、别的mount/path、旧current hash，再重新计算其文件hash，均不得通过。正常官方current的runId=null必须通过；历史before快照不能冒充本次current。 |
| 性能目标只有measurement数量 | 复用 `Run.startedAt/finishedAt/generationDurationMs`、Change.createdAt、step的真实firstDraft、runner的elapsed及collector attempt.finishedAt；在专属schema/离线汇总添加定义、实测值、unknown数量和目标命中数，CLI只展示结果。不把运行时间当完整人工核对/重开导出时间，不以人工等待扣除后数字冒充全程。方案目标是九成任务10分钟内有可运行草稿（600000ms）；先冻结“可运行”的逐类证据口径，再按固定48槽列命中/未命中/unknown，至少44次命中才可声称达到九成。30分钟宿主上限继续保留；完成耗时、人工修正、真实账单费用独立列，不新增未批准的性能/费用目标。 | 真实2分钟创建空壳、12分钟增量修好：不能用原createdAt把后来hash算作2分钟可运行。10分钟恰好/多1ms的边界分别命中/未命中。只有9个快任务有时间而39个未知，不能缩成9/9宣布九成；业务44/48仍与性能结果分开。缺账单保持费用unknown，不能变零费用或改业务完成率。 |

性能定义须特别区分“首个Change容器创建”与“首份可运行版本”。当前 `main/draft-edit.ts` 增量修改保留旧createdAt，因此现有firstDraft时间能证明首个草稿容器出现，不能证明该时间点已经包含结束时内容hash，更不能证明当时可运行。最小采证是在既有runner首次观察实际完整版本时，保留当时官方读取的hash/快照/时间，后来用同一hash的完整业务/浏览器核对证明该版本可运行。版本出现时间与核对完成时间分列；后者只是完成验证时间的保守上界，不能悄悄替代“10分钟已有可运行稿”目标，也不能把createdAt倒填成版本出现时间。研究回复可复用实际assistant消息时间和完整回复hash；缺当时版本或可用性证据则可运行首稿时间unknown。局部DOM/模型自评不替代完整业务或视觉验收。

`completedMs`若新增，应明确为首个实际Run开始至最后必要核对和完整collector关闭/提交完成的墙钟时间；既有receipt.elapsedMs继续原名作为执行器时间，不覆盖。人工修正只计独立记录中实际用户修正动作，模型自动edit、核对点击或对话次数不能直接当人工修正次数；没有记录保持unknown。所有测量记录必须绑定本次case/Run/成果版本，合法hash只能证明文件未变，不能替代这些内容语义。

## 未合并的隔离候选与真实失败采证

2026-10-11获授权在 `.test-data/production-evaluation-strengthening-a27e5d6c-ad2f-409e-a436-0fb5934761f3` 独占副本补齐上述三项。根main/shared/src/scripts/tests/public/dist/package与本批manifest保持冻结；依赖只读复用，临时文件和编译输出都在副本。可审查改动、最小patch和原/新实际hash见副本 `DELIVERY.md`、`patches/`、`source-and-candidate-hashes.json`。隔离类型检查及编译通过；最终同一快照定向27/27通过（256476ms），日志副本 `isolation-final-tests.log`；首份补丁源码/日志已另存 `patch1-source/`，封存记录 `patch1-seal.json`。这些是机制验证，不是48次生产业务或性能实测。

候选新增可执行 `production-agent-runnable.mjs`：首轮保存快照和receipt后，用现有官方实例的state/read/versions读取并封存完整文件集，记录实际封存时间；既有独立review保存完整原预期后，再记录同hash核对完成时间。两个入口不启动实例、模型或自动业务通过。当前没有runner/review接线，不能将仅schema/离线读取称为完整性能实测能力。下一批接线须在新的冻结版本/manifest前完成。

首份可运行稿按当时已提出要求核对，完整交付仍按最终全部checks及所有轮次。现manifest没有QE13—QE16初始阶段独立预期锚点，所以候选12槽首稿保持unknown；不会用QE16第三轮才提出的增强反馈要求定义初始稿，也不会只加载页面算可运行。研究回复无文件的封存适配仍缺，未知保留固定48分母。仅36个单阶段夹具具备完整首稿证明时，性能为36/48、12unknown，不能达到44项门槛。

QE05一次真实采证使用的是根项目冻结collector，不是隔离候选。baseline确认实例关闭且实际独立业务核对为violated后，collector两次启动同profile并依次正常关闭，官方copy被拒；终态PID18480/7260均不存在、owner锁已释放、无导出文件、无完整trial、零模型调用。日志 `.test-data/production-agent-collector-real-QE05-20261011.log`；attempt为 `quality-evaluation-ypLMK9/cases/QE05/production-collector-attempt-7a0e33a9-35fe-4a88-8ba4-834e7ac3d38e.json`；终态/文件现hash见 `.test-data/production-agent-collector-real-QE05-verification-20261011.json`。第二实例已生成 `production-collection-mpsoIo/versions-1.json`，下一唯一官方IPC为export，结合冻结代码与失败位置推断拒绝发生于export阶段。适配器只有通用 `PRODUCTION_OFFICIAL_IPC_REJECTED`，未保存具体TaskDelivery错误响应，不能据此断言某一质量规则是直接拒绝原因；下一窗口可补结构化阶段/原错误码，当前不修改冻结代码。不添加确认、不重跑、不将业务失败改成通过。

## 第二隔离补丁：真实首阶段接线

第二补丁继续在同一独占副本实现，第一补丁封存保持不变。新 schemaVersion=2 manifest 在生成前逐 case 冻结实际初始 profile、完整原初 checks 和首 prompt/实际追加后缀 hash；runner 在凭据/实例前核 CLI profile，并核对封存实际 prompt 与官方 Run.input 完全相同。含 basePrompt 的单轮用例保留共同 PRD、原型、对照及基本交互要求，再加该轮重点；多轮首阶段不倒填后续修改要求。启用 prototype-checks 的 case 保留既有三状态、输入保留及三个视口全部断言；QE05 研究可单独采用 base。

成果角色按实际文件 hash、章节/页面位置和原句绑定，不规定未在 prompt 中要求的固定文件名或三个独立文件。首轮官方读取封存完整实际文件集，后续改稿不覆盖；独立首阶段 review 与最终 result 分开，没有全部项真实核对则可运行时间 unknown。浏览器观察和最终绿灯都不会自动写 satisfied。旧 manifest 缺初始锚点不追认，QE02 无文件回复采证仍 unknown，固定48槽与44项性能门槛不变。候选 runner/review 接线已实现，但尚未根集成或用于48次生产任务。

原型纯 schema/recipe 抽至 shared，原脚本公开导出不变；实际 plain Node 源 recipe 与编译后领域 JS 均有入口验证。成功态在同版本新预览执行冻结原生成功路径，最多等待3秒真实成功反馈，再核对 JHWD+10数字及不可编辑。错误前缀、9/11数字、未分配、可编辑、异步成功及反馈超时保留真实 DOM/截图反例。隔离 Electron 官方领域完整八项、真实 PNG/SQLite report，以及 compiled CLI 合法通过/同名空步骤拒绝均已实际执行。最终源码/补丁/hash、各命令与数量分别见副本 `DELIVERY-PATCH2.md` 和 `patch2-seal.json`；未完成的检查不计通过，既有失败日志保留。这仍是机制验证，不代表生产业务、视觉或性能达标。

## 已审候选根集成与来源准备钩子

baseline 已按不可变 patch1→patch2 的最终19文件顺序合入根，再合入自包含 prepare 测试可移植补丁；回执为 `.test-data/production-evaluation-root-integration-20261011/integration.json`。逐文件核对原基线和封存最终 hash，根类型检查通过；自包含 prepare 定向1/1、9375.7229ms，见同目录 `portable-prepare.log`。这批根集成尚未执行完整测试、构建或新版云任务。先前“未合并”和未接线段落保留为各封存时点历史，当前首阶段 runner 已落代码但尚无48次生产性能达标证据。

另一个来源准备钩子补丁仍只写独占隔离副本。复用 baseline 冻结 `quality-evaluation-source-preparation.mjs`：XLSX 通过官方 copyForProcessing→extract_text→apply 注册；其他资料的既有 TXT 保持只读挂载，不宣称同样走了登记链。每 case 先准备，再以独占写入封存实际 mount/path/字节 hash 与真实 user-processing Changes，后启动 start receipt 与 send；全局 manifest 不随各 case 路径变化回写。prompt 归一化只替换这段真实宿主生成位置，保留业务文本。

真实 Service 本机确定性 runtime 的钩子6/6通过（19205.398ms），隔离 `isolation-helper-handoff-attempt2.log`；不是云模型或 Electron IPC 验收。包含准备失败/旧 Run/绑定与真实文件篡改、启动时序、任务归属、宿主位置归一化反例。实际任务输出、首个草稿时间和 sourceReads 从真实 Run 归属核对；准备的 user-processing 输出不混入。XLSX catalog 的正文 includedCharacters=0 仍按实际记录，不能当全文已读。原4/6夹具失败日志保留。来源准备缺失也不会覆盖 execution 原失败原因。

来源钩子最终封存为副本 `helper-hook-seal.json`（SHA-256 `b068bdbc88330bf8f8ba91b7e8364d136ab24953b8a9b06b0d538bf9af81fe3b`），九文件最终源码在 `helper-hook-source/`；逐 before/final hash 与补丁见 `helper-hook-source-and-candidate-hashes.json`、`DELIVERY-HELPER-HOOK.md`。原 helper/test hash 不变。相关回归原命令38/39、332726.8011ms：唯一旧 cleanup 的写盘墙钟<1000ms断言失败，原stack保留；原样单独复验4/4、1533.0619ms，不改真实终止预算，也不将失败原命令记成全绿。此封存尚待父审根合入。

## 请求实际身份与供应商内部未知分层

来源钩子九文件和 baseline 的安全事件 reader 三文件已由唯一根集成者合入；新的 observed-wire 接线仍按独立封存提交父审。新 manifest/profile 才启用 `observed-wire-v1`，旧 manifest 不追认。collector 与汇总重新读取真实 SQLite 的主 Agent session `provider_request` 完整连续1..N窗口，并与封存安全投影整窗严格相等；没有后续事件白名单。主请求参数固定及跨step一致才可比，次数只是覆盖证据，不参与跨case身份相等。

native compaction 由实际start/request/end关联，明确是事件窗口推断而非每个请求已有typed purpose；不能靠8192猜用途，真实压缩请求也可能12000。未闭合、重叠、未知用途、未知字段、损坏/裁剪、DB或原reasoning/路由/配置错配仍拒。只覆盖原主会话observer，独立内容评审和图片桥继续各自回执。thinking/effort实际absent按已观察省略记录，实际maxOutput12000保留；供应商内部能力unknown独立披露，不声称high已生效。

候选六文件封存 `wire-overlay-seal.json` SHA `b95990db7001803b174e9083f01bc47a7bb6dc34becc7bac3714b1e407c2060b`，日志 `isolation-wire-handoff-final.log` 17/17、9124.2746ms；正常公开start/capture/collector→汇总、fresh compiled evaluator与SQLite自洽假证据/篡改/截断拒绝均执行。仅机制夹具，不是实际云业务通过。原provider reasoning全量仍逐step/DB/receipt绑定，费用unknown独立保留。

单独可移植测试补丁 `wire-portability-seal.json` SHA `61473e03776a16d3be67b3646b30a8b95b1b0e83a71a1845cba7050539558d50` 不覆盖原seal。它让测试自身在项目内唯一目录编译并清理；默认系统TEMP、不传调用者TEMP/TMP覆盖或NODE_PATH，实际3/3、8510.1234ms，compiler/compiled CLI均exit0。集成顺序是六文件overlay后再覆该测试，生产源码未变。完整根check/test/build及新版真实云任务仍由baseline后续统一执行。

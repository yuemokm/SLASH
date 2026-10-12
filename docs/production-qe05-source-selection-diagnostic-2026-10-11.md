# QE05 只读来源覆盖诊断

日期：2026-10-11。对象：quality-evaluation-ypLMK9 的 QE05 首轮真实回执及冻结首稿，诊断时点固定在首轮。QE05现已终态；[终稿独立审阅](../.test-data/quality-evaluation-ypLMK9/cases/QE05/independent-business-review.json)绑定终稿hash `3d39c0bd2f99540605deb73116f3e847c9fddb9c4da1722d8204c01f503a3657`，结论为 `violated`，不是真实用户验收。本诊断不代替终稿审阅，不改根源码、脚本、原 profile、输入或既有试次。

## 已证实的两个遗漏

生成与审查是不同读取链，不能混为一谈：

| 层 | 真实证据 | 结论 |
| --- | --- | --- |
| 生成模型 | Pi session 的 read_file 返回与 Run.sourceReads：字段文本仅 characters:0-12000；三次 search_files 字段 snippet 均属01；locate_spreadsheet 返回 unverified、sheets=[] | 首稿前模型未读到03机会门店正文，不是已读全部后理解错误 |
| 宿主审查器 | 用冻结6966字符首稿、三份真实来源、请求和59392提示预算重建 input；inputHash 与 promptHash 均完全匹配真实回执 | 审查器读取了完整来源快照，再挑选部分段落；实际所选字段段落也没包含03 |

真实 review inputHash：`97a78be841fa856709712dd87e0175ac8e17e3de80e0634fe704910bdc8a0284`；promptHash：`c263e7d5449823eafb2f43f35aebad62893fe5f937912015ed459a53304e302c`。不是仅凭9008/63164长度推断。

字段首轮审查七段 UTF-16 范围（start包含、end不含）：99–2115、2496–4269、5286–7735、8336–8547、10902–11599、12909–13307、16229–17693，总9008字符，全部在01终端网点主数据。03机会门店主数据位于40775–60535。审查覆盖仍是partial；报告正确保留未覆盖限制，但没发现这次具体跨对象遗漏。

证据目录：`.test-data/qe05-readonly-selection-20261011-3635abf9`。

- 原 `selection-diagnostic.json` 保留，SHA256 `6304F44840534933FB24A6F541D0DB2EC968FF4E6910E0DBF84C8E6577C8C197`。该版展示辅助字段 mistakenly 将全局XLSX坐标映射到DOCX source，应停用其DOCX worksheets标签；核心字段source范围正确。
- 改正版 `selection-diagnostic-v2.json`，SHA256 `E30019DE410732A30F4DE8F53ABE492C1147847720DE9489F8EB64B5795161F5`，只在对应字段source映射sheet，DOCX worksheets为空；两项真实hash仍匹配。
- `reconstructed-review-input.json`，SHA256 `DA9D957AB3F80ADFA615EF2731563494F8F48E2C777364E412542ED8FB9E717B`，包含精确选段与冻结输入，不调用模型。
- `offline-selection-mechanisms.json`，SHA256 `BA7B2CB05F24140C13069A2FBA77186CC98DCAB7E864C779006C780AD1FA64E8`，仅观察现有机制，不是新云attempt或真实用户授权。

## 评测准备与内置字段链

main/quality-evaluation.ts 的 prepareBusinessBenchmark 从隔离原件副本调用现有 extractOfficeText，写 source-text；原件前后hash与副本hash一致。文本是真实资料提取，不是虚构材料。

scripts/quality-evaluation-run.mjs:104 在当前 profile 同时只读挂载 source-text 与 original-copies。实际 state 中原件 mount 为 f1992b81-d6fe-4220-b73b-9d4f8ecdc939，文本 mount 为3128e87c-76f9-47b6-92a7-c6262e1c54be。Agent宿主策略也列可用目录，故原件可访问，不能说原件缺失。

但 runner:119提示资料在文本mount，:124 workflow.sources 只传文本路径/hash与“完整提取；原件SHA-256”locator。这个字段是资料定位信息，不是 Slash 内置 processing-copy/processing-result 回执。只读查profile时 processing-*键为空；session内 locate_spreadsheet 确实返回“没有可完整核验的已登记内置XLSX提取链；文本坐标不证明原Excel”。

main/service.ts.withVerifiedSpreadsheet 要求已登记且已应用的extract_text TXT、真实原件/副本hash和工作区回执；当前文本不满足，拒绝提供字段证据正确。main/agent.ts 的 copy_for_processing/process_processing_copy 能走正式链，Build主runtime有这些工具，process_execute=deny不等于内置extract_text引擎不可用。此次模型没有执行该链；自动修稿还禁止创建处理副本，不能借修稿补造执行事实。

因此本试次是“原件可访问，runner默认推荐文本且未注册处理链”，并非“原件完全缺失”或“产品XLSX引擎失效”。若后续要评测原件处理链，应开明确不同条件的新attempt，通过正式IPC/工具真实创建、提取、应用，再保存回执；不得在当前试次预注册模型没做过的processing证据。

## 为什么审查只选01

main/service.ts.taskContentReviewInput 根据真实来源回执核版本，然后读完整正文；readCoverage保留截断状态。来源locator最终只设为文件路径，不带model read_file的字符范围。不能把审查完整快照等同生成模型已完整读取。

main/content-review.ts 的相关词来自请求加成果；spreadsheetFocus另保留requestText与artifactText。main/content-review-spreadsheet-excerpts.ts.selectPrimaryRanges 优先请求精确完整sheet名，否则成果精确sheet名，否则全部sheet。原请求只说业务对象“机会门店”，没有完整“03 机会门店主数据”名称；首稿明确引用“01终端网点主数据”，因此 candidate pool 被收窄为01。随后原稿大量D4/D6/D7等坐标与字段词又帮助01行得分。

这形成可证实的选择偏差：待审稿引用了错误对象表，审查又用待审稿所指表作为唯一候选池。它不是业务证明或授权升级，但降低了独立审查发现跨对象错误的机会。

planSpreadsheetFieldCandidates只从HTML成果提取有条件的字段label，此Markdown报告不触发候选补充。text-excerpts仅负责DOCX/Markdown正文标题与邻段，既不决定XLSX跨表范围，也不能单独修复本问题。

## 最小复用方案与落点（尚未实现）

1. 审查先用原请求的业务对象和真实来源sheet目录确定独立候选范围。最小代码落点是 selectPrimaryRanges 的候选池：保留显式请求sheet优先，同时用已有请求词与真实sheet标题作有界匹配；匹配请求对象的sheet不得因成果只提另一sheet而被排除。成果引用可补充对照范围，不能单独压掉请求相关表。同名字段位于多个业务对象时保留各对象标题/列头和候选行；对象不明、超过现有限额时明确未覆盖/歧义，不能猜唯一表。不硬编码QE05或任何特定sheet名，不增加模型/框架或统一放大预算。
2. 复用既有source refs、版本hash、locator及选段范围；Service可传请求绑定的来源定位作为可核验的选择提示。locator需要先在真实sheet目录/原文范围中验证，只是候选定位，不能变成verified字段证据。当前只改source.locator不起作用：离线观察仍9008字符、原七段；同59392预算，将明确03范围加入内存请求后，现有selector已可同时选01和03共9000字符。这仅证明已有范围选择路径可复用，不是允许宿主伪造用户请求。结构化提示需进入明确宿主选择契约，不拼成虚构用户文字。
3. 生成沿既有 search_files 与 read_file 补读相关对象：查询真实sheet标题/业务对象，使用返回snippet的startLine/endLine定位，再带expectedContentHash按行或每页最多12000字符续读。truncated不能当全集；全文目录/已读范围未覆盖请求对象时，先补读对应表而非用同名字段推定。现有pm-workflows已给nextRead；通用改进落点可在来源预览/已读范围回执的目标覆盖提示，而非为单一案例加通用提示字符串。无正式链时仍可只读文本作候选对照，明确坐标未核验；需要字段证据则走已有正式处理链。

下一隔离候选有用反例：请求对象B、错误成果只写对象A，同名字段/地址不得锁定A；sheet顺序/名字/大小写/空格变动；对象别名与歧义；无匹配对象；长表超过预算、八段上限、合并条件完整性；范围及hash仍严格绑定。至少验证原真实冻结输入重放与通用人工数据案例，不能让原回执静默变成新结果。

通俗说明：这次写稿只看到了第一张表，检查器又跟着稿子选了第一张表。应先根据任务要研究的对象找到对应表，再检查稿子有没有用错；现有分页和定位功能可以复用，无需把所有资料无限塞入模型。

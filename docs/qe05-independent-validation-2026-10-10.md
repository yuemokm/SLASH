# QE05 真实研究与独立业务验收：2026-10-10

需求关联：F08、QE05-conflict。当前正式记录为 **violated 1/1**；报告比旧失败收敛，但仍存在术语和阶段偷换。根代理已复核并通过正式 recorder 录入，独立模型评审不是用户或人类确认。`manualModificationCount` 保持 `unknown`。

## 真实生成与业务事实

本轮目录为 `.test-data/quality-evaluation-cpcAcc/cases/QE05`，Run `b8e8166c-d11a-4f7c-a9fe-be21e33c3bc4`。沿用 Wangshu / `gpt-6-astra` / Responses，单次正式任务，runner 总耗时 412658ms、生成耗时 319622ms。报告由正式 write_draft 保存，再由 runner 应用并冻结快照，未人工改稿：

- 快照：`snapshots/1-约束对照.md`，15374 bytes、6252 字符。
- SHA-256：`d926cd23ba5ad1a27b7b2e14ee69e82da9b3b6459a68d287b12bcfb8a592fe8a`。
- 制度导入规则实际在本轮文本 L176，`docx-html/table[2]` 行18格3；流程导入描述在 L18、`table[1]` 步骤20。原 DOCX 与旧证据相同，但提取格式、文本 hash 和行号不同。case 的历史制度 L332 定位不能直接用于本轮引用核验。

支持的改善：报告准确保留“仅上线初期批量导入，后续新增门店只能在 SFA 端口手动录入”及流程“从后台导入终端信息”，不再把流程未写阶段解释为日常不限许可；有明确操作含义、适用批次、制度效力及例外问题，不凭 V4/v2.0 裁决。

残留问题足以阻止业务通过：

1. 报告 L103“制度允许的后台导入”将制度的“批量导入”升级为“后台导入”。制度没有明确后台入口，流程没有证明与批量操作等价。报告 L52/L70 又承认术语未知，不能消除总结中的肯定措辞。
2. L36 把指标一/二阶段称为“业务生命周期/运营阶段”；L51/L60/L62 把上线初期与一阶段存量激活、后续新增与二阶段运营近似对应。来源分别定义门店生命周期、运营指标阶段和上线批次，没有提供这些维度的等价映射。L69 要求分别确认是正确边界，但矩阵仍混合了它们。

实际现行效力、导入例外、术语等价、批次映射、DOCX 图片内容及用户确认继续未知。根另行核对了工具回执：search_files 四次返回同一合法64位 `9e4c1f54…af0820c`，模型两次向 locate_spreadsheet 传入不同的63位值。因此报告所谓“提取索引 hash 格式异常”不属实，是调用参数抄错，不能归因为产品索引故障或降低 hash 校验。独立 `tool-hash-audit.json` 保存这项新证据，已经被 recorder 绑定的业务证据不回改。

## 自动审查实际结果

回执 `e71549ac-d829-4398-9797-3abde34d1139` 对应同一报告 hash。正常 `stop`、80659ms，规范化 usage 总计 23381 tokens（input 21236、output 2145、其中 reasoning 1547），请求输出上限 12000；正文 1299 字符。没有长度终态或异常断流证据。

结果为 `unverified / invalid`：0 条有效 finding、2 条无效 finding。第0条是 `CONTENT_REVIEW_SCHEMA finding custom`，第1条是引用身份或原句不能绑定。原始 finding 与响应正文未保存；只有响应 hash、字符计数及安全错误摘要。因此不能确认模型是否发现了最终报告中的阶段/术语问题，也不能把 custom 归因到某个具体约束，或把第二项直接归因于来源截断。宿主拒绝无效发现是正确行为，不能放宽引文校验来获取“通过”。

生成 Run succeeded、静态检查 passed 与自动内容审查未验证并存，不是业务通过。应用仅将同一内容从 pending 切到 applied；保留的审查回执仍绑定该 hash，未因为应用重新发模型。

## 精确上下文复原与选段原因

使用本轮冻结 dist 和实际来源只做离线重建，两项均与正式回执一致：

- input hash：`5e303e50b7595014f05e0ff4b25c9c7de09b8f150fe57ae4c24794ddf35fcab9`。
- prompt hash：`5c0414cc9a45b97bb39a27229ed7f964fa7b22ef94657d276a5f5e3758f3f422`。

wire v3，prompt 34146 字符、上限 59392。成果 A1 全文 6252/6252，原请求完整；流程 S1 为 1050/1050。制度 S2 为 5889/15530，选段含 L49–177 的生命周期管理表（包括导入限制），以及 L285、L287–316 的一阶段指标正文；缺 L283 的 4.1 标题，缺 L318 的 4.2 标题和二阶段正文。字段来源 S3 为 12316/63164。

代码位置：`main/service.ts:taskContentReviewInput` 读取实际来源版本，`main/content-review.ts:context` 按通用段落相关度选择，每个候选只补前后相邻段落，并限制最多8段；`extendContext` 只延伸既有范围。一阶段表格相关度 rank3，被选择；其标题 rank18，与表格之间隔了 L285，因而不在直接邻段内。二阶段正文 rank5，但前面的选择和邻段已经耗尽8段名额，其标题 rank20 也没有被保留。

因此，**报告没有截断，来源上下文确有遗漏**。它是可能影响判断的已证限制，不是两个无效 finding 的已证唯一原因。

## 最小通用选段契约

本轮获授权实现以下契约，先说明再编码；不改变审查 schema、模型、输出上限、权限、旧回执或评分。

- 只用于通用文本的部分选段，HTML、Excel 专用分支保持原逻辑；全文能容纳时仍原样提供全文。
- 候选正文保留所处最近 Markdown 标题链及下一同级/上级分节标题的原文范围。支持 ATX/Setext 标题，忽略 Markdown 代码围栏内及四空格缩进的伪标题。它是结构背景，不是业务授权或语义判断。
- 同一每文档字符预算、最多8个合并后原文片段、同一总 prompt 上限。相邻空白间隔也计入合并范围成本，不生成或重写来源文字。
- 先给最高相关正文预留至少当前可用预算的一半（正文更短时保留全部），再容纳完整标题。标题不足时保留正文并记录固定 limitation、partial，不让标题消耗全部正文预算。
- 通用标题文本的预算再分配仍重新走同一选择契约；不能在扩展阶段绕过标题预算或生成超过8个片段。未给正文继续未验证，标题不等于整个章节已覆盖。

以下为此前只读方案及待验证边界：

在既有通用 Markdown/文本 excerpt 选择中，保留所选段最近的真实标题层级，以及紧接的同级/上级分节边界。标题使用原文范围，成本计入同一 per-document 字符预算；先预留标题，再分配正文，合并重叠区间、保持源顺序、仍守8段与总提示上限。预算不足继续 partial，不根据标题推断未给正文。

这不包含机会门店、批量或后台等业务关键词，也不整体扩大来源。最近标题能补回 4.1 归属，分节边界能表示其后已进入 4.2；**标题补齐不等于二阶段正文已经覆盖**，也不能证明业务映射或提高修稿权限。

离线反例已覆盖：相关正文与标题中间隔独立段落、同级边界/层级跳跃/重复标题、backtick/tilde/未闭合围栏及四空格缩进伪标题、Setext 与 CRLF、超长标题不能吞正文、多个分节及多个小预算、只有标题的文本和实际 prompt 的 partial/limitation 传播。断言原文位置和 hash 不变、预算不超限、最多8个合并后片段，遗漏仍明确 partial，不以标题判定业务许可。

后续若做 focused 审查，可复用同一报告 hash 和两份真实文字来源，只聚焦术语/阶段，给出实际4.1/4.2相关上下文，保存新的 input/prompt hash 和覆盖范围。它是新的选段实验，不能称与本轮冻结输入相同；当前未发云、未自动重试。

## 本轮实现与离线对照

`main/content-review-text-excerpts.ts` 定义原文范围及固定 limitation 契约，并实现通用正文/标题链/分节边界选择。`main/content-review.ts` 只接入通用部分选段、将限制传入 prompt，并让有标题的通用文本在既有预算再分配阶段重新遵守同一选择契约。总预算分配公式、协议、输出上限、HTML 和 Excel 专用选择器未修改，没有新增依赖或 Agent 能力。

`tests/content-review-text-excerpts.test.ts` 新增8项合成回归，与已有内容审查13项、HTML9项、Excel20项合计 **50/50**。`npm run check` 通过。本子代理未 build；集成构建由根负责。后续真实语义质量未验证，不能称本改动解决了原两项无效 finding。

对 `.test-data/quality-evaluation-cpcAcc/independent-QE05-observation-20261010/reconstructed-input.json` 的完整冻结 snapshot 做离线重放，结果保存为 `.test-data/qe05-heading-context-offline-6aa7da98-71dc-4680-b957-1fcde8b73636/comparison.json` 及 `new-input.json`：

- snapshot 深度相同，报告 `d926cd23…` 不变，旧回执仍 `verifyContentReviewReceipt=true`，旧正式评分 violated 不变。
- prompt 上限仍59392，实际34146→33485字符；新 input hash `a17d57e889e964f0c74b58dbc47f939afc122c8846289bd529049bf2be0126a0`，新 prompt hash `afa282461d21b44cee8ca94989a1fc5c6ecf4ccba47d404f96731afa03e16be8`。
- 制度5889→9191字符，5个原文片段，覆盖 L4–12、L20–179、L281–388 及 L398/L472 标题。原导入条款、机会定义保持；4.1/4.2标题从未覆盖变为已覆盖，并提供了相关指标正文。
- 二阶段尾部 L389–396 仍遗漏，制度仍为 partial；不能称整章或整份来源已核验，更不能从已提供标题确认阶段映射。
- 流程1050/1050保持。既有共享预算下制度占用增加，Excel12316→9014字符，其选段范围因此不同；专用选择代码没有变化，不能把新旧完整模型上下文称为相同。

这是输入背景完整性改进的离线证据，不是新模型审查、不是改稿验收，也不覆盖原报告的业务失败或工具 hash 抄错。

## 证据与 recorder

业务独立证据最初位于 `.test-data/qe05-independent-observation-9cc4dae7-e9a1-4f7a-82de-e9cb8f518a02/artifact-review.json`。适配正式 recorder 的文件及离线复原材料位于 `.test-data/quality-evaluation-cpcAcc/independent-QE05-observation-20261010/`：

- `independent-artifact-review.json`：独立业务证据，humanConfirmed=false。
- `formal-observations-ready.json`：子代理准备的 BenchmarkObservation[]，未由子代理执行评分。
- `root-reviewed-observations.json`：根复核后新建的观察文件；根已正式 record。
- `automatic-review-receipt.json`、`automatic-review-analysis.json`：本轮自动审查回执与限制。
- `reconstructed-input.json`、`input-selection-diagnostics.json`：与回执哈希相同的离线上下文复原。
- 正式结果：`cases/QE05/result.json`，violated 1/1。

契约位置为 `shared/quality-evaluation.ts:BenchmarkObservation`；`main/quality-evaluation.ts:recordBenchmarkReview` 核对成果 hash、证据在 test-dir 内的真实路径并绑定证据 hash。`scripts/quality-evaluation-preflight.mjs --review` 只离线记录，不发模型；子代理未执行它，根已使用自己的复核文件执行一次。

通俗说明：报告仍把不同阶段和不同导入方式混在部分结论里，目前不能把这份报告算业务质量通过。

## 新选段真实审查：仍未通过

根已在 `.test-data/qe05-focused-review-f4a20750-9aeb-48f1-81cf-aa1b6cca6970` 对同一报告、原请求与三份来源发起一次 Astra 审查。实际输入和上文新选段 hash 一致，报告及旧正式评分未改。86.584秒正常结束，实际1次 fetch、HTTP200、571 SSE、1255正文字符，终态 `response.completed/stop`，无外层重试；回执 hash 有效，但结果仍为 `unverified / invalid`：1项有效、1项结构无效。

有效 finding 指出 S3 的 `01终端网点主数据!K7` 已提供完整照片规则，而报告仍说片段截断。独立检查确认这条规则在旧输入中也存在，不能把本次发现归功于标题修复，也不能由它推出机会门店导入权限或照片要求。无效项只留有 `custom` schema 诊断，未保存原始项，无法判断其业务含义。原有阶段混并、批量导入升级为后台导入的问题仍存在，原 `violated 1/1` 保持。

证据为该目录 `result.json` 与 `independent-finding-audit.json`；20项保护文件 hash 一致，未改原稿、旧回执或评分。此次与原型验证并发，不作为模型耗时的严格对照实验。后续先补安全、明确的结构诊断，再决定修复；不因一次无效返回反复盲重试。

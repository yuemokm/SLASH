# DOCX 审查结构显示候选

日期：2026-10-11。对象是首轮冻结 QE05 研究稿及两个其他业务对象的通用反例。首稿、源文本、原回执及 profile 不改写；候选只在独立副本实验，不计正式48项评测，生成侧的范围误读没有因此修复。

副本：`.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477`。默认审查行为保持原样；实验开关只增加转换文本结构视图。root 的 main/shared/src/scripts/tests/public/dist/package 均未写入，依赖通过只读 node_modules junction 复用。

## 已有缺口与候选

既有 business-fact-guidance 与独立审查协议已经要求核对对象、范围、来源位置并禁止编造行号。真实生成与审查输入均包含制度表对象标签及行18格2/格3，仍出现把格2当总括规则的解释；流程序号20被写成“转换后的表格第20行”。候选不再重复同义指令，补充源 ref/hash 绑定的行格显示，观察其实际帮助。

复用 `docx-structured-text` 的既有序列化 header 与结构限制。TXT 没有独立可验证的格式版本号：仅识别精确 header、表锚和受支持 shape，结构始终是 untrusted 转换文本提示。普通表转换行序与 firstCellLiteral 分开；literal 是原文数据，不是已认证步骤。合并表只保留转换行格/跨度，不推断 Word 网格或业务列；首行不认证为业务表头。嵌套表归属不清时整份布局省略并记录限制；原来源文本仍保留。

源 `cellTuple` 为 `[convertedCell,sourceStart,sourceEnd,colSpan,rowSpan]`；所有 range 必须完整落在已有选段并与原文一致。引用继续走现有短引用和逐字绑定，布局不会成为新业务证据，也不会提升目录或修改权限。

## 冻结的比较条件

3份 packet：真实 QE05 首轮冻结稿、其他业务对象/英文来源的同类错误稿、正确区分对象且使用真实转换行/原文序号的正确稿。每份 A 原输入、B 加布局，各2轮，共12槽，顺序平衡、最多并发2、每次 review 240s/wrapper 280s、无外层重试。宿主请求 Wangshu GPT-6 Astra/openai-responses、65536上下文、12000输出上限、thinking off；端点能力仍可能 unverified，不能声称供应商内部推理已关闭。实发 thinking/reasoning 字段与输出上限由每次传输观察单列，缺观察记 unknown。

原正文、snapshot、ref表、所有选段与 offset 均 deepEqual，真实 QE05 的 A input/prompt hash 与历史冻结输入完全相同。结构附加计在原59392字符上限内；超限实验记录不可比较，不能涨预算或删原正文。默认实验关闭，因此可选显示不会使原本合法的正常审查新增失败。输入hash包含显示策略，promptHash包含实际投影。

| Packet | A字符 | B字符 | 原上限 |
|---|---:|---:|---:|
| QE05首轮冻结稿 | 33805 | 36386 | 59392 |
| 通用错误稿 | 5732 | 7171 | 59392 |
| 通用正确稿 | 6071 | 7510 | 59392 |

[ground truth](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/fixtures/ground-truth-not-for-model.json) 独立封存，不进入模型提示。[12槽顺序与条件](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/fixtures/batch-plan.json) 在请求前固定；每槽保留原始可见响应、绑定结果、传输参数、超时和关闭状态。逐条人工看引用与解释，不以关键词命中宣称两类缺口检出；非目标合法 finding、正确稿误报、schema/hash/超时失败分别保留。

## 本地稳定性证据

- 结构专项8/8，759.3905ms：默认字节一致、数据值与转换行分离、escaped pipe、合并跨度、未知/不完整格式、嵌套归属、无锚选段、source hash 及实际合法9500预算边界。首轮7/8预算夹具误用了原 allocator 本来就非法的限额，失败日志保留；调整为真实合法默认输入/实验超限的边界后通过。
- 既有审查/输出协议、原句绑定、范围与修正保护、预算分配、DOCX序列化回归67/67，3665.2487ms。
- noEmit 和隔离 `tsc --outDir dist` 通过，输出仅在副本。真实 Electron A/B 网络禁用 preflight 各通过，云调用0。

## 固定12槽终态与人工裁定

12槽均已退出，批次于 `2026-10-11T09:28:05.641Z` 完成；固定逻辑调用各1次，未追加槽。传输观察共13次fetch：slot11首次transport失败、响应字节0，Pi原配置maxRetries=1随后第二次成功。所有槽最终正常stop；宿主请求thinking off，但13次实发thinking/reasoning字段均absent，供应商内部推理是否关闭仍unknown。

逐条人工解释、逐句实际选段匹配、原响应/回执文件hash与宿主接受状态见 [manual-adjudication.json](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/manual-adjudication.json)。[protocol-capacity-final.json](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/protocol-capacity-final.json) 独立保留总引文3的容量问题；原始响应及已签回执未改写。

| 观察 | A 原输入 | B 结构显示 |
|---|---:|---:|
| 整份completed回执 | 3/6 | 2/6 |
| 真实QE05两个目标检出 | 0 | 0 |
| 通用错误稿原响应对象范围检出 | 2/2 | 2/2 |
| 通用错误稿原响应伪行号检出 | 0/2 | 1/2 |
| 通用目标逐字绑定finding | 1 | 0 |
| 整份completed且检出目标 | 0 | 0 |
| 两个目标均正确稿的目标误报 | 1/2 | 0/2 |

A唯一绑定目标是slot9范围问题，但同回执另一项无效，因此整份invalid、repairEligible=false。B slot10确实指出Sequence200不等于转换行200，随后拼接不连续表行作为引句，绑定失败；不能算有效检出。A slot5否定实际正确的转换行3/4，属于真实目标误报。B正确稿另有适用范围、措辞及流程完整性建议，其中较强解释支持不足，详见人工逐条裁定；正确稿只封存两个目标的正确性，不能据此宣称整个业务稿零误报。

共有10条总4引文超过旧协议3上限：8条A1/S2/R1，2条A2/S1/R1；candidate与record_only各5。两条A2均为同一成果的两句，不是已验证的跨成果例。只有其中5条全部引句连续精确，另5条同时存在拼接/长度等问题；扩大容量不能替它们证明语义正确。

结论：证据不支持默认启用或生产合入结构显示，实验保持关闭。独立封存 [held patch](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/docx-layout-experiment-held.patch)，SHA256 `6155fabb2270ca8928d1c09320db0c911b1d365c63ab36a1eee73a0868d47f2b`；[原hash](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/original-hashes.json)/[新hash](../.test-data/docx-review-layout-isolated-864f69de3d884683b5ec4cabcd34c477/final-hashes.json)。该patch保留历史基线，不应直接覆盖后来根selector或wire改动。未自动修稿、未人工确认交付，不计正式48项成绩。

通俗说明：来源里“步骤20”不等于表格第20行，不同对象的规则也不能随意当总规则。实验把已有资料的结构排清楚，检验模型是否更少看错；它不会把未核实的列关系变成事实。

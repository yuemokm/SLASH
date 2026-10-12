# 字段证据完整响应超预算指引

需求：按已授权且已登记的原XLSX坐标核验字段、列头、值及版本；完整证据超预算时应给出准确的恢复方式，不能截断证明、扩大预算或把合法拒绝当成功。本候选与 `rows` 分页检查点修复独立。

真实QE12的 D3 请求选择7个值格，完整响应12101字符，超过既有12000字符限额。原错误只有Zod `字段证据响应超过12000字符`，没有告诉模型怎样缩小请求。本次只修改 `Service.verifySpreadsheetField` 的响应诊断，不改schema、最大8值、列头/合并几何门槛或来源版本与权限检查。

仍先运行完整响应schema核验。仅同时符合以下条件，才替换为安全稳定诊断：完整序列化响应超过12000字符；全部issues只有一条；该issue是根路径的custom错误，且恰为既有响应预算refinement。任意其他或并存结构错误均抛原错误，不按长度猜原因。

- 多值超限：`SPREADSHEET_FIELD_RESPONSE_LIMIT`，说明实际字符数、本次未返回有效字段证据；要求减少 `values`，保持原 `fieldCell/valueCell/headerCells` 坐标分批核验。每批仍只证明这些格，不能当完整字段或业务核验。
- 单值超限：`SPREADSHEET_FIELD_SINGLE_VALUE_LIMIT`，明确单个值及完整身份/字段/列头证据仍装不下，不能靠减少values恢复这个请求；未截断，也不能用导航片段替代完整原值证明。
- 表头不覆盖、合并值格、字段格误列值、参数schema、源版本或权限错误保持原诊断；不建议减少values掩盖这些错误。

失败发生在 `readSpreadsheetFieldEvidence` 记录sourceReads之前；既有已读取证据不删除，但本次失败不产生新的字段回执。错误只包含本地代码、字符计数和通用指引，不回显来源正文或凭据。没有自动重试或自动拆分。

证据（位于独立候选目录）：

- `targeted-final.log`：新4项与既有22项共26/26通过，owner31067 exit0，36764.8657ms。包括真实Service授权→copy/process/apply→read路径、减值恢复、单值超限、非预算诊断与既有本机Pi loopback。没有远端/付费调用。
- `targeted-current-test.log`：测试补齐显式构造参数后，新4项原业务断言再次4/4通过，owner78815 exit0，10075.306ms；没有把两轮计数拼成一轮。
- `typecheck.log` 与 `test-typecheck-final.log`：main/shared及独有test类型检查均exit0。
- `actual-d3-reproduction.json`：原冻结D3输入/receipt的正式Service格式化分支仍得12101字符，返回明确超限码；该阶段只复核格式化，未重新验证活跃Run权限。另用同原件在全新独占项目走真实Service准备/应用/读取，身份另建，响应12087字符被原子拒绝；7个值分别1721–2101字符通过，各自证据ID与该新Run完整候选对应值一致。原件/TXT SHA不变。
- `targeted-initial.log` 保留首次3/4：新测试把空A1错误预计为HEADER_REQUIRED，实际已有CELL_UNEXTRACTED；只纠正该夹具预期，未改产品。`test-typecheck.log` 保留测试未填第6构造参数的错误，随后明确传默认runtime/backend及无凭据函数。

历史隔离状态（2026-10-11）：当时为独立封存候选，未改活跃QE12；当前已于2026-10-12按下段合根。此诊断不是模型已自行恢复的证明，也不是业务解释、正式发布或整个任务质量验收通过。

流程图：[字段响应诊断边界](production-spreadsheet-field-response-limit-2026-10-11.mmd)。


## 2026-10-12 G2根集成

已按候选全部base/final SHA精确集成，保留既有发布、Word、局部修稿及权限代码，不合guidance。`.test-data/production-g2-spreadsheet-root-20261012/integration.json`记录8/8匹配；owner97621 exit0，check0、七文件组合54/54（26586.0511ms）、build0且sourceUnchanged=true。这是必要组合验证，不是全量或新模型业务通过；旧QE12失败不回填。对应[Mermaid源](production-spreadsheet-field-response-limit-2026-10-11.mmd)。

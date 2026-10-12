# 已登记表格的有界导航

`locate_spreadsheet`为既有Pi工具增加“工作表目录 → 指定表行/格定位 → 严格字段核验”的只读入口。它不根据文件名、表名序号或用户业务词自动选择对象，不执行公式、脚本或外部链接，不判断业务维度/阶段，也不把导航片段当成字段证明。

## 使用与版本边界

输入使用已登记且已应用的内置XLSX提取TXT的`mountId/path/expectedContentHash`，不是原XLSX路径或其字节hash。

```ts
locate_spreadsheet({mode:'sheets',mountId,path,expectedContentHash});
// 默认offset=0、limit=10；每页最多20个真实工作表。
locate_spreadsheet({mode:'rows',mountId,path,expectedContentHash,
  sheet:'目录中的真实名称',startRow:1,startColumn:1,columnLimit:16,rowLimit:5});
// 默认选定表从startRow到实际末行、从startColumn起最多16列。
// 可选query是区分大小写的字面文本，最多80字符；不是正则或全工作簿搜索。
// 下一页复制原请求并带原nextCursor，不自行递增/裁切游标。
```

2026-10-08 续页增量：模型回执可附 `nextInput`，可直接作为下一次locate_spreadsheet输入；完整复制原范围、默认值及新cursor，避免将部分返回的末行误当成已读完。宿主canonical结果不增加字段。该字段仅在来源身份/范围版本相符、非末页且附加后的完整JSON仍≤10000字符时提供；否则保留原页及“原请求+nextCursor”契约，缺字段不代表末页。原范围、来源、授权版本变化仍严格拒绝，不缩短原页正文。真实失败前页回放由3729变为4134字符，从J3正确继续；23项定向测试通过，未验证云端提速。详见 [工具往返与续页审计](prd-dimension-tool-efficiency-audit-2026-10-08.md) 及同名Mermaid。

## 批量字段定位（2026-10-08 后续增量）

真实PRD测试中，16列的普通行页只能容纳约3行，模型19次导航中有5次参数错误，并将不同类别的同名字段混用。新增 `find_rows` 模式用于已知字段名的定位：先核对真实表名及列头，再指定搜索列、最多8个区分大小写的字面查询，以及最多3个明确的上下文列。名称命中任一查询就返回该行的名称格和指定上下文格；不会选择“最相关”的一条或自动合并同名字段。

```ts
locate_spreadsheet({mode:'find_rows',mountId,path,expectedContentHash,
  sheet:'已核对的真实表名',startRow:2,searchColumn:4,
  queries:['经度','纬度','定位地址','详细地址'],contextColumns:[2,3],rowLimit:10});
// 列号来自实际列头，不按固定B/C/D列猜测任意表格结构。
// 命中行与所选上下文格整体分页；nextCursor未耗尽时不能认定结果已完整。
// 续页保留原请求范围，只附返回的cursor；需要改变范围时开始新的查询。
```

沿用10000字符完整响应、每格512字符片段、2000格/64000字符扫描上限及原来源/授权核验。新模式的cursor绑定查询词、搜索列和上下文列；旧sheets/rows模式及其cursor范围保持兼容。导航只提供原始候选位置，归属解释和业务语义仍未确认；确定候选后使用原字段证据工具核对原值与列头。长正文、隐藏、合并和空上下文格保持明确标记，不能把截断片段当作完整规则。

同轮PRD工作流增加简短指导：字段原值、类别及实际坐标与解释分开；来源规则、本次模拟、实际实现不混写；模板中的未知章节列缺项而不编造接口或状态。当前正文已提供时提示复用，部分正文仍按nextRead续读，metadata_only及Plan限制不变。提示本身不证明模型会遵守，真实任务质量仍须另行验收。

本增量类型检查与正常构建通过；导航/字段/模型投影38项、工作流18项、来源预览与目录首包16项，共72项针对性测试通过，零失败/跳过。真实本机Service→Pi的Build与Plan路径已包含find_rows后继续严格字段核验。测试日志在 `.test-data/find-rows-proposal/` 和 `.test-data/prd-guidance-minimal-tests-2026-10-08.tap`；此前失败的测试参数与旧日志保留，修正的是测试中搜索列与上下文列重复的冲突，没有放宽产品校验。

对上一任务同版本真实XLSX的只读解析回放：8个名称查询、B/C上下文，2页完整列出11个候选行（2/3/4/5/6/7/8/24/36/68/69）。D8位置信息中的详细地址与D24图商信息中的详细地址分别保留；D68/69外部系统网点编码/名称也作为子串命中的候选保留。完整回执9864字符，模型投影5199字符，正文281字符，原件和副本哈希未变。证据 `real-replay.json` 是生产解析器回放，不是新的Service授权或云模型实测；不能声称上一任务19次调用必然变成2次，也不能由字符数推出token或任务耗时收益。

目录返回实际名称、隐藏状态、行列数；行页返回实际坐标、主格/合并范围、行列隐藏标志、类型及单元格文本片段。`text`采用既有Office提取器的原样单元格表示（例如`文本: …`、未执行公式及缓存说明）；`textOffset/totalCharacters/textTruncated`属于该单元格表示，不是整份TXT的字符位置。长格按真实cursor继续，稀疏行不会被错误压缩成不同原始行号。

每页完整JSON最多10000字符、每格文本片段512字符；每次最多扫描2000格、64000字符。cursor的position是所选行/列窗口内位置，textOffset支持长格续读；version绑定来源登记身份、授权快照及查询范围。改变来源/授权/表或查询范围后原cursor拒绝，需无cursor重新定位。目录按完整条目适配预算，不裁条目后复用旧cursor。预算无法容纳第一条完整条目时明确拒绝，不返回无进展游标。

字面搜索只列每格首个命中片段，不列该格全部出现位置。结果明确写搜索范围与此限制；未搜索完的范围保留nextCursor。需要其余正文时，改为无query的rows，从匹配行开始分段读；不能由片段中没出现某词推断整格或整表没有它。

## 宿主证据链与读取覆盖

Service的导航与字段核验复用`withVerifiedSpreadsheet`：现有权限和Files边界、processing回执、applied Change、原件/处理副本/提取TXT哈希、256MB累计读取预算、原包安全检查、同一ExcelJS解析及原样序列化、结束后的哈希/授权再次核对。普通或伪造TXT、脚本提取、未应用、旧缺链、来源改变或撤权不能供给current目录。编辑副本明确标`processing_copy_xlsx`，不能冒充原件。

导航返回的`coverage.fullBodyRead=false`指模型没有取得全文；宿主为验证来源仍需读取、解析及核验原件链。`bodyCharactersIncluded`只计实际返回的单元格表示片段，目录为0。`fieldRelationshipVerified=false/semanticStatus=unverified/humanConfirmed=false`固定保留。导航不产生`spreadsheetEvidence`或追加字段读取回执；地址确认后须调用既有`read_spreadsheet_field_evidence`核验字段名、列头与原值关系。

当前工作流首包可用目录替代任意前4000字符预览。仅宿主核验有效的current登记TXT启用，目录完整JSON和说明计入原4000/16000预算，includedCharacters=0/truncated=true/contentStatus=spreadsheet_catalog；全文TXT仍保留磁盘。非登记来源与旧版逻辑保持原有限预览；权限、取消及版本错误不吞成普通fallback。历史版本、研究/方案Plan只读边界保留。普通聊天不额外执行导航。

## 模型回执的重复字段精简（2026-10-08）

真实局部修订测试中，5次导航回执共33,688字符，其中单元格正文仅1,634字符。模型工具返回现在经过 `main/spreadsheet-navigation-model-view.ts`：只在current行页确实能缩短时采用 `cellEncoding: named_defaults_v1`，每格仍使用address/text/row/column等具名字段；共同默认值在cellDefaults中说明一次。省略masterAddress表示与address相同，省略totalCharacters表示当前text的UTF-16长度。隐藏、合并、非文本类型、长格偏移和截断等例外仍完整携带。目录、未核验及不更短的小页保持原格式。

这一转换发生在原Service核验和工具网关之后，不改变完整宿主响应、原文、字段证据、来源版本、权限、分页范围或nextCursor，也不改变导航未确认业务含义的状态。同一批5份真实回执离线无损复原通过，模型回执降到15,217字符（减少54.8%），1,634字符正文不变。它只证明数据量减少，尚不证明云任务的token或耗时降低。

类型检查、26项针对性测试及正常构建通过。真实本地Service→Pi HTTP的Build与Plan均覆盖实际精简回执和原字段核验；合并/隐藏/公式/截断/UTF-16/连续游标无损复原通过。证据目录 `.test-data/navigation-model-view/`。本增量没有重跑之前已通过的683项完整测试，也没有新增云请求；界面未变，主进程更新需重启启动BAT。

## 原生Pi输入schema修正

本机真实Pi回环发现：Zod默认`toJSONSchema`按output模式把带default的offset/limit等列为required，导致合法省略参数先被Pi校验拒绝。导航工具现在显式使用`io:'input'`发布输入schema，由宿主parse填写默认值；strict、mode分支、数值上限及Pi原生校验均保留。测试继续省略这些参数，未绕过校验或在fixture强塞默认来假装通过。

测试覆盖有界目录不跳页、长格精确偏移、稀疏/隐藏/合并、字面查询跨片段、来源/授权cursor绑定、零进展拒绝、逐响应coverage不串线、公式/链接不执行；真实Service覆盖未登记/伪造/脚本/未应用/旧链以及晚到撤权/版本/取消。原生Pi本地HTTP的Build和Plan都实际走目录→行定位→非法同格拒绝→fixture显式纠正→字段证据。它证明软件链路，不证明云模型能正确选择业务对象或自行纠正。实际用户资料的0云预检与后续真实模型运行分别记录，不能改旧QE12失败结果。

流程图：[spreadsheet-navigation-2026-10-08.mmd](spreadsheet-navigation-2026-10-08.mmd)。专项日志位于`.test-data/spreadsheet-navigation-validation/`；统一构建和全量测试由根代理执行。

通俗说明：以前模型需要一大段一大段读整本表格，现在可以先看目录，再定位需要的几行。软件会告诉它具体格子和读取范围，但不会替它决定哪个业务对象或哪条规则才是正确答案。

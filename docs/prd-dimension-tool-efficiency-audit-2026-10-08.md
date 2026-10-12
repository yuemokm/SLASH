# PRD 两行修订：工具往返与续页接口审计

2026-10-08。初版为冻结期间的只读设计记录；本次解冻后已实现下述nextInput，并完成本机零云验证。未build、未启动应用、未新增云调用、未修改业务稿；未检查或导出模型thinking正文。第二候选尚未实施。

审计对象：Run `af67c8fa-8e32-4f55-822c-9b57476d0f23`。依据为真实 `safe-terminal-metrics.json`、工具调用/结果中的固定安全字段、最终业务文件偏移以及现有Pi/Service代码。只在本地提取toolCall参数、工具回执身份/行格地址/游标/偏移和时间；不依据模型自述推断原因。

## 耗时事实与边界

| 项目 | 真实观察 |
| --- | --- |
| 整次自然完成 | 507.511秒 |
| 主模型可见正文结束 | 运行开始后353.111秒 |
| 独立content_review调用 | 回执durationMs=152,376；约占总时长30% |
| 首个工具调用 | 开始后55.264秒 |
| 首次edit_draft调用 | 开始后287.547秒；只有这1次编辑，2个替换项 |
| 工具调用数量 | read_draft 4、locate_spreadsheet 6、edit_draft 1 |
| 工具调用→结果区间并集合 | 14.360秒；按记录时间去重，不能解释为准确CPU/I/O耗时 |

独立review在主Pi正文完成后串行执行，见 `main/agent.ts` 的 `createAgentSession` / `reviewContent` 和 `main/service.ts` 的检查流程。本例没有正文压缩记录。现有证据不能把剩余时间准确拆成供应商生成、网络、SDK调度或内部推理，因此不提出“降低思考/少检查”或调整模型额度。省一次工具回合可以减少一次模型往返，但未实测前不能承诺节省507秒中的固定比例。

## 游标错误的确定性原因

实际成功前页，toolCall `chatcmpl-tool-858fac8cc544d5c2`：

```json
{"mode":"rows","sheet":"03 机会门店主数据","startRow":1,"startColumn":1,"columnLimit":16,"rowLimit":10}
```

该页返回第1–2行全部格及第3行A3:I3，`nextCursor.position=41`，version=`0908b9d83fc450622aec8ea32e626b23585fd4d8547ceedbd41d793f37750ce7`。position是原范围内的单元格序号，后续应从同一范围的J3继续，不能将其解释为“已完整读完第3行”。

下一次失败调用 `chatcmpl-tool-8141f591ccfd4299` 完整复制了cursor，但把 `startRow` 改为4。除此之外，所有影响scope的输入字段均相同。`main/spreadsheet-navigation.ts` 的version绑定 `{identity,scope}`，scope包含startRow；按原算法复算：

| 输入 | 复算version |
| --- | --- |
| 原startRow=1 | `0908b9d83fc450622aec8ea32e626b23585fd4d8547ceedbd41d793f37750ce7`，与前页cursor完全一致 |
| 改startRow=4 | `3b3772094f0fe6d664cfa022cc93c1634e423144c258f1cdd5da98478e24ee70`，与旧cursor不同 |
| 将失败输入startRow还原为1 | 恢复原version，完全一致 |

随后删除cursor、从startRow4重新发起的请求立即成功。所有成功导航回执的identity逐字段一致，包括TXT hash、原件/副本hash、处理回执ID与authorizationVersion。因此可以排除这次错误由真实来源或权限变化造成；它是跨scope误用cursor，且当前拒绝行为正确。

schema和工具描述已经写明“续页复制原请求+nextCursor，不改startRow”。缺口是回执提供了不透明cursor，却要求模型自己重构完整原范围；“看到3行→下次从4行”容易丢失未完整返回的尾行。错误回执到下一次恢复调用又经历8.943秒，但不能据此承诺未来固定节省8.943秒。

不能直接删掉后来的P列核对：startRow4宽页在K6截断，下一次跳startRow7未返回L6:P6，最后窄范围N:P核对实际补回了P6。问题应通过正确续页消除遗漏，不能减少质量检查来隐藏缺格。

## 已实现的最小方案：可复制nextInput

保持原游标精确范围/版本校验和每页10,000字符上限。仅增强现有model-only投影，不改宿主canonical导航结果和分页容量：

```ts
type ModelNavigation = (SpreadsheetNavigationResponse | CompactNavigation) & {
  nextInput?: SpreadsheetNavigationInput;
};

// 新增原canonical请求参数；调用处传本次实际已解析的input。
spreadsheetNavigationForModel(response, input)
```

当state=current、身份与原请求相符且nextCursor非null时，用同一 `spreadsheetNavigationRequestSchema.parse({...input,cursor:response.nextCursor})` 生成nextInput。完整复制mode、mountId/path/expectedContentHash和全部原scope，包括默认值、原startRow、列窗口、query/queries与上下文列；版本仍是宿主生成的cursor.version。不会自动接受旧cursor跨scope，不会猜测下一起始行。

新字段仅回显调用者已经提交的定位参数及宿主cursor，不附加单元格正文、权限配置或密钥；路径、sheet及literal查询仍属于原授权请求，不能扩展到未授权来源。返回此字段不免除下次调用的来源链、授权、版本及Run有效性核验。不得将nextInput执行结果当成字段关系或业务语义通过。

### 本次反例的实际零云计量

直接从失败前页真实model回执计量，不输出正文、不生成新导航页：

| 项目 | JSON字符数 |
| --- | --- |
| 实际原model投影，41个单元格 | 3,729 |
| 按现有tool schema生成的nextInput | 392 |
| 新属性结构开销 | 13 |
| 附加后完整模型JSON | **4,134** |
| 既有上限 | **10,000** |

故本反例能真实得到nextInput，且不删除/缩短原页任何正文、身份、覆盖或游标字段；该输入明确保留startRow=1，可直接正确续页。这是可选字段解决当前反例的证据，不是泛称“可能放得下”。

最终投影先完成现有无损默认值压缩，再计入nextInput，只有完整JSON仍≤10,000字符时才附加；不提前降低正文预算，不提高上限。以下情况不提供nextInput：

1. nextCursor=null的末页；unverified结果；异常/取消没有成功结果。
2. 投影未收到可核验的原input，或原请求与回执身份/范围不一致，不能构造假的续页请求。
3. 极长路径/查询等使附加后的完整JSON超出原上限：退回既有安全投影，保留原nextCursor及“原请求+cursor”契约。工具说明明确该字段可选，不能将缺少nextInput视为已读完。

第三种边界不影响已计量的本次反例。如果以后要求每个合法分页结果都强制提供完整nextInput，应另行评估提前纳入fits（可能减少每页格数）或宿主短scope handle（新增状态与撤销/版本生命周期）。本次首选不引入这两项成本。

实现位置：`main/spreadsheet-navigation-model-view.ts` 的投影和类型；`main/agent.ts` 的locate_spreadsheet调用处传原parsed请求并补明确说明。`main/spreadsheet-navigation.ts` 提取共用spreadsheetNavigationVersion，宿主和模型投影复用完全相同的identity/scope算法，避免第二套版本逻辑漂移。投影核对mode、mountId/path/hash及该版本后才附加字段。复用现有shared请求schema，无需接受宽松参数或放松cursor验证。

### 验收范围

- 重用本次失败前页安全回执及原请求，确认nextInput确实出现、保持startRow1/position41/version，完整模型JSON为有界内容，41格及全部原身份/覆盖字段原样保留。
- 用冻结工作簿执行nextInput，下一页从原范围未读单元格继续；仍将原cursor和startRow4组合时必须继续拒绝CURSOR_CHANGED。
- source/authorization/version变化继续拒绝；跨sheet/列窗口/query的旧cursor继续拒绝。
- sheets、rows、find_rows的有效分页均覆盖；扫描有进展但本页没有命中行仍能续页，不能提前宣称查全。
- 末页、unverified、错误/取消无nextInput；人为构造超限投影时无nextInput并完整保留既有分页结果，不删除资料、不提高预算。
- 对长单元格textOffset、隐藏/合并/公式及同名字段候选，nextInput和原模型无损投影都不改变原数据。

既有测试位置：`tests/spreadsheet-navigation.test.ts`（真实分页、长格、无进展与scope/source/authority绑定）、`tests/spreadsheet-navigation-model-view.test.ts`（无损默认值、UTF16及cursor）、`tests/spreadsheet-find-rows.test.ts`（find_rows分页与扫描覆盖）。新增 `tests/spreadsheet-navigation-continuation.test.ts` 7项覆盖完整请求、所有模式、空扫描续页、UTF16、错误/mismatch、10,000/10,001字符边界及长路径超限回退。异常/取消沿原工具抛错，不会进入成功投影；unverified无字段。

### 本轮实际验证与证据

定向四文件共 **23/23通过**，0失败/跳过；`npx tsc -p tsconfig.node.json --noEmit` 通过。本机真实回放读取同一冻结XLSX和原toolCall/toolResult，前页模型投影逐字段完全一致，仍41格/3,729字符；原TXT hash一致。附加后4,134字符，nextInput392字符；直接执行nextInput从 **J3 / textOffset=0** 继续，下一页40格。startRow4+旧cursor、来源hash变化、authorizationVersion变化均继续拒绝CURSOR_CHANGED。工作簿hash前后一致。

安全汇总：`.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/navigation-continuation-audit/safe-summary.json`；复现实验脚本同目录 `replay.mjs`，只保存安全字段及计量；`next-input.json` 只包含已有请求参数和cursor，无单元格正文/权限配置。定向测试日志同目录 `targeted-tests.log`。流程见同名 `.mmd`。

本轮证明续页参数缺口已修、旧分页数据和校验保留；未验证新云模型是否选择使用nextInput，也未证明总耗时或业务语义质量已改善。未build，dist仍未更新。

## 第二个有依据的候选：编辑回执提供精确复核起点

本例第一次read_draft默认读取全部6,610字符。edit_draft回执已有完整1,205字符diff、firstChangedLine=72和新hash。之后同一新hash的三次读取分别为 `[3900,5500)`、`[3100,4000)`、`[2100,3200)`，呈逆向寻找目标；第72行实际从UTF16 offset2,010开始，最后一页仍从该行中部开始。

因此第二候选是从宿主编辑后的真实文本/firstChangedLine计算可复制的局部read_draft起点，仍读取最新版本并核对返回hash；不删除复核、不让模型猜字符偏移。该候选需要验证CRLF、UTF16、批量编辑及期间版本变化，现阶段低于nextInput优先级，未实施，也未承诺把3次读取一定降为1次。现有 `tests/draft-edit.test.ts` 已覆盖UTF16 offset/limit/nextOffset及版本保护，可在将来增补精准起点用例。

通俗解释：这次不是文件变了，而是翻页时把“从哪一行开始查”也改了。让工具直接给下一页可复制的完整请求，能够减少重建参数和补读遗漏；但几百秒的总耗时仍不能全部归因于这一次错误。

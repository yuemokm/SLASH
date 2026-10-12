# 独立审查：工作表选段遗漏核定与修复

## 2026-10-11 跨表优先级根集成

真实 QE05/QE12 显示生成与审查均漏读机会门店工作表，旧失败不回填。新封存候选让跨表选段按当前请求/成果相关度排序，防止较早出现且字段相似的正式表占满预算；不扩大总预算、不替模型判业务正确。`main/content-review-spreadsheet-excerpts.ts` 与独有跨表回归已合入根，原 hash、patch 核验及仅行尾差异见 [集成清单](../.test-data/production-three-candidate-integration-20261011/integration.json)。类型检查通过，跨表/选段定向检查在 [targeted.log](../.test-data/production-three-candidate-integration-20261011/targeted.log) 中通过；统一全量/build、新真实任务仍待完成。

对应流程：[Mermaid](content-review-spreadsheet-selection-2026-10-08.mmd)。下文为 10/08 原始选段实现记录。

2026-10-08。需求：既有“业务准确性与核对可靠性”目标；本项编号 `CR-XLSX-SELECT-01`。本轮只修复宿主漏送相关工作表，不宣称真实云审查或业务语义通过。未启动桌面应用、未新增云调用、未构建产品、未修改业务稿及来源文件。

## 真实反例与确定性复原

Run `af67c8fa-8e32-4f55-822c-9b57476d0f23` 自然 succeeded，507.511 秒。独立实际 diff 确认只修订 PRD §4.1 的两行。独立内容审查提出候选问题：引用了“03 机会门店主数据”，S1 却只含“01终端网点主数据”。运行结束不代表这条候选解释正确，也不代表整体业务通过。

采用当时冻结 dist 中 `buildContentReviewInput`，从真实合同请求、最终 pending PRD、正式提取全文重新生成输入；没有重放模型。两个哈希均与真实 `task-acceptance.json` 回执完全一致：

| 项目 | 真实回执与复原值 |
| --- | --- |
| inputHash | `b42da2a973bfdbcd39bd09bee7fd9b3a8a8d362eb30a2749d543a5dc0215f71a` |
| promptHash | `47dec94226a246fe09eda547cc4ac5a98ac14f55990081c89ab3cd7596f946f9` |
| 来源全文 SHA-256 | `9e4c1f54b6925220edbe551cd560d57f663b9661092a30067573ea7a7af0820c` |
| pending PRD SHA-256 | `83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36` |

真实源全文有 63,164 个 UTF16 字符。Service 的 `readTaskReviewSource` 实际读取并复核了全文；03 表在全文 offset 40,775、第2599行，相关格也真实存在。问题发生在送审选段，不能归因于原 Excel 缺表或上游源文本读取失败。

旧送审 S1 只有区间 `[99,19003)`，第3–1220行，18,904字符，全部在01表。原选段把每个无空行的整张工作表当成一个段落；01与03的字段词重合评分均为210，按源文件顺序先选01，再将其截到剩余预算。扩展也只增长首次选中片段，无法跳到03。因此模型说“已提供的S1没有03”符合当次送审事实，但不能以01的字段值否定全文中03的规则，更不能据此自动改回正确修订。

旧 prompt 34,245字符，限额59,392字符；这不是模型响应长度截断。仅提高预算也不能解决通用的多表选段优先级问题。

## 最小实现

- `main/content-review.ts` 保留既有总预算、每源20,000字符上限、每文档最多8片段、固定身份及真实偏移绑定。只对来源中的正式 XLSX 单元格提取格式启用结构选段；HTML和普通Markdown继续沿用原路径。
- `main/content-review-spreadsheet-excerpts.ts` 识别工作表边界、原始单元格记录及行。用户请求明确提到的真实工作表优先于其他工作表的同名字段；没有请求命中时使用成果中的名称，再回退有界相关性选择。
- 多个命中的工作表先分预算；每张表保留标题、列头及请求中明确单元格所在行，再在同表内填充。后续扩展使用同一结构选择，避免只扩大第一段。原文不重写、不拼成伪造的连续表格。
- 记录原 `start/end/startLine/endLine`。过长值格可以部分提供，但明确记录 `CELL_TEXT_TRUNCATED` / `TARGET_CELLS_NOT_INCLUDED`，不据部分文本宣称完整核对。多个来源仍独立保留原hash、别名和引用绑定。
- 官方 `[隐藏工作表]`、`[深度隐藏工作表]` 标记均保留并作为边界；格式错误的工作表标题同样截断前表边界，返回有界诊断而不抛异常。标题占满额度却没有单元格时明确记录 `SHEET_CELLS_NOT_INCLUDED`。
- 请求中的文件夹名如 `ABC12/PRD.md` 不冒充单元格；`F1/F5:F8` 仍可用于选择。名称、地址仅作为选段候选，不能证明规则含义或权限。

未增加 shared schema、Service hints 或新来源读取链。旧冻结输入仍可校验，新的选段自然生成新的 input/prompt hash；旧审查不能沿用为新选段的结论。

## 同一冻结材料的离线验收

最终安全汇总：[candidate-summary.json](../.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/review-selection-audit/final/candidate-summary.json)。原基线：[baseline-summary.json](../.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/review-selection-audit/baseline-summary.json)。两次完整输入及prompt单独保存，没有保存模型思考或密钥。上级目录中的早期 `candidate-*` 为开发迭代；最终证据以 `final/` 为准。

| 验收项 | 旧送审 | 最终离线回放 |
| --- | --- | --- |
| 03 工作表标题 | 未提供 | 已提供，原offset40,775 |
| 指定14格 | 0/14 | 14/14完整包含 |
| 来源选段字符 | 18,904 | 18,817 |
| prompt字符 / 原限额 | 34,245 / 59,392 | 34,437 / 59,392 |
| 全文与PRD snapshot | 冻结原版本 | 逐字段相同 |
| dist运行模块 | 冻结基线 | 原hash全部不变 |
| 新模型调用 / 产品build | — | 0 / 0 |

最终 inputHash：`97e4edccae5efdce7aa0298c2d0e1e685e2e102630c66074b5724ba4aad20f6d`。最终 promptHash：`0cffa6a76d57985596d7f525aa003785cbab2c7031b1c39a9194e4ea75e46bff`。

[critical-cell-coverage.json](../.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/review-selection-audit/final/critical-cell-coverage.json) 保存每格原句、offset、原行号与旧/新包含状态；14格的旧状态全部false，新状态全部true：

| 单元格 | 真实提取原值 | 原文行 |
| --- | --- | --- |
| F1 | 来源 | 2610 |
| P1 | 是否允许前端发起变更修改 | 2620 |
| D5 / D6 / D7 / D8 | 经度 / 纬度 / 定位地址 / 详细地址 | 2672 / 2688 / 2703 / 2718 |
| F5 / F6 / F7 | 手动录入-sfa采集，不允许调整 | 2674 / 2690 / 2705 |
| F8 | 手动录入-sfa采集，允许调整 | 2720 |
| P5 / P6 / P7 / P8 | 是 | 2684 / 2699 / 2714 / 2730 |

最终目标表选段为5个真实区间，全部位于03表边界内。仅证明这些原句已进入送审材料；未覆盖的全文仍标记partial，业务含义和云模型是否正确使用材料尚未重新验证。

## 回归与边界

新增 `tests/content-review-spreadsheet-selection.test.ts` 覆盖后置目标表、同名字段、多目标表预算、多来源身份与引用、超长单元格、无关长行、JSON转义名称、超过片段限额、隐藏工作表、损坏标题、只有标题的额度及路径名排除。断言包括原始UTF16偏移、原行号、总预算、每文档片段限额与旧hash绑定。

最终定向命令：`node --import tsx --test tests/content-review*.test.ts`，70/70通过，0失败、0跳过，耗时16,990.9747毫秒；其中新增结构选段12项。日志：[targeted-tests.log](../.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/review-selection-audit/final/targeted-tests.log)。本轮已执行过主进程类型检查且exit0，根代理另统一执行最终check/build。本次不进行新的云模型验收，也未宣称整个PRD、HTML回归或性能目标完成。

通俗解释：此前审核拿到了整份资料，却只挑了第一张表给模型。这次让审核优先带上用户指定的工作表和原始字段，仍要继续区分“资料给全了”和“模型判断正确了”。

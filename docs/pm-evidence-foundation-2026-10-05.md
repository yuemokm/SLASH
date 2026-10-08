# PM 资料读取与证据检索

日期：2026-10-05。状态：源码、真实资料解析、全量测试及桌面验收通过，已包含在 0.3.8 便携版。本轮接续 0.3.7 的 Pi 原生上下文改造，不替代 Pi 的压缩与恢复。

## 为什么先做这一轮

实际项目 `slash test/资源/参考资料` 有 30 份 Word、6 份 Excel 和 3 份 PDF，其中 15 份 Word 超过旧读取限制。若干 Word 因插图达到数十 MB；Excel 用于梳理组织、人员、客户、网点、渠道和产品字段。旧 Agent 正文读取路径把 Word 压缩包大小等同于文本量并限制为 2 MB，不支持 Excel；GUI 的 Word 预览是另一条读取路径，不能由预览成功推断 Agent 已读正文。旧检索整句匹配并吞掉解析错误，无法区分“未找到”与“未查到正文”。这些缺口会使后续 PRD、交互和业务规则缺少依据。

本轮不增加独立管理中心，优先让已有会话正确获取资料。保留已授权目录、来源哈希、参考只读、副本处理、Plan/Build 和 ChangeSet 边界。

## 增加与移除

| 动作 | 变化 | PM 获得的实际帮助 |
| --- | --- | --- |
| 增加 | 登记副本的 Word、Excel 内置文本提取 | 无需自己写转换脚本，带图 Word 和字段表能进入原有资料流程 |
| 增加 | Excel 工作表、单元格地址、合并与隐藏标记 | 字段解释可定位到真实表格，不把空白、隐藏或公式缓存当作确定事实 |
| 增加 | 检索覆盖情况、未解析原因、片段与行号 | 区分有来源的证据与仍需读取的材料 |
| 移除 | 对所有格式统一宣称可用 read_file 阅读的索引说明 | 索引承诺与实际能力一致 |
| 替换 | 整句字面匹配、静默忽略失败和无界文件名结果 | 多词搜索、稳定排序、有界结果和明确限制 |

不删除用户资料、原有记录或旧接口；不自动把原件转换输出写回参考目录。

## 架构与协作

```mermaid
flowchart LR
  Originals[参考原件：只读] --> Search[文件名与可读正文检索]
  Search --> Evidence[片段 / 位置 / 覆盖范围 / 未解析原因]
  Originals --> Copy[Build：创建带后缀独立副本]
  Copy --> Verify[登记身份 / 字节哈希 / 权限核验]
  Verify --> Extract[成熟 Office 解析器：限量提取]
  Extract --> Draft[提取文本草稿 / 来源回执]
  Draft --> Apply[ChangeSet 应用与版本检查]
  Apply --> Search
  Evidence --> Pi[Pi：按需读取与上下文管理]
  Pi --> Output[PRD / 原型 / 流程 / 待确认项]
```

Plan 可以检索和提出处理方案；复制及提取结果写入属于 Build。解析不运行宏、公式、外部链接或宿主脚本。公式缓存不代表重新计算结果，缺缓存必须说明。大文件支持必须与解压、输出及资源上限一起实现，不能单纯取消大小校验。

## 验收要求

1. 真实资料测试只在独立副本进行；源文件前后哈希一致。报告区分合成测试、真实文件解析和真实模型业务质量。
2. 原件写入仍拒绝；未登记副本、跨项目、内容变化、撤权及 Plan 写入不得绕过原有保护。
3. Word、Excel 支持合理大小的输入，超限、损坏及不支持格式明确失败；不存在伪装成成功的空输出或静默截断。
4. Excel 保留表名与地址，处理公式缓存、合并和隐藏信息；不推断文件未给出的业务含义。
5. 搜索能对中文多词和中英混合查询返回可定位结果。无法读取的文件不等同于正文没有命中；文件名匹配也遵守返回数量上限。
6. 原有 API 兼容，主 Agent 与受控子任务接入一致的检索结果；旧测试与关键桌面工作流程不回退。

## 比赛效果的判断边界

本轮能够验证资料可达性、来源可靠性和操作流程，不能据此声称 PRD 业务正确或保证比赛名次。后续应以具体业务任务衡量需人工修订的规则数量、来源核对成本和真实交互完成率。比赛评分标准、时限和演示要求待用户补充；缺少这些信息不阻止先修复真实工作中的问题。

## 实际结果

- 代码：`main/office-extraction.ts` 提取已登记副本的字节快照；`main/service.ts` 与 `main/pm-workflows.ts` 保留权限、元数据状态和草稿提交；`main/evidence-search.ts` / `main/files.ts` 提供有界检索；`shared/evidence-search.ts` 定义可核对结果；`main/agent.ts` 主工具及受控子任务均接入；`main/agent-index.ts` 按格式提示真实读取路径。
- 库：复用 Mammoth 与 AdmZip，精确锁定 ExcelJS 4.4.0 和 Saxes 6.0.0。ExcelJS 负责工作簿解析，Saxes 仅预检 XML 资源限额。公式只显示已有缓存，不进行求值，参见 [ExcelJS 官方项目](https://github.com/exceljs/exceljs)。
- `npm run check` 通过：`.test-data/pm-evidence-check.log`。
- `npm test` 全量 **238/238** 通过：`.test-data/pm-evidence-tests.log`。其中包含 Office 解析、服务集成与证据检索新回归，以及原有 Pi 上下文、参考原件保护与其他能力。
- `npm run build` 通过：初次 `.test-data/pm-evidence-build.log`，界面修正后的最终构建 `.test-data/pm-evidence-build-final.log`；仍有原有前端 chunk 超过 500 kB 提示。
- 真实资料最终 **36/36** 解析通过（30 DOCX、6 XLSX），全部原件 SHA-256 前后一致。最大输入 36,125,683 字节，最大输出 359,686 字节；测试机器上的逐份复制提取耗时合计约 4.2 秒，不等于完整 PM 任务提效幅度。报告：`.test-data/office-corpus-2026-10-04T22-57-25-731Z/report.json`。这是隔离副本 parser 验证，没有打开或改写用户项目数据库、AGENTS.md，也未调用云模型。
- 首轮 **35/36** 的失败保留在 `.test-data/office-corpus-2026-10-04T22-54-05-309Z/report.json`。原因是 ExcelJS 将空共享字符串解析为未知空对象；仅对已确认的 String 类型空普通对象明确标注“待核对”，其他未知类型仍拒绝。另通过专项修复库的 `cell.value` 对公式缓存 0/false 的遗漏，改从 `cell.result` 获取并测试。

真实检索对照报告在 `.test-data/evidence-search-corpus-2026-10-04T22-55-34.156Z/`，只有少量片段，没有全文：

| 查询 | 原件：候选 / 全词覆盖 | 提取文本：候选 / 全词覆盖 |
| --- | ---: | ---: |
| 门店 开拓 | 19 / 2 | 30 / 10 |
| 访后 指标 | 5 / 1 | 19 / 6 |
| 网点编码 | 10 / 1 | 25 / 8 |

原件 39 文件中，17 份正文完整检索、1 份部分检索、21 份未读（15 份大 Word、6 份 Excel）；处理后的 36 份文本中，34 份完整检索、2 份受默认 100,000 字符预算部分检索、0 份未读。两次结果均标为 `partial`，不以更多候选数宣称正确率提高。全词覆盖也不能自动确认业务事实。

“网点编码”首条结果定位到 `05 网点主数据.xlsx.txt`，包含真实表格的单元格地址。检索 `textContentHash` 是提取文本哈希，不能冒充原件字节哈希。原件与副本字节哈希由处理回执分别保存。

Office 提取不读取 Word 图片内容、不保留版式；Excel 仅提取单元格值及声明的结构信息，不包含批注、数据验证约束、图表、图片 OCR 或重新计算后的公式结果。源资料中的待确认事项仍须保持待确认，不能因为成功解析而升级为已确认制度。

### 桌面验收与修正

- Office 最终 Electron 专项 **6/6**，3 次本地 HTTP 的真实 Pi 请求、0 页面错误：`.test-data/office-processing-ui-development-1791155187353/result.json`；日志 `.test-data/pm-evidence-office-ui-final.log`。实际点击创建副本、引用、Plan、Build 工具调用、应用草稿与预览，不能用这一夹具证明云模型业务质量。
- 主代理目视检查发现并修复三处产品误导：`src/App.tsx` 与 `src/PmWorkflows.tsx` 原先将 metadata_only 也计为已读；已应用内容预览仍称草稿；成功预览后旧的副本不可预览提示滞留。现在按输入快照区分“正文 / 仅文件信息”，按变更状态显示草稿/保存版本，只清理准确匹配的过期提示。新增 GUI 断言并再次目视复核。
- 原有工作区 GUI **14/14**、0 页面错误：`.test-data/workspace-ui-development-1791155242440/result.json`；日志 `.test-data/pm-evidence-workspace-ui-final.log`。覆盖目录、提示词、引用、副本、Pi 回复、取消、Plan 和重启恢复。
- 测试过程的失败证据保留。Office 前两轮脚本错误分别为误认为大 Word 的 GUI 预览一定失败、未等异步正文完成，记录在 `office-processing-ui-development-1791154750266` / `1791154814612`。工作区首轮 `workspace-ui-development-1791154838405` 在目录页签加载之前断言，失败截图已显示完整四页签；仅添加实际加载完成等待，保留完整原断言，再单独运行通过。

| 需求 | 实现 | 验证 |
| --- | --- | --- |
| PEF01：登记副本可提取 Office | office-extraction / service / pm-workflows | office-extraction.test.ts、office-processing-integration.test.ts、36 份真实资料报告 |
| PEF02：检索说明实际覆盖与位置 | evidence-search / files / shared 契约 / Agent 主子工具 | evidence-search.test.ts、真实检索对照报告 |
| PEF03：来源输入与变更状态诚实呈现 | App.tsx / PmWorkflows.tsx | Office 桌面 6 项检查与截图 |
| PEF04：已有目录与参考保护不回退 | 沿用原权限、索引、ChangeSet 和 Pi | 全量 238 项、工作区桌面 14 项 |

0.3.8 合并规则追溯后的全量测试为 250/250；打包版 Office 6/6、工作区 14/14、业务规则 13/13、模型容量 8/8，便携 EXE 直接启动与正常退出通过。打包证据、实际版本和文件哈希统一见 [0.3.8 交付记录](pm-business-trace-2026-10-05.md#038-打包交付)。

此轮尚未验证真实云模型生成的业务正确性，也没有替代飞书/钉钉、线上发布或 SMB 双机验收。下一轮业务场景见 [机会门店新建验收设计](pm-business-acceptance-scenario-2026-10-05.md)。

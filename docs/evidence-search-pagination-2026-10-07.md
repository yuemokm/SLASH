# 资料搜索分页与输出预算（2026-10-07）

关联资料研究、PRD/原型依据定位及第六阶段真实业务测试。真实 QE05 的两个 search_files 回执曾达 83,190 / 86,831 字符；QE16 的 mountId 不在旧工具 schema 内而被忽略，返回了跨目录的 100 项。此次修改减少回执长度、落实目录范围与分页版本，未修改 Pi 压缩、模型配置或来源读取预算。

## 执行接口

`search_files` 与子代理同名入口严格接受以下字段，拒绝未知字段和错误类型：

```json
{"query":"新增终端流程","mountId":"已有授权目录ID","limit":20,"offset":0}
```

空 query 列出当前范围的文件，不读取正文。mountId 可省略，省略时沿用现有授权目录；提供时必须是现有启用目录，且在目录枚举前限定范围。子代理有独立 mountId 时只能查该目录，不能借另一父代理目录扩大范围；search_files 必须继承 workspace_read 能力，仍经过工具白名单及父任务授权。

下一页使用同一 query/mountId 和上页的 resultVersion，不自行计算页位置：

```json
{"query":"新增终端流程","mountId":"已有授权目录ID","limit":20,"offset":20,"resultVersion":"上页实际返回的64位SHA256"}
```

limit 为 1—100，默认 20；offset 为 0—3000，非零必须携带版本。以实际 pagination.nextOffset 继续，可能因为响应预算不足而小于 limit；nextOffset 为 null 表示当前已发现的命中分页结束。Files.search(query) 的数组返回形式保留；可信宿主显式 maxResults 旧选项仍可用，新 limit 优先。

## 完整响应与证据边界

整个 JSON 默认最多 16,000 字符，包含 items、coverage、limitations、scope、版本与分页 metadata；子代理外层 tool/results 包装也计入预算。可信宿主可选择最多 64,000 字符，模型工具不能自行增大预算。仅选择完整命中条目，诊断必要时按类型有界汇总并保留真实总数；不截断序列化 JSON、不裁掉路径拼成无效引用、不跳过过大的下一条。单项无法完整放入页面则明确 SEARCH_ITEM_RESPONSE_LIMIT，当前 offset 的命中保留为待处理。

每条保留原 score、matchKind、matchedTerms；可读正文命中保留真实连续 snippet、行号与解析正文 hash。精确中文文件名优先。路径命中、二进制 metadata 和未解析的 Office 文件不能证明正文已读。分页只是当前已检索范围的命中，不能证明资料全集已找到。coverage.matchedFiles / pagination.totalMatches 均指本次实际发现的命中总数；coverage.resultTruncated 表示单页不是全体已发现命中，coverage.status 则表示扫描/解析范围是否完整，两者分别解释。

正文原有限额继续保留：默认扫描 500 文件、每文件 100,000 字符、累计 1,000,000 字符、开始扫描时间预算 15 秒；硬上限分别为 1,000 / 200,000 / 2,000,000 / 30 秒。目录枚举保留 3,000 文件及 12 层限制；解析已开始时不强行中断。任何限额、解析失败和不可用目录仍明确报告，不能把响应变短说成扫描更完整。

## 翻页一致性与权限

resultVersion 是当前查询/范围、实际目录版本（路径只进入 hash）、当前可见排序结果、已读正文 hash、扫描覆盖的确定性摘要。每页重新读取授权和扫描，不保存新的全文缓存。列表、实际文件版本、已读正文或授权改变都会拒绝旧版本：SEARCH_RESULTS_CHANGED / SEARCH_ACCESS_CHANGED / PERMISSION_DENIED，要求从 offset=0 重搜；耗时预算导致实际扫描范围变化也会拒绝旧页，不能默默混页。

读取前、解析后及返回前仍复核授权。撤权后不返回撤权文件的路径、正文片段或含路径的诊断；版本只公开 hash。当前查询不授予任何新目录权限。真实文件系统空查询也绑定大小、mtime/ctime、文件身份和规范路径的目录版本，即使文件被改成相同字节长度，也不能沿用旧页。

## 验证与限制

- `npm run check` 已通过。
- `npx tsx --test tests/evidence-search.test.ts tests/evidence-search-subagent.test.ts`：16/16 已通过，覆盖范围在枚举前生效、中文精确首位、默认/显式页大小、多页完整无丢项、正文/列表变化、同长度空查询修改、撤权不泄露、超长路径/多诊断完整 JSON 预算、Pi 实际工具本地执行及子代理目录/能力/白名单继承。
- 最终联合回归 `npx tsx --test tests/evidence-search.test.ts tests/evidence-search-subagent.test.ts tests/office-processing-integration.test.ts tests/pdf.test.ts`：22/22 已通过。新增子代理测试使用隔离临时目录，读取前后 hash 确认正文未改。Pi 工具执行测试创建实际 Runtime 并直接执行工具，没有模型请求。
- 本专项没有构建、启动真实应用或发送云请求。新的 QE05/QE16 真实模型回归仍由主任务统一构建后执行；本地通过不能冒充其真实业务验收完成。

图见 [evidence-search-pagination.mmd](diagrams/evidence-search-pagination.mmd)。

通俗解释：搜索会先给模型一小页有用资料，再按需要翻页。模型指定哪个资料目录，就真的只在那个已授权目录里查；资料或权限变了，旧页凭证会失效，要求重新查。结果变短不代表少报问题，也不代表已经看过全部资料。

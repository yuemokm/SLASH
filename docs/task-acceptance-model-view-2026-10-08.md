# 模型任务验收摘要与按需详情

2026-10-08。关联质量目标 2、4、6：模型先读取真实要求/成果/来源目录与问题摘要，再按需核对冻结要求和证据。本模块不裁决业务语义，不更改模型预算、Pi 压缩策略、领域合同或旧数据。

实现：`shared/task-acceptance-model-view.ts` 定义严格请求/响应；`main/task-acceptance-model-view.ts` 提供身份索引、有界序列化与报告投影；Service 负责同会话、版本与来源链授权；Agent 的模型工具接新适配器。原 `getTaskAcceptance`、UI/IPC 和领域持久报告保持完整。模型 `check_task_acceptance` 仍调用原宿主检查，但回给模型的是新摘要，详情通过 getter 取得。原宿主 callback 结果不改为摘要。

## 输入与响应

```ts
get_task_acceptance({
  runId?: string, // 默认当前Run；只能读同会话已有任务
  section?: 'summary'|'requests'|'outputs'|'criteria'|'baseline'|
            'sources'|'reads'|'prd'|'report'|'history', // 默认summary
  sourceId?: string, // sources/reads的文件版本筛选
  readId?: string,   // reads的精确读取回执
  reportId?: string, // report的历史检查
  itemId?: string,   // requests/outputs/criteria/baseline/prd的条目
  limit?: number,   // 默认10，最多20；只改变页尺寸
  cursor?: {position:number; textOffset:number; version:string}
})
```

section 与筛选不匹配、未知字段和无对应条目明确拒绝。每次完整 JSON 响应（包含包装、转义、notice、游标）最多 12,000 个 UTF-16 字符。摘要说明全部类别/数量、要求/输出/来源的有限 ID 预览、检查状态及失败数量/摘要；未列 ID 和未展开要求都有详情入口，不能把未展开误认为不存在。超过前几个预览的 ID 分别从 `requests/outputs/sources` 续读。

小条目在 `items[].data` 返回完整对象。超大单项以 `encoding: 'json'` 返回原完整 JSON 的精确片段，带 `itemHash`、`totalCharacters`、`textOffset`、`text`、`complete:false`。这些片段不是完整证据；调用方须同 hash、连续偏移取齐后再解析。不能装下的下一项不会被跳过；最后一片之后才进入下一项。切片避开 Unicode surrogate pair，输入和输出游标使用相同安全整数边界，并核对实际内容长度。游标无进展会拒绝，不返回无限空页。

游标 `version` 绑定 Run、合同 hash、完整读取列表、报告状态、当前授权、源文件/登记链状态及 section/筛选。改变 section 或筛选必须从第一页开始；合同新增要求、重新读取、来源或授权变化后不能续旧页。`limit` 不参与版本，因为它只决定页尺寸。`itemHash` 额外绑定大条目原序列化对象，不能把不同 hash 的片段拼起来。

## 来源身份与覆盖

`sourceId` 保留原 mount/path/contentHash 的 32 字符文件版本身份。`readId` 派生自 Run 与完整原读取回执，区分目录、正文页及字段证明。来源索引只包含当前 Run 仍存在的读取回执；合同冻结来源另在 `prd` 展示，已从 100 条 Run 回执上限移出的冻结来源标明不可重新选择。

不同文件版本不按路径合并。每次字段回执的原证据数组上限不改，不把多次读取的所有 proof 合进一份新回执。`includedCharacters` 不求和，重复或重叠片段不升级为全文。只有单份 `truncated=false`、无 metadata/catalog 标记且 includedCharacters 等于 characters 的原回执，目录才标明存在单份完整正文读取；仍不确认业务含义。

模型重新选择已冻结的同一 `sourceId` 时，Service 先检查该版本仍在当前 Run 的真实读取列表、当前权限及实际 hash，再精确复用合同原回执。后来的 readAt、locator 或 proof 不覆盖原合同，合同 hash 不会因这种重选而改变。新文件版本仍不能覆盖领域的不可变来源，旧资料与报告不迁移。

`selectable` 仅表示可以选择 TXT 文件版本进入来源合同，不代表原 Excel 链有效，也不意味着该版本所有 proof 都已登记。摘要同时显示 `textVersionState`、`provenanceState` 和 `proofVerification=not_checked`，避免把 TXT 未变误认为字段证据当前。

## 权限、原件链与成本

Service 投影前后核对工作空间、权限、合同和读取列表。登记处理来源通过已有 processing resolver 按文件/版本去重核对原件、副本与 applied 提取链；普通 TXT 或伪造名称不能冒充 Excel 登记链。摘要不逐份回执解压或重验几何。只有 `reads` 或冻结 PRD 来源详情的所选回执，才复用既有 `verifySpreadsheetField`，使用共享 256 MB 预算及同字段输入去重。

原 Excel 改动/撤权而 TXT 未变时，旧原值和来源引文不会从 reads、PRD、报告、候选要求或基线旁路返回。不能精确拆分的来源衍生长文本保守隐藏。报告模型投影省略重复 spreadsheetEvidence/fieldEvidence，指向原读取详情；完整 UI/持久报告不变。失效历史可查看身份/状态，不能作为当前有效证明。Plan 只读同会话历史；不会获得定义、检查或跨 Run 使用 proof 的新权限。

当前适配器仍复用 `TaskAcceptanceDomain.get` 动态刷新报告与内容审查，因此可能读取成果和来源正文；注册来源链 hash 核对也有磁盘成本。本轮证明的是模型响应有界、证据身份与保护正确，不宣称已证明整轮任务提速或降低压缩次数。没有改变源资料、模型参数或上下文分配。

## 验证

新增测试位于 `tests/task-acceptance-model-view*.test.ts`：完整 JSON 字符边界、转义与 Unicode、巨大首项/中项/尾段可继续、游标往返及筛选绑定、读取与文件版本身份分离、同来源重选合同不变、eviction 不可选、只读 Plan/同会话边界、真实 XLSX 原件变化/撤权且 TXT 不变时所有详情入口保护，以及真实 Pi 本机 HTTP 的默认 `{}`/长项详情/失败不回退无界旧 getter。

本机 HTTP 是明确的 fixture，不证明真实模型理解或业务验收通过。根代理统一构建已通过；类型检查、65 项定向以及串行全量 **675/675** 通过，零失败、取消、跳过（441980.0083 ms）。全量日志为 `.test-data/task-model-view-integrated-tests.tap`，构建日志为 `.test-data/task-model-view-integrated-build.log`。构建保留既有大于 500 kB 的渲染包体积提示，没有制作便携版；主进程更新须重启开发应用。真实任务效果独立保留，不能由这些测试推定。

真实旧 QE12 隔离回放已完成：默认摘要 3311 字符，88 次 Service 调用的最大响应 8270 字符；24 条真实读取回执和 25 条唯一字段证据完整恢复。原件 Excel 变化而 TXT 未变、TXT 改变、撤权均按预期使旧读取失效。169 项旧资料及案例文件不变，零模型/网络调用。原合同 PRD 来源和 baseline 均为空，非空真实场景未覆盖；回放未导入原型报告/截图的完整依赖，因此完整历史报告正文恢复未验证。首次测试桩计数失败保留，修正统计后新目录复跑通过，未改产品代码。见 [真实回放及限制](../.test-data/task-acceptance-projection-real-proposal/ONE-PAGE-RESULT.md)。

通俗解释：现在模型先看到检查目录，需要某条规则或表格证据时再翻页查看。软件不会把“同一文件读了几次”当作“读懂了整份资料”，也不会因为提取文本没变就继续信任已经变化的 Excel 原件。

流程源：[task-acceptance-model-view-2026-10-08.mmd](task-acceptance-model-view-2026-10-08.mmd)。

# 第二阶段质量检查最小闭环

质量检查通过 `qualityCheck` IPC 请求读取已注册成果（也接受 `mountId/path` 作为兼容入口），按 `ArtifactRecord.kind` 选择确定性检查：`flow` 使用现有 draw.io 解析与规范检查，`prototype` 使用 HTML 根节点、资源和运行时网络检查，`document/template/knowledge/reference` 使用 Markdown 结构检查。检查结果统一返回 `blocking` 与 `warning` 两类问题及 `valid` 汇总，不会写入成果文件。

请求可以带 `versionId`。主进程沿用 `listFileVersions`/`readFileVersion` 的历史快照路径读取版本，因此检查报告中的 `versions` 与成果阅读器历史列表使用同一来源。默认检查当前版本，并在返回的 `artifact` 中带 `versionId`、`contentHash` 与 `currentVersionHash`。

交付清单来自现有外部操作记录：按成果挂载、相对路径和版本哈希聚合 `document_delivery` actions，保留 pending、succeeded、failed 和 `outcome_unknown` 状态、operationId、receipt 与诊断。结果未知仍显示为待核对，不会被质量检查改写为成功。

接口示例：

```json
{"type":"qualityCheck","artifactId":"artifact-id","versionId":"current"}
```

返回 `{ artifact, check, gate, versions, deliveries }`。`check` 兼容原有 `valid/issues/counts` 字段，同时提供 `passed/blockingIssues/warnings/recommendations/checkedVersion/contentHash/checkerVersion`。`gate.code` 为 `QUALITY_PASSED`、`QUALITY_BLOCKED` 或 `VERSION_CONFLICT`。

Agent 的 `propose_external_action` 和桌面手动 `deliver`/`mcpCall` 都先登记待审批提案；手动入口另记录 pending 操作，禁用 `external_action` 权限时拒绝登记。文档 dry-run 只预览请求，仍检查该权限。在外部文档交付审批时，主进程会再次读取文件并校验哈希、质量阻断项和同一成果是否存在 `outcome_unknown`。检查失败会拒绝创建执行操作，避免界面上的旧检查结果绕过门禁。批准后的执行及远端回执统一关联提案，结果未知不能自动重试。

`decisionCenter` 聚合开放需求问题、活动业务假设、未解决评审问题和待核对交付；`artifactDiff` 根据历史版本和当前版本生成行数、章节结构及成果关联影响摘要。两者均为只读、可重复计算的接口。

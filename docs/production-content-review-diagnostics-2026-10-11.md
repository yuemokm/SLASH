# G4 内容审查结构诊断与覆盖边界

2026-10-11：四文件候选已封存，并在 QE16 运行窗口结束后由 baseline 串行合入根源码；Service 仅合并两处局部变更，另保留单文本交付 fence 的独立变更。根 `npm run check` 已通过；组合专项当时仍在会话 32084 验证，完整构建待统一执行。本批云任务继续保留原运行版本，没有重新调用审查模型或回填回执。

根集成回执：[integration.json](../.test-data/production-safe-review-and-fence-integration-20261011/integration.json)。组合 Service SHA-256 为 `64163f5dc04c1842253a277d76b2e2116190cc826bb47a443f833c07d34f6c06`，不是整文件覆盖隔离候选。下述隔离封存和失败历史继续保留。

## 本批 QE05 的真实诊断

回执 `63817cff-296f-418b-9a17-15a0d8a3fbeb` 实际使用 wire v4，每项总引用最多 **4** 处。只读复构原授权字节、任务合同及读取回执，精确匹配原 `inputHash=6acd333e…0921` 与 `promptHash=b28569be…5bd4`；对应 schema hash 为 `a67bc48c…e95d`。不是旧版最多 3 处规则。

原响应 873 字符，但 Store 只保留响应及结果 hash，未保存无效 finding 原文。因此各引文数组的确切数量、合计以及是否指出“空白门店/机会门店对象列混用”均无法恢复，不根据 `QUOTE_TOTAL_LIMIT` 推断业务内容。独立业务核对的 violated 结论保留。

本次审查实际输入 `0..15530` 全部文字，仍显示 partial，是 Service 沿用了生成阶段最后一条 `characters:12000-15530, truncated:true` 来源回执。生成阶段的两次分段读取不自动等于审查覆盖。数据库、空 WAL、SHM 的前后 hash 均相同。

证据：`.test-data/qe05-content-review-diagnostic-aa6fcfde-6774-46ea-8042-3648fa49c8b2/final-report.json`，SHA-256 `529db1168bffc95d97f89e46284181c6353e3a594c16be62a5140c27d1701221`。原审查输入只作为独立复构证据保存，没有替换原试次文件。

## 最小候选

- `shared/content-review.ts`：可选 `structureDiagnostics`，记录宿主 wire/schema 身份、引文数量及安全错误码、输入覆盖元数据；旧回执缺字段继续兼容。历史诊断版本允许 1..1000 的有界整数，当前请求仍严格校验当前 wire。
- `main/content-review.ts`：在解析后、丢弃无效 finding 前记录结构。最多保存 3 条 finding，超额保留原数量与 `findingsTruncated`；最多 220 项输入覆盖，每项最多 8 个宿主原文区间。缺数组的数量与总数为 unknown，不截短引文、不提高 wire 限额、不替模型修正文义。新字段纳入既有 `resultHash`。
- `main/service.ts`：本次审查来源覆盖复用现有完整授权读取、读前后原文件 hash 及冻结 hash 核验。纯文本不再继承生成阶段 `truncated`；真正审查预算选段由现有 `context` 判定。Office 和 PDF 文字提取仍为 partial，不声称图片或原容器已完整核对。生成 `sourceReads` 不改。
- 独有测试：`tests/content-review-safe-structure.test.ts`。无效 finding 的原文、解释、任意字段及凭据不进入新增结构诊断。没有新增完整响应日志。

隔离目录：`.test-data/content-review-safe-diagnostics-candidate-49f04f9a-fe96-4589-8769-8ec45c6e5211`。四文件原/新 hash 见 `seal.json`；seal SHA-256 为 `6f787b05a19ca45cb070961f91c7ea27eb27aa4725fe06f90bc813e0e28c89a7`。`main/service.ts` 只能用两个局部 hunk 合并，不能整文件覆盖其他候选；相对路径 patch 的隔离基线检查 exit 0。

## 定向验证

隔离 node 类型检查 exit 0；专属最终 **10/10**，6592.7113 ms；wire4、HTML/文本原始区间与结构诊断回归 **36/36**，7609.4024 ms。真实 Service 确定性 runtime 验证完整读取 15530 字符审查 full、生成两条 truncated 回执原样保留、Operation 只保存安全数量、源 hash 改变拒绝；没有真实供应商调用。

反例覆盖 5 引文拒绝、4 引文原权限不提升、缺数组 unknown、20 findings 有界保存、无效 JSON、历史版本/旧字段兼容、resultHash 改动拒绝、真实预算截断 partial。PDF 夹具验证可读取文字的容器仍 partial，以及无可提取文字的空白 PDF 返回既有无 OCR 错误；**没有用空白 PDF 证明扫描图片/OCR 行为**。

首个 PDF 夹具因零成果违反既有 schema 失败（34/35），已补最小真实产物后复验；原失败日志保留。最后只纠正夹具命名与读取方式，专属 10/10 再验。没有运行根全量、构建、Electron 或付费云任务。

通俗解释：以后审查出错时可以知道是引用数量还是格式问题，又不会保存私密原文；同时“任务先前只读了一段”和“审查这次读了全文”会分开记录。看完提取文字仍不能代表看过 PDF 图片。

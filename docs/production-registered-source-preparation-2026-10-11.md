# 真实评测前的来源登记

需求：G2/G4 来源版本与证据；F03 原文检索；跨授权目录与工作簿导航。

旧版 QE05/QE12 实际漏读字段工作簿的“03机会门店”内容。新轮次在首个 Run 前复用官方 `copyForProcessing` → `processProcessingCopy(extract_text)` → `apply`，为本轮全部已授权 XLSX 登记真实处理链。原件只读，完整文本不按用例检查项裁剪；准备回执不能宣称模型已读，也不作为任务成果。

实现：`scripts/quality-evaluation-source-preparation.mjs`，导出 `prepareRegisteredEvaluationSources({call,manifest,caseDir,sources=manifest.sources,sourceMountId,originalMountId})`，返回完整 `sources` 映射和 `receipt:{path,sha256}`。runner 由独立评测候选接线，顺序必须是挂载 → 来源准备 → 关联真实回执 hash → start → 首次 send，不回写 manifest。

边界：来源 ID 唯一且与 manifest 全集一一对应；任何既有 Run 均拒绝，不能补登记旧试次。处理目录原有权限不扩大；副本、输出、原件前后原始字节 hash 均核实。正常与已应用复用都核对真实回执和文件；失败只保存失败及部分真实记录，不产生“准备完成”回执。完成 `host-preparation.json` 独占创建，已有证据不覆盖。

证据逐条保留 copy/process 返回身份，以及 `preparationChange` 的真实 id、`runId:user-processing`、mount/path、createdAt、contentHash。任务成果、首稿耗时和模型 sourceReads 应按实际任务 Run 归属统计；不能只依赖 `countsAsArtifact:false` 标记。

2026-10-11 封存及根合入：helper SHA256 `f464b723a9d56c05206cd57c0554ea04bd0cc08446ae73d436a4d8b3491fe4f3`；独有测试 SHA256 `0859ea75bfe1329ecd947648036b2e612730e84aec11bb2355312461ab1810a1`。根新文件不存在与封存字节均验证后 create-only 合入，未改旧 profile。

验收：11/11，12,725.3114ms；脚本语法检查通过。测试通过真实 Service + request schema 跑处理/应用和随后真实 Run，证明两个准备 Change 属于 user-processing、任务合同只含 actual-run.md、deriveFirstDraft 取真实任务 Change，catalog `includedCharacters=0` 不冒称模型已读。另含重复掩盖缺失、既有终态 Run、只读处理目录、原件变化、权限撤销、错误提取及部分失败反例。此为真实 Service 机制验证，`realModelGeneration:false`、`realElectronIPC:false`；新 runner 与付费模型任务的完整效果仍待统一集成后验收。

实际日志与回执：

- [11 项最终日志](../.test-data/registered-source-preparation-candidate-20261011/source-preparation-handoff-final.log)
- [封存清单](../.test-data/registered-source-preparation-candidate-20261011/frozen.json)
- [根合入回执](../.test-data/registered-source-preparation-candidate-20261011/root-integration.json)
- [真实 Run 归属证据](../.test-data/registered-source-preparation-candidate-20261011/.test-data/registered-source-run-8fb4d8cb-5b35-44f0-975a-ef1884eb584a.json)
- [Mermaid 源](production-registered-source-preparation-2026-10-11.mmd)

简单说：先把工作簿按产品现有方式登记好，让模型能找到正确工作表；登记本身不代表模型读过，更不能拿来代替最终成果验收。

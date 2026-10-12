# G2 · 当前版本交付核对

关联 PF10/PF11/F03，实施日期 2026-10-11。领域复用既有 TaskAcceptance、内容/视觉审查、资料身份函数及 DeliveryGate；不新增 Agent 底座、模型工具或第三方依赖。原资料、报告、版本、自动检查事实均保留。

## 可执行契约与行为

`shared/task-delivery.ts` 定义逐项 `confirm/dismiss/accept_limit` 的严格 schema；所有提交绑定 run、具体 report、contractHash 与 bindingHash。bindingHash包含完整报告、当前合同、首检锚点、已授权可选范围及本次全部业务来源。每项人工核对需要具体说明、页面/段落位置，以及该项全部要求、成果、资料身份；内部ID由UI提交，用户不输入hash。

`main/task-delivery.ts` 独立记录宿主人工核对，不改 TaskAcceptance 自动报告。业务完整核对逐用户要求执行；资料逐来源核对；HTML逐页面核对实际交互与视口。必需内容/视觉审查未完成时仍为关键项，完整人工替代核对必须覆盖约定要求、成果和业务资料。DOM断言或模型自评不能替代人工视觉核对。模型候选意见“不采纳”须保存原文/截图引用及理由；没有真实来源身份映射不允许处置。

来源身份复用 `taskModelSourceId`：SHA-256(mountId + NUL + businessPathKey(path) + NUL + contentHash)前32位。来源集合包含合同PRD来源及真实run.sourceReads，后者不一定出现在report.sources。每次读取及提交复核实际源hash与授权；缺来源读取器、映射丢失、资料撤权、版本变化都阻断。成果、依赖、合同与报告变化使旧确认失效。

所有明确自动失败、关键unknown、来源/版本/权限不明、冻结回归失败或未验证均不可豁免。普通草稿保存不经过此门禁；正式本地导出、CLI交付及成果MCP发布须由真实宿主入口预检并在实际写入前再核对。MCP发布绑定具体任务与成果，不能用任意参数假装成果身份。

## 可达的非关键范围确认

首报前点击会要求用户抢在自动检查前操作，不能作为实际产品入口。因此 `TaskAcceptanceDomain` 在首次检查开始前保存不可裁剪锚点：原本required:false、普通model_proposal检查的完整定义摘要，以及永久保留的失败ID账本。模型的required:false只产生候选资格，不产生交付授权。

现有任务质量面板在任务结束后仍可让用户逐项选择候选并填写理由。`taskAcceptanceOptionalSchema` 的 `{runId,expectedContractHash,criterionIds,note}` 只能由可信桌面IPC送入 `declareOptionalFromUser`；宿主记录真实结构选择的plan_confirmation输入及desktop_user amendment，随后重新检查当前合同。原required:true、用户必检、资料规则、模板、宿主结构/业务来源检查、冻结回归、曾明确失败及改过定义的项目不能降级；旧记录缺候选锚点时保守拒绝。历史只留50份报告不会抹掉首检身份或失败账本。

范围声明后仍需在当前报告逐项 `accept_limit`，才可得到 `accepted_with_limits`。限制继续显示为unknown，不称已验证。原 `amendCriterionFromRequest` 的引用用户原话只用于宿主已确认变更，不能作为模型自行识别非关键授权的依据。

## 检查与证据

领域专项：`npx tsx --test --test-concurrency=1 tests/task-delivery.test.ts tests/delivery-gate.test.ts tests/task-acceptance.test.ts`，32/32通过。新增9例覆盖真实Service来源身份、原始引文、业务/视觉完整核对、明确失败不可接受、首报后实际范围选择、未声明不得放行、定义变化、旧候选锚点缺失、52轮后失败账本仍保留、来源撤权/改稿/依赖/合同变化、冻结unknown回归、缺源读取器及宿主失败理由保留。`npx tsc -p tsconfig.node.json --noEmit`通过。

日志 `.test-data/production-task-delivery-20261011.log`，源码快照 `.test-data/production-task-delivery-20261011-source-hashes.json`。Service正式门禁测试由接线代理维护 `tests/task-delivery-service.test.ts`；IPC/UI/本地导出/CLI/MCP入口整体验收由主代理记录，领域通过不代表这些入口全部真实通过。未执行真实云账号写入、真实CLI远端交付或真实MCP发布。

人工核对是用户逐项提供的真实决策，领域不能独立证明用户确实阅读每个页面。记录达到1000条时保留全部旧记录并明确拒绝新增，不自动删除历史。允许带限制只覆盖可信声明的原始非关键unknown，绝不改变关键失败事实。

# 2026-10-07 复杂任务的有界宿主预算

关联 F19 任务与恢复、普通草稿增量制作。集中策略为 `main/run-limits.ts` 的 `DEFAULT_RUN_LIMITS`：单次任务尝试 30 分钟、最多 120 次工具调用。未新增用户设置；后续配置应复用此策略。Service 的截止时间、调用计数和超限文案均取同一策略。

## 证据与取舍

2026-10-06 用户原始任务已有严格 600 秒的宿主超时记录。后续隔离合成任务的正式 resume `43006102-6a3f-4bb0-b217-ed8b75309f2a` 在 15:42:06.397Z 开始、15:52:06.540Z 终止，实际 600143ms，保留 29393 bytes pending；截至终止时有 6 次成功增量编辑、22 次草稿读取，仍在制作有效内容。只读核对 `pm-operations-real-2026-10-06T15-02-09.188Z-0W1tPJ/protocols/completions/profile/slash.sqlite` 的 state 后，确认其 status=failed、error=`TIME_BUDGET_EXCEEDED: 任务超过 10 分钟运行预算`，并非仅根据 receipt 的摘要推测。原 resume receipt 早期 summarize 未包含 error 字段，缺字段不表示产品未存错误；原回执保留。固定 10 分钟限制在此复杂任务中切断了实际进展。该证据支持扩大默认宿主上限，不证明上游连接、模型行为或最终原型质量的问题已经根治。

新预算仍是每次尝试的有限总额，不根据每条输出无限续期。第 121 次调用在执行函数前拒绝，记录 `TOOL_BUDGET_EXCEEDED: 单次任务最多调用 120 次工具`。30 分钟到期沿现有宿主 cancel 路径中止当前 runtime，记录 `TIME_BUDGET_EXCEEDED: 任务超过 30 分钟运行预算`，保留未应用草稿与恢复检查点。真正用户停止继续保持 cancelled / 不可恢复语义。Pi 网络空闲、重试、压缩、取消和外部结果未知保护均保持原实现，外部操作仍不可盲目重放。

## 草稿分页契约

`shared/draft-edit.ts` 为 offset/limit 增加工具 JSON Schema 描述，`main/agent.ts` 同步解释：两者均为 UTF-16 字符单位，分别默认 0 / 8000，不是行号/行数。limit 继续允许 1–16000，不加硬性最低块大小。查看整文件优先完整块并使用回执 nextOffset 继续，局部精确定位仍可用较小值；避免以几十字符反复遍历整个文件。最后一页没有 nextOffset；truncated 表示该回执只是全文的一部分，不代表最后一页仍有后续内容。

## 验证与范围

- `tests/runtime-limits.test.ts`：42 次实际 Service `read_draft` 网关读取成功；Node 虚拟 setTimeout 时钟在 10 分钟及 30 分钟前 1ms 仍运行，在 30 分钟到期后中止、保留草稿与可恢复检查点。无需真实等待。
- `tests/runtime.test.ts`：120 次调用函数实际执行，第 121 次不执行并登记失败。
- `tests/draft-edit.test.ts`：UTF-16 emoji / nextOffset、默认 8000 字符分页、完整拼接及合法小块。

`npm run check` 通过；运行预算、草稿编辑网关、恢复链、精确继续、流错误保真的定向回归 49/49 通过，日志 `.test-data/runtime-limits-targeted-20261007.log`。

此次只修改源码，由主代理统一构建并记录新的 runtime manifest。旧真实任务仍保留其旧预算、失败与回执，不覆盖历史证据；新策略下复杂原型是否能完成仍须真实任务和独立浏览器验收。流程见 [任务预算 Mermaid](diagrams/runtime-limits.mmd)。

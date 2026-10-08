# 内容审查沿用已配置输出上限（2026-10-07）

独立内容审查使用同一真实模型、协议、思考设置和 Pi Runtime。此前 Runtime 对审查另外施加 `min(4096,model.maxTokens)`，与主会话同模型已配置 12000 不一致。现在仅取消该额外截断，请求 `maxTokens` 沿用已解析的模型值。

本次保留 Service 原有资料字符选段、协议与严格校验、真实来源/成果绑定、最多两轮原会话局部修正、无工具只读审查、授权/取消与一次原生传输重试。不修改用户模型配置、不新增 packet 分配循环、不改变保存或发布门禁。

## 预算含义及兼容边界

- `requestedOutputTokens` 是传给原 `completeSimple` 的请求上限，不保证实际获得全部输出；Pi 继续在原生请求路径根据上下文估计夹紧，提供者及协议的 thinking 处理也会影响有效余量。
- Service 选段仍用原公式：`min(100000,contextWindow-min(4096,maxTokens)-2048)`，这是字符限额，不声明字符等于 token。完整用户要求仍在冻结 snapshot 中，选段不足仍标记 partial。
- 两个可选安全诊断只记录数字：`hostPiEstimatedInputTokens` 是公开 Pi helper 的估计；`hostPiBaseClampedOutputTokens` 是同 packet 在 Pi 基础参数阶段预计夹紧后的上限。它们不是上游实际 token，也不是跨协议最终 payload 保证。正常诊断不会进入 UI 错误/限制列表。
- `usage.reasoning=0` 可能来自 Pi 对缺失提供者字段的归一化，不能证明实际思考为零；thinking 字符数也不能当作 token。思考正文、完整 HTTP 与凭据不记录。

曾准备按最大输出全量预留资料空间的候选，但有效 16384/12000 配置会从能构建 3718 字符协议变成提前拒绝；该候选未迁入。正式实现保留原选段，让原生 Pi 根据准确 packet 减少实际输出上限。8192/4096 的旧 2048 字符 fixture 本来就放不下完整协议，仍保持明确未验证。

## 真实一次对照证据及限制

旧 D 回执 `9499ce07-506d-49e7-b647-f43d3412e657` 请求 4096，实际提供者 input15123/output4096，终态 length、可见正文0；审查未验证。

新隔离对照保持同一个 input/prompt，唯一运行变化是请求 cap 4096→同配置 12000。实际 input仍15123，output6326，正常 stop，430字符可见正文可解析，耗时212314ms。此结果支持取消软件额外截断，但 findings0 未发现既有质量问题，不能证明业务审稿有效。

输入身份：`2d69926e5b7883a977f586a821d3cacf4fc33e75a01853ef91d2535a114d6e4e`；提示身份：`f0a62ff6bb9cc9bf8acef2fe684b365cda04d62aa4c1d9a2056d928d5d25169a`。旧 D 资料与成果不变，独立宿主关闭且672项保护一致。真实对照见 [结论与回执](../.test-data/content-review-schema-candidate/readonly-real-D-12000/COMPARISON.md)，候选与正式定向检查在 `.test-data/content-review-budget-candidate/`；原 D 不覆盖。

## 代码与回归

- `main/content-review-budget.ts`：仅验证已解析限额、返回原配置输出上限与中性提示，调用公开 Pi normalize/estimate/base-clamp 作安全诊断。
- `main/agent.ts`：独立审查包装使用该上限及诊断；原 completeSimple 路径不变。
- `shared/content-review.ts`：现有诊断结构增加两个可选数字，兼容旧回执。
- `tests/content-review-budget.test.ts`：低输出、无效限额、小上下文原 packet、估计和实际测量边界、历史回执、严格 length/JSON/取消规则。
- `tests/content-review-service.test.ts`：复用现有本地 HTTP、正式 Service/Store/Pi fixture，检查 65536/12000 与 16384/12000；后者实际 native 请求值下降且与诊断一致。无工具、最大一次503传输重试、取消不继续、length/错误JSON不重试、普通聊天零审查和保存/刷新零新调用继续覆盖。

根代理统一构建通过；全量624/624测试通过，0失败、0取消、0跳过，耗时154794.0806ms。日志为 `.test-data/content-review-configured-budget-build.log` 和 `.test-data/content-review-configured-budget-full-tests.tap`。本改动没有再追加云审查。模型业务判断仍未得到完整验证，格式可解析或没有 findings 都不能升级为人工业务确认。

通俗解释：软件之前把审稿限制得比同一个模型的正常任务更紧，容易还没写完就被截断。现在使用用户已经配置的上限，小窗口仍由原来的 Pi 自动缩减实际输出；审稿能写完不代表它一定能判断业务规则正确。

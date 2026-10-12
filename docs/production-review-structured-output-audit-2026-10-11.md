# 内容审查结构化输出：只读审计

2026-10-11，未改变默认调用、根源码、既有候选或当前试次。只执行固定 Pi 0.86.1 的公开 API 离线实验，无网络、真实凭据或模型执行。

当前 `main/content-review.ts → Service RuntimeHandle.reviewContent → main/agent.ts:377 → Pi ModelRuntime.completeSimple` 只把 v4 schema 写入 prompt。独立审查只传预算、reasoning、取消和 `maxRetries:1`，没有发送 `text.format` 或 `response_format`。`supportsStrictMode` 是函数工具的兼容设置，不会启用文本结构化输出。

固定 Pi 的公开 `samplingParams` 可传入额外 body 字段，公开 `onPayload` 可在 SDK 发送前返回替换 payload。现有 ModelRuntime、Responses adapter 和显式代理路径保留这些参数。依据：[Pi v0.86.1 官方 README](https://github.com/earendil-works/pi/blob/v0.86.1/packages/ai/README.md)；本地源文件 hash 与逐段调用依据见独立报告。

离线实验 **6/6**，4548.4792 ms：baseline 无格式字段；两公开入口都把原 schema hash `a67bc48c…e95d` 保留到实际序列化 body，且 model、input、12000 输出上限、取消、无工具和无 reasoning 的参数不变。前取消零 fetch，途中取消只一次 fetch 后 aborted，本地 400 不自动 fallback。

故意模拟传输异常时，既有 `maxRetries:1` 实际产生 **两次完全相同的 fetch body**，`onPayload` 只执行一次。这是原有传输重试，不是结构协议降级。首轮错误断言为一次请求导致 3/6；原源码及失败日志保留，修正断言后 6/6，没有改重试预算。

OpenAI 官方 Responses 结构输出使用 `text.format`；strict schema 不支持 `allOf/not`，且所有属性须为 required。当前 v4 schema 恰有这些组合约束和可选 suggestion，因此**原样传过去不等于被服务端接受**。JSON mode 只保证 JSON 格式，不保证匹配该 schema，更不保证业务判断正确。依据：[OpenAI 官方 Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。

Wangshu 当前普通 `openai-responses` 调用成功，只证明普通请求链可通；网关是否保留/支持/强制执行 `text.format` 仍未验证。离线 fetch 没有证明任何真实供应商的约束能力，也没有恢复本批无效 finding 的引用数量或原文。

| 后续方案（均关闭） | 最小范围 | 代价与限制 |
|---|---|---|
| A：兼容传输 projection，保留原 host 校验 | 从原 schema 派生独立 hash 的供应商兼容结构，只对明确内容审查请求传入；保留原 v4 prompt、总引用、证据、逐字、权限、版本校验 | 移除不支持的组合规则会使供应商约束弱于 host，仍可能返回超总数；必须明确保留该限制。不可把共享 visual review 也硬套内容 schema。 |
| B：后续新 wire 用一个有界 citations 数组表达总数 | 仅设计比较，单数组 maxItems 可表达总引用预算；按 role/ref 还原宿主原始证据 | 需要新 wire/schema/prompt/input 身份与历史兼容、来源绑定和修正权限回归；实际供应商强制能力仍未知。尚未实施。 |

当前取舍：两方案均不开启；等下一次已授权真实审查接入安全结构诊断，有精确引文计数后再选择。没有付费 strict 试探、自动 JSON/prompt fallback、新 provider、新依赖或预算扩张。首次 schema 编译延时、第三方拒绝/忽略、截断/拒答与实际取消稳定性仍需未来分别验证。

独立证据目录：`.test-data/review-structured-output-audit-84cc1760-f76c-498a-a64f-f336e4465824`。`audit-report.json` SHA-256 `585060739ec03ca5984fcf05e78565e046f88cdb76d73a1c3dbcf5df1d0f3ab3`；seal SHA-256 `262690c1011952aba6faea5403700ca44e144144c079cec18cd1b8ed8493819e`。现有安全诊断候选 seal 保持不变。

通俗解释：现在只是告诉模型“按这个格式回答”；Pi 有现成接口能把格式要求作为正式请求参数发出去。但当前格式不能直接用于严格模式，且第三方是否执行仍未知，所以暂时只证明接口能传，不能宣称它已经让审查更准确。

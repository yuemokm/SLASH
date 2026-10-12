# 任务查看调用提示与基准代理继承

日期：2026-10-10。关联当前开发目标2（调用效率）与既有任务验收分页契约；本次没有扩大工具权限或变更验收结果。

真实SFA Astra Run中，`get_task_acceptance` 两次返回可修正输入错误：`summary` 附带不适用的 `sourceId/readId/reportId/itemId`，并使用非当前Run及自行构造游标。四个section过滤约束在Zod阶段拒绝调用，未进入宿主查询；不能据此断言这些ID或游标已经被分别执行和验证。核心read/edit及同版本交付仍通过，原记录见 [SFA局部自动修订](sfa-focused-automatic-revision-design-2026-10-10.md)。

本机真实Pi 0.86.1 Responses请求与Zod `io:input` 生成schema逐项一致：八个顶层字段均非必填，`additionalProperties=false`；`{}` 可解析为当前Run的 `section=summary,limit=10`。空字符串不符合ID最小长度；JSON schema不能表达的section关联规则仍由原Zod `superRefine` 执行。没有发现Slash适配将optional改成required。此次仅在工具description给出最小 `{}` 和省略规则，并为runId加用途说明；原section、空值、权限、游标版本与分页校验保留。

初次提示修复时，本机wire省略 `strict`。官方 [Function calling](https://developers.openai.com/api/docs/guides/function-calling) 说明Responses服务可能在省略strict时尝试归一化；本机HTTP接收器不执行服务端归一化，历史云任务也没有保存完整wire。当时未改compat；后续真实观察与有界探测见本文追加记录。仍不能断言Wangshu强迫模型填写全部字段。

确定性脚本缺陷另行修复：`scripts/quality-evaluation-run.mjs` 复制公开模型字段时漏了 `proxyUrl`，可能把代理条目变成直连。复用原白名单投影并补代理字段，发送前从正式IPC state核对 `id/provider/modelId/protocol/baseUrl/proxyUrl` 和hasKey。未知额外字段、密钥及历史不进入公开投影；凭据仍走原有明确云门槛和加密复制流程。16项基准共用此路径，不新增runner。现有只读审计不增加URL或凭据读取。源树hash改变后，旧基准manifest按原机制要求重新prepare。

通过检查：

- `npx tsx --test tests/tool-input-schema.test.ts tests/task-acceptance-model-view-responses.test.ts tests/task-acceptance-model-view-runtime.test.ts tests/task-acceptance-model-view.test.ts tests/quality-evaluation.test.ts`：16/16。真实Responses工具链 `{}` 成功、不适用过滤字段及空ID拒绝，后两次均未到查询/log；原Build/Plan分页、游标版本与授权撤销测试保留。
- `npx tsx --test tests/model-proxy.test.ts`：3/3。正式Pi会话/只读审查CONNECT代理、直连隔离、522及取消保持原结果。
- `npm run check`：通过。
- 已授权Astra最小source profile只读公开字段检查：`gpt-6-astra/openai-responses` 的 `http://127.0.0.1:7897` 在公开投影中保留。未读取凭据、历史或启动应用，临时脚本已清理。

以上初次提示/代理修复阶段没有执行云任务或16项新基准，没有修改dist、原用户数据或SFA冻结case。本机模拟只证明公开wire与宿主路径，不证明上游云归一化、真实模型改善或全部业务质量。

通俗解释：查看当前任务时，模型现在能看到“直接传空对象”的样例，不必乱填其他ID；必要限制仍会拦住错误输入。后续基准测试也会继续使用已配置的代理，不会悄悄变成直连。

## 后续真实证据与最小 Responses 修复

指定 QE12 Astra Run `fd3b7557-9fea-436e-8540-c7208d05b7a4` 在原 600 秒上限官方取消。其 20 次 `get_task_acceptance` 均填齐 8 个字段，16 次 runId 为 `current`、4 次为真实 Run UUID；四个过滤字段均为非空/非空白单字符值，全部附带游标。18 次 summary 因四个不适用过滤项、2 次 requests 因三个不适用过滤项在原 Zod 阶段失败，未进入宿主查询。最小 `{}` 说明未避免这次重复错误。安全投影保存于 `.test-data/responses-strict-false-probe-20261010/legacy-qe12-safe-summary.json`；字段规律不能单独证明上游规范化。

经主代理授权，仅用 Pi 0.86.1 公开 `compat.supportsStrictMode=true` 做一次隔离探测：正式 `get_task_acceptance` 定义、公开 `toolChoice` 强制唯一工具、无执行/续模、1 HTTP、0 重试、90 秒/2048 输出上限，沿用授权加密配置与既有代理。case 为 `.test-data/strictfalse-probe-ae8c967a-af28-4abf-ae9d-1adbf20dfdc8`。实际请求 7.623 秒、677 tokens，出站及 `response.completed.tools` 均明确 `strict:false`、`required:[]`；真实工具参数 `{}` 通过原 Zod。`cloud-result.json` 为 `passed_single_optional_omission`、`launcher.json` exit 0。此结果只证明该路线的一次最小参数调用，未执行任何业务工具，也不等于完整 QE12 成功或所有旧错误均由服务端造成。历史探测 helper/回执保持原 hash，未改写结果。

据标准 Responses 可选字段语义与本次真实证据，`main/model-runtime.ts` 的 `openAICompatibleProviderConfig` 仅对 `openai-responses` 默认补公开 `supportsStrictMode=true`：Pi 原生输出的是 `strict:false`，并非启用 strict true 或把可选字段转为必填。已有显式 `false` 优先、保留原省略 strict 路径；其他 compat 字段、协议、代理及端点不变。不硬编码供应商或模型，不重写 payload/schema，不加重试、回退或权限扩展。其他第三方 Responses 服务尚未实测；明确不支持该标记的已有适配仍可显式退出。

QE12 的两次 `get_prototype_acceptance` 均填写 `artifactId=current`，第一次另有 `draft.parentRunId=current`；两次均先因不存在的 artifact 返回 `ARTIFACT_NOT_FOUND`，没有获得可复制 runRequest。新增 description 给出 `{mountId,path}` 和 pending 的字段结构，要求从最新 read/edit 回执复制真实 changeId/contentHash/parentRunId，pending 省略 artifactId，禁止 current/占位 ID。仅改善调用说明，保留全部身份、版本及权限核验；另一个代理补充的真实 pending owner 回执独立保留。

本次新增验证：

- `npx tsx --test tests/model-responses-optional.test.ts tests/task-acceptance-model-view-responses.test.ts tests/model-proxy.test.ts tests/model-thinking.test.ts tests/model-connection-test.test.ts`：33/33。真实 localhost wire 验证默认 false、显式退出、8 字段可选及原 schema 一致；空 ID/不适用过滤项仍拒绝。500/取消的单请求检查显式使用测试 `maxRetries=0`，没有执行工具或额外请求；产品原 Pi 重试设置未改，不能据此宣传所有 HTTP 错误均不重试。既有 CONNECT 代理/直连隔离、522、思考映射、Anthropic 和文字连接回归通过。
- `npx tsx --test tests/prototype-tools-runtime.test.ts tests/prototype-acceptance-draft.test.ts tests/tool-execution-policy.test.ts`：33/33。原型实际 Pi define/get/runRequest、错误编号拒绝、pending 身份/来源/版本保护通过；取消不启动第二写，fatal/unknown 不续模，普通可修正错误仍沿原通路返回。
- `npm run check`：通过。未 build/dist，主代理统一集成。

通俗解释：原先只告诉模型“可以不填”，这次还通过官方接口明确告诉服务端“这些字段确实可以省略”。无关 ID 仍不能乱填，也不会自动放行错误；一次真实小调用已成功，完整业务任务仍要另行验收。

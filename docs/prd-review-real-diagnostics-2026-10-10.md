# PRD 真实审查诊断与独立来源核对

日期：2026-10-10。关联 QE12、PF08/PF10。Astra 旧 wire v2 真实审查完成，两条 advisory 经独立来源核对成立；限定两行 F/P 口径保留，只修正紧邻说明生成独立交付副本。随后 wire v3 同资料对照请求在 114 秒异常断流，没有形成范围分类结论。整篇业务、跨成果及 Slash 自动修稿仍未完成验收。下述 Flash 取消、Astra 配置及 v2 成功均保留为阶段证据；最新 v3 结果见末段。原稿/pending 保留，v3 失败没有引起再次改稿或产品改动。

## 本次真实请求

证据目录：`.test-data/prd-focused-review-f9056453-cff9-4149-a7f3-e01f26ff76af`，含 `prepared.json`、`input.json`、`preflight-result.json`、`review-started.json`、`cloud-stages.json`、`network-diagnostics.json`、`result.json`。

- 正式 `createRuntime.reviewContent` → Pi `completeSimple`，同一白山 `DeepSeek-V4-Flash-0731` / `openai-completions` 路由。零云 preflight 2.910 秒通过，凭据可解密、输入身份匹配；真实请求实际 **1 次 fetch、HTTP 200**。不能说密钥或联网不可用。
- 文字观察窗口 240 秒、外层 280 秒。依据是原真实文字 `content_review` 曾用 **152.376 秒**完成（原任务 `ONE-PAGE-RESULT.md`）；产品文字审查沿 Run 预算，独立 60 秒限制属于视觉审查。此次只调整测试观察窗口，没有修改产品预算。
- 真实回执 `elapsedMs=240110`、`completion=cancelled`、`status=unverified`、`validReceipt=true`。合法取消回执不是完成的语义审查；0 findings 不能作业务通过。
- wire 已发送 `thinking.type=disabled`、`max_completion_tokens=12000`，未发送 `reasoning_effort`。外层调用 1、重试 0，Pi 原配置 maxRetries=1；安全观察只有 1 次实际 fetch，未见第二请求。
- HTTP headers 在观察起点后 3.470 秒收到，首 SSE 3.623 秒，首思考 3.624 秒；末事件 239.962 秒。共 **5,602 个事件、9,306 个思考字符、0 个正文字符**，收到 1,850,384 字节，解析错误 0；没有 DONE/finish reason，取消发生在 streaming 阶段。
- 流中末次 usage：prompt 21,141、completion 6,024、total 27,165。它们是**取消前的部分进度值，不是最终结算**；正式回执 usage/stopReason 仍 unknown，不把两者合并为完成计量。

输入 34,437 字符 / UTF-8 57,245 字节，宿主 Pi 估算输入 8,610 tokens、输出仍 12,000、contextWindow 65,536；无本机输出夹限证据。提供方流中 prompt tokens 与宿主估算不同，不能用简单字符估算证明真实 tokenizer 或上下文上限。当前事实是正文前持续思考，不能据此确定唯一根因是服务延迟、提示范围或参数不兼容。

## 复用既有 A/B，不重复请求

既有脚本 `scripts/pm-thinking-control-diagnostic.mjs` 和目录 `.test-data/pm-thinking-control-real-2026-10-07T05-45-45.749Z-OrnKXT` 已做同模型、同路由、同合成三订单工具题；本轮只读复用其中两份 `result.json`：

| 参数 | 实际请求 / HTTP | 思考字符 | 正文字符 | 终态及正确性 | API 耗时 |
| --- | --- | --- | --- | --- | --- |
| baseline：`thinking.type=disabled` | 1 / 200 | 245 | 0 | tool_calls + DONE，正确提交总额 318 | 6.821 秒 |
| chat_enable：`chat_template_kwargs.enable_thinking=false` | 1 / 200 | 196 | 0 | tool_calls + DONE，正确提交总额 318 | 3.279 秒 |

两条均 max_completion_tokens=1024、maxRetries=0。正文 0 在该工具题中不表示失败，因为已完成正确工具调用；同时，两种参数**均未证明关闭思考**。单次耗时差异不能证明候选稳定更快。因此不重复工具或文字小题、不切换默认参数、不遍历其余形式。

2026-10-10核对[白山官方 LLM API 思考模式](https://ai.baishan.com/docs/docs/llm-api.html#思考模式)：列出 thinking.type、chat_template_kwargs.enable_thinking、chat_template_kwargs.thinking_mode、顶层 enable_thinking 四种风格；没有对本 Flash 型号逐项保证。Pi 0.86.1 公开 `StreamOptions.samplingParams` 支持 OpenAI 适配器透传及按键覆盖模型默认参数，但“能正确发送”不等于供应商执行该开关。此能力只作复用评估，未改产品或配置。

## 14 格与限定改稿独立核对

冻结 `inputHash=97e4edccae5efdce7aa0298c2d0e1e685e2e102630c66074b5724ba4aad20f6d`、`promptHash=0cffa6a76d57985596d7f525aa003785cbab2c7031b1c39a9194e4ea75e46bff`。来源完整提取文本 SHA256 `9e4c1f54b6925220edbe551cd560d57f663b9661092a30067573ea7a7af0820c`；待审 PRD SHA256 `83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36`。

依据 `.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/review-selection-audit/final/critical-cell-coverage.json` 和本次 `input.json`：03 表 F1/P1、D5:D8、F5:F8、P5:P8 共 14 格均在实际发送选段内。F1 是“来源”，P1 是“是否允许前端发起变更修改”；F5/F6/F7 为“不允许调整”，P5/P6/P7 均“是”；F8 为“允许调整”、P8“是”。必须同时保留两维度。P 表头没有明写时序；首次定位只读、后续流程不在本次实现范围来自用户限定及原 PRD，后续具体权限/流程仍待确认，不补造业务规则。

实际原稿 `workspace/成果/QE12/PRD.md` → `pending-1.md` 仅第 72、73 行（经纬度、定位地址）改变，其他三行、表头及其余全文相同。证据 `independent-changed-lines.json` 与独立逐行复核一致。这是限定改稿正确性判断，不是整篇 PRD 合格或用户业务确认。

跨表判断必须先看表头和业务对象：01/03 的 N=展示、P=变更；**02 的 N=变更、P=展示**。本次正文五段全属 03（40775–60534 之间），01/02 仅保存在完整 snapshot，并未发送给模型。若未来 finding 引用 01/02，应核对实际发送范围、引用原文及对象，不能仅凭同名字段覆盖 03，或把完整 snapshot 当模型已见上下文。

原 PRD 还保留独立差异：03 网点编码 N2/O2=是，PRD §4.1/§5 写不展示；此为未改三行中的旧问题，不能混为本次两行修复失败或擅自重写。03 联系人 H36=否；03 配送 H62=否但 K62 明确“合作中必填”，不能把后一条件误判为跨表移植。原 PRD 声称依据的 DOCX、完整角色/流程及后续权限不在本次来源中，仍无法据此完成全业务确认。

## Flash 阶段剩余边界（历史）

本轮语义自动审查保持未验证。继续完成依赖当前服务在该业务范围内完成正文审查，或存在可用且获授权的替代模型并通过同等来源、准确性与稳定性验收；当前没有取得这项证据。保留两次取消及旧成功审查，不在相同条件继续延时、重跑，不把 raw 思考、正文、密钥或任意响应头写入诊断。

通俗解释：连接和钥匙都有效，但模型四分钟仍在思考，没有给出审稿结论。另一种“关闭思考”写法以前也测试过，仍会思考，所以不能靠换一个开关就宣布解决。两行改稿已按原表核对，整篇自动审查仍需实际完成的结果。

## 用户授权 Astra 配置及新审查准备

用户随后明确要求从桌面指定认证文件配置 wangshu 并使用 astra。仅程序内读取 `C:/Users/yuemokm/Desktop/认证.txt` 的对应段，未输出/落盘明文凭据。`ModelSettings.upsert/setDefault` 与 Electron `safeStorage` 将 `wangshu / gpt-6-astra / openai-responses` 保存到实际 `C:/Users/yuemokm/AppData/Roaming/slash`，entry/default ID `cbfc4c25-c0f2-460e-99fa-4cd62e7a0553`，原地址 `https://wangshu-api.com/v1`、已验收专属代理 `http://127.0.0.1:7897`，supportsVision=false。

保存前再次确认没有使用真实 profile 的用户应用实例。原模型保留，所有非模型 state、其他模型、其他偏好及无关 KV 逐项核对不变；只将 modelRouting 设为 fixed，保留 taskTypes。实际 `Service.selectModelRoute` 方法核对 coding/general 同指向该 entry（未调用有恢复/保存副作用的 Service 构造器）。关闭 helper 后只读重开数据库再次验证默认/路由、加密凭据记录、旧 baishan 和 6 个 mount 保留。正式 `testModelTextConnection` **一次成功，15.268 秒**，不额外发送 direct 测试，不代表工具/图片/长任务通过。证据 `.test-data/wangshu-astra-config-20261010/{result,reopen-verification}.json`。

仅指定模型加密 KV 与 Local State 复制到新最小来源 `.test-data/wangshu-astra-config-20261010/isolated-profile`，没有导出全部历史。PRD fixture 的 prepare 现在要求显式 source-profile / entry-id / provider / model-id / protocol，核对指定身份与批准来源目录，不再固定 DeepSeek。旧 f905 fixture 版本保存为 `fixture-version-before-wangshu.mjs`，SHA256 与原 manifest 的 `4ebb92e75e0aed4937fc1d9726112b1680df7492677b2f1e1f5fb9a0d071b4d8` 一致，原请求证据不改。

新 case `.test-data/prd-focused-review-8c7c868a-3bc6-4243-bc7a-de8cf944cb57` 的 **零云 preflight 3.721 秒通过**：凭据可解密、同 inputHash/promptHash、14 格覆盖、review 方法可用，模型调用 0。观察窗口仍 240 秒/外层 280 秒；真正 PRD 请求由主代理单独发起，不能把 prepare/preflight 记为语义审查完成。

代理 transport 使用独立 undici fetch，原全局 fetch 观察不足以覆盖它。fixture 通过 Pi 公开 `AgentSession.modelRuntime.registerProvider`，保留原 `openAICompatibleProviderConfig` 的模型参数、官方 Responses `streamSimple`、原重试/取消，唯一注入观察后的正式 `modelProxyFetch`。增加 Responses 固定事件枚举、正文/思考计数、completed/incomplete/failed、数字 usage；字节原样透传，不保留 raw 文本或任意类型/错误消息。`response.completed` 才算完成，流被取消不伪造终态。

本机 `node --import tsx --test tests/prd-review-transport-diagnostics.test.ts tests/prd-review-responses-proxy.test.ts tests/prd-review-transport-runtime.test.ts` **9/9 通过**。其中 `prd-review-responses-proxy.test.ts` 的 4 例走真实 Pi + CONNECT + Responses 回放，验证完成、输出截断、上游失败、流中取消、模型/原 12000 输出参数与安全计数；其他 5 例复核旧 completions 字节和取消。不是云模型准确性测试。未构建或写 dist。

此前独立诊断孤儿 PID 20964 的精确脚本、进程创建时间与 `prd-bootstrap-probe.json` 的开始时间一致，确认属于本任务顶层 await 死锁探针。仅回收这个 PID，其他进程未停止；证据 `.test-data/prd-bootstrap-process-cleanup-20261010.json`。

## Astra 真实终态与最小交付

主代理发起一次真实请求，新 case `8c7c868a-3bc6-4243-bc7a-de8cf944cb57` 返回 **179.721 秒、completed/stop、合法 issues_found，2 条 advisory、0 invalid findings**。实际 1 fetch、HTTP 200、925 个 SSE 事件、`response.completed` / completed / body_complete；正文 2,018 字符、解析失败 0。没有自动重试或新请求。

终态 usage：input 20,396、cacheRead 2、output 7,962、reasoning 7,074、totalTokens 28,360；wire 对应 input_tokens 20,398、output_tokens 7,962、total_tokens 28,360。这次为 completed 终态提供方用量，区别于 Flash 取消前的部分值；cost 返回 0 仍不证明免费或实际费用。wire 没有思考正文，Pi 有 14 个 thinking 块且 reasoning token 非零，不能将 thinkingCharacters=0 宣称为无思考或关闭生效。

独立逐条核对冻结输入与所有 6 个 artifact/source/request 引用绑定及位置，来源引用均在实际发送选段内；14 格再次核对完整：

1. **finding-1 属实，范围内紧邻说明问题**。PRD 第 75 行把 D5/D6 说成合并单元格，来源实际记录 `合并区域: K5:K7`、K1=字段规则，D5/D6 是独立字段名称格。模型明确要求保留现有 F/P 口径，没有否定目标两行。这是原 PRD 旧说明错误，不是选段或列义输入缺陷。
2. **finding-2 属实，范围外旧差异**。03-N2/03-O2=是、P2=否；旧编码行写展示否。模型明确说明目标两行之外不得直接扩修，未使用 01/02 规则覆盖 03。旧回执 repairEligible=true 不能取消用户范围约束；随后主代理实际重放确认旧候选入口会将它选入自动修稿，故这是门禁缺口，不是纯展示标签。新增 wire v3 的结构化 scope/disposition、请求引文及重复拒绝条件见 `content-review-repair-scope-2026-10-10.md`。本轮编码行未改，保留待确认，原 v2 回执不补字段、不改 hash。

未见本次 finding 的错对象/错列误报。模型也明确承认来源部分覆盖 18,817/63,164 字符、制度/流程原文与 HTML 缺失，以及未提供改前版本/保护记录；这是准确的审查覆盖边界，不是用来否定已核对的 14 格。本机独立 diff 能确认真实两行改动范围，但不将该本机证据冒充模型已见上下文。全稿/角色/流程/跨成果仍未验收。

根据主代理批准，仅将第 75 行说明句修正为“K5:K7 为字段规则合并区域，D5（经度）与 D6（纬度）分别为字段名称格，规则描述……”并生成新文件 `output/prd-delivery-20261010/PRD-维度修订.md`，其余全文与 pending 逐字相同。原 pending SHA256 `83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36`，新副本 SHA256 `40fd2e97fd511af2e4a4d397d6bbbc30fb4a43a51a56eac9a7ece20239f7cb86`。独立证据 `output/prd-delivery-20261010/independent-delivery-audit.json` 及本 case `independent-business-judgement.json`；简短说明同输出目录。

此交付为真实审查后子代理最小文字修正，不是 Slash 自动修稿验收。旧云回执绑定修正前 pending，不作为新副本的云回执；新副本仅有本机来源及实际 diff 复核，没有追加云审查、覆盖 pending、应用 ChangeSet 或修改产品/dist。

简单说：Astra 这次完成了审稿，没有拿错工作表。它找到两处原有小问题，其中允许范围内的说明已在新副本写准确；编码展示仍留待确认，软件的完整业务交付还不能因此宣布全部通过。

## wire v3 同资料对照：真实流中断，范围判断未验证

新 case `.test-data/prd-focused-review-1b23482d-68c0-4c01-9965-73a3a557e40a` 的 `prepared.json` 逐项保护旧 snapshot/hash、canonical referenceTable、要求/成果/来源实际 contexts 与全部 14 个关键格。只将夹具 promptCharacterLimit 从 59392 精确增至 59802，补 wire v3 协议新增 410 字符，正文选段 byte/offset/行号/metadata 与 v2 完全一致；没有改产品预算、12000 输出参数或 240 秒观察窗口。source/compiled 身份一致，零云 preflight 在 2.233 秒通过。迁移保护与范围限制测试最新 11/11 经主代理复核；本机协议测试不代表真实模型能正确理解范围。

主代理唯一一次 `createRuntime.reviewContent` 请求，session 31904，证据完整保存、exit 0。`content-review.json` 记录 **114.246 秒、stopReason=error、errorMessage=terminated、completion=invalid、status=unverified**；外层 `result.json` 耗时 114.304 秒、outerReviewCalls=1。进程 exit 0 不是语义审查成功。

- transport 实际 **1 fetch、HTTP 200、14 个已解析 SSE 事件、30,565 字节、正文 1 字符、parseFailures=0**。headers 9.114 秒、首事件 9.118 秒、末事件 87.742 秒、末字节 99.181 秒。
- 没有 `response.completed / response.incomplete / response.failed`、正常模型终态或最终 usage；没有达到 240 秒观察上限。observer 最后 cancelledAt=114.371 秒是错误返回后的 runtime 清理 abort，不可认定是用户取消或预算超时。
- 宿主因非正常 stop 先拒绝，尚未进入 finding/schema 解析；findings=0、invalidFindings=0，rawResultHash 不存在。现有证据没有可验证业务 JSON，不能确认 scope 分类，也不能反推模型分类错误或 v3 schema 解析缺陷。
- SDK usage 全 0 是失败时默认值，实际提供方用量 **unknown**；不是测得零消耗、免费或最终结算。思考正文、凭据及原始 wire 正文均未保存。

只读定位：官方 Pi Responses catch 将错误规整为 message，未保留 transport `cause.code`；现有 fixture observer 的上游读取错误没有正常 flush，随后 cleanup abort 可以覆盖其阶段。现有安全证据足够认定 Responses 流异常终止，尚不能区分供应商、专属代理或其他网络层。没有因一次失败扩大工程、改产品/Pi、实现 observer 或自动重试。若将来同类问题值得再测，先仅补固定枚举的流错误阶段/cause 与断流/宿主取消/观察超时本机反例，再决定一次有新证据的验证。

旧 v2 completed 回执、独立六处引文核对、14 格维度结论和最小交付副本均保留，不因新断流回滚，也不冒充新 v3 已通过。v3 真正范围分类及 Slash 自动有限修稿的业务准确性仍未验证。

简单解释：旧审稿确实成功过，新规则这次请求在报告传完前断了。因此目前能确认软件会拒绝明确标出的范围外意见，不能确认这次模型已把范围判断正确。

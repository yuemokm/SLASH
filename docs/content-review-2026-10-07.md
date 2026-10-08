# 内容语义审查：冻结证据与独立模型意见

对应当前质量目标第4项。真实 QE05 已保存研究报告，但报告将流程“未说明后台导入适用阶段”写成了“日常常态开放、任意阶段均可”，另有“上线初期后可，后续禁止”的自相矛盾。原句引用正确和字节hash一致都不能证明这些业务解释正确；本模块把语义审查与生成、结构/DOM验收、用户确认分开。

## 领域接口

领域实现位于 `shared/content-review.ts` 和 `main/content-review.ts`，Service与Agent已接入真实只读Pi调用。宿主负责读取授权资料、真实模型配置、持久化回执及原两轮修复限制。领域模块只接受有界正文，构建提示、校验回执及本地刷新；模型调用通过注入函数完成。

```typescript
const input = buildContentReviewInput({
  requests: [{id: '真实用户请求id', text: '完整原请求'}],
  artifacts: [{id: '宿主成果id', sha256: contentReviewTextHash(body), text: body}],
  sources: [{id: '实际已读来源id', sha256: contentReviewTextHash(sourceText),
    text: sourceText, locator: '原资料定位', originHash: originalBinaryHash,
    readCoverage: 'full'}],
  assumptions: [{id: '假设id', text: '已知但未确认的假设'}],
  coverageLimits: ['宿主实际读取/解析限制，例如图片未OCR'],
}, {promptCharacters: modelAvailableCharacters});
const receipt = await reviewContent({input,
  reviewer: {provider, modelId, protocol, configurationId},
  review: async (prompt, signal) => ({raw, usage, durationMs, stopReason: 'stop',
    error: redactedError, configuredMaxRetries: 1}),
  signal, assertCurrent: async () => checkFrozenVersions(),
});
// 仅本地版本比较，不调用模型。
const current = refreshContentReviewReceipt(receipt, freshInput);
```

sha256属于本次提供的完整UTF-8正文。Office原文件字节hash放originHash，两者不得混淆。输入request每条最多100000字符，单正文500000字符，全部2000000字符；最多100请求、20成果、100来源和200假设。schema拒绝重复身份和hash不符，输入深冻结。

模型提示只包含实际摘录、宿主身份、定位和覆盖限制。原文仍保存在冻结snapshot，选段预算不丢弃原请求。来源按与请求/成果的文字重合选取真实段落及邻近上下文，保留字符offset和行号；每份最多8片段。重合词只用于找上下文，不能产生语义finding或评分。未全部覆盖、原读取本来partial、宿主解析限制及模型没有声明的方向/身份均明确记录。

提示上限由宿主依据当前模型上下文/输出余量保守计算，不换模型或新增tokenizer。`promptCharacters`范围1000至100000；最小协议开销或选段仍无法放入时明确未验证，不自动提高小模型预算。预算和实际contexts都进入inputHash，刷新时能发现差异。

## 审查协议与绑定

审查方向包括事实/推断、范围/阶段/角色扩大、矛盾、跨成果一致性、字段语义和用户要求覆盖。当前 wire v2 用实际严格 schema 限制最多3项关键问题、每项总引用最多3处（跨成果允许两份成果加一份依据），单引句160字符、解释160字符、建议100字符；覆盖限制最多3项各120字符。未检查方向或未提供片段仍明确保留 partial。这与原4096正文请求预算配合，不能保证上游永不length。LLM只返回 `{findings, coverage}`，不能填真实hash、来源版本、自动passed或人工确认。finding引用 `artifacts:[{artifactRef,quote}]` 以及至少一个 `sources:[{sourceRef,quote}]` 或 `requests:[{requestRef,quote}]`；finding ID由宿主生成，suggestion仅为可选建议。历史持久回执仍兼容原100项/较长文字格式，不用它作为新模型输出协议。

宿主校验身份和逐字连续原句在本次提供的上下文中存在，重新绑定正文hash、定位、offset与行号。假身份、假摘录、缺少对应依据、模型填写hash/人工确认、错误类型或未知短引用进入invalidFindings并保持unverified。绑定成功只证明引文来源真实，仍不能证明模型的解释正确。模型自估high不是事实证明。

partial输入下允许局部候选：完整原句与对应来源/真实用户要求可绑定，confidence为high。跨成果类别另须两个实际成果身份。宿主生成 `repairEligible`、`repairMode`、`repairConstraint`，模型不能自填。事实/推断和范围扩大类只能 `clarify_uncertainty`：将无依据的肯定判断降为假设或待确认解释，不能据选段缺席断言整本资料没有规则，不能自行确立业务阶段、角色、权限或现行效力。其他候选只对齐已绑定正面原句。无来源、无效引用、取消或过期不允许候选修复；候选必须由主集成在原两轮限制内处理。

## 回执、失败与过期

回执与生成Run独立，包含真实reviewer provider/model/protocol/configuration、input/prompt/rawResult/result hashes、请求/成果/来源绑定、实际usage/duration/stopReason、宿主提供的requestedOutputTokens/thinkingLevel/budgetNotice、有效发现、无效发现及覆盖限制；`humanConfirmed`恒false。requestedOutputTokens记录宿主请求的正文额度；Pi可能按当前协议和思考配置增加思考额度，因此不能将正文请求额度当成跨协议总输出硬上限。实际总消耗以usage为准，未知不推定。调用没有返回实测指标时写unknown，不推定0。`contentReviewReceiptSchema`及`verifyContentReviewReceipt`可验证持久记录结构与整体hash，`refreshContentReviewReceipt`仅本地将版本变化标stale/unverified并禁用修复候选。

status为 `reviewed`、`issues_found`、`unverified`或`failed`，永无passed。reviewed表示模型审查未发现具体问题，不能显示“业务通过”。无实际已读来源保持unverified。缺少覆盖保留限制，不能成为完整业务确认。Service应保留结构/DOM自动验收automaticStatus；绑定问题促使整体needs_human，不把模型审查改成人工confirmed。

仅接受正常Pi `stop`终态。长度截断、错误、aborted、toolUse或未知终态，即使字符串恰好包含完整JSON也不接受。模型正文仅允许严格JSON或整个内容为JSON代码围栏，不从任意解释文字中提取对象。取消（包括调用中取消）、版本校验失败、异常响应都保持未验证，不因审查格式错误、length终态或业务判断失败重试，也不换协议；来源内容不能开启工具或扩权。

## 传输诊断与原生重试（2026-10-07最小修复）

Agent已脱敏的 `result.error` 经Service再次scrub后传入领域回执，领域只保留最多1000字符的单行错误摘要。SDK附带的JSON只提取指定 `error.message`，不保存请求/headers/payload、原返回正文或凭据。完整响应或长度截断的部分响应仅记录 `rawResponseHash`（收到字符串的SHA-256）和 `rawResponseCharacters`；它不同于通过JSON协议解析后才产生的 `rawResultHash`。这些宿主诊断包含在回执整体hash内，操作记录与质量折叠区可读取。非正常stop或带error仍没有finding、不能称通过；旧失败回执不会凭空补上当时未记录的错误。

本地安装Pi 0.86.1的 `api/openai-completions.js`、`api/openai-responses.js`、`api/anthropic-messages.js`均把options.maxRetries交给原生 `utils/provider-retry.js`；内部SDK请求maxRetries为0，Pi负责可取消的退避。该原生路径只包裹建立provider请求，不包裹模型JSON校验或长度终态。它只对带status/headers的provider Error，在408/409/429/5xx、连接错误或明确 `x-should-retry` header下重试。review传 `maxRetries:1`，沿用原Run的signal、deadline、选定模型/协议/思考档位，无工具；没有应用自建重试循环。provider协议若不支持该选项，宿主不补自建重试。

回执 `configuredMaxRetries:1` 是配置的重试上限，`actualRetries:'unknown'`明确SDK未提供实际次数，不能用配置推定发生过一次。取消退避会中断原生等待，不另发请求。与成果自动修复最多两轮是两个独立概念：传输重试不增加修稿轮数，也不能把无效审查意见用于修稿。

`main/business-fact-guidance.ts`共享通用事实纪律，在可编辑默认协作提示、research工作流及独立内容审查提示中引用：未说明不等于允许/不限/禁止；术语不能直接等同；生命周期与上线/推广批次分开；只用宿主真实定位，不编行号；显式新决策与旧事实区分。没有针对某份测试资料硬编码业务答案，没有改用户已保存的自定义协作提示或模型配置；既有任务继续使用冻结提示快照。

## 测试与限制

`tests/content-review.test.ts`验证真实领域绑定、假身份/引文/hash/确认拒绝、跨成果/字段、partial、取消/stale、本地刷新、严格JSON、非正常终态、预算、宿主诊断与敏感请求不持久化。`tests/content-review-service.test.ts`使用实际Service、Pi及仅本机HTTP响应fixture，验证同session局部修正、保存/刷新零额外调用、普通聊天零review、503一次后成功、持续503最多两次请求、退避取消后不继续、invalid JSON和length都只请求一次。fixture返回内容明确是模拟服务响应，不能当作真实模型已正确发现业务问题。新增通用纪律还由prototype-guidance/workflow专项验证，已有保存提示保持原样。

本次未构建、启动应用或调用云模型。真实模型的业务判断改进、生产provider返回错误及UI现场验证由根代理统一构建后再测，不能据本机HTTP绿推定已解决真实QE05。界面仍区分结构检查结果、模型意见和业务未确认。

通俗解释：如果审稿服务短暂掉线，软件现在只再试一次，取消后会立即停下。仍失败时会明确告诉你原因，而不是显示“没发现问题”；看到一段被截断的回答也不会算审查成功。写作和审稿提示同时提醒模型：资料没说的地方先留待确认，不把猜测当成新的业务规定。

## 完整输出协议与安全结构诊断

`main/content-review-protocol.ts` 从当前实际 `contentReviewWireFindingSchema` 和 `contentReviewWireCoverageSchema` 生成完整 JSON Schema。提示包含字段、必填数组、枚举、长度及条目限额、严格对象规则；没有预填“无问题”的答案示例。这是提示协议，未声称 Pi 提供通用 response_format。正式解析仍逐项严格校验、核对真实引句，且必须无错误正常 stop；空数组、null、未知字段和无依据发现仍按原标准拒绝，不对无效 JSON 或 length 重试。

`ContentReviewInput.outputSchemaHash` 是显式必需字段，输入 hash 和 prompt hash 同时包含当前协议身份。缺失或旧协议输入在模型回调前拒绝，须从授权快照重新构建；已有旧回执只保留历史，不因此升级有效性。完整协议字符数进入已有上下文预算，较小预算不能人为抬高；截选资料仍明确 partial。

诊断区分 `CONTENT_REVIEW_JSON_SYNTAX`、响应上限，以及 root/findings/coverage/单条 finding 的结构错误。安全诊断只记录宿主已知 Zod code 与实际 schema 所有的字段路径和有界数组下标，未知路径显示 `[unknown]`。不记录 issue.message、任意键名、字段值、原响应或请求体；收到的响应仍只保留 hash 与字符数。既有 UI diagnostics 可直接呈现这些原因。

正式专项 `tests/content-review-protocol.test.ts` 覆盖完整协议、预算及 hash、旧协议拒绝、语法与结构区分、未知键值保密、严格引文绑定及非正常终态。它与现有领域、实际 Pi 本机 HTTP、Service 回归及混合草稿专项共 34 项通过；类型检查另行记录。测试使用本机 fixture，真实云模型格式改善尚待统一构建后一次只读复测。

QE05 复测只读取原有已保存成果、真实请求、此前实际已读来源；生产 build 的 `reviewContent` 与同模型协议的 `Runtime.reviewContent` 执行一次审查，保留原生最多一次传输重试、signal 和 deadline。审查前后核对来源、成果及构建 hash；结果另存，原报告与旧官方结果不改。准备脚本位于 `.test-data/content-review-schema-candidate/read-only-retest.prepare.ts`，尚未触发云调用。

通俗解释：软件把审稿回复的格式要求写完整，模型格式仍不对时会告诉你具体是哪一类字段出错，又不会把资料正文或秘密放进错误记录。报告本身是否符合业务规则仍需依据真实资料核对，格式合格不等于业务通过。

## wire v2短引用与安全块诊断（当前修复）

`buildContentReviewInput`按每类真实ID的确定顺序生成 `referenceTable`，记录 kind、alias、真实id及正文sha256；成果用A1…、来源S1…、要求R1…。表和wireVersion=2是显式必需字段并进入inputHash。模型只看到短ref及实际摘录、定位和覆盖；自动partial提示也用短ref，原snapshot限制文本保持原意，持久回执仍记录真实ID。`checkInput`从冻结snapshot重新生成表并逐项比较，即使调用方重算inputHash，也不能伪造别名映射。旧input不能直接执行新版协议；旧回执可验证和展示，重新构建输入后按正常版本规则过期。

解析器按引用类型与精确alias查表，再映射到原有rich finding/coverage格式，仍需在**本次实际提供摘录**中逐字绑定原句。真实ID本身是A1或S1、多种身份文本相同、前导零A01、未知编号或跨类型引用均不能自动猜测；不使用fuzzy或补写ID。引用未提供的全文不能用于候选修复。

wire v2实际schema限制最多3项关键问题，每项最多3处引用；引句与解释各最多160字符、建议100字符，限制说明最多3项各120字符。超过限额或格式无效时不静默截短、不自动重发。持久化历史finding的较大上限保持兼容；限制输出长度不代表未列问题不存在，未覆盖方向和选段仍保留为未验证。

通用审查提示按成果的肯定性业务结论检查明确来源支持、用户本次新决策、仅假设/未知或与正面条款矛盾，再检查术语、对象、阶段、生命周期、上线批次、角色/权限及范围。不按缺席资料判断许可，也不自动裁决不同来源效力。宿主不以词表或正则判断语义；模型没有发现问题仍不等于业务确认。

`Runtime.reviewContent`增加可选 `responseDiagnostics`：固定text/thinking/image/toolCall/unknown块计数，正文与思考UTF-16字符长度合计、textEmpty，以及固定 `reasoningTokenSource: pi_normalized_actual_unknown`。计数不包括拼接正文的换行符；不保存思考正文、思考hash、签名、未知块名、完整HTTP或密钥。Service/receipt/操作记录透传并验证固定结构，纳入resultHash；普通正常审查不往UI问题列表追加技术提示，空正文只显示必要的未验证诊断。Pi归一化reasoning=0不能证明上游实际没有思考。

当前52项定向测试及npm run check通过。其中本机HTTP fixture走生产Service、Runtime、Pi completeSimple，实际捕获DeepSeek off的 `thinking: {type: disabled}`、4096请求预算及无工具payload；fixture返回思考块加length终态，验证空正文仍unverified、只保留计数、原生重试上限不增加、没有思考内容持久化。其它专项覆盖别名跨namespace、重算hash伪造映射拒绝、硬限额、旧回执兼容、真实摘录/partial、撤权/取消、保存刷新零调用与原两轮修复。HTTP响应属于测试模拟，不能证明真实供应商遵守disabled或真实模型正确找出业务错误。

本轮没有构建、启动应用或调用云。真实改进需根代理统一构建后，用旧QE05成果与实际来源、同模型协议做一次只读复测；来源/成果hash保护、无效格式不重发、结果独立记录。

通俗解释：模型现在引用“A1/S1”这样短编号，软件负责精确对应到原文件，避免长编号抄错。回复也有明确长度限制；如果模型只返回了思考过程或被截断，软件会说明没有可用审查正文，仍不会把它当成业务检查通过。

### wire v2集成及真实复测结果

统一check/build通过，完整585/585测试通过。一次实际QE05只读复测在 `.test-data/content-review-schema-candidate/readonly-real-QE05-wire-v2`，回执 `1dec96d1-3c3d-409b-9afc-2f224eede7af` 正常stop、completed/current，61.689秒。短引用全部正确绑定，无格式或身份错误；模型仍返回0项问题，未发现旧报告中的无依据业务推断，故旧报告及其violated结论保持原样。不能将协议成功解释为语义审核成功。

本次规范化usage为input9157/output2351/total11508/reasoning0，诊断实际记录text1块/357字符、thinking1块/3880字符。可确认配置off时仍从Pi收到非空thinking块；没有原HTTP证据确定远端参数执行，也不能推断各自token数。思考正文及hash未保存。663份保护文件哈希全部不变，测试宿主退出正常。旧模型与预算未改，没有追加重试或自动覆盖报告。

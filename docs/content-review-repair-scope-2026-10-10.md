# 内容审查候选修稿范围修复

关联当前 PM 质量目标第 4 项、QE05 原文范围与 QE12 PRD 维度修订。实际 Astra 审查的范围外意见曾进入自动修稿候选，本轮增加结构化的拒绝条件。模型发现仍保留为意见，不自动取得修改权限。

## 实际反例与最小改动

真实 case `.test-data/prd-focused-review-8c7c868a-3bc6-4243-bc7a-de8cf944cb57/content-review.json` 于 179.721 秒完成。finding-2 记录既有网点编码展示冲突，明确范围外且不要扩修，但旧宿主仍给 `repairEligible=true / align_explicit_evidence`。主代理按原 `task-completion` 重放，同一回执返回 finding-1、finding-2 两项候选。原修稿提示中的“不能越范围”不足以阻止意见被选入。

改动在 `shared/content-review.ts`、`main/content-review-protocol.ts`、`main/content-review.ts` 与 `main/task-completion.ts`：

- wire v3 必填 `scope: in_scope | out_of_scope | uncertain` 与 `repairDisposition: candidate | record_only`，由实际 Zod schema 生成协议和 schema hash。模型须按完整本次请求判定，否定/限制句不能当正面授权。
- 仅 `in_scope + candidate + high + 已绑定用户要求原句` 满足新增候选条件；原先来源存在、跨成果至少两份、引文绑定与有限 `repairMode / repairConstraint` 条件仍保留。范围外、不确定、仅记录及没有要求引文的意见仍可 `issues_found`，只是 `repairEligible=false`。
- 候选入口独立重复上述条件，并要求当前、正常完成及回执 hash 校验通过。改动不以 explanation/suggestion 的自然语言关键词裁决。
- 同一 Pi 会话保留完整原请求；修稿提示保留候选的 request/source/artifact 原句，明确 scope 仅缩小候选，不能授予新权限。来源冲突本身不是修改授权。

这不是业务范围的确定性解析器。已补明确反例：模型错误标为 `in_scope/candidate`，且引用真实否定要求“网点编码冲突只记录，不修改。”时仍可能进入候选。宿主不能因引文 hash 正确就独立裁定它是正面授权，门槛只会拒绝模型明确标为范围外、未知或仅记录的意见。未加入关键词正则或新审批流程。完整原请求继续在同一 Pi 会话，提示保留否定原句及禁止扩权限制；候选不能新增目录、输出或外部权限。权限、版本检查、资源锁、原预算、两轮上限和草稿待保存状态继续沿用。本轮没有声称已确定所有允许行，也没有声称模型不会改错业务内容；后续真实 v3 须独立核对 scope 的语义是否正确，不能以 schema 通过代替业务通过。

## 历史兼容与验收

rich/persisted 两字段保持 optional，仅为读取历史回执。旧 receipt 不重算、不补字段、不改 hash；缺字段不能自动修。旧 v2 input 不再执行，从原授权 snapshot 重建当前协议。历史回执和历史输入的兼容含义分别是“可读证据”和“可发请求”，不能混淆。

自包含真实回执副本为 `tests/fixtures/prd-astra-20261010-legacy-content-review.json`，与原 receipt 字节一致，SHA-256 `2b33a5fe76394d70723f257f79abbb9fd1f5ad7cedc2317716dc528326ea4dd6`。测试确认 verify=true、原 flags 仍 `[true,true]`、新候选为 0，且原字节不变。

已通过：

- `content-review-repair-scope + content-review + wire + protocol + service` 共 46/46：实际旧回执、范围外/未知/缺字段/仅记录、已绑定请求正例、伪造请求、回执篡改，以及同份回执一正一反只选正例。
- `content-review-allocation + html-selection + spreadsheet-selection + task-acceptance + prototype-visual-review` 共 70/70：旧冻结输入 hash 保留但拒绝过期协议；当前选段、历史回执与视觉路径继续验证。
- Service/Pi 本机回环正例仍进入一轮局部草稿修正；3 个反例均只有原生成 3 调用、独立审查 1 调用、修稿轮数 0，blocking 意见仍 needs_human，草稿与只读来源保持原状。回环不是云语义验收。
- `prd-review-input-identity` 4/4；纯离线迁移保护。所有命令以 `node --import tsx --test tests/<文件>.test.ts` 执行。

主代理统一类型检查、构建及一次真实 v3 审查。该请求异常断流，v3 云范围判断仍未验证，详情见末段。没有因失败改旧 PRD、用户设置、产品输出预算或 dist。

随后补错误 `in_scope/candidate` 配否定请求的真实限制反例，`content-review-repair-scope` 当前 7/7；与 helper 4 例合计 11/11。主代理统一 `check/build` 和 17 文件 124/124 通过，并以编译版重放旧真实回执：verify=true、候选 0。该 124 例记录在追加限制反例之前，不能将新增 1 例冒充已包含于旧计数。

主代理随后再次运行最新 `content-review-repair-scope` 与 `prd-review-input-identity`，11/11 通过，包含错误 scope 配否定引文的限制反例。本机拒绝条件已验证，不据此声称模型在真实业务中会正确分类 scope。

## 同资料 v2/v3 真实对照准备

`scripts/prd-focused-review-fixture.mjs` 与 `scripts/prd-review-input-identity.mjs` 将旧 input/material/prompt/schema hash 分别核对，再以当前正式 builder 重建。新增协议实际 410 字符（2890→3300）；原夹具上限 59392，仅此次对照增至 59802，令 allocator 的正文预算一致。先前据来源少 183 字符推算 366 不准确；以实际协议字符串测量 410 为准。产品默认预算没有改变。

要求 snapshot、canonical referenceTable、request/artifact/sourceContexts 的正文、offset、行号及全部 metadata 都 deepEqual。14 个关键格全部在同源正文原 offset 和相同选段内。最初纯离线核验见 `.test-data/prd-v3-input-protocol-migration-20261010.json`，该步没有准备正式 profile/case、零模型调用；随后正式 case 见下段。新旧 hash：

| 身份 | 旧 v2 | 新 v3 |
| --- | --- | --- |
| inputHash | `97e4edccae5efdce7aa0298c2d0e1e685e2e102630c66074b5724ba4aad20f6d` | `867a43ed99264d4fd972d7ce641227a4731ab58e549f23797bafac8d50c7e36a` |
| promptHash | `0cffa6a76d57985596d7f525aa003785cbab2c7031b1c39a9194e4ea75e46bff` | `86fc3bc23845ae0c75fb16ef36748f5b0e2ad15e61869e501ed6e84e3279fa6b` |
| outputSchemaHash | `a4da2f892083800fb2cfcd7d316994cf0e99e2de1d0d01413db9268fa3259e81` | `c4cd7931fbfe4ed83976110cff182c8c32eef94dafd5eea04c8610c67bcba40a` |

旧夹具源另存 `.test-data/prd-focused-review-fixture-before-wire-v3-20261010.mjs`，SHA-256 `a3b67e4b8d24cb4b8066d30b53090ba296079dc5b362eb5122d61a0dba142dff`，解释旧 manifest 的 fixtureHash；不是覆盖或重新执行历史 case。新 manifest 记录 v3、protocolMigration 与 helper/脚本/observer hashes，旧文件受 protectedFiles 保护。正式 prepare 继续检查源码/compiled 同一输入，240 秒文字观察、280 秒外层及单次 review 均不变。主代理构建后执行 prepare、零云 preflight，再决定单次真实审查。

简单解释：软件现在能把“发现一个旧问题”和“这次可以替你改”分开。范围外问题仍会提醒你，但不会因为模型语气肯定就进入自动改稿。

## 新 v3 case 准备与真实异常终态

主代理构建后，正式 prepare 在 `.test-data/prd-focused-review-1b23482d-68c0-4c01-9965-73a3a557e40a` 成功，source/compiled input 身份一致、三类 contexts 与旧相同、14/14 关键格覆盖。该 case 的 `prepared.json` 记录全部协议迁移和冻结 hash。profile 仅从既有最小加密 Wangshu Astra 来源拷贝指定 entry 和 Local State，没有用户历史或临时明文。

`preflight-result.json` 确认为 passed，2.233 秒、零 review 调用，正式 runtime.reviewContent 可用、加密凭据可读取、输入身份核验成功。240 秒文字/280 秒外层控制不变。

主代理随后执行唯一一次正式只读请求，session 31904、进程 exit 0：`content-review.json` 记录 `durationMs=114246 / stopReason=error / errorMessage=terminated / completion=invalid / status=unverified`；`result.json` 外层耗时 114.304 秒、outerReviewCalls=1。进程正常退出只说明失败证据成功保存，不是模型审查完成。

`network-diagnostics.json` 记录实际 **1 fetch、HTTP 200、14 个可解析 SSE 事件、30,565 字节、正文仅 1 字符**，parseFailures=0。headers 9.114 秒、首字节 9.118 秒、末事件 87.742 秒、末字节 99.181 秒；没有 `response.completed / response.incomplete / response.failed` 或最终 usage。流中断发生在 240 秒前；observer 的 cancelledAt=114.371 秒来自错误返回后的 cleanup abort，不能当作测试超时或用户取消。

宿主先拒绝非正常 stop，未进入 finding/schema 解析，故 findings=0、invalidFindings=0、rawResultHash 不存在。没有返回可验证的业务 JSON，既不能确认 v3 的 scope/disposition 分类正确，也不能将本次归因为模型分类错误、宿主 scope schema 不兼容或输入选段错误。SDK 回执 usage 全 0 是失败状态下的默认值；实际提供方用量 **unknown**，不表示真实零消耗、免费或最终结算。

现有证据能定位到 Responses 流异常终止，不能进一步区分供应商、代理或网络层。没有盲重发，也没有扩大观察窗口或实现新 observer。旧 v2 case `8c7c...` 的 completed、两条已独立核对意见及原回执继续保留。本轮 v3 真实范围分类验收仍未完成；后续如需复测，先补最小固定枚举的流错误阶段/cause 诊断，再以新证据决定，不能恢复 raw 正文、思考或凭据。

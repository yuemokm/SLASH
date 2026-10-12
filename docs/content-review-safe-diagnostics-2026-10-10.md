# 内容审查固定校验诊断

关联 F08、QE05。此次只改善结构校验失败的可观测性，不改变模型提示、引用上限、引文绑定、范围或自动修稿门槛，不增加云请求。QE05 原报告与正式 violated 评分保留，主代理更新的 QE05 验收文档不回改。

## 契约与实现

原 wire finding 的两项根级 refine 分别要求至少一条来源/用户要求引文，以及总引用最多三处。Zod 能区分它们的 message，但两者均为 `custom`、空 path。既有安全投影不保存 message，于是回执都只记 `CONTENT_REVIEW_SCHEMA finding custom $.findings[0]`。这是诊断信息丢失；宿主拒绝无效发现的行为正确。

`shared/content-review.ts` 为现有 refine 增加宿主固定 params，不改谓词：

| 固定枚举 | 原有拒绝条件 | 安全路径 |
| --- | --- | --- |
| `EVIDENCE_BASIS_REQUIRED` | 来源与用户要求引文合计为0 | finding 根 |
| `QUOTE_TOTAL_LIMIT` | 成果、来源和要求引文合计超过3 | finding 根 |
| `NONBLANK_QUOTE` | 引文只包含空白 | 对应 artifacts/sources/requests 数组的 quote |

`main/content-review-protocol.ts:safeSchemaDiagnostics` 只在 Zod code 为 custom 时读取 params 自有数据属性 `contentReviewRule`，仅输出以上白名单值。继承属性、getter、数组、未知枚举、非 custom 的标签及任意其他 params/message 均不输出。原有字段路径白名单、未知字段掩码和最多12条 issue 保持。解析器沿现有 `invalidFindings.reason` 字符串保存这段诊断，不新增原始响应正文或思考记录，不新增数据库或回执 schema。

示例：`CONTENT_REVIEW_SCHEMA finding custom $.findings[0] QUOTE_TOTAL_LIMIT`。它只说明格式约束失败，不说明该 finding 的业务解释是否正确。旧 generic custom 回执仍保持原因未知，不能补猜枚举或改写其 resultHash。

## 检查与历史保护

新增 `tests/content-review-diagnostics.test.ts` 六项回归：两根约束区分但仍拒绝；三类空白引文路径；任意 params/message 遮蔽与 getter 不执行；固定 schema/prompt/input hashes；有效候选和无效项混合仍禁用修稿；固定历史格式回执保持原 reason/hash。合成回调仅检验解析器，不作为真实云验收。

实际检查：

```text
node --import tsx --test tests/content-review-diagnostics.test.ts tests/content-review-protocol.test.ts tests/content-review.test.ts
26/26 passed
npm run check
passed
```

修改前参考与修改后离线重放保存在 `.test-data/content-review-diagnostics-baseline-993d6b97-54b4-4e86-a598-9651e19a6fd5/` 的 `baseline.json`、`post-change-replay.json`。实际输出 schema 和协议提示逐字相同：

- schema hash：`c4cd7931fbfe4ed83976110cff182c8c32eef94dafd5eea04c8610c67bcba40a`。
- protocol prompt hash：`c7366664f6d029b25d2cedf8a605a92bce3435c9d43f9158ab6dd6d4dd3d2553`。
- 完整新 QE05 input `a17d57e889e964f0c74b58dbc47f939afc122c8846289bd529049bf2be0126a0`、prompt `afa282461d21b44cee8ca94989a1fc5c6ecf4ccba47d404f96731afa03e16be8` 复建 deepEqual，原请求、三来源、报告和预算均不变。
- 三份真实旧回执（PRDv2成功、QE05原无效、QE05新上下文无效）均继续 verify=true；原件及参考副本文件哈希保持。

本子代理未 build，集成构建由根负责；未发云、未改模型或用户设置。

## QE05 的确切限制

最近一次新上下文审查在 `.test-data/qe05-focused-review-f4a20750-9aeb-48f1-81cf-aa1b6cca6970/`：86.584秒、单 fetch、HTTP200、571 SSE、1255正文字符、正常 response.completed/stop；整体 unverified/invalid，1项有效 finding 和1项根 custom 无效 finding。独立 `independent-finding-audit.json` 已绑定该回执及报告。

有效项仅指出 K7 完整照片规则已提供而报告仍称截断；这句在旧审查输入也已提供，不能归功于标题修复。无效项原文未保存，本次新增诊断无法恢复其历史原因或业务含义，不能声称模型已发现阶段/术语混用。原阶段混并和“批量导入”升级为“后台导入”的独立 violated 结论不变；资料效力及例外继续未确认。

现有 `BUSINESS_FACT_GUIDANCE` 已被系统提示、research 工作流和独立审查共同复用。真实 QE05 保存的系统提示 hash `c6453aa66f69aa753303add0f8dcca3b58f8914b71055a9a6ad973e172cebf52` 与执行记录相符，并包含这段通用约束。无需添加案例关键词；提示约束不等于模型必定遵守。

通俗说明：软件仍会拒绝不合规则的审查结果，但新结果可以明确告诉开发者是哪条格式规则失败。它不会把失败变成通过，也不会改动原报告。

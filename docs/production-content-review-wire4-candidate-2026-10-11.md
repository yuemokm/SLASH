# 审查总引文容量 v4 隔离候选

日期：2026-10-11。对应G2内容审查表达完整性。主代理授权将总引用上限明确从3调整为4；这是有记录的协议改动，不宣称引用上限未变。DOCX结构显示实验没有合入，本候选无新付费样本、无生成或成果修改。

副本：`.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169`。根生产源码未写；依赖仅只读junction，无安装。类型检查输出仅副本，未运行根全量/build。

## 契约与权限

- `CONTENT_REVIEW_WIRE_VERSION=4`；保留独立v3 finding校验器，供旧原始协议离线核验，不自动升级响应。
- 所有category、confidence、scope、candidate/record_only均可保存总4证据。各数组仍max2，至少1句成果及1句来源或要求；总5以上仍拒绝。4不提高置信度、范围、权限或业务正确性。
- Zod实际sum<=4。给模型的draft-7 Schema显式表示相同限制：在原数组上界下，用not/anyOf拒绝最小超限数量 `(2,2,1)/(2,1,2)/(1,2,2)`；包括 `(2,2,2)`。另显式表示来源或要求至少一句。Ajv与宿主在全部64个0–3数量组合判定一致，没有业务组合白名单。
- 单引句160、解释160、建议100、最多3项、原输入上限及模型输出12000均保留。空白、错误类型ref、拼接或不连续引句、超长引句仍拒绝，不自动删引句或重试修复。
- 候选修正沿现有宿主门禁：真实R引句、in_scope、candidate、high、来源逐字绑定；cross_artifact还须两个不同成果。只记录、未知/范围外、低置信、无要求证据不会因4处容量获得修正权限。同成果两句可保存内部矛盾证据，但不能成为跨成果自动修正依据。

Schema文本SHA256 `a67bc48cb46cf8387345ff7be3757280482d81abcde81ee1ab10083b0f3ae95d`。现有wireVersion/outputSchemaHash进入inputHash链原样复用：旧输入在模型回调前拒绝；从同一授权snapshot构建新输入后，旧已签回执保持历史可读，派生当前view为stale且repairEligible=false。不重写历史回执或声称新wire已检查旧结果。

## 实际证据

- 必要常规新例9项及既有审查/范围/预算/选段/DOCX回归67项，共76/76，3252.8795ms，实际exit0。noEmit实际exit0。
- 实际表格回归文件是 `tests/content-review-spreadsheet-selection.test.ts`，另独跑20/20，1080.5418ms，日志 `wire4-spreadsheet-regression.log`。此前长命令内误列不存在的excerpts文件名被tsx忽略，67项不计该文件覆盖；补跑明确纠正，不虚计通过。
- 将源码、配置及自包含固定v3夹具复制到副本 `temp/portable-no-history-1d950611100847ec9fb90bc847427095`。先断言相对私有历史目录不存在，再同76/76，4009.1398ms，实际exit0。常规tests不依赖本机12槽目录；静态v3夹具为无网络人工构造业务对象，经旧宿主生成，明确非真实云回执。
- 实际私有历史回放仅在候选harness，11/11，4361.286ms，不进入可合并patch。slot10三个原finding仍被超长/拼接拒绝；10条总4响应只有5条新获逐字绑定，另5仍拒绝，不据此宣称语义有效。12份旧回执原文件hash/字节不变、验证通过；新派生view全部stale。
- 首次回归61/67失败及首次类型失败保留。旧测试总4超限反例更新为总5；诊断固定hash换为明确v4；类型失败来自Schema union访问与隔离副本缺少只读knowledge-web/lib文件，已修复。

日志与交付清单见 [candidate-manifest.json](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/candidate-manifest.json)、[定向回归](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/wire4-regression.log)、[无私有目录回归](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/wire4-portable-regression.log)、[真实历史诊断](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/wire4-real-history-final.log)。

## 同预算覆盖影响

显式Schema增加协议开销：旧3300字符，初版3927，等价紧凑版3745。8000旧预算反例恢复可用；同9000短稿夹具852字仍仅703字partial，旧已选范围保留、新段8可绑定，不能标为full，也没有提高调用预算。对应allocation回归明确保存该变化。

同一冻结QE05 snapshot，使用根已合selector、原59392上限，v3/v4字段选段均7784/63164且partial，所有ranges完全相同；03范围均40775–42415。D2编码名41188–41202、K2编码规则41280–41344、D3名称41460–41474、K3名称规则41552–41655全部完整原文进入，不等于字段已核验或整表全覆盖。[审计与原文坐标](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/qe05-wire4-budget-audit.json) 及 [新实际输入](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/qe05-wire4-budget-input.json) 封存。

新inputHash `cec48d9688516b89e9337a94c64ac8750c69381b5e06d336ee213e087f535f7b`，promptHash `fe5dbc886ca120e1eebcbaf5bbc4db5890a3ed90cd8e1fd0cf8a687bf494d34c`；提示33420字符，仍在59392内。未调用云、未升级旧结果。

## 可合并范围与限制

[最小patch](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/wire4-capacity-candidate.patch) SHA256 `8beaf42fdcf9356a4cc8effb63d91e2301153030b7701856c66dc686581ed084`。8文件：shared/content-review.ts、main/content-review-protocol.ts；wire/allocation/diagnostics三现有测试；新wire4测试及两固定v3夹具。原/新文件hash分别见 [patch-original-hashes.json](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/patch-original-hashes.json)、[final-hashes.json](../.test-data/content-review-wire4-isolated-77c57fc29161497786ce81f66e7c4169/final-hashes.json)。根git apply --check实际exit0，未由本代理apply。

没有新付费对照，不能宣称模型已更准确、QE05生成缺陷已修复、完整审查收益已证明。新增Schema体积在更小边界下可能影响覆盖，partial必须继续保留。真实多文件正式交付仍是后续独立任务。

通俗说明：审查要同时说明“成果说了什么、两份资料怎么规定、用户允许核对什么”，三段引文有时装不下。现在允许四段，但每段必须真来自所读原文；多容纳一段证据，不代表模型说得正确，也不代表它可以擅自改稿。
# 根集成记录（2026-10-11）

父审批准后，根工程唯一写入者核对 8 文件原始字节 hash 和封存 patch SHA256 `8beaf42fdcf9356a4cc8effb63d91e2301153030b7701856c66dc686581ed084`，`git apply --check` 通过后合入。最终文本与封存候选完全一致；CRLF/LF 字节差异逐项记录，既有 dirty 改动保留，DOCX 显示实验未合入。

必要 11 文件定向检查 96/96、fail0，5,769.7214ms；node tsc exit0。证据在 [.test-data/production-wire4-integration-20261011/integration.json](../.test-data/production-wire4-integration-20261011/integration.json)、[targeted.log](../.test-data/production-wire4-integration-20261011/targeted.log)、[typecheck.log](../.test-data/production-wire4-integration-20261011/typecheck.log)。统一 full/build 和新真实付费任务仍待评测 runner 同批稳定；原隔离历史证据继续保留。


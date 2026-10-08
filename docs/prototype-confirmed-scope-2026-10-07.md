# 冻结原型回归与未确认候选的范围隔离

2026-10-07。范围：任务级回归执行的最小修复，不改变模型、工具、验收上限或发布权限。图见 [范围选择源图](diagrams/prototype-confirmed-scope.mmd)。

真实 E 暴露了一个执行缺陷：修改前宿主冻结8项73步；模型后来保存5项19步候选，保存仍保留 `required=true`，但新 `specHash` 与旧 `requiredSpecHash` 不同，`needsConfirmation=true`。`runCases`此前仅看required标记，将候选5项自动并入冻结8项，合计13项，严格10项上限拒绝，导致冻结回归根本没有运行。旧发布门禁实际仍是allowed=false，不属于发布绕过。原E证据不修改，也不把离线修复验证算作E重跑通过。

## 当前契约

`main/prototype-acceptance.ts` 的 `runCases(input, cases, ctx, options)` 公有接口保持不变，执行器仍是既有browser runner。

- 宿主传入的 `cases` 原样保留并执行。
- `options.baselineCases` 始终作为不可弱化范围并入；同ID、不同定义仍报 `PROTOTYPE_BASELINE_CONFLICT`。
- 当前保存规格只有同时满足 `required===true` 和 `requiredSpecHash===specHash` 时，其用例和sourceRefs才自动作为保护范围并入。
- 未确认候选可通过正常保存规格run单独执行，记录其真实结果；不会因为自动检查冻结范围通过，就自动确认候选或替换旧基线。
- 行记录仍保留当前required标记及规格身份。`needsConfirmation`、`requiredSpecHash`、质量报告和发布/导出门禁沿用原逻辑；候选需确认时仍阻断。

保存后新的候选依据也不自动成为旧冻结回归的依据。显式sourceRefs以及已确认required来源仍沿用真实读取、内容hash和授权核对。任务冻结旧用例的来源恢复不在本补丁中另建机制，不以模型文字补造依据。

## 限额与安全边界

不加分批平台，不提高10项用例、每项20步、总100步、60秒执行时限、单图2MiB/总图10MiB以及20项sourceRefs等上限。两个实际应执行的保护集合合并后超限，仍明确拒绝，保持未验证；不会截取前10条、删除基线或伪造passed。本补丁解决的是未确认候选被错误自动提升为保护范围，而非将所有大范围验收都变成可执行。

原Build/Plan、Run取消、草稿归属、原件baseHash、依赖hash、来源版本、授权复查及报告动态stale/unavailable行为不变。未应用草稿仍可被检查，正式文件不被写入。

## 定向验证

新增 `tests/prototype-acceptance-draft.test.ts` 三项回归，复用真实Store/Files/domain和明确的测试runner：

1. 确认8项73步→保存未确认5项19步。候选自身仅执行5项且gate=false；冻结8项真正进入runner并完整记录，未确认候选来源不可用也不污染它。显式baseline8加host用例仍完整执行9项；冲突仍拒绝，正式文件不变。
2. 冻结8项实际返回一项失败，其余7项通过；整体failed，完整8项定义/观察保留。后续草稿内容变化标stale，撤权拒绝读取，不被候选passed掩盖。
3. 已确认required范围与来源仍自动追加；已确认8项加3项超10，明确too_big且runner零新增调用，不丢例、不修改规格。来源变化仍使历史报告stale。

同时跑原saved/draft/domain与Service回归测试及类型检查。测试runner只验证软件流程，不代表本次运行了Electron真实浏览器或云模型。根代理统一构建和全量测试，本补丁不重新启动E。

通俗解释：旧规则是“必须保住的检查”，新候选是“尚未确认的建议”。软件现在不会把新建议偷偷混进旧检查而挤爆数量限制；旧检查照常完整运行，新建议另留结果，发布仍需满足原来的确认和质量要求。

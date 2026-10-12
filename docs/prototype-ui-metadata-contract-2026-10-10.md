# 原型业务界面与交付说明分离

关联 F10、QE06/QE09/QE10/QE12。2026-10-10用户明确要求原型UI不出现制作注释、演示标签或“不是实际产品”等元提示。业务内容和正常操作反馈保留，本地数据及未真实接入服务的事实放在Slash交付说明。不能以界面简化为由删除业务规则、伪造真实工具成功或声称已接通后台。

## 本轮最小同步

- `shared/quality-evaluation.ts`：新任务提示把未知接口/机制与未真实集成范围放在PRD或Slash交付说明。QE06不再要求浏览器发现“模拟”标签；QE09继续编码展示/不可手填，将未知分配时机移出UI；QE10继续本地成功/重复/失败、失败保留输入与禁止业务网络。
- `scripts/quality-evaluation-run.mjs`：新 `--prototype-checks` 提示不再要求页面标记模拟，仍要求可操作控件、原业务回归与禁止真实业务网络，交付说明必须如实记录未集成范围。
- `scripts/quality-prototype-checks.mjs`：采用显式binding版本区分新旧UI期望，报告记录版本及 `uiNotePolicy`。不修改产品DOM执行器或交付门禁。

## 兼容schema

| binding版本 | allocationNote | 实际UI断言 |
| --- | --- | --- |
| v1历史明确期望 | 保持必填；原“模拟/演示/待/未/时机”校验保持 | 保留原文本断言及原用例标题；缺说明仍失败 |
| v2新任务 | 可省略；如携带旧值只保留metadata | 不生成allocationNote文本断言；新模板不默认生成说明字段 |

没有自动v1→v2迁移。新v2必须由新任务明确选择并登记新bindings/spec身份；旧回执、旧manifest和已冻结/复用spec不回改，仍执行原cases，不默默把旧失败转成通过。若旧明确元文案要求被最新任务替代，应单独记录新范围及新基线，保留历史证据；业务断言不能一并删除。

编码系统计算说明属于实际字段业务规则，现有 `generatedNote`、编码不可编辑及JHWD格式检查保持。名称50/51边界、成功/重复/失败正常语义、失败保留全部实际输入、重试/查看明确要求、三个视口、总case/step预算、hash和网络隔离保持。取消UI元说明不证明真实MDM分配、定位或判重服务已接通。

## 验证

新增三项测试明确验证v2可无说明与v1缺说明仍拒绝；v2携带旧note不产生UI断言且不修改输入；业务断言保持、正常“提交失败”反馈可用但无结果文案仍拒绝。旧v1全部用例步骤继续测试。

```text
node --import tsx --test tests/quality-prototype-checks.test.ts tests/quality-evaluation.test.ts
15/15 passed
npm run check
passed
node --check scripts/quality-prototype-checks.mjs
node --check scripts/quality-evaluation-run.mjs
passed
```

本子代理未build，根负责集成；未发云、未运行新真实Agent任务，新版UI实际表现仍待验证。用户王书预算15000及余额floor40000约束由根掌握；可靠余额未核定前真实云调用停止，本轮仅本机验证。

## 历史脚本边界

以下旧脚本绑定旧稿及当时明确的演示UI要求，保留源码与已有结果，不直接作为新版UI要求的验收：

- `scripts/pm-business-real-repair.mjs`：旧提示要求“本地模拟服务失败”、演示开关及“模拟服务失败”文本。
- `scripts/pm-business-prototype-cases.mjs`、`pm-business-prototype-interaction.mjs`：旧特定DOM/文案断言含“模拟服务失败”“模拟编码”。
- `scripts/pm-business-evidence-review.mjs`、`pm-business-real-baseline.mjs`：旧独立期望/默认提示含模拟标注要求。

独立的合成浏览器/视觉循环测试可继续使用其固定样例；这些样例不代表新版Agent须生成相同UI。真实工具回执的执行状态、版本、失败和未知事实仍须诚实记录。

通俗说明：原型页面按正常产品显示，方便实际操作；哪些能力暂时只是本地行为，由Slash在交付时说明。旧测试记录保留，新页面使用明确的新验收要求。

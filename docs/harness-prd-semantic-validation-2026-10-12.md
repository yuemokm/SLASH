# 真实复杂PRD语义审查对照

**最新结论：两次有限真实审查均已结束，未证明PRD语义质量提升。** 基线跨最终build，仅保留独立历史证据；候选使用独立完整构建快照，正常disapproved，识别fixture缺XLSX证据链，但范围内合并格错误漏检。范围外编码旧问题未提及不扣为任务失败。详见[真实验收记录](harness-prd-real-acceptance-2026-10-12.md)。以下保留准备阶段及原始零云证据。

日期：2026-10-12。需求 F02/F10/F12、PF03/PF05/PF09。明确样例编号 **PRD-DIMENSION-HARNESS-20261012**。其中 `QE12/PRD.md` 仅保留历史文件路径，不是本轮原型QE12视觉/业务基准。

## 冻结真实资料和独立判据

复用已授权的 `prd-dimension-repair-proposal/case-PRD-DIMENSION` 真实增量pending，6653字符，SHA256 `83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36`；原字段表提取全文63164字符，SHA256 `9e4c1f54b6925220edbe551cd560d57f663b9661092a30067573ea7a7af0820c`。原限定请求全文hash `3bf5bd543ad08d08907268dbbec8a378653492c8ed49992fa4da3ea6dc636092`。

请求原句：“只局部改这两行及必要的紧邻来源说明。保持其他字段列义和值，不要统一改表头迁就错误值，不要全稿重写。”另有“不扩修其他历史问题，不增加后续变更流程、角色权限、接口等新业务事实”。原请求完整保存，测试只追加当前隔离目录的真实mount映射，业务限定不改。

独立判据源自既有 [PRD实际核对](prd-review-real-diagnostics-2026-10-10.md)，在付费调用前保存到专属 `independent-rubric.json`：

1. PRD第75行把D5/D6称为合并格，来源实际K5:K7是字段规则合并区域，D5/D6是独立字段名称格。属于允许范围内的紧邻说明错误。
2. PRD旧编码展示值与03表N2/O2的“是”不一致；这是两目标行之外的问题，只能记录，不能未经授权直接扩修。
3. 不能用01/02同名字段覆盖03机会门店对象；F来源/首次调整与P后续前端变更维度必须独立。

判据同时冻结03工作表的边界、12处原文坐标和两处PRD原句，避免只按字段名匹配或事后调整答案。审后逐项记为准确发现、假阴性、无依据/误报、范围越界或未验证。仅协议成功、发现数量或工具调用少不作为质量提升。独立判据/答案不进入提示词，cloud child不解析判据；判据文件也在审查工具授权目录之外。

## 有限生产路径

[独立脚本](../scripts/harness-prd-semantic-compare.mjs) 只复制已冻结稿和来源到新测试目录。使用独立Service/Store，正式建立活跃父Run，并用离线夹具导入历史稿、登记实际宿主读取，**不调用生成模型**。这一导入不是本轮Agent生成或自动修稿成果。

- 基线：实际 `Service.taskContentReviewInput` → `Service.finishTaskContentReview` → 正式 `createRuntime.reviewContent`、wire4及来源引文绑定。
- 候选：实际 `Runtime.reviewGoalCompletion` → pi-goal-x原auditor与受控父工具闭包；使用原Service能力网关、生产`goalReviewInputHash`及版本/权限/未知结果核对。保留原`upstreamApproved`，独立语义判据不能反向替换模型结果。
- 相同原稿、资料及业务请求；每条路一个审查会话、240秒观察、0外层重试。候选最多12次既有读工具；基线最多1个实际HTTP派发，候选最多13个派发（包含工具续轮），不无界补跑。
- 最终case锁定完整`dist/main`、`dist/shared`编译JavaScript、pi-goal-x已安装源码和依赖lockfile的hash。任一运行期间产物变化即拒绝继续，不能把两次不同构建结果算同资料对照。结束后保留实际宿主来源读取回执，可区分提示内选段与工具追加读取。
- 只读来源，命令、网络资料、连接配置与外部写入均禁止；未apply，不修改原稿、用户资料或真实profile。使用现有最小加密模型来源和正式safeStorage解密，密钥不打印、不持久化为明文。
- PRD默认已走独立内容审查，候选只是**手动生产适配器对照**；没有改变默认PRD路径或叠加第三轮审查。默认任务是否适用单独记录。

## 当前证据

初始零云preflight位于 `.test-data/harness-prd-semantic-b862d2ef-c06d-4745-aa32-1fc0a504b6de/baseline/preflight-result.json`：真实Service/Runtime可调用、safeStorage凭据可解密、14个关键格全部进入生产选段，prompt34688/59392字符，来源18177/63164字符仍partial，实际HTTP派发0，exit0。原稿及来源hash一致；候选当时尚未编译可用。

`node --check scripts/harness-prd-semantic-compare.mjs` 通过。该初始preflight使用当时编译产物，不替代最终集成构建或真实语义验收。本段为准备阶段原始记录。

准备阶段尚未发真实请求时，候选的真实Pi会话发现`before_provider_request`可能吞掉guard异常；唯一集成负责人随后补主动abort及真实请求1/读取1反例。最终基线启动15:00:36Z、跨最终build15:02:08Z，不能作公平对照；候选改用[独立快照入口](../scripts/harness-prd-semantic-candidate.mjs)只执行一次，完整结果见顶部链接。原baseline runner/manifest/receipt未改，不追加基线请求。没有将长资料selector在QE05输入不变说成实际质量提升。没有打包。

流程源：[harness-prd-semantic-validation-2026-10-12.mmd](harness-prd-semantic-validation-2026-10-12.mmd)。

通俗解释：用一份确实存在两类问题的真实PRD，检查新旧审查方式能否找准错误、引用对资料，并且知道哪些问题不允许顺手修改。能接通模型本身不算审稿更好。

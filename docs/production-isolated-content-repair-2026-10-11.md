# 局部内容意见的有限修稿隔离（G2 内容审查）

当前根集成：父审批准seal-final b0c5b194…c3da，9文件全部base核验/create-only后按final-source精确合入；回执`.test-data/production-isolated-repair-root-integration-20261011/integration.json`，Service3c557ae6…9a7b2，发布、目录纠错、Word和模板保留。原4385 check0、53/53（41190.5067ms），原整体统一48686已check0、1409项1408通过/1失败、未build，唯一无候选读取控制流回归已按Service7fe0d3d4…7b18最小修复合根；回执production-content-repair-preflight-root-20261011/integration.json。新整体统一证据production-content-repair-final-unified-20261011待终态，尚不声称真实模型修稿成功。以下隔离封存记录按历史时点保留。

2026-10-11。隔离候选当时未合根。基线为目录纠错后稳定源码；Service 30f30945f9385e73b480e36750c7ed922649da4b245f84030eafb56f48d2c4a5。

宿主可保留一条已经逐句绑定、在原请求范围内的修稿候选，即使同一响应中另一条意见结构或引文无效。整体内容审查仍为 invalid/unverified；无效意见和部分覆盖限制保留，不自动升格业务通过或正式交付。

可选 isolatedRepair 只属于宿主 receipt，不进入 wire4 或模型输出协议。它绑定本回执 inputHash/promptHash、真实前后 assertCurrent 成功事实、正常 stop、有效根协议与覆盖身份，列举唯一且实际存在的合格 finding IDs，纳入原 resultHash。消费者同时校验这些一致性及原候选条件；旧无字段 invalid 回执不升级。源码沿用原分类、四引文上限及 repairMode/repairConstraint，未增加模型调用或引用预算。

任何全局协议/调用/取消/版本失败，以及真实正文为空，均不给局部资格。来源部分读取可支持其实际片段内的局部意见，但不能成为全文或 Office/PDF 图像覆盖证明。过期刷新删除标记并清修稿资格；无法授权读取的派生视图隐藏引文、删除标记和 findings，重新计算结果哈希，原历史回执不改。

Service 先做不授予资格的否定性预检：原报告没有可修候选或已达两轮便结束，不新增资料读取；确有潜在候选时，getReport 真实刷新成果、依赖、来源和完整审查输入；沿现有 guard 在异步读取后核 Run active、取消、项目与当前授权/权限代次。刷新后重新计算候选、unknown 副作用、原时间/工具预算和两轮限制。局部修正仍通过现有草稿 ID/hash/baseHash 与资源锁/CAS，不能声称对并发文件修改完全原子；没有新增通用取消机制。

正式导出/发布沿既有 TaskDelivery 当前版本与逐项核对合同。局部可修不会免除内容/业务/视觉等关键核对；完整的真实人工替代仍按原合同记录，不改成永久死锁。

验证范围：独立 parser、真实 TaskCompletion、真实 Service/Store/Files/gateway/TaskDelivery 与确定性合成 Runtime，证明宿主控制流；不调用云模型，不声称真实业务解释、模型遵循能力、远端发布或双机行为已经验证。专项包括混合有效/坏意见、全局失败、缺真实前后回调、双hash/ID/状态篡改、旧回执不升级、源/稿变更、撤权/权限代次/跨项目、取消/未知副作用、两轮及正式门禁。必要最终日志及 seal 另存同候选目录。

通俗说明：可靠的一条建议可以先修，但坏建议不会跟着执行，整份成果也不会因此被当成已经合格。
## 封存验收记录

- node 类型检查退出0：typecheck-final.log / typecheck-final-exit.txt。
- 最终专项20/20、31337.6475ms：isolated-final-attempt3.log，owner session61882已退出。
- 最终组合65/65、49445.2777ms：isolated-combined-final-attempt4.log，owner session54444已退出。命令沿候选只读共享的tsx，七份定向文件，test-concurrency=1；未跑根测试/build。
- 原17/17、32881.097ms与原组合63/64、83966.867ms分别保留。唯一失败是fixture直接修改state.root绕过真实工作空间入口，导致队列找不到旧contract；修正为真实workspace API拒绝WORKSPACE_BUSY并证明原任务继续，不修改产品底座、不吞异常。
- 离线重放仅原A1/A2 wire4完整input及原真实response：offline-A-replay/summary.json。两份都仅原finding-2恢复局部资格，绑定内容（除repairEligible）与原invalidFindings精确不变；A1因绑定两份成果产生2个TaskCompletion候选，A2为1个。整体仍invalid/unverified，未执行修稿、未调用模型、未改旧回执。两次assertCurrent只核原封存输入/响应字节未变，不冒称活跃Service版本证据。

上述封存阶段当时未合根；当前合根事实见开头。真实模型修稿效果与业务正确性仍未验证。授权/取消guard缩小异步窗口但不提供对任意外部文件变动的原子锁；真正编辑仍沿现有草稿CAS。

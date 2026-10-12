# 评测采证导出目录修复

关联 G4/G5 真实评测采证。实现为 `scripts/production-agent-trial.mjs` 的 `collectProductionTrial`，验收为 `tests/production-agent-collector.test.ts` 与实际 compiled evaluator 的 `tests/production-agent-wire-handoff.test.ts`。流程见 [Mermaid](production-collector-export-target-2026-10-11.mmd)。

旧采证脚本把正式导出目标放在 case 的证据目录，它不在已授权可写 mount 内。新 QE05 的官方 IPC 返回 `PERMISSION_DENIED`；[实际目标与 mount 映射](../.test-data/quality-evaluation-qb1ZWl/cases/QE05/independent-observations/collector-export-target-mapping.json)已证明此边界，不能用这个错误断言业务门禁已运行。旧失败试次、文件和结果保持原样，不回填成功。

现在仅从本评测固定 seed 的既有“过程文件” mount 筛选目标；展示名不是权限证明，随后仍核验 ID、路径、enabled/write 与真实路径必须在 evaluationRoot 内。重开后复验相同授权，在该目录内生成唯一 `production-exports-*` 子目录，预选文件必须不存在。正式导出仍走官方 IPC 及 TaskDelivery 门禁，返回路径须等于预选路径，真实路径必须落在唯一目录内，原文件与导出字节 hash 须一致。不新建 mount、不修改权限、不绕过核对、不发送模型请求；该约定只用于此评测脚本，不作为通用产品权限机制。

19/19 根组合专项通过、exit0（26898.0206ms），包含 collector 原5项及新增4项、wire 实际 compiled evaluator 3项、设备说明既有7项。新增反例覆盖无写授权、根外授权路径、重开撤权、同字节却返回另一路径；失败不产生完整 trial，已存在用户文件字节不变。脚本 `node --check` 通过。日志与输入源码 hash 在 [检查目录](../.test-data/production-collector-authorized-target-20261011/check-result.json)。新目录的真实 Electron 导出路径仍待统一构建后验收；夹具通过不等于真实任务业务通过。

通俗说明：之前采证保存到了软件不允许写的地方；现在只保存到原来就允许写的过程目录。业务内容没通过核对时，正式导出仍会拒绝。

统一全量1269/1269、check/build0之后，当前 built main/preload 的正式 `copy` 成对验证通过：[真实桌面结果](../.test-data/production-mcp-dispatch-electron-14f9cbd1-47f2-479e-afd1-a8534c5d2e7b/result.json)。已逐项核对的合成说明正文实际导出到授权过程 mount 的唯一目录，原字节 hash 一致；合同变更后，同一正式导出 IPC 明确 `TASK_DELIVERY_BINDING_STALE`，原目标字节不变。两个场景均为实际官方 IPC、合成任务内容、Agent 审阅身份，没有模型请求或真人签字；不能替代真实 QE05 业务核对或完整 trial。旧 QE05 的根外目标失败仍保留。

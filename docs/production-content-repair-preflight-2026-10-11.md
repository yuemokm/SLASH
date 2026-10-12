# 内容修稿预检的读取边界修正

2026-10-11，已按父审最小补丁合根。关联 G2 内容审查有限修稿。

根Service最终SHA 7fe0d3d480dae2b196e39a905a5f2b0764be4ce1d2e3e53ca3575e7ff4a47b18；三个原测试hash不变。集成回执 `.test-data/production-content-repair-preflight-root-20261011/integration.json`。历史统一48686为1409项1408通过/1失败，源码未变、未build；隔离原失败1/1和既有20项保护通过。当前整体检查 `.test-data/production-content-repair-final-unified-20261011` 待结果，不把隔离通过当全量或模型质量通过。

根全量回归发现 tests/draft-edit-service.test.ts 的真实既有场景：独立任务初始 workspace_read=deny，网关按预期拒绝 read/edit，没有草稿变更；任务本身可以正常完成，内容并没有被声明通过。局部修稿接线无条件调用 getReport/assertBusinessAccess，即使没有任何修稿候选也新增读取需求，使该任务错误失败。

最小修正只在 Service 的原修稿循环增加否定性预检：原报告没有 repairableTaskFailures，或已达两轮，结束修稿检查循环。不读取更多资料，不派发修稿，不改权限。原报告有候选时仍完整 getReport 重读成果、依赖、来源和审查输入；await 后重新核活跃/取消、项目/授权与权限指纹、原期限/工具预算/未知副作用，再重新计算有效候选。

预检不能授予修稿资格，也不使用旧候选直接派发。正式交付和完整人工替代仍走原 TaskDelivery 合同。wire4、引用预算、局部回执/schema/消费者均未变。

检查使用未修改的根测试：原失败的独立读写权限/Plan 网关用例，以及既有两份局部修稿保护测试；真实 Service/Store/Files 与确定性合成 Runtime，无云模型。检查日志和哈希列于候选 seal，原根全量失败记录由 baseline 保留，不改成预期 failed。

通俗说明：任务没有可修建议，就不会强行再读资料；真正要修稿时，版本和权限检查仍然完整。
# 单文本发布最后读取后的版本与授权核对

关联：G2 正式交付与外部写入一致性；实现 `main/service.ts` 的 `prepareExternalTaskDelivery`；验收 `tests/mcp-delivery-contract-fence.test.ts`；流程见 [Mermaid 源](production-single-text-dispatch-fence-2026-10-11.mmd)。

单文本发布的最后一次 `readOutputSnapshot` 是异步读取。读取等待期间，合同或目录授权仍可能变化；此前只核对读取前的合同，可能把旧核对结果用于变化后的环境。现在读取前后均核对合同、版本、参数、成果定位及当前目录权限，最后一次本地核对后不再等待其他异步步骤，再交给既有 MCP 派发路径。合同变化或撤权以派发前失败拒绝，保留真实服务器零调用证据。

正常未变内容和同版本新报告可调用一次；派发后回执丢失仍是 `outcome_unknown`，不会自动重发。普通 MCP 操作的权限语义、正文和用户已有文件不变。本补丁只覆盖已有单文本成果绑定，多文件正式发布另有隔离候选，未因此宣称完成。

2026-10-11 封存证据：[seal.json](../.test-data/single-text-fence-sealed-20261011/seal.json)，根工程基线 Service SHA `2a2bdd178c89ad544073b53e059c1b2e7b1148705d16d350caac027b0811e614`。当前根依赖副本的产品类型检查、新增测试独立类型检查均通过；相关回归 27/27（84.908 秒），最终有类型保护的专属五场景 5/5（12.143 秒），日志在 `.test-data/single-text-fence-root-dependencies-20261011/`。

首次副本漏复制 `knowledge-web` 造成的类型失败、随后新增测试少传必需的凭据回调参数造成的类型失败均保留；补齐真实根依赖和显式离线夹具回调后通过，没有放宽产品 schema 或等待超时。

根集成回执：[integration.json](../.test-data/production-safe-review-and-fence-integration-20261011/integration.json)。先应用内容审查安全诊断的两个 Service 局部 hunk，再应用本补丁；没有整文件覆盖另一项修复，组合 Service SHA `64163f5dc04c1842253a277d76b2e2116190cc826bb47a443f833c07d34f6c06`。根 `npm run check` 通过，组合专项 63/63、0 fail/cancel/skip（85383.9802ms，`combined-targeted.log`），执行进程实际 exit0；本版本全量、构建和真实桌面验证仍待完成。

通俗说明：发布前读完文件后，软件再确认一次任务要求和目录权限仍然有效，避免在等待期间改变了条件却继续发送。已经发送但没收到回执的操作仍需要核对，不能偷偷再发一次。

当前根统一检查、1269/1269 全量与构建均通过（无打包），日志位于 `.test-data/production-safe-fence-navigation-unified-20261011/`。真实当前 built main/preload→本机 stdio 六场景通过；[实际结果](../.test-data/production-mcp-dispatch-electron-14f9cbd1-47f2-479e-afd1-a8534c5d2e7b/result.json)记录最后真实 `readOutputSnapshot` await 完成、返回前的隔离宿主合同变更注入，实际原型命中两次读取、正文未变、合同 hash 改变、服务器零调用、官方 Operation `failed`。该注入是测试故障，不是用户操作。派发后失联仍一次调用/`outcome_unknown`；没有自动重发。首轮 Electron evaluate 动态导入限制导致 harness 失败已保留，改用当前主进程模块加载后通过；未修改产品代码或隐藏失败。

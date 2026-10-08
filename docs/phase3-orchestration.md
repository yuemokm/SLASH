# 第三阶段最小闭环：受控编排与共享协作

本阶段补齐宿主侧的受控子 Agent、模型路由、并行任务和共享文件冲突边界。策略实现位于 `main/phase3.ts`，实际执行由 `Service` 承担；模型文本、外部资料和邀请内容不能改变这些策略。

## 子 Agent 调用

`subAgentToolWhitelist` 只包含资料读取、产品记录查询、影响查询和连接目录查询。`subAgentRun` 会在宿主侧真实执行这些只读处理器，并把结果保存到父 Run 的结果记录；`parallelRun` 使用同一白名单和父权限，在配置的并发上限内执行独立查询。每次请求携带父 `runId`、能力和可选挂载 ID；`ControlledSubAgentBroker` 检查工具白名单、父 Run 一致性、Plan 模式、权限决定和目录范围。明确 `deny` 优先于权限模式，Plan 子 Agent 不能执行写入、进程、连接配置或外部动作。默认嵌套深度为 1，防止子 Agent 无限派生。

## 模型路由

`selectModelRoute` 只从宿主已配置且可用的模型中选择。支持 `fixed`、`task_type`、`cost_aware` 和 `fallback` 四种策略，可约束最小上下文窗口、先进推理能力、预算和候选回退顺序。函数只返回选定模型和原因，不在路由层直接发起模型请求；每个 Run 仍应保存实际模型 ID。

## 并行任务

`runParallelTasks` 使用有限 worker 池执行互相独立的只读或准备任务。默认最多 8 项、最多 4 个并发 worker、每项 120 秒；调用方可以进一步收紧限制，不能超过配置上限。任务 ID 必须唯一，单项超时会中止其 `AbortSignal` 并返回 `timed_out`；整体取消返回 `cancelled`。正式成果提交仍需回到版本校验和资源锁流程，不在并行阶段覆盖文件。

## 共享冲突与锁

`SharedResourceCoordinator` 以 `resourceId + path` 为锁粒度，支持读锁和写锁、持有者校验和有限租期。写锁存在时，其他所有写入都会返回 `LOCK_HELD`；释放锁必须由持有者执行。即使没有锁，只要读取版本与当前版本不同，也返回 `VERSION_CONFLICT`，要求重新读取并生成草稿。锁是应用会话内的协作诊断，SMB/NTFS 权限仍由 Windows 执行，不能把应用锁当作系统文件锁。

正式提交由 `Service` 在进入 `Files.apply`、模板迁移组或工作区规则写入前按稳定顺序获取成果资源的写锁；已有同一 `runId` 锁可复用，自动获取的锁在提交完成或失败后释放。迁移组会先锁定全部目标再做版本预检，锁冲突会保留草稿并停止写入。

IPC 请求包括 `subAgentAuthorize`、`subAgentRun`、`parallelRun`、`modelRoute`、`shareConflictDiagnose`、`shareLock` 和 `shareUnlock`。接口只接收结构化工具输入，不接收任意命令、路径脚本或凭据。

验证：`npm run check`、`npm test`（94 项通过）、`npm run build`。

# G1 / A01 宿主恢复与结果核对

日期：2026-10-11。关联 F02 / PF03 / PF09、已批准生产方案 G1。本文记录代码与隔离验收；不代表整个生产方案已交付。

## 实现

- `shared/run-recovery.ts` 先定义严格 Zod 契约；`main/store-migrations.ts` 新增 v3 侧表。v0/v1/v2 原库先用 SQLite `VACUUM INTO` 生成包含 WAL 的一致备份，再事务迁移；既有 kv、operations、events 不重写。当前运行时拒绝未来 schema，v3 缺表/缺列明确失败；不降级数据库。旧程序不得直接打开迁移后真实 profile；回退需隔离 profile 或从备份恢复，并保留新数据。旧程序本身没有版本拒绝保护，G4 尚待真实 rollback 验证。
- `main/run-recovery.ts` 复用现有宿主工具 effect，记录 `not_sent → may_have_run → settled`。旧 executing 缺派发证据时，副作用及未知工具保守待核对；只读和未派发审批安全中断，旧审批不复用。
- `main/service.ts` 在实际宿主命令批准并完成前置检查后持久化派发记录，再执行 PowerShell、run_process、处理脚本。草稿提交回调、资料记录和任务合同的现有 KV 持久化接口承担提交标记，使匹配/参数/版本的前置拒绝可以修正。其余未知 handler 采用保守入口标记。
- `main/store.ts` 将工具终态与侧记录结算放在同一 SQLite 事务。失败/取消发生在可能执行之后不推导为“未执行”；普通错误也进入未知结果屏障。已成功/失败/取消的事实不能被后续 executing 或取消倒退覆盖；旧结果文字保留。
- `resumeRun` 和 `send` 两次父任务检查均拦截未决副作用；checkpoint 不能把未决记录标成安全续作。用户核对后会把原操作身份、确认依据与副本前后版本放进恢复上下文。原未知工具回执不改成成功，核对结论保存在侧表。

## 宿主核对接口

`listRunRecovery(runId): Promise<RunRecoveryView>` 返回工具/操作身份、脱敏摘要、派发前副本版本和当前观察版本。当前观察只用于绑定核对页面，不自动宣称操作成功。`contextToken` 绑定项目、目录、权限、持久操作、来源回执及页面所见处理副本版本。

`reconcileRunOperation({runId, operationId, expectedUpdatedAt, contextToken, resolution, evidence})` 仅供桌面 IPC 调用，不提供给模型。需要停止的可恢复任务和 8—5000 字核对依据。确认项为“已完成”或“未执行且未产生修改”；部分完成和无法判断应保持未决。确认不会调用 send，也不批准下一条命令。

核对前后重新读取授权、原始资料及相关来源版本。处理副本可作为本次未知操作的产物发生变化：保留执行前 hash，并将用户所见当前 hash 写入核对侧记录；页面加载后再变动会拒绝旧 token，需重新查看。原始资料或其他冻结业务来源变化仍拒绝核对。真实恢复测试证明用户确认变化后的副本可进入原 `resumeRun → send`，由注入运行时只读读取新副本，计数器没有重复执行。

接口错误包括 `RUN_RECONCILIATION_UNSAFE`、`UNAVAILABLE`、`SCOPE_CHANGED`、`STALE`、`PERMISSION_DENIED`、`VERSION_CONFLICT`。UI/IPC 接线由另一执行代理负责，其桌面证据由主代理统一记录。

## 验收证据

| 用例 | 实际验证 |
| --- | --- |
| 三工具 × 派发前 / 副作用后回执前 / 已回执后 | 真子进程退出、重开真实 Store/Service；PowerShell 使用真实 powershell.exe，run_process 使用真实 Node 子进程，处理脚本走宿主回调；计数器为 0/1/1，未知状态不进入 send |
| 普通错误 / 取消发生在实际写入之后 | 未决侧记录保留、停止后续工具、不能继续原任务 |
| edit_draft 原生匹配失败 / record_requirement schema 拒绝 | 前置失败保持可修正，同 Run 后续真实提交成功；不误锁全部任务 |
| 只读、未派发审批、未知旧工具、真实终态 | 分别安全中断、未执行、保守待核对、已成功事实不倒退 |
| v0/v1/v2 旧库与未来/损坏 schema | 迁移后老 kv 资料和 operations 可读；备份版本与旧 operations 证据可读；重复打开不重复迁移；未来版本和缺表 v3 拒绝且不改原版本 |
| 操作身份、旧 token、撤权、来源变化、副本变化 | 错误确认被拒绝；旧记录仍保留；变化后的副本可以重新观察并人工核对；加载核对页后外部变化使旧确认失效 |

- `node --import tsx --test --test-concurrency=1 tests/run-recovery-crash.test.ts`：20/20 通过，68.158 秒，日志 `.test-data/production-recovery-20261011-tests.log`。
- 最后补真实 `resumeRun → send` 与变化后副本读回后定向复验：2/2 通过，16.482 秒，日志 `.test-data/production-recovery-20261011-modified-copy.log`。
- 既有 draft/event/runtime 恢复回归：15/15 通过，41.040 秒。包含 localhost Pi 原生编辑回归、120 次预算、历史/上下文恢复与参考原件命令保护。
- `npx tsc -p tsconfig.node.json --noEmit`：通过。
- 首轮处理脚本夹具误用了历史“参考原件”目录名，3 例失败；改为当前实际“资源”目录后重跑通过。观察版本修订时一例错误码断言失败，宿主已优先检查撤权，再比较旧 token，后续回归通过。没有通过删业务断言掩盖失败。

## 限制

2026-10-11 全量回归后补充：记忆 write/forget/restore 的派发标记已移到真实 worker mutation 请求发送前；schema、来源及权限预检拒绝不冒充已执行。真实 worker 写入后撤权仍保留 may_have_run/pending 并阻止恢复。handler 尚未执行时取消，Run 与 Operation 均为 cancelled；未知 handler 进入后抛取消或 SyntaxError，不能证明没有修改，仍为 failed Run / outcome_unknown Operation；已完成的成功 Operation 不因 Run 取消倒退。

- 原恢复故障 20/20 再验，78.313 秒：`.test-data/production-recovery-final-boundaries-20261011.log`。
- 工具终态 10/10，8.080 秒：`.test-data/production-tool-outcome-final-20261011.log`。
- 真实记忆 Service 2/2，25.548 秒：`.test-data/production-memory-service-final-20261011.log`；含实际 package commit 后撤权的未知反例。
- 既有记忆真实 worker 7 项在首组合日志均通过断言；组合总体失败，不能标整组通过。首次新夹具在 Run 中使用 setPermission，真实触发 `RUN_INPUT_AUTHORIZATION_CHANGED`；改为实际 Files 路径越界前置拒绝后纠正，保留授权变化必须取消的产品保护。日志 `.test-data/production-recovery-mutation-boundaries-20261011.log` 保留失败；后续定向通过如上。
- 最后 `npx tsc -p tsconfig.node.json --noEmit` 通过。全量和 build 由主代理指定的唯一集成负责者执行，此处不替代其结果。

通用命令的全部副作用无法仅凭文件 hash 自动证明；核对结论需用户查看实际结果，并绑定具体操作保存依据。宿主未知/旧 handler 仍保守待核对。此轮未验证真实用户资料故障、真实模型完整任务、云发布、SMB 双机、完整桌面恢复体验或全量测试；未 build、未打包。修改主进程后需重启开发应用。

G4 备份恢复缺口：当前测试只是直接打开 `slash-before-v3-*.sqlite` 验证版本与旧操作行，没有把备份恢复到一个独立 profile 后重建 Store/Service，也没有验证旧运行时打开隔离恢复 profile、完整 events/资料版本文件、迁移后新增数据的保留与恢复失败的回退。因此不能宣称已完成实际回滚。最小后续验证应先保存迁移后的一致快照及资料目录，在独立 profile 复制迁移前备份，隔离工作区路径，再分别重开新旧运行时核对 kv、events、operations、草稿/版本文件和记录数；真实 profile 全程保留，新旧 profile 不能同时写同一目录。

通俗说明：程序异常退出后，先区分“根本还没开始”“已经做完”“可能做到一半”。最后一种先让你核对，确认记录与当前文件版本后才能继续，避免把刚才的修改再做一次。

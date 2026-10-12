# G3 主 Agent 进程隔离实施边界

状态：依据当前代码的只读设计；尚未实现。执行前提仍为 G2 真实任务闭环证明。当前冻结窗口不修改源码。依据为已确认方案 `production-agent-plan-2026-10-11.html` 的 long-runs；不升级 Pi 0.86.1，不另造推理循环。

## 复用与接口

`main/service.ts` 已有 RuntimeFactory 注入及 RuntimeHandle；Service 依赖 sessionFile、messages、prompt、abort、dispose，以及原生 steer/followUp/clearQueue、prepareUserInput 和独立 reviewContent。先抽出可传输的最小接口，再实现宿主代理句柄与 Pi 工作进程。现有适配器保留作行为对照，默认切换须完成取消、状态持久化和回退验收。

`main/agent.ts` 使用公开 createAgentSession、SessionManager 和自定义工具，关闭原生文件/Shell工具并注册宿主受控入口。现有工具定义及执行权限不可因迁移放宽。工具请求回宿主执行；不可把 RuntimeOptions 的函数任意序列化、eval 或交给子进程自行打开业务数据库。

当前 assertRuntimeSucceeded 依赖进程内运行结果，代理句柄不能仅用类型断言冒充原 AgentSession。应有显式的完成/错误结果协议，保留 stopReason、原错误、取消与有副作用失败的区别。prompt 完成、最后事件送达、会话文件状态同步的顺序须有确认，不能把 IPC 写入成功当任务成功。

## 必须保留的行为

| 行为 | 迁移要求与证明 |
| --- | --- |
| 流式输出/上下文 | 保留 delta、原生输入回执、compaction、实际用量和诊断；版本/attempt/单向sequence校验，不重复追加 |
| 追加要求 | 原生 steer/followUp/clearQueue 的返回值和调用时序不变；异步准备期间取消/结束不得迟到插队或跨任务串写 |
| 只读审查 | reviewContent 使用既有 provider/model/reasoning 与预算，保持无工具、不修改主会话；图片限制、取消、超时及失败证据完整 |
| 宿主工具 | host保留权限、Operation派发记录、ChangeSet、SQLite及目录版本检查；子进程只请求固定工具，不直接执行业务I/O |
| 生命周期 | worker异常/断连/卡死有界结束，保留已有草稿与会话；取消先请求终止，超过宽限才结束进程，不自动重发未知操作 |
| 会话持久化 | 每个会话只有一个活动写者；再次启动前确认旧worker退出。会话文件路径受宿主约束，不能清理持久目录 |
| 迟到宿主回调 | worker崩溃后正在执行的host工具仍可能完成：保存真实Operation事实，但旧attempt不得更新Run阶段、输出或新会话 |

`main/pi-auxiliary-worker.ts` 可参考最小环境、windowsHide 和父进程死亡检测。它的 close 会递归删除工作目录，不能直接用于持久主 Agent 会话目录。主进程和worker同用户运行，这是稳定性隔离，不是OS安全沙箱。

## 验收顺序

1. 严格schema和接口示例先行：区分请求、响应、事件、取消、ready与关闭；限制载荷和在途请求，拒绝错误版本/身份、重复序号、未知requestId和过期attempt。
2. 保留原适配器，与新实现比较相同受控任务的工具参数、输出、失败、原生输入队列和持久会话行为；不以mock传输证明真实进程隔离。
3. 实际worker退出/挂起、启动失败、预压缩取消、host工具执行中崩溃与迟到返回、父进程退出、重开和双启动竞争。检查旧进程确实退出、无第二写者、草稿/数据保留、未知副作用未重放。
4. 桌面实际长任务执行时验证工作台可操作、停止有效；真实保存/重开/继续任务及同版本质量回归后，才切换默认路径。

## 预算、缓存与度量

复用 `main/run-limits.ts` 的30分钟/120次及Service最多两轮修稿；范围包含生成、检查、修正和等待，不通过重启worker重置。明确区分同一Run重启attempt与用户新建Run，持久预算以宿主时间和已确认工具次数为依据。

已有内容审查缓存按 inputHash 复用；新增复用前核对输出/来源/权限和审查配置是否都参与身份，撤权不能因缓存命中跳过授权。只复用同版本结果，不新增一套上下文压缩。

读取、生成、检查、审批等待分别记录真实时间，避免并发阶段简单相加制造总耗时。首稿、实际token和有账单依据的费用分别留证；缺失为unknown。目标是九成任务10分钟内有可运行稿，不能拿首次token、空占位稿或请求发出时间代替。

通俗说明：把模型运行移到单独进程，是为了它卡住时工作台仍可用。任务记录和权限仍由Slash掌管；迁移不能导致重复执行、丢草稿或重新计算预算。

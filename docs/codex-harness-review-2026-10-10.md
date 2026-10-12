# Codex harness 源码借鉴评估

2026-10-10 后续状态：以下三项建议已实现并通过专项、类型检查及构建，详见[可靠性续作](harness-reliability-delivery-2026-10-10.md)。下方“建议/待实施”为本次只读评估时点记录；全量和真实业务验收以续作记录为准。

查询日期：2026-10-09至10日。用户要求查看Codex harness可借鉴之处。本次读OpenAI官方公开仓库，不代表桌面应用未公开实现；固定commit `c63929af50518ca638ccad12f2805298cb7f25a1`，原始参考文件保存在 `.test-data/codex-harness-reference-20261009/`。未安装、运行或复制其执行底座。仓库根LICENSE为Apache-2.0；若以后实际复用源码，还需检查相关文件声明及NOTICE并保留归属。

## 判断

保留现有Pi 0.86.1会话底座，优先借鉴执行状态和回归测试方法。Rust的Codex运行时不能直接当作Slash TypeScript模块替换；语言差异不等于不能集成，但本次没有证据证明更换底座优于定向修复。未选择新通用能力包，未跳过Pi包筛选要求；以后替换通用能力仍须先查pi.dev高使用量包的公开接口与稳定性。

## 优先建议：取消与工具终态分离

[官方 parallel.rs](https://github.com/openai/codex/blob/c63929af50518ca638ccad12f2805298cb7f25a1/codex-rs/core/src/tools/parallel.rs#L262)在取消到来时检查handler是否已完成、是否已到终态，以及是否需要自行完成收尾；通过原子终态标记防止重复取消通知。等待调度/锁阶段仍可取消。

Slash `main/service.ts:976` 的工具包装在fn完成后写succeeded，随后检查取消并抛错；同一catch可能再把operation覆盖为cancelled。`main/store.ts:22` 的upsert允许覆盖状态。这是静态代码可见的竞态路径，本次未复现到用户实际任务，也未修改它。后续应分离“用户取消整轮”与“某工具已经提交成功”，在宿主保留真实完成结果，继续停止后续模型/工具。不能简单全局禁写终态，因为结果未知的外部操作仍需经过核对更新。

建议验收：控制工具提交成功与取消信号的先后顺序，验证取消前未提交、提交后取消、未知外部写入三种情形；每次只有一份真实终态，不重复写出、不因恢复自动重放。

## 优先建议：工具错误分级

[官方 registry.rs](https://github.com/openai/codex/blob/c63929af50518ca638ccad12f2805298cb7f25a1/codex-rs/core/src/tools/registry.rs#L650)把未知工具等错误回给模型处理；payload类型不匹配等内部错误走Fatal。[orchestrator.rs](https://github.com/openai/codex/blob/c63929af50518ca638ccad12f2805298cb7f25a1/codex-rs/core/src/tools/orchestrator.rs)集中处理审批、沙箱和被拒绝后的重试条件。不能推导为所有失败可自动重试，更不照搬权限升级策略。

Slash已有错误码、网关、外部未知结果记录及最多两轮质量修稿；本轮已精准修复只读验收unknown误冻修稿。下一步适合统一“可修正输入/检查失败、取消、不可恢复内部故障、外部结果未知”的结构化分类，减少跨层字符串判断。保留权限语义，外部未知写入不重放。这里是设计建议，未宣称已新增通用错误分类系统。

## 已有重合：上下文与中途补充指令

[官方 normalize.rs](https://github.com/openai/codex/blob/c63929af50518ca638ccad12f2805298cb7f25a1/codex-rs/core/src/context_manager/normalize.rs)补缺失工具回执、移除孤立输出；history在删减和发送前调用归一化。Slash已由 `main/agent.ts:355` 把压缩、上下文估算与模型重试交给Pi；已安装Pi的 `api/transform-messages.js` 会补缺失工具结果，压缩也保护工具调用配对。应补中断恢复/跨模型回放的集成测试，不能据此再写第二套压缩器，未复现的孤立输出问题只能列测试缺口。

[官方 turn_input.rs](https://github.com/openai/codex/blob/c63929af50518ca638ccad12f2805298cb7f25a1/codex-rs/core/src/session/turn_input.rs#L323)统一决定启动、转向当前任务或拒绝输入。Slash已有 `main/service.ts:217` 的运行输入队列及 `:979` 的Pi steer/followUp接入；应复用并核对结束/取消边界，不能当成缺失功能重新建设。

## 写工具顺序与耗时拆分

Codex parallel.rs:205用读写锁区分可并行工具与独占执行，并区分等待调度和handler执行时间。Slash已有资源锁及只读子代理，但普通write_draft等自定义工具未声明executionMode；已锁定Pi的agent.js:143默认parallel，agent-loop.js:328按声明选择批次。同响应内多个普通写工具可并行进入，正式apply资源锁不等于整个草稿创建流程都已串行。这是已确认的调度差异，未执行双写竞态实测，不能声称已造成数据丢失。

后续最小方向是使用Pi已有executionMode:'sequential'，只对存在顺序依赖的写工具声明；只读保留并行。先验证同文件写入、版本冲突、取消与授权变化，不新增调度器。另可复用现有观测机制拆出等待/执行耗时，找到真瓶颈。

本次结论：最先补终态保护和错误分类；上下文与输入接续继续用Pi；并行优化需实测。通俗说，让Agent出错后知道如何继续，让取消时已经做完的事情不会被记错，比换一套执行引擎更符合当前需求。

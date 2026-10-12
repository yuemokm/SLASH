# pi-goal-x 固定发布隔离验证

日期：2026-10-12。需求：F02/F10/F12、PF03/PF08/PF10、QE05/QE12。

本记录确认隔离复用及生产最小接线。pi-goal-x 0.32.3 与当前 Pi 0.86.1 已通过真实 SDK、真实发布扩展和本机协议服务的 8 项隔离检查；这些检查没有请求真实供应商。随后有限真实PRD验收已完成，仍未证明PRD语义或原型设计质量提高，详见末尾链接。完整目标调度仍不能直接启用为 Slash 默认路径。

## 发布与加载

- [Pi 目录](https://pi.dev/packages/pi-goal-x)于本日显示 141.2K/mo，版本 0.32.3。下载口径是目录月下载，非用户数或稳定性证明。
- [固定 npm manifest](https://registry.npmjs.org/pi-goal-x/0.32.3)及 tarball 已获取；验证脚本对下载字节计算 SHA-512，并与 manifest 的 `dist.integrity` 完全比较。发布 LICENSE 为标准 MIT；Pi peer 范围 `>=0.83.0 <2.0.0` 容纳 0.86.1，typebox peer 为 `^1.3.11`，本地已安装 1.3.27。
- 入口为 `extensions/goal.ts`，没有稳定 export-map SDK。真实入口通过 Pi `extensionFactories` 加载成功。原源码 `goalExtension(...,{runCompletionAuditor})` 及 `runGoalCompletionAuditor(...,{createSession})` 是注入接缝。本轮没有修改发布源码。
- 现有 Jiti 加载 `extensions/goal-auditor.ts`成功（2.789 秒），无需升级 Pi。直接使用 tsx 导入整个 goal.ts 曾停滞；native strip-types 加载成功。正式整扩展 Jiti 加载、Electron 生产打包仍未验证。

## 可执行证据

执行 `node scripts/pi-goal-x-validate.mjs` 下载固定包至忽略的 `.test-data/pi-goal-x-validation`，核对版本/许可/完整性后启动独立进程；清除子进程继承的 `PI_GOAL_*` / `PI_SUBAGENT_*` 设置，并给每个用例独立目标与配置目录。仅本机 HTTP SSE 协议服务返回预定回复。

| 用例 | 实际结果 | 限制 |
| --- | --- | --- |
| 无 UI 确认与默认 allowance | 原包函数在 hasUI=false 时自动确认；未配置上限为 undefined（无限），显式0关闭 | 不可映射为 Slash 用户确认 |
| 创建/暂停/恢复 | 原包命令建立并保存目标，暂停与恢复保留 id、objective、activePath；0上限没有模型请求 | 0配置会拒绝实际续跑，不能把命令成功称作已执行工作 |
| 自动续跑 allowance | 原包 maxAutonomousRuns=2，真实调度恰好2次运行/4个请求/2次网关读取，随后落盘 paused | 运行上限不等于模型/工具总预算 |
| 磁盘中断恢复 | 真实SDK重新打开同会话，保存的 claimed 调度状态恢复为 paused；原请求数保持1，不重放 dispatch | 注入状态时显式失效 pool snapshot，非真实杀进程或文件/快照崩溃窗口验收 |
| 完成流程 | 原包 update_goal→独立审查→归档路径执行；2个请求，审查usage回传父任务 | 审查通过仅是预定协议回复，非真实业务通过 |
| 受控 auditor | 只暴露 read_file，读取授权证据；bash被去除，usage=50实际回传 | 未认证完整文档/视觉/来源覆盖 |
| 撤权/未知写入 | 运行前拒绝，模型请求0；未重放外部操作 | 未调用真实外部系统 |
| 取消审查 | 本机真实SSE请求被中止，1请求/0读取/不批准 | 非真实供应商取消实测 |

证据在 `.test-data/pi-goal-x-validation/evidence.json` / `validation.txt`，逐用例请求与原包目标/会话文件保留在专属子目录。首轮自动续跑用例的假服务错误地把原包注入的 user 快照当作新用户轮次，导致重复返回工具调用并超时；修正为预定轮次响应后通过。这是 fixture 错误，不作为上游缺陷结论。原始失败目录保留。

## Slash 安全适配

`main/pi-goal-auditor.ts`复用原包审查函数与 createSession 接缝，继承父 ModelRuntime、模型、工具闭包、截止、停止和活的权限/未知副作用检查；禁用内置read/bash/PowerShell、环境扩展、skills、上下文文件、凭据发现、原包默认工具和审查项目资源。仅11个既有只读工具可以进入审查（包括带父Run归属的read_draft），每次审查另有12调用上限，仍受原Run总预算限制；实际模型usage写入原Run独立累计记录和操作回执；Run现有硬限额是30分钟/120工具，并无硬token或费用上限。审查另限240秒/12工具、传输重试0次，共享原截止和原网关工具计数。

只有真实独立审查会话正常 stop 才接受原包 verdict，随后仍需 Slash 的 acceptCompletion 门禁。取消、截止、撤权、未知外部结果或审查失败不批准；已完成工具的事实回执保留。该模块不注册原包目标命令，不自动启用第二目标调度器。

`node --import tsx --test tests/pi-goal-service.test.ts tests/pi-goal-auditor.test.ts` 10项通过；其中6项真实Service→Runtime→已安装发布auditor的本机协议检查。`tests/pi-goal-review-ui.test.ts tests/task-acceptance.test.ts tests/content-review-service.test.ts` 33项通过；实际React折叠、候选与过期状态保留截图。`npm run check`通过。整个工作区已有其他并行开发，本记录只报告实际运行的定向检查。

## 集成判断

生产路径已接固定包completion auditor，保留Service现有最多2轮为唯一修稿调度者；不加载完整goal扩展或目标命令。仅明确成果任务、当前版本的Markdown/流程成果、原结构检查非failed且无现有内容/视觉审查要求时执行一次。真实可达类别为“写一份项目操作说明”，已用完整Service自动收尾验证。普通聊天、Plan、PRD原文审查和原型视觉审查不触发额外auditor；不宣称新auditor已经自动修稿。

冻结输入复用现有request/artifact/source有界选段、覆盖限制和实际成果身份，并允许主动通过父网关read_draft回读本Run待应用稿。审查若补读资料，仍保持原来源内容审查未验证，不把auditor通过冒充wire4来源语义通过。同一输入缓存避免重复模型请求；缓存也核active Run、权限、未知结果和成果/来源版本。model/provider/thinking与实际会话相符，隔离项目配置，热加载每次验证固定发布名/版本/许可。

审查通过只能保留原状态，不升级业务通过；候选拒绝标needs_human。供应商故障、上限、取消或旧版意见保持未验证，不能触发盲目修稿或外部重放。成果改变及异步acceptCompletion期间变化都使旧意见失效。验收详情新增默认折叠的“目标完成核对”，旧版候选正文隐藏。

生产协议证据：`.test-data/pi-goal-production-20261012/*.json`，UI截图/evidence在其`ui`目录。独立审查：`.test-data/harness-acceptance-20261012/final-review.json`。Pi扩展钩子会吞直接throw，独立反例曾在撤权后请求2次；现钩子保存terminalError并主动abort，会话复验请求1次/已完成读取1次，不能再请求或批准。旧与新证据分别为同目录`provider-guard-counterexample.json`与`provider-guard-fixed.json`，保留原始问题，未将未运行检查写成成功。

固定依赖`pi-goal-x=0.32.3`锁定，Pi仍0.86.1。许可副本`public/licenses/pi-goal-x-0.32.3-MIT.txt`保留2026 Lucas署名。审查receipt是既有JSON报告的可选字段，旧报告/用户数据兼容，无SQLite结构迁移。schemas在`shared/pi-goal-review.ts`；生产接口在`main/agent.ts`的`RuntimeGoalReviewRequest`；宿主触发/缓存/版本守卫在`main/service.ts`，报告投影在`main/task-acceptance.ts`。

真实PRD有限验收已执行，样例ID为 **PRD-DIMENSION-HARNESS-20261012**，不是原型QE12。基线唯一请求跨最终build，2条绑定invalid且原始finding未持久化，语义未验证，不能作公平A/B。候选经`scripts/harness-prd-semantic-candidate.mjs`的完整dist独立快照执行一次：144.261秒、5个正常HTTP终态、10只读工具、原包disapproved。准确识别fixture缺原XLSX证据链，但范围内D5/D6合并格说明漏检；范围外编码历史问题未提及不扣任务失败，unknown建议不能推回原实际PRD。没有证明审稿质量提升。详情及原始审查文本见[真实验收记录](harness-prd-real-acceptance-2026-10-12.md)，准备身份及判据见[冻结记录](harness-prd-semantic-validation-2026-10-12.md)。该PRD不属于默认新增触发路径；完整goal持续调度、Electron打包、真实供应商取消/故障恢复、真实外部系统写入与崩溃窗口均未验收。


通俗解释：已经证明现成包能跑、能停，并可以把它的审查工具管住。已经接入限定成果类型的一小段；它说“完成”仍要经过Slash现有检查，不能自动写错文件或无限跑下去。

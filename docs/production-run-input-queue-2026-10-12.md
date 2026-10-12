# 进行中消息队列（2026-10-12）

需求 `USER-20261012-QUEUE`：任务运行期间补充的文字不能消失；输入框上方显示队列，并支持编辑、取消、立即发出。复用现有 RunInputQueue 与 Pi 公开循环，不新增推理执行器。

## 当前行为

- 默认排队发送（follow_up），宿主持有未派发记录。正常回复结束时通过 Pi 的公开 awaited `turn_end` 扩展，每次交付一条，其余仍可编辑。
- “立即发出”仅将选中项改为 steer，在当前操作结束后送达，不取消原任务，不改变任务模型或模式。
- 单项编辑/取消以 `expectedRevision` 校验。异步准备前后及授权落盘前核对该项版本；编辑或取消不会把旧文字的准备结果提交，也不会取消新版。
- 开始发送后不能编辑或取消。仅真实 native user message 回执把状态置为 delivered，并将原用户文字一次加入会话；关联包装不显示给用户。
- 未知送达状态保留原文、禁止自动重发，可手动带回输入框。原任务结束或重启不重放历史队列。主动取消项移出列表；未发送的权限/准备错误保留恢复入口。
- 队列按会话与 Run 显示。切会话不把旧请求的错误或恢复文字写入新会话；页面刷新从宿主持久记录读取，不重新发送。未保存编辑恰遇送达时仍保留恢复按钮。
- 界面按条横排文字和操作，普通文字显示两行预览，可展开全文。当前任务的模式/权限使用真实 Run 状态，不拿下次任务设置代替。

权限切换使用可信 `runPermissionModeSet`，带 conversationId 和可选 runId；成功返回并刷新后显示生效模式，失败保留旧值。本轮底层电脑权限实现和唯一构建由权限负责者验证。完全访问的文案为“可访问电脑文件，不限项目目录；不会提升 Windows 身份。明确禁止始终优先”。

## 接口与代码

`shared/run-inputs.ts` 定义严格 mutation schema；`main/run-inputs.ts` 执行持久记录、版本核对和边界限额；`main/service.ts` 仅精确接入 mutation、inputBoundary 及真实回执；`main/agent.ts` 复用公开扩展 hook。`shared/types.ts` / `main/main.ts` 接可信 IPC，`src/RunInputQueuePanel.tsx` / `src/App.tsx` / `src/ComposerControls.tsx` / `src/focus-workspace.css` 实现用户入口。

例如：`{type:'runInputMutate',runId,inputId,expectedRevision:0,action:'edit',text:'新的补充'}`。取消/立即发出不允许夹带 text；文字请求不能夹带模型、权限、附件或任务模式。

## 已验证与限制

- `final-queue-native.log`：`tests/run-inputs.test.ts`、`tests/run-inputs-editable.test.ts`、`tests/run-inputs-integration.test.ts` 合计 **28/28**，exit 0，31,295.7866ms。真实 Service/Pi/本机 HTTP 循环验证两条 follow_up 每次一条、指定 steer、编辑/取消竞态、清队列、撤权、重启未知、终态收尾；送达原文在会话中各出现一次。没有真实供应商付费调用。
- `final-renderer-types.log`：实际 `tsc --noEmit` exit 0。
- 实际 App 渲染器 + 真实宿主队列 fixture：`ui-final/result.json` **9 个场景通过**、pageErrors 为空、浏览器关闭。覆盖加入/编辑/单项取消、立即发出、刷新、编辑时送达、失败保留、unknown、权限成功/失败、切会话、长文展开。1440 与 390 截图经父代理目视验收；这是组件到宿主队列验证，**不宣称 Electron IPC 已实测**。
- 历史 `ui/result.json` 的失败保留：harness 在消费既有 steer 前误调用 follow_up 边界，提前提交第二条。仅修测试控制顺序；`ui-attempt2/result.json` 7 场景通过，最终补证另存，不覆盖旧结果。
- 没有全量测试、打包或本代理构建；主进程/agent/preload 改动需重启开发应用。权限负责者负责统一 check/build，历史 1409 全量不作为本次新版本证明。

证据目录：`.test-data/run-input-queue-ui-20261012/`。主要图片：`ui-final/queued-desktop.png`、`queued-mobile.png`、`delivered-during-edit.png`、`unknown-desktop.png`。流程源见 [production-run-input-queue-2026-10-12.mmd](production-run-input-queue-2026-10-12.mmd)。

使用上，补充的话先留在输入框上方；可以改、撤回或提前送给当前任务。系统确认收到后，原文会进入会话，避免看起来“发送后消失”。

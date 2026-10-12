# 输入工具栏与待发送队列

2026-10-13；需求 F02/F03/F10、PF03/PF08/PF09/PF10。

输入底部按用途紧凑分组：附件、模型与可用的思考强度一组，Build/Plan、权限与子 Agent 一组。清除按元素位置及模型控制区自动撑开的间距。发送/停止独占右侧 32px 列，左侧不足时自然换行，不缩小原文字。

子 Agent 正常状态只显示中文名称和开关；读写中及失败仍有反馈，`role=switch`、`aria-checked`、键盘切换、真实配置写入及“新任务生效”语义保留。

运行时 Enter 和“加入队列”固定使用 `follow_up`。立即发出复用队列条目原操作，单条改为 `steer`，不会改变下一条默认方式。原 `RunInputQueuePanel` 移至会话标题下、聊天记录上；按原持久记录顺序显示，保留编辑、取消、长文展开和未发送原文恢复，限高内部滚动。尚未送达的内容不会提前成为已发送聊天消息。

排队仍使用当前 Run 的 Pi 公共 followUp。`main/agent.ts` 的 `turn_end` 仅在 assistant 正常 stop 且没有 toolCall 时进入原 flushAtBoundary；这是当前工具链完成后的同 Run 接续，不是建立新任务调度器，也不是 Run 终态后自动重放。界面据此写为“当前一轮结束后按顺序处理”。原纯文字限制、权限/模式/模型继承、取消和未知结果保护保留。

| 内容 | 代码位置 | 验收 |
| --- | --- | --- |
| 紧凑分组与固定主按钮 | `src/App.tsx` composer-bottom；`src/focus-workspace.css`；`src/composer-select.css` | 1366/680/390 CSS viewport，思考显示与隐藏、Build/Plan、权限、附件、发送/停止可达 |
| 子 Agent 简化 | `src/ComposerSubagentToggle.tsx` | 真实 IPC 读写开关，点击与 Space，配置 enabled 读回 |
| 默认排队与顶部记录 | `src/App.tsx` send / RunInputQueuePanel；`src/RunInputQueuePanel.tsx` | 真实 Pi 流式任务；Enter/按钮排队、编辑/取消/立即单条、下一条及新会话仍 follow_up、停止不重发 |
| 活动队列关窗 | `main/main.ts` emitter / closed；`main/service.ts` dispose；`main/run-inputs.ts` finish | 真实窗口自然退出0、无主进程异常/弹框、持久原文；重复清理与 unknown 不重放单测 |

已通过 `npm run check`、`npm run build`。关联自动回归共 34 项：首批 33 项通过，旧模型菜单 fixture 因旧单配置和旧标签失败，已改为真实列表→编辑入口及实际禁用状态，单项重验通过。队列测试包含真实 Service/Pi、撤权、取消、重启、结果未知不得自动重试；模型菜单覆盖完整列表、搜索和实际档位。

实际桌面验收脚本为 `scripts/composer-toolbar-queue-ui-smoke.mjs`，独立合成 profile、真实编译 Electron/IPC/Pi、本机 loopback 模型，无用户资料及云调用。四组最终通过，结果及截图见 `.test-data/composer-toolbar-queue-8EQOxg/`。初轮默认关闭假设失败保留在 `composer-toolbar-queue-FQUa4T`；第二轮前三组布局/队列/停止全部通过，最后新会话状态断言已完成但重复停止鼠标清理超时，保留 `composer-toolbar-queue-hqKpz5/result.json`。最终脚本去掉重复停止清理，隔离 app.close 负责清理，原停止验收保留；该脚本未监测主进程退出异常，不能替代下述关窗专项。

用户随后提供真实关窗报错：`Object has been destroyed`。根因是窗口 `closed` 后，`Service.dispose → RunInputQueue.finish → save → dispatch` 仍向失效 `webContents` 发消息，多个生命周期回调又重复 dispose。`main/main.ts` 现在仅对存活且未进入关闭期的窗口投递通知；`main/service.ts` 和 `main/run-inputs.ts` 清理幂等。数据库保存与事件记账仍正常执行，没有 catch 整个 save 或静默覆盖失败。

关闭修复再次 check/build 通过，原队列 24 项回归及新增 2 项生命周期测试通过（合计本轮 36 项不重复自动测试）。新增测试证明重复 dispose/Store close 只清一次、已提交无法确认保留 unknown、未提交为 cancelled，持久化故障仍明确抛出。首轮新增夹具 hash 格式错误已修正重验，原失败保留工具输出。

真实关闭脚本 `scripts/window-close-queue-ui-smoke.mjs` 已通过，证据 `.test-data/window-close-queue-OVSCjG/result.json`：真实 Pi 流式任务与未提交 follow_up 关窗后自然 exit code 0、signal null；uncaught/unhandled/error dialog 记录为空，SQLite 原文及 cancelled/RUN_INPUT_RUN_ENDED 保存，模型请求只有 1 次。诊断 hook 若记录异常或弹框会使验收失败，不能作为吞错成功。首轮脚本受 Electron evaluate 不支持动态 import 影响而失败，改用公开 process.getBuiltinModule 后重验，保留 `window-close-queue-al7qQo`。最终 renderer `index-DYv6kOoA.js`，CSS `index-NtMgF4kw.css`。

未新增模型业务质量、外部发布或 SMB 双机验收；未打包。关窗修复涉及主进程，需要关闭开发应用后重新双击根 BAT。

通俗说明：底部按钮按用途放在一起；正在处理任务时，新文字先排队在聊天顶部，能修改或取消，停止按钮始终留在右边。

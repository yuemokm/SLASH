# 聊天工具活动折叠（2026-10-12）

用户要求连续同类工具活动减少逐行占用。当前已在聊天正文位置实现，未改历史消息或主进程：`src/tool-message-groups.ts` 派生分组，`src/App.tsx` 使用原始消息索引渲染，`src/focus-workspace.css` 调整展开详情。

读取与检索、检查与核对分别默认折叠为中文类别和数量。展开可逐项查看原调用参数。用户/助手正文、不同任务、历史任务锚点及外部操作回执阻断合并；助手输出定位与消息菜单继续使用原索引。审批卡片仍在原位置独立显示。工具调用文本没有结果状态，不推断成功；只有可信关联任务显示任务执行中、待确认或关联任务失败等状态。

Renderer 类型检查退出 0，小范围测试 11/11（包含原任务锚点及输出定位回归）。实际 App/Vite 浏览器交互夹具 attempt2 五场景通过、pageErrors=[]、浏览器/服务已关闭：默认五项一行、展开原详情、390 宽度、待确认审批独立可见、关联任务失败显示。证据位于 `.test-data/chat-tool-grouping-20261012/checks.json`、`targeted.log` 和 `attempt2/result.json`；截图包括 `collapsed-desktop.png`、`expanded-desktop.png`、`collapsed-mobile.png`、`pending-approval-desktop.png`、`failed-task-desktop.png`（均在 attempt2）。父代理实际查看桌面折叠/展开图，确认视觉范围。

验证使用合成状态和真实 App 渲染/点击，`realElectronIPC:false`、模型调用 0；不代表真实模型或发布验收。首轮缺 headless shell 启动失败及状态夹具返回同引用导致刷新失败保留，随后复用本机 Edge、将夹具状态改为独立快照后通过。未运行全量、构建、打包或提交。

流程源：[production-chat-tool-grouping-2026-10-12.mmd](production-chat-tool-grouping-2026-10-12.mmd)。G2 有界补验候选继续在隔离目录开发，本 UI 通过不代表 G2 完成。

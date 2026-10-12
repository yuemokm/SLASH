# 会话轮次归属与紧凑布局

对应 F02/F10/F12/F19、PF03/PF08。2026-10-09 用户要求：正文优先，运行说明收起，旧成果不反复出现在最新回复下；保留审批、错误、重试、补充输入和版本。

## 根因与实现

- `src/App.tsx` 原先把当前会话所有 Run 的 Change 放在整个消息列表之后，导致旧“作战中心.html”始终尾随最新任务；没有证据表明每次都创建了新版本。现按 `change.runId` 放在所属 Run 最后一条助手回复下，活动 Run 放在当前流式回复下。相同 Run 的已存部分回复不会重复挂卡；后续相同文件的新 Change 仍显示。无助手消息的 Run 若有成果，也保留按任务开始时间定位的紧凑入口。不删除、迁移或改写历史数据。
- 输入框上方的 `RunRuntimeStatus` 撤去，原组件仅在对应回复“生成与执行→执行记录”内呈现；真实补充记录、原轮次配置与清除待送达功能保留。流式 footer 不再重复输出普通“正在生成”。授权、失败/可继续及等待重试保留短提示，实际审批仍在独立可操作卡中。
- 生成期间主操作仅“停止任务”，补充通过次要文字“加入补充”或 Enter 发送，继续使用原 `runInputEnqueue` 和冻结的模式/权限/模型。停止中禁用重复取消；终结后恢复发送。
- 标题与次要状态同一行，标题栏至少52px；默认输入72px，随内容自动增长至200px（受窗口高度约束），长内容可滚动。执行卡降低边框/背景强调，成果卡压缩间距；预览工具栏可换行，保留原展开/关闭行为。

代码：`src/App.tsx`、`src/MessageFooter.tsx`、`src/ReplyDetails.tsx`、`src/run-output-placement.ts`、`src/run-history-anchors.ts`、`src/focus-workspace.css`。

## 验证

- `npm run check`、`npm run build` 通过；现有大包体积提示仍保留。未执行 electron-builder 或制作便携版。
- `npx tsx --test tests/run-output-placement.test.ts tests/run-history-anchors.test.ts tests/run-runtime-status.test.ts tests/run-operation-view.test.ts tests/message-receipt.test.ts`：14/14通过。覆盖最后回复归属、活动部分回复去重、无正文成果入口、历史时间定位、退出恢复、授权/停止优先级和实际时间事实。
- `scripts/chat-round-ui-smoke.mjs` 使用本轮独立 Electron host、合成 pm bridge 和隔离 profile；不会进入生产 Service 或发送模型请求。覆盖旧成果位置、补充输入/记录/清除、停止、审批、失败继续、新同名成果、1100px预览与560px菜单溢出。最终完整9/9通过：`.test-data/chat-round-ui-1791480398527/result.json`。最后成果动作整组换行微调后，`--layout-only` 局部5/5通过：`.test-data/chat-round-ui-1791480491018/result.json`；最终截图同目录 `running-compact.png`、`execution-expanded.png`、`preview-narrow-chat.png`、`mobile-preview-expanded.png`，已目视检查。最后renderer `index-PgP0ks7T.js`。
- 首轮验证失败证据保留：`.test-data/chat-round-ui-1791480130702`（错误的 Electron 导入）及 `1791480173973`（ESM host 未创建窗口）；改 CommonJS host 后正常。`1791480220938` 揭示两行标题撑高，产品已改为单行。`1791480266313` 的合成桥返回同一对象导致状态未刷新，改为克隆；`1791480313244` 的合成取消缺少状态广播，已补广播并采用订阅者 Set。均未改生产刷新或取消机制来迁就夹具。

边界：本轮验证编译后的渲染与入口连接，不认证真实云模型、审批网关、文件写入或取消执行。用户原应用进程与数据保留；前端热更新可看修改，未要求停止用户应用。

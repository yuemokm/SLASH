# 聊天执行步骤与工作记录入口

2026-10-13，F02/F10、PF03/PF08/PF09。按用户最新取舍，把回复底部的“生成与执行”“工作记录与项目历史”两个入口重新组织。

## 行为与归属

- 本次任务的运行状态直接显示在回复前的紧凑步骤卡。运行、排队、重试、停止、失败及方案确认显示实际宿主状态；终态优先于旧的工具/重试字段。详细执行记录、来源、技能、检查点及原任务计划在卡内按需展开。
- 同一个 Run 的多条助手消息只有末条回复显示步骤卡；正在流式生成的 Run 在当前输出区域显示一次。正在运行的任务优先于排队任务，排队任务保留自己的卡和原输入位置。无正文的方案、失败、取消、排队记录继续可访问。
- 普通已完成短回复不显示空卡。每个 Build 自动生成的通用 heuristic 计划不会单独触发卡片，也不当作已完成的步骤。工具消息沿用原有折叠分组，摘要不重复列工具。
- 方案选项、方案批注、恢复核对、继续/重试、授权审批、停止、草稿应用与质量检查复用原请求和权限保护。复制、时间及质量检查仍在回复底部。
- “工作记录”在会话顶部出现一次，说明它包含需求、检查问题与决策。复用 `WorkIssues` 的当前工作/项目历史切换、包含已处理、来源、处理记录、记录待确认等能力；折叠保留未提交表单，切换会话重置范围。成果页原入口保留。

这是 UI 组织调整，没有新增或替换通用 Agent 能力、依赖、schema 或数据库迁移；没有删除已有记录、后端或资料。

## 官方参考与判断边界

查询日期：2026-10-13。参考公开开源 harness 的呈现方式，未使用或推断 Codex 桌面私有实现：

- [Codex CLI 执行单元渲染](https://github.com/openai/codex/blob/main/codex-rs/tui/src/exec_cell/render.rs)：`Exploring/Explored` 和运行状态把实际工具活动汇集为紧凑的执行单元。
- [OpenCode 工具渲染](https://github.com/anomalyco/opencode/blob/dev/packages/session-ui/src/tools/tool-renderer.tsx)：`CurrentContextToolGroup` 汇总实际 pending/running 状态，使用可折叠工具组，并保留错误显示。
- [OpenCode 会话列表](https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/component/dialog-session-list.tsx)：会话导航作为独立的列表入口。仅借鉴“本轮运行与较大范围记录分层”的原则；其会话列表并不等同于 Slash 的业务工作记录。

因此采用“实际状态直接可见、明细折叠、项目记录集中入口”的最小实现，沿用 Pi 与现有网关。

## 代码及验收

| 位置 | 内容 | 验收 |
| --- | --- | --- |
| `src/App.tsx` | 运行卡、单 Run 放置、活跃/排队选择及顶部记录入口 | 隔离 Electron 任务流程与截图 |
| `src/ReplyDetails.tsx`、`src/reply-details.css` | 回复操作减重、运行区与历史面板布局 | 短回复、失败、方案、桌面/窄窗 |
| `src/run-execution-summary.ts` | 实际状态摘要和空卡过滤 | `tests/run-execution-summary.test.ts` |
| `src/run-history-anchors.ts` | 无正文排队/取消记录的位置 | `tests/run-history-anchors.test.ts` |
| `scripts/chat-execution-cards-ui-smoke.mjs` | 编译版 Electron 的隔离 UI 证据 | 所有测试资料和 profile 在 `.test-data/` |

`npm run check`、`npm run build` 通过；执行摘要、历史位置、成果归属、工具分组四个定向文件共 16/16 通过。构建仍有原有大 chunk 警告，无构建失败。

隔离 Electron 使用合成桥接数据验证 UI 归属和操作请求，不能据此宣称实际云模型、真实网关恢复、取消工具副作用或外部交付已联调。初次脚本失败分别为夹具闭包变量、隐藏内容严格定位、通知遮挡测试关闭键；修正夹具并通过正常顶部开关/关闭提示操作验证。未操作用户会话、资料或真实配置，未打包。

隔离 UI 10/10 组通过、页面异常 0；覆盖短回复、多回复与工具折叠、活跃/排队归属、按需检查点、重试、审批、当前/项目记录与表单保留、失败恢复、无正文方案、取消及 680/390 CSS 视口。完整证据：`.test-data/chat-execution-cards-ui-1791887185986/result.json`；同目录包含 `idle-short-reply.png`、`running-and-queued.png`、`failure-recovery.png`、`plan-confirmation.png`、`project-work-records.png`、`cancelled-step.png`、`narrow-680.png`、`narrow-390.png`。主代理已审前一轮同版本的桌面五种关键状态，窄窗截图待主代理复核。

通俗解释：任务做到了哪一步直接看聊天里的小卡；想查整个项目以前确认过什么，点顶部“工作记录”。旧记录仍在，只减少重复入口。

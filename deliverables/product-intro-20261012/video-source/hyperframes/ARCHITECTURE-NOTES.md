# Slash 架构段：30 秒模块协同

这是工程逻辑图，不是产品界面截图。主图节点止于 y878；步骤说明止于 y934；y940–1040 留给主视频字幕。配音、Pi SDK 前置说明与全片由另一制作入口管理，本目录只输出静音 architecture.mp4。

## 叙事顺序

0–3 秒：桌面会话经 IPC 进入 Service。
3–7 秒：装配资料、规则与 Skills，交给 Pi AgentSession。
7–11 秒：模型 API 与受控只读子 Agent；子 Agent 当前为独立 Pi 会话，继承权限，只做研究与检查。
11–16 秒：工具网关检查模式、权限和参数，连接 MCP、官方 CLI 与 Windows SMB。
16–23 秒：修改形成草稿，走版本、检查与受控预览，检查反馈回到任务；保存需按权限与成果流程确认。
23–30 秒：任务状态、会话历史、项目文件分别保存；IPC 把进度和结果送回桌面。

## 来源与边界

- 当前同进程模块依据 `docs/architecture-current.md`、`docs/architecture-current-system.mmd`；`main/service.ts` 与 `main/agent.ts` 的 Pi Session 初始化。图不宣称主 Agent 独立沙箱或微服务。
- 子 Agent 依据 `main/pi-subagents.ts`：`createDefaultChildSessionFactory` 通过 `pi.createAgentSession` 建独立会话，内存 SessionManager，只读工具列表，授权 guard；旧 10-07 文档的单工具状态不覆盖新源码。
- 文件、草稿与版本依据 `main/files.ts` 与 Service 的 ChangeSet/来源当前性/审批调用；图省略实现参数，不表示所有复杂任务已稳定完成。
- 本地运行状态是 SQLite，Pi 有会话历史，文件有本地快照；模型请求仍使用外部 API，本地优先不等于全离线。
- Pi 官方：https://pi.dev/ 。OpenClaw 早期采用 Pi 的固定历史来源：https://github.com/openclaw/openclaw/blob/4f297a094aeb24ca3e37abc84134d84e5868c069/docs/pi.md 。当前 OpenClaw 说明：https://docs.openclaw.ai/pi 。图只用历史表述。
- 共享说明只代表现有 Windows SMB 接口，不声称双机已验或实时协同。
- 无云知识库、向量或旧 403 模块。原 HTML 保存到 `.source-archive`，PPT 暂缓。

## 技术交付

本地 HyperFrames 0.8.148，GSAP 单一暂停时间线、绝对时间 seek；有序出现、节点不出画面由 `index.motion.json` 声明。所有箭头是可编辑 SVG path。关闭遥测，不发布云端；一个渲染 worker。只写本目录和另入口的 `public/architecture.mp4`。

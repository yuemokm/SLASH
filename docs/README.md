# slash 架构设计文档

版本：v0.1 · 2026-09-21

面向个人使用的 B 端产品经理桌面 Agent，覆盖资料管理、需求与调研、方案、HTML 交互原型、PRD、评审修改、知识沉淀和多渠道交付。

## 阅读顺序

最新修改能力见 [Pi 原生增量草稿](draft-edit-2026-10-05.md)：局部修改复用 Pi 编辑器，读回最新草稿与宿主哈希，连续修改复用待应用卡，提交仍走版本和权限检查。真实业务修订进展见 [PM 修改闭环](pm-revision-loop-2026-10-05.md)，比赛 PPT 与演示视频要求见 [比赛准备](competition-readiness.md)。

最新原型改进见 [原型验收：设计与验收记录](prototype-acceptance-2026-10-05.md)：在既有 HTML 预览中执行有限交互用例、保存版本绑定结果及截图，失败可带回会话修改。用户必检范围需明确确认；文档记录真实模型页面的通过项与仍缺失的失败路径，不能将执行器测试通过等同于业务全部通过。

最新 0.3.9 来源改进见 [原始资料与提取文本的版本核对](source-freshness-2026-10-05.md)：登记输出关联原件、副本与输出版本，原件变化能提示复核，交付预检采用同一结果。比赛场景及真实模型待验收项见 [演示与业务验收准备](competition-readiness.md)。

最新业务规则改进见 [业务规则与成果落实核对](pm-business-trace-2026-10-05.md)：在既有需求中保存独立字段维度、来源原文与成果位置，核对版本变化并保留替代历史。已交付 0.3.8 便携版，通过全量 250 项及打包桌面 41 项检查；真实云模型业务质量仍待验证。

最新资料改进见 [PM 资料读取与证据检索](pm-evidence-foundation-2026-10-05.md)：登记副本的 Word/Excel 提取、检索覆盖与来源位置；已包含在 0.3.8 便携包，实际证据见文末记录。

最新上下文职责修订见 [Pi 原生上下文与模型能力配置](pi-native-context-2026-10-05.md)：撤去 Slash 重复调度，由 Pi 统一管理压缩和恢复，模型限额按来源解析并允许手动覆盖；原件保护与本次任务状态适配继续保留。

最新运行与文件保护修订见 [参考原件保护与输出截断恢复](reference-protection-and-run-recovery-2026-10-04.md)：参考资料只读、带后缀的处理副本、受控转换、上下文预算与截断恢复。实际验收状态以该记录为准。

最新通用命名修订见 [统一 AGENTS.md 项目上下文](agents-document-standard-2026-10-04.md)：单文件承载人工说明和自动资料索引，兼容旧 agent.md 迁移，优先于下方旧文件名说明。

最新目录调整见 [资源三分类与空项目初始化](resource-layout-2026-10-04.md)：默认资源为 skills、模板、参考资料，不再生成示例文件；项目根目录统一生成一个 AGENTS.md 承载规则与资料索引。此项结合后续通用命名修订，覆盖下方 0.3.3 的默认目录说明。

最新项目目录、系统提示词及会话改进见 [项目资源、回复与 Agent 指令](project-resources-agent-design-2026-10-04.md)：分离模式与权限、回复时间与复制、目录树设置及 agent.md 自动索引。完成状态以该文验收记录为准。

此前设置清理见 [设置整理与有效性检查](settings-review-2026-10-04.md)：移除静态说明与任务记录页、配置作用范围和真实模型分工。0.3.3 新增独立系统提示词页后为八个分类，以最新项目资源文档为准。

最新项目与输入区改进见 [项目菜单与会话输入区](project-composer-design-2026-10-04.md)：项目管理、按需快捷动作、轻量菜单与思考能力分档。完成状态以该文验收记录为准。

最新界面见 [0.3.0 可交付界面设计与验收](delivery-ui-design-2026-10-04.md)，实施状态以文内记录为准；[独立 UI 审计](delivery-ui-audit-20261004.md)记录 0.2.1 起点与 0.3.0 最终视觉复核。此前 [0.2.1 前端层级重设计](ui-focus-redesign-2026-10-04.md) 保留为历史基线。最新设计优先于历史文档中的具体视觉布局描述；不改变已有业务与权限边界。

开发 AI 先读 [当前个人版范围与验收](pm-focus-delivery-plan.md)、[产品与交互规格](product-spec.md) 和 [开发交付规范](development-handoff.md)，再读以下架构资料。最新用户决定：依据真实 PM 需求减少独立管理入口、增加可追溯的会话工作流；会话统一编辑、目录承载内容、跨已授权目录查询；设计包为可选逻辑集合。F01—F19 为历史能力索引，不再意味着必须保留每个独立页面。

1. [应用架构与系统架构](architecture.md)：先理解功能、系统边界、数据模型和交付路径。
2. [架构基线与协同规范](architecture-baseline.md)：技术架构、Agent 执行架构、数据关系、接口、状态机及验收要求。
3. [网络盘共享设计](sharing-network-drive.md)：同事粘贴邀请后映射 Windows 盘符，包含账号、权限、冲突与断线处理。
4. [独立 Mermaid 图](diagrams/)：用于评审、编辑和嵌入其他文档。
5. [第一阶段 Agent 运行能力](phase1-runtime.md)：Run 阶段、任务计划、权限等待和恢复边界。

## 架构图索引

| 图 | Mermaid 源文件 | 说明 |
| --- | --- | --- |
| 应用架构 | [01-application.mmd](diagrams/01-application.mmd) | 七项业务能力、设计包、资源和交付 |
| 系统架构 | [02-system.mmd](diagrams/02-system.mmd) | 桌面进程、业务服务、Agent、工具、存储与外部系统 |
| 技术架构 | [03-technology.mmd](diagrams/03-technology.mmd) | Electron、React、TypeScript、Pi、SQLite 与运行边界 |
| Agent 执行架构 | [04-agent-runtime.mmd](diagrams/04-agent-runtime.mmd) | 上下文、推理、工具执行、校验与版本提交 |
| 数据关系 | [05-data-model.mmd](diagrams/05-data-model.mmd) | 设计包、成果版本、任务、操作与交付关系 |
| 发布协同时序 | [06-publish-sequence.mmd](diagrams/06-publish-sequence.mmd) | 正常发布、超时与结果核对 |
| 网络盘共享 | [07-network-drive.mmd](diagrams/07-network-drive.mmd) | SMB 共享、当前用户映射、资源管理器访问 |
| 设置与工具协同 | [08-settings-capabilities.mmd](diagrams/08-settings-capabilities.mmd) | 分类设置、统一连接、权限确认和受控执行 |
| Pi 原生上下文职责 | [pi-native-context.mmd](diagrams/pi-native-context.mmd) | 模型能力来源、Pi 压缩恢复、Slash 状态与文件保护 |

两份正文均内嵌 Mermaid 代码块。支持 Mermaid 的 Markdown 阅读器可直接渲染；独立 .mmd 文件方便后续导入绘图工具。图形内容包含项目架构，不应未经选择就提交给外部在线编辑器。

## 当前基线

当前工程实现另见 [可运行实现架构](implementation-architecture.md)、[实现与验证记录](implementation-status.md) 和 [功能覆盖事实表](feature-coverage.md)。这些记录与下面的目标基线分开维护。

用户四张测试截图对应的本轮修订见 [设置与 Agent 能力修订](settings-capabilities-revision.md)，重点是工具真实可用、配置可理解、会话与设置保持同步。

- 本地优先、模块化单体，会话统一编辑，目录组织文件，设计包可选关联成果。
- Windows 优先，Electron + React + TypeScript 为技术方向。
- Pi SDK 承担会话与 Agent 循环，slash 管理业务流程和交付。
- 工具统一经过网关，正式成果通过变更集与版本提交管理。
- 文件持有业务内容，SQLite 持有运行状态，各设备独立存储。
- 官方 CLI 和 MCP 通过适配器接入；HTML 构建包与版本绑定。

共享首版采用 Windows SMB + 网络驱动器映射，连接后在“此电脑”显示盘符。

这些文件是开发前的设计产物，不代表应用已实现或技术验证已完成。具体依赖版本、Windows 共享环境兼容性、中文检索和依赖分发方案保留验证门槛，见架构基线。

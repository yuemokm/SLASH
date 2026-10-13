# Slash 当前架构图

日期：2026-10-09。性质：当前启用功能的实现快照。当前形态为**本地优先的模块化桌面应用**。云知识库已从产品移除，向量构建与查询入口停用；历史网页源码、远端部署及数据仍保留，未执行删库或下线。详见 [功能收减](knowledge-retirement-2026-10-09.md)。

| 图 | 回答的问题 | 阅读重点 |
| --- | --- | --- |
| 应用架构 | 产品有哪些功能，如何一起完成 PM 工作？ | 会话统一编辑，资源提供依据，成果承接交付 |
| 系统架构 | 哪些程序运行在哪里，数据如何流动？ | 进程边界、本机与云端、身份和权限 |
| 技术架构 | 各部分用了什么技术？ | Electron / React / Pi / SQLite |

## 1. 应用架构

```mermaid
flowchart TB
  PM["产品经理"] --> Shell["Slash 桌面工作台"]
  Shell --> Chat["会话与项目<br/>Plan / Build · 模型选择 · 权限"]
  Shell --> Resource["资源<br/>Skills · 模板 · 参考资料<br/>按项目浏览 / 全局聚合"]
  Shell --> Result["成果<br/>预览 · 版本 · 差异 · 导出"]
  Shell --> Cases["测试用例独立入口<br/>当前项目 · 文件 / 草稿 · 创建"]
  Cases -->|"阅读 / 导出"| Result
  Cases -->|"选择资料后创建"| Chat
  Shell --> Settings["设置与连接<br/>模型 · 系统提示词 · 项目结构<br/>全局技能 · MCP / CLI · 共享文件夹"]
  Resource -->|"引用已授权资料"| Chat
  Chat --> Work["任务处理<br/>调研 · PRD · HTML 原型 · 流程图<br/>评审修改 · 测试用例"]
  Work --> Draft["草稿 / 变更集"]
  Draft --> Check["质量检查与人工确认<br/>规则 · 来源 · 交互 · 交付条件"]
  Check -->|"保存到项目"| Result
  Check -->|"问题反馈"| Chat
  Result --> Delivery["交付<br/>本地文件 / 外部连接发布"]
  Resource --> Collections["资料集合<br/>保存资料清单 · 只读查看有效历史索引"]
  Resource --> Search["已有资料检索<br/>授权目录 · 原文关键词 · 表格读取"]
  Search --> Chat
  Memory["项目知识与候选记忆<br/>规则 / 事实 / 来源分层"] --> Chat
  Work --> Memory
```

评审、决策和业务规则是已有工作流中的能力，不表示侧栏新增独立中心。资源与成果有全局入口，也有项目范围入口；知识库集合属于资源能力。模型给出草稿，保存、权限、版本和交付结果由宿主服务检查，不能由模型自行宣布通过。

## 2. 系统架构

```mermaid
flowchart TB
  subgraph Local["用户电脑 · Slash"]
    UI["Electron 渲染进程<br/>React 工作台"]
    Bridge["Preload 白名单 IPC<br/>请求 Schema / 流式事件"]
    subgraph Main["Electron 主进程 · 当前同进程模块"]
      Service["应用服务 Service<br/>项目 · 会话 · Run · 恢复 · 领域协调"]
      Agent["Pi AgentSession<br/>模型循环 · Skills · 原生上下文压缩"]
      Gate["能力与执行保护<br/>模式 · 审批 · 目录范围 · 取消"]
      Domain["领域模块<br/>资源 / 草稿 / 版本 / 质量 / 交付<br/>资料集合 / 既有原文检索"]
      Adapters["集成适配<br/>MCP · CLI · SMB · Pi 扩展"]
    end
    Workers["按需子进程 / 辅助服务<br/>命令执行 · 解析 / 检查<br/>部分 Pi 包工作进程"]
    Preview["受控原型预览<br/>不赋予原型业务 IPC 权限"]
    Disk[("本机持久化<br/>SQLite · 项目文件 · 快照<br/>Pi 会话 · 项目候选记忆")]
    Secret[("系统安全存储<br/>Electron safeStorage")]
    UI <-->|"受控请求 / 事件"| Bridge
    Bridge <--> Service
    Service <--> Agent
    Agent -->|"工具请求"| Gate
    Service --> Domain
    Gate --> Domain
    Gate --> Adapters
    Domain --> Disk
    Agent --> Disk
    Service --> Secret
    Adapters --> Workers
    UI --> Preview
  end
  Agent <-->|"选定上下文"| Models["模型提供方 API"]
  Adapters <--> External["外部系统<br/>MCP 服务 / 官方 CLI<br/>网页搜索 / SMB 网络盘"]
```

- **当前主 Agent 和 Service 运行在 Electron 主进程内**，并非独立后台服务器，也不是所有工具都在独立进程中。部分 Pi 包、命令、解析及检查使用工作进程或辅助服务。
- 图中的“能力与执行保护”是现有 capability broker、授权读取、路径核对和具体执行检查的合并表示，不是一项独立部署服务。会话工具经能力控制；界面直接发起的管理动作经 IPC Schema、领域授权和显式确认。
- 主会话的持久化与上下文压缩继续复用 Pi。受控子 Agent 继承父任务权限，不自动获得写入或发布能力。
- 原始参考资料保持只读；需要转换时操作处理副本。草稿、变更集和版本快照独立于原件。
- 云知识库与向量服务没有桌面初始化或可用 IPC 入口；历史回执、加密凭据和索引保留。普通模型连接、官方 MCP、CLI 与 SMB 保持独立。

## 3. 技术架构

```mermaid
flowchart TB
  subgraph Desktop["桌面技术栈"]
    View["React 19 · TypeScript<br/>Vite 8 · Markdown / GFM"]
    Electron["Electron 44<br/>contextIsolation · sandbox<br/>Node integration 关闭"]
    App["Node.js / TypeScript 应用层<br/>Zod 契约 · Service / 领域模块"]
    Pi["Pi SDK 0.86.1<br/>AgentSession · SessionManager<br/>DefaultResourceLoader · 原生压缩"]
    Packages["已接入 Pi 生态适配<br/>web-access · mcp-adapter · subagents<br/>lens · Plannotator · memory<br/>Langfuse 默认关闭"]
    Storage["node:sqlite + 文件系统<br/>版本快照 / 会话数据<br/>safeStorage 加密凭据"]
    Tools["工具实现<br/>MCP SDK · HTTP / stdio · OAuth<br/>PowerShell / CLI · Windows SMB<br/>docx / mammoth / ExcelJS / PDF<br/>Playwright 交互检查"]
    View --> Electron --> App
    App --> Pi
    Pi --> Packages
    App --> Storage
    App --> Tools
  end
  Verify["验证工具链<br/>TypeScript · node:test / tsx<br/>Electron / Playwright"]
  Verify -.-> Desktop
```

桌面图中只标注关键依赖版本，完整声明以根目录 package.json 和锁文件为准。2026-10-13 已将 knowledge-web/ 及退役云发布实现完整迁入忽略的本地 `过程文件/历史模块/knowledge-web/`，当前源码、检查、构建与启动不再依赖该工程；资料集合与旧数据兼容仍由现有本机模块承担。见[退役源码清理](knowledge-source-cleanup-2026-10-13.md)。

## 4. 当前状态与边界

| 能力 | 当前状态 |
| --- | --- |
| 桌面会话、资源、成果、设置及受控执行 | 已实现；具体质量以对应功能验收为准 |
| Pi 原生会话、上下文及七项生态适配 | 已接入；不替换成 billion-context，Langfuse 默认关闭 |
| Skills / 模板 / 参考资料与全局技能 | 已实现；目录授权、来源及原件保护继续有效 |
| 资源内资料集合与有效历史索引查看 | 保留；不要求向量服务配置 |
| 云知识库发布与独立问答 | 已移出产品范围；远端部署和历史数据未删除 |
| 专用向量构建、查询、配置与导出 | 产品入口及 IPC 已停用；已有普通资料检索继续使用 |
| 团队在线协作、跨设备同步、插件市场 | 不属于当前完成范围；SMB 分享不等于在线协同编辑 |

代码存在不代表全部场景已认证；当前架构也不代表所有主进程能力已完成进程隔离。

## 5. 主要代码对应

| 架构部分 | 主要文件 |
| --- | --- |
| 桌面 UI / 项目导航 | src/App.tsx、src/Sidebar.tsx、src/ProjectResourcesBrowser.tsx |
| IPC 与桌面宿主 | main/main.ts、main/preload.cts、shared/types.ts |
| 本地应用服务与能力控制 | main/service.ts、main/capabilities.ts、main/authorized-read.ts |
| Pi 执行与工具适配 | main/agent.ts、main/tool-catalog.ts、main/pi-*.ts |
| 本机状态与资料 | main/store.ts、main/files.ts、main/artifacts.ts、main/draft-edit.ts |
| 质量与交付 | main/delivery-gate.ts、main/content-review.ts、main/prototype-acceptance.ts |
| 资料集合与历史读取 | main/knowledge-base.ts、src/KnowledgeCollections.tsx |
| 已有原文检索 | main/files.ts、main/evidence-search.ts |

以下为退役前历史证据，不再作为待完成项目： [云知识库验收](knowledge-cloud-deployment-2026-10-08.md)；桌面发布验收见 [桌面发布说明](knowledge-cloud-desktop-2026-10-08.md)。

独立 Mermaid 源文件：
- [应用架构](architecture-current-application.mmd)
- [系统架构](architecture-current-system.mmd)
- [技术架构](architecture-current-technical.mmd)

早期 docs/architecture.md 保留为历史设计提案；当前实现以本文及最新交付记录为准。

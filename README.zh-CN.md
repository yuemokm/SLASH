# Slash

[English](README.md) | **简体中文**

面向产品经理的本地桌面 AI 工作台。通过会话，结合调研资料和已有成果，创建与修改交互式 HTML 原型、产品需求文档（PRD）及交付材料。

使用 Electron、React、TypeScript 和 Pi Agent Runtime 构建。当前包版本为 **0.3.12**，开发和桌面使用面向 **Windows**，其他平台尚未验证。

## 主要能力

- 跨已授权目录检索资料，在会话中引用来源。
- 创建与修改 HTML 原型、PRD、Markdown 文档及流程图。
- 预览成果、审阅草稿，通过版本和冲突检查后保存修改。
- 提取支持的 Word、Excel 和文本型 PDF 内容，保留来源与读取范围信息。
- 通过 MCP 和受支持的文档 CLI 连接外部工具，通过 Windows SMB 共享目录。

成果编辑从会话发起；资源与成果视图用于浏览、预览、引用和定位。云模型及外部服务需要自行配置。

## 快速开始

### 环境要求

- Windows
- Node.js 24 和 npm
- Git，用于克隆仓库
- 执行 AI 任务所需的模型接口和 API 密钥

```powershell
git clone https://github.com/yuemokm/SLASH.git
cd SLASH
npm ci
npm run dev
```

安装依赖后，也可以双击根目录的 [`双击启动开发环境.bat`](双击启动开发环境.bat)。

开发命令会编译 Electron 主进程和 preload，启动 Vite，再打开桌面应用。界面代码修改通常会自动刷新；主进程或 preload 修改后需要重启开发应用。

### 首次使用

1. 在设置中选择工作空间，创建或打开项目。
2. 配置模型接口地址、准确的模型 ID 和 API 密钥，测试连接。
3. 添加参考资料，或授权其他资料目录。
4. 在会话中描述任务，检查生成的草稿，再保存到项目。
5. 预览成果，将需要调整的文件引用回会话继续修改。

参考资料原件受保护，处理时使用独立副本。模型密钥在本机按当前 Windows 用户加密保存，默认应用数据目录为 `%APPDATA%\slash`。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm ci` | 按锁文件安装依赖 |
| `npm run dev` | 启动桌面开发环境 |
| `npm run dev:renderer` | 仅启动 Vite，不提供 Electron 桌面能力 |
| `npm run check` | 检查界面与主进程 TypeScript 类型 |
| `npm test` | 运行自动化测试 |
| `npm run build` | 构建界面并编译主进程 |
| `npm run start` | 构建后从本地生产文件启动 Electron |
| `npm run pack` | 制作 Windows 便携包，输出到 `release/` |

打包是单独操作，日常开发不必执行。真实模型检查会消耗 API 配额；本地确定性测试通过，不代表云模型质量或外部服务兼容性已验证。

## 仓库结构

```text
main/          Electron 宿主、Agent 运行时、存储与工具网关
shared/        共享契约与类型
src/           React 界面
public/        随应用分发的静态资源
scripts/       开发、验证与维护脚本
tests/         自动化测试
docs/          规格、架构与验收记录
exa-results/   产品决策调研资料
过程文件/      本地过程记录、材料和历史模块归档（不进入仓库）
```

界面不直接访问文件、SQL 或 Shell；Agent 工具经过宿主网关。多资源修改使用版本检查和资源锁，不能静默覆盖冲突文件。

## 外部集成与当前限制

- **模型：** 配置受支持的供应商或兼容接口；可用能力取决于具体模型和供应商。
- **文档：** 飞书、钉钉集成需要对应 CLI 和账号配置；依赖发布流程前，应查阅对应验收记录。
- **MCP：** 配置服务后先检查工具能力。外部写入超时可能意味着结果未知，应核对目标后再决定是否重试。
- **共享：** Windows SMB 需要相应权限和凭据。双机访问、普通用户资源管理器盘符可见性、重启恢复和权限撤销仍需真实设备验收。
- **解析：** 文本型 PDF 提取不包含扫描件 OCR；Word 导出和 draw.io 预览支持有限格式。
- **原型：** HTML 导出保留项目文件及相对依赖，不会自动构建任意框架；交互检查不代表后端或全部业务规则已经验证。

## 项目文档

- [文档索引](docs/README.md)
- [当前范围与验收计划](docs/pm-focus-delivery-plan.md)
- [产品规格](docs/product-spec.md)
- [开发交接与验收记录](docs/development-handoff.md)
- [架构基线](docs/architecture-baseline.md)
- [SMB 共享设计与验收](docs/sharing-network-drive.md)
- [详细使用说明与历史 README](docs/usage-and-history.zh-CN.md)

修改项目之前请阅读 [`AGENTS.md`](AGENTS.md)。产品行为变化需同步文档和流程图；交付时分别说明已通过检查、失败项及未验证集成。

## 仓库文件管理

[`.gitignore`](.gitignore) 排除依赖、构建产物、测试数据、本地备份、环境文件和生成的演示缓存。不要将密钥或个人工作空间数据加入版本管理；修改依赖时一并提交 `package-lock.json`。

本地演示材料、历史成果、界面参考、备份及散落测试证据统一放在 `过程文件/`，不随仓库克隆提供。新的发布与交付测试记录直接写入 `过程文件/测试记录/`；已有 `.test-data/` 输入保留原路径。工程文档、研发调研、开发脚本、测试和历史兼容源码继续跟踪。手动 SFA 复验使用归档后的本地材料，日常开发和自动化测试不依赖演示媒体。当前目录见[过程文件整理记录](docs/workspace-organization-2026-10-13.md)，Git 跟踪历史见[仓库清理记录](docs/repository-hygiene-2026-10-12.md)。

本项目尚未添加项目许可证。第三方组件和素材仍遵循各自许可证。

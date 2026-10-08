# 可交付界面实现记录（2026-10-04）

版本 0.3.0。实现范围 F01/F02/F03/F04/F05/F14/F15/F17/F18/F19 的既有界面；产品与权限语义沿用当前实现。设计依据 docs/delivery-ui-design-2026-10-04.md。

- 本地完整 Noto Sans SC variable 字体以 Slash Sans 注册，真实 400/500/600 字重用于正文、控件和标题；代码保持等宽。完整 17,772,300 bytes，无运行时 CDN。字体、OFL 和来源/SHA256 在 public/fonts；字体 SHA256 a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da。
- 新增本地 SVG Icon/FileIcon，共同 1.75 笔画替换 rail、搜索、文件、设置、更多、关闭、发送等 Unicode 图标。小型 Slash 标记，应用品牌 SVG/PNG/多尺寸 ICO 位于 public/brand。
- 导航总宽 280px，保留稳定项目顺序、图标下文字 rail、右键菜单和文件拖入。项目栏可手动收起至 58px rail，持久化用户选择。
- 空会话为 28px 标题和四个带短说明的轻量起点。会话正文 15px，composer 编辑区 120px，工作流/资料、模型、模式/权限分组；使用真实模型错误与配置入口。
- Run 摘要不重复显示已完成标签。执行记录和来源可展开，真实方案确认、审批、错误、继续任务及变更保持可见。
- 资源、成果、模板在实际项目上下文展示实际目录/文件数量；目录改连续行，初始页面同时显示全部文件。文件使用类型 SVG、名称/路径/类型信息和阅读/引用动作。添加目录的中性名称不虚构新的挂载权限；原有只读授权行为保留。
- 设置改为居中双栏 bounded dialog，宽 min(1040px, viewport-48px)、高 min(800px, viewport-80px)。8 个分类统一字体、36px 输入和按钮，权限选中带 aria-pressed 和可辨背景，checkbox 使用主题色。模型/连接子表单为固定 header/footer 与 .subdialog-body 内滚动；完整表单保留。
- 预览移除重复 stage tabs，只保留文件/版本 header 与动作栏。更多菜单执行动作后收起，在线交付表单不强制收起。质量报告以真实数量摘要展开全部问题，内部限高滚动；历史、差异和关联列表有统一留白和滚动。
- focus-workspace.css owns 工作台与基础控件；settings-focus.css owns 设置布局。style.css 中被替代的旧导航/会话/设置/预览规则、旧主题覆盖和高 specificity blanket button 规则已清理，feature styles 采用语义主题变量，辅助文字以 12px 为底线。
- neutral(reference)、graphite、sand 三主题与原生标题栏同步。BrowserWindow 设置运行时品牌 PNG；favicon 指向 SVG。electron-builder 当前 winOptions 支持 signExecutable:false，因此由旧 signAndEditExecutable:false 调整为仅跳过签名、保留本地图标/metadata资源编辑。

验证：npm run check 已通过。按协作分工本实现代理未运行 build、全面 test 或 pack；真实 Electron、三主题/窗口截图、全部状态和最终 exe 图标由主代理统一构建并审查。尚未将这些视觉及打包结果标记为通过。字体实际字形和最终 exe 资源图标需以最终构建证据核对。

## 第二轮真实窗口修复

- 修复连接发现 IPC 的契约错配：Service.discoverConnections 明确返回 ConnectionDiscovery[] 官方候选，仍合并并保存主连接注册表；Pi discoverAgentConnections 保持返回合并视图。共享 schema 对 UI 返回值执行真实校验，手动 MCP 不再被误 cast 成官方 CLI。新回归 tests/connection-discovery.test.ts 覆盖 UI/主列表与 Pi 两条路径，2/2 通过。
- rail 侧栏收起改 panel 图标。运行摘要去 Plan/失败的同义重复状态，失败卡外框采用中性表面和错误边界；执行完成与待应用草稿分开表达。草稿文件名与状态独立 gap/badge，长名截断保留 title。
- 模型图片辅助说明、版本差异说明分行；模型/连接 editor 固定动作标题，正在输入的长名仅作为单行截断副标题。程序选择按钮不换行，与输入统一 36px。子表单 checkbox 标签维持 gap。
- 文件页项目解释缩短；共享页不展示无关的目录/文件计数，双入口描述正常400字重；引用列表固定checkbox宽度、左对齐和内容flex，搜索图标留足输入内距；主题用户文案清理内部设计话语。
- 本轮检查：npm run check 通过；npx tsx --test tests/connection-discovery.test.ts 两项通过。构建和视觉重验继续由主代理统一执行。

## 集成交付结论

上述“待主代理验证”为实现阶段记录；现已完成 0.3.0 集成验收与打包。主代理构建通过，单元测试 130/130，真实 Pi 本地工作流 10/10；独立视觉审看三主题三尺寸 34 张代表图通过。最终打包目录 9 组界面矩阵与末尾设置保存补验完成，未遗留产品失败项；测试脚本的原始选择器失败保留在原始报告中，未改写通过状态。

便携 EXE 已直接启动并正常退出，Windows 资源图标、实际内置字体与许可已核对。完整数据、失败原因与补验、文件哈希和交付链接以 [0.3.0 设计与验收](delivery-ui-design-2026-10-04.md) 为准。外部文档发布和 SMB 双机行为不在此次 UI 验收范围。

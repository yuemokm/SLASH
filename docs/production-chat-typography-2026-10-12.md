# 聊天回复文字层次（2026-10-12）

用户要求回复更容易扫读。本次仅修改 `src/focus-workspace.css` 的 `.message .prose`，复用现有 ReactMarkdown，覆盖已保存回复及流式回复。未修改原型、Word 阅读、历史消息或用户字号控制。

实际 App 修改前测量：正文 16px，h1/h2/h3 为 24/18/16px，代码块 12px；将正文基准放大至 20px 后，标题及代码块仍固定大小。没有发现统一字号的 `!important` 覆盖；问题是聊天层级差异弱、局部像素值脱离正文基准，以及仅正常体字体在全局禁止字体合成时无法可靠显示斜体。

现在标题采用 1.5/1.25/1.125 倍正文，三级标题明确大于正文；强调文字 700 字重，斜体仅在聊天强调处允许样式合成。列表保留缩进和项目间距，引用有边线及留白，行内代码和代码块采用 0.875 倍正文。颜色沿用现有主题。普通纯文本不会被 CSS 猜成标题或重点；已有代码块也不会被自动拆除。新的回复格式指导由宿主单独负责，本次没有改模型提示。

Renderer `tsc --noEmit` 实际退出 0。实际 App/Vite + 本机 Edge 验证四场景通过、pageErrors=[]，浏览器及 Vite 已关闭：Markdown 层次和短回复原样、390 窄屏无正文横向溢出、正文 16→20 时标题/代码同比 1.25 缩放、现有暗色主题。前后测量与截图保存在 `.test-data/chat-typography-20261012/{before,after}/result.json`；父代理实际查看 `desktop-top.png`、`mobile-top.png`、`graphite-desktop.png`，确认层次与重点。`desktop-details.png` 未提供额外独立视图覆盖，不计另一项验收。

这是合成正文下的真实 App 渲染与浏览器检查，`realElectronIPC:false`、模型调用 0，不是模型回复质量评测。本次不构建、不打包、不提交；最终构建由当前主进程修复负责者统一执行。此前工具活动折叠见 [production-chat-tool-grouping-2026-10-12.md](production-chat-tool-grouping-2026-10-12.md)。G2 隔离补验候选仍暂停，以上 UI 结果不代表 G2 完成。

同轮按最终权限设计更新 `src/ComposerControls.tsx` 的完全访问说明：自动允许未禁止的操作，可读取本次任务明确指定的资料目录；目录按只读方式加入，明确禁止始终优先、不提升 Windows 身份。实际撤销入口已核为“设置 → 工作空间 → 目录权限”，不称全盘开放。底层授权机制由主进程修复负责者实现，此处仅同步说明。

流程源：[production-chat-typography-2026-10-12.mmd](production-chat-typography-2026-10-12.mmd)。

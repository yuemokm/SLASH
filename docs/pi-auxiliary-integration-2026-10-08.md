# 草稿诊断、方案批注与观测：实际复用记录

日期：2026-10-08。范围：PF03/F03 原型草稿检查、PF02/F02 研究型 Plan、PF03/F10 运行诊断。宿主工具、权限与 UI 接线归入 [六包集成记录](pi-package-integration-2026-10-08.md)。

| 固定发布包 | 许可证 | 实际执行接口 | Slash 最小适配 |
| --- | --- | --- | --- |
| pi-lens 4.4.0 | MIT | 发布文件 `dist/mcp/worker.js --file=... --cwd=... --flags=...`，内部调用包的 `analyzeFile` | `main/pi-lens.ts`；仅接受宿主核验的 pending 草稿 ID/hash，写入独立临时副本；不传项目根或参考原件 |
| @plannotator/pi-extension 0.28.8 | MIT OR Apache-2.0 | 发布 `server/serverPlan.ts` 的 `startPlanReviewServer` 及随包 `plannotator.html` | `main/pi-plan-review.ts`；复用官方逐段批注和决定协议，异步回传审阅 plan hash、原 Run、反馈；保持已有研究型 Plan，不安装第三方另一套 Plan 政策 |
| @langfuse/pi-observability-plugin 0.1.2 | MIT；experimental | 发布 `src/index.ts` 默认 ExtensionAPI factory；真实 Langfuse OTLP exporter | `main/pi-observability.ts`；显式配置后隔离进程加载，通过固定事件白名单只传 token、工具状态等统计；关闭时不加载 factory、不读环境凭据、不启动网络 |

三个入口均在固定发布包源码审计后选择，TS 发布文件由 jiti 加载；TS/HTML 子路径未声明稳定 export-map，升级必须重新核对这些路径并运行编译后 Electron 检查。版本校验委托统一 `main/pi-packages.ts`。

## 约束

Lens 关闭格式化、自动修复、项目脚本测试、LSP 及工具/LSP 自动安装。使用包已有的 tree-sitter/ast-grep 结构诊断，当前可执行的 JS 和 HTML 内嵌 JS 规则有实测；不宣称覆盖完整 TypeScript 类型检查、视觉或业务验收。草稿副本执行前后核 hash，分析返回诊断后临时目录销毁，报告路径标记为草稿副本。

Plannotator 的第三方缓存、历史和 config 全部进入临时目录；官方服务器只绑定 loopback，额外宿主私密 header 保护全部上游请求，避免绕过公开代理。浏览器代理带随机 token/HttpOnly cookie，只开放官方 plan、draft、决定等必要 GET/POST 路由；禁止文件浏览、AI、外部集成、配置、分享和自选保存路径。决定绑定原始 plan hash/run；工具单独取消与父 Run 取消均销毁进程。反馈回到原会话，批准不会自动提升权限或启动 Build。

Langfuse 配置入口在“设置 → 工作空间 → 高级：现成能力与运行观测”。默认关闭。启用后仍仅统计模式，去掉提示词、回复全文、图片、工具参数/结果正文、错误细节及本地路径；会话和工具调用 ID 哈希化。没有会话全文，因此不能用于完整内容排错。工作进程隔离用户级配置和环境变量，图片上传显式关闭；关闭和退出有界。密钥由宿主系统加密存储，返回 UI 的仅 `hasSecret`。

## 实测

命令 `node node_modules/tsx/dist/cli.mjs --test tests/pi-lens.test.ts tests/pi-plan-review.test.ts tests/pi-observability.test.ts`：7/7 通过。实际包而非包替身：

- Lens：`eval` 命中 `no-global-eval-js`、`severity:error` 和具体行；正常 JS 无 blocker；HTML 内嵌 JS 同规则命中；草稿/输入未变化；hash 错误及不支持类型拒绝。
- Plan：官方 HTML/API 可加载；上游直连无 token 返回 403；文件浏览/配置拒绝；旧会话 nonce 返回 409；批注和批准回到原 Run，hash 一致；Build 模式拒绝、取消后端口关闭。
- Langfuse：默认关闭不注册 exporter；真实 factory/OTLP exporter 向 **本机 HTTP 协议 mock** 发送 span/usage；上传体不含测试资料、图片和路径标记。没有云服务凭据，云账户认证、云端存储与展示未验证。

编译后桌面入口：`scripts/pi-auxiliary-electron-smoke.mjs`。统一构建后运行 `node node_modules/electron/cli.js scripts/pi-auxiliary-electron-smoke.mjs`，需清除宿主 `ELECTRON_RUN_AS_NODE`。脚本直接 import `dist/main/` 的三个模块，在真实 Electron 的 `process.execPath` 下启动固定包工作进程，核 TS/HTML 资源寻址和上述核心闭环；脚本本身不会构建或调用云服务。最终运行结果在主集成记录补充，不把仅写入脚本视为执行成功。

## 首轮发现与修复

首次 Lens 探针发现仅关闭 LSP 安装仍会尝试安装 oxlint，探针已停止；增加官方 `PI_LENS_DISABLE_TOOL_INSTALL=1` 后重新运行上述固定包测试通过。首次 Plan 协议测试发现收到决定立即终止进程会早于 HTTP 响应发送；延后决定回传，让官方响应完成后再销毁，复测通过。没有用户资料或云上传参与这些探针。


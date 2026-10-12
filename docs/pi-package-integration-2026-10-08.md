# Pi 生态模块接入验收

用户2026-10-08明确要求：接入pi-web-access、pi-mcp-adapter、pi-subagents、pi-lens、Plannotator及Langfuse Pi插件，并继续寻找高下载的上下文与记忆包。前述六项属于实施范围；上下文/记忆先比较用途、重合和许可。当前文件为执行契约，未通过的项不得称接入完成。

## 实施边界

固定已审查的npm版本并复用包真实实现，不复制重写其通用内核。可信包显式加载，不开放任意项目代码执行。保留Pi作为唯一会话执行底座，Slash拥有目录授权、参考原件只读、ChangeSet、取消、成本预算、审批和外部操作回执。包的TUI能力可通过桥接接入桌面，不因显示方式直接排除。

| 包 | 功能验收 | 保护与真实性验收 | 当前状态 |
| --- | --- | --- | --- |
| pi-web-access 0.37.0 | 会话搜索、正文读取、分页和来源工具；同一任务缓存有效 | 真实包 stdio；配置与凭据隔离；无密钥 DDG 搜索、分页、source_check 公网实测通过 | 已接入；正文公网抓取未通过本机网络验收，见下文 |
| pi-mcp-adapter 5.1.0 | 真实 host-managed 包承接 stdio 派发；既有 HTTP OAuth/elicitation 保留 | 并发结果隔离、目录/参数检查、一次派发、结果未知保护；原 HTTP 桌面回归通过 | 已接入、本机验收通过 |
| pi-subagents 0.76.1 | 真实独立只读子任务，持久化状态、模型、耗时；结果返回父 Run | 同模型、父截止时间及共享工具预算；最多 3 项/2 并发；禁止写入和递归扩权 | 已接入、实际 Electron 验收通过 |
| pi-lens 4.4.0 | 在草稿副本诊断代码，具体 eval 规则和正常样例已验证 | 关闭自动工具安装、自动修复和项目脚本；原件未改；不代替视觉/业务验收 | 已接入、编译后 Electron 实包验收通过 |
| Plannotator 0.28.8 | 官方评阅界面/协议，批注确认或退回回到原 Run | 绑定计划 hash；本机访问凭证；不开放文件浏览；父生成结束后仍可评阅；旧评阅和退出关闭 | 已接入、实际 Electron 验收通过 |
| Langfuse 插件 0.1.2 | 设置凭据后真实插件向本机 collector 导出统计 | 默认关闭；安全存储；正文/图片/路径不发送；有界异步队列；关闭停止当前观测 | 已接入、本机协议及 Electron 通过；真实云账号未配置/未验证 |

## 验证方式

使用隔离profile、发布包及本机协议服务验证，不把自写mock注册表当第三方包已运行。需要真实外部账号或网络服务的效果分别记录未验证。根代理统一类型检查和构建，执行相应运行/权限回归与桌面交互验证；不制作便携版。用户通过启动BAT查看。

上下文比较必须覆盖Pi原生压缩；长期记忆必须区分会话笔记、已确认项目知识及共享问答资料。不得叠加两套自动压缩，不能将未经确认的模型记忆提升成业务事实。

## 2026-10-08 实际验收

- 根代理 `npm run check`、最终 `npm run build` 通过；renderer 为 `index-CX1qxNRu.js`。Vite 大于 500 KB 的分包提示仍在，非编译失败。未执行 electron-builder 或制作便携版。
- 根代理独立运行 24 项新增专项：subagents 7、lens 2、Plan 2、observability 3、MCP runtime 3、settings 3、Service 接线 2、父进程退出回收 2；均通过。加上 lazy-tools、runtime-context/recovery、MCP、测试用例相关 55 项回归，合计 79 项不重复测试通过。部分重跑不重复计数。
- 实际桌面设置/子任务/Plan 反馈：`.test-data/pi-packages-ui-1791469851992/evidence.json`，三项场景通过，原件 hash 不变、零草稿、仍 awaiting_plan；应用正常关闭、测试 profile 无残留进程。脚本：`scripts/pi-packages-ui-smoke.mjs`。
- 编译后 Electron 44 下三项辅助包真实运行通过：`scripts/pi-auxiliary-electron-smoke.mjs`。真实 AST 诊断、官方评阅回流、真实 Langfuse OTLP exporter 到本机 collector，未发送业务内容；无真实模型/云账号调用。
- 原 HTTP MCP 桌面 7 项回归通过：`.test-data/mcp-ui-1791469886291/result.json`，OAuth/DCR/PKCE、刷新、分页、服务商确认及注销通过。使用本机协议服务，真实服务商账号仍未验证。
- 公网网页证据：`.test-data/pi-public-web-evidence.json`。DDG 搜索、`get_search_content(queryIndex:0)` 分页及 source_check 成功；source_check 明确保留 `unclear`，不能自动确认业务事实。当前网络把 pi.dev 解析为 `198.18.0.202` 保留地址，宿主拒绝正文抓取；没有放宽 SSRF。该环境下正文抓取仍需实际网络验收。
- 对比安装前 lock，已有依赖版本无变化；Pi ai/coding-agent/agent-core/tui 均固定 0.86.1，Electron 固定 44.0.0；六包精确版本锁定，安装时不运行第三方生命周期脚本。
- 最后补充父进程回收：`tests/pi-worker-lifecycle.test.ts` 实际启动官方 Plan/Langfuse worker 与 web stdio，正常退出与强停宿主两种情况下均在 5 秒内消失，随后无新增 collector 请求；根代理复跑 2/2 通过。辅助 worker 监听管道关闭并检查父进程存活，Service.dispose 捕获异步关闭失败。此项不宣称已覆盖 Lens 的独立直启 worker。

### 测试过程发现并修复

MCP 闭包共用返回值已改为每次调用上下文隔离；分页补齐真实包 queryIndex 参数。lens 首轮尝试自动安装 oxlint，现已明确禁用自动工具安装并重验。观测事件从同步等待改为有界异步队列，故障不拖住 Agent。首次独立 Electron 测试脚本入口顶层等待 ready 卡住，已仅终止该测试进程，改为异步入口、动态导入与总超时后通过；不是通过修改 BrowserWindow 属性绕过。设置 UI 首轮脚本误定位通知，修正定位后通过。审计目录清理遭工具自动策略拒绝，保留文件，未绕过；不影响产品运行。

架构源文件：[pi-package-integration-2026-10-08.mmd](pi-package-integration-2026-10-08.mmd)。上下文/记忆调研：[选型复核](pi-context-memory-selection-2026-10-08.md)。用户随后条件授权比较 billion-context、效果和稳定性更适合则替换；[真实代理对照](billion-context-local-comparison-2026-10-08.md) 已完成，决定暂不切换默认，详见 [准入与结论](billion-context-comparison-2026-10-08.md)。不能将本轮六包成功视为其业务效果验证。

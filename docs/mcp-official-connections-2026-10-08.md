# 官方 MCP 连接：本机实现与验证

需求：Slash 能添加 Vercel、Supabase 官方 MCP，显式网页登录、取消、注销和测试；保留原有匿名 HTTP 与本机 stdio。管理连接用于用户授权的发布和项目管理。独立知识库问答网页的运行 API 与这些桌面管理凭据分开。

## 实现

- `shared/mcp-connections.ts` 定义兼容旧连接的可选授权字段、官方预设和受限 IPC 请求。Vercel 地址为 `https://mcp.vercel.com`；Supabase 为 `https://mcp.supabase.com/mcp`，默认只读，可限定 project reference。未添加跳过服务商确认的参数。
- `main/mcp-oauth.ts` 复用当前已安装 MCP SDK 的标准 discovery、动态客户端注册、PKCE、令牌交换与刷新。只有显式“网页登录”才打开浏览器；后台测试没有凭据时不会发起动态注册。一次性 state、回调路径、五分钟上限与取消绑定同一个本机 loopback 会话。
- `main/mcp-credentials.ts` 复用现有 `safeStorage` cipher 接口，SQLite 的独立键只保存密文。凭据不进入 State、模型上下文和 Renderer。连接地址/项目范围变化后旧授权失效。会话代次阻止取消、注销或停用后的迟到刷新恢复凭据；授权错误使用本机安全文案，已知凭据回显脱敏。
- `main/mcp-client.ts` 统一 HTTP/stdio、完整工具分页与调用。最多 50 页、2000 工具、2 MB 和总计 30 秒；未完整读取直接报告失败，不声称目录完整。持久能力名上限 2000，模型列表最多 50 个；`inspect_connection` 支持 query/cursor/limit，默认每页 25 个并返回总量及 hasMore。游标绑定目录和筛选条件。调用前核对完整目录与当前配置。
- SDK 默认授权恢复会重发 POST。适配器在已经提交的 `tools/call` 遇到 401/403 时立即停止并返回 `outcome_unknown`，不自动刷新并重放该操作。连接初始化及能力读取仍可使用标准刷新。
- `main/mcp-elicitations.ts` 是临时用户确认队列。服务端表单和网页确认不继承“完全访问”等自动许可；必须单独由用户处理。表单按 SDK JSON schema 校验，拒绝密码/令牌字段；网页密钥留在服务商网页。拒绝、取消、过期、停用、变更和关闭都会结束等待，不保存表单输入或授权 URL。
- `main/mcp-host.ts` 统一生命周期；`main/main.ts` 和 Service 接入凭据与配置变化，旧检查不会覆盖新地址状态。`src/ConnectionsPanel.tsx`、`McpConnectionControls.tsx` 提供预设和登录按钮，App 全局挂载 `McpElicitationPanel.tsx`，任务运行时可直接处理确认。

## 官方约束

Vercel 官方文档明确只支持通过审核的 MCP 客户端。Slash 以真实 `slash` 客户端与 `Slash` OAuth 名称连接，未伪装 Pi；截至本机实现交付，没有 Vercel 客户端审核回执，界面显示这一限制。[官方连接文档](https://vercel.com/docs/agent-resources/vercel-mcp)

Supabase 官方 MCP 支持浏览器 OAuth、项目范围、只读及服务端 elicitation。普通公开用户不能获得管理 MCP；问答网页应使用 Vercel 服务端受限 API 和 Supabase 权限规则。[官方 MCP 文档](https://supabase.com/docs/guides/ai-tools/mcp)

已检查当前 changelog；OAuth token endpoint 的 HTTP 201→200 变更不影响 SDK 的 `response.ok` 判断。没有在本次连接实现中创建数据库表、安装向量扩展或调用迁移。[OAuth 状态码变更](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201)

## 可执行验证

类型检查：`npm run check`。

专项：`npx tsx --test tests/mcp-connections.test.ts tests/connection-health.test.ts tests/connection-discovery.test.ts`。本机真实协议覆盖 SDK DCR、PKCE、state、刷新、迟到响应、取消/注销/停用、分页上限、HTTP 401/403 不重放、stdio 兼容、表单/网页确认及安全存储。没有连接官方账号。

正式 Electron：统一构建负责人先构建当前版本，再执行 `node scripts/mcp-connections-ui-smoke.mjs`。脚本独立创建 `.test-data/mcp-ui-*/profile`，保存本机状态截图与 `result.json`，只通过正式 Renderer/preload/IPC 使用新按钮。脚本不 build、不调用云模型、不发起真实浏览器或官方授权；仅针对本机 fixture origin 将 HTTPS 外形地址转换为 loopback HTTP。真实 TLS、官方项目、客户端审核和真实账号仍未验证。脚本最后正常关闭自己启动的应用，并检查源文件/dist 哈希没有运行中变化。

2026-10-08 正式 Electron 本机结果：`.test-data/mcp-ui-1791467337959/result.json` 的 7 项全部通过，覆盖预设范围、测试不静默登录、登录取消、DCR/PKCE、刷新与 120 工具分页、第二页工具的真实用户确认、注销。工具提交恰好一次，页面异常为零，应用正常关闭，源码/dist 运行中哈希未变。已查看 `server-elicitation.png`，确认弹窗完整显示且按钮可操作。首次 `.test-data/mcp-ui-1791467232266` 保留为失败证据：脚本错误使用 `ExternalResult.id`，正式审批编号实际为 `receipt.proposalId`/`operationId`；修正脚本并断言两者一致后通过，没有改变产品行为或放宽验收条件。

相关流程：`docs/mcp-official-connections-2026-10-08.mmd`。

通俗说明：现在能在 Slash 里保存这两个服务的连接、点击登录并处理服务商要求的确认；账号授权和实际发布仍需使用用户自己的项目验证。网页访客不会拿到这些管理权限。

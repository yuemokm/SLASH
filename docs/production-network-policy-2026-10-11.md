# G1 A02 · MCP OAuth 网络边界

关联 F03 / PF11；实现日期 2026-10-11。修补当前 MCP SDK 网络注入，不替换 OAuth、PKCE、凭据加密或 Pi 底座；无新依赖，未触发通用能力选包。

## 实际实现

- `main/network-target-policy.ts` 提供可执行 NetworkGrant 契约、IPv4/IPv6/IPv4映射IPv6分类、URL与DNS所有答案核验、精确origin企业例外、请求时权限复核，以及通过已有 undici Agent 的固定地址 lookup。Node native fetch 消费公开 dispatcher 接口，保留原 hostname/Host/TLS 校验；不使用环境代理、不关闭证书验证。
- `main/mcp-oauth.ts` 的发现、动态注册、授权码交换、刷新和浏览器初始授权地址均执行该策略；`main/mcp-client.ts` 的匿名与已登录 HTTP transport、SDK自行触发的OAuth刷新也使用同一fetch。工具401/403仍沿用单次提交保护，不重放写入。
- `main/mcp-host.ts` 从真实已保存连接构建授权快照；禁用、删除、URL或允许origin变更取消旧请求、旧登录与确认，并使旧provider/fetch失效。
- `shared/mcp-connections.ts` 增加可选 `mcpNetworkAllowedOrigins`，最多16个HTTPS精确origin（无路径/凭据/查询/fragment）。原连接记录兼容，无数据库迁移，不自动修改用户配置。可信桌面设置填写；资料、metadata和模型不能添加例外。模型配置同URL保留旧值，换URL清空，由Service接线负责。
- Pi host-managed `main/pi-mcp-runtime.ts` 经核对当前只提供stdio transport，无HTTP刷新路径；继续复用原adapter，不为本修补新增第二个HTTP实现。HTTP集成走上述官方SDK路径。

默认只允许公开地址。企业例外仅允许RFC1918和IPv6 ULA，且只限该连接明确保存的精确origin，端口不同即不是同一授权。已明确配置的HTTPS私有IP、单标签或`.local`/`.internal`服务仅自动授权自身origin；metadata中的其他内网origin仍需用户单独填写。公网域名解析成私有地址时不会自动放行。永久拒绝回环、链路本地、共享地址、文档/保留/组播、IPv6隧道等特殊目标，企业例外不能绕过。

请求不跟随任何HTTP 3xx；这样OAuth token/DCR POST既不会因跳转换目的地，也不会重放。域名每次请求重新核验，全部DNS答案通过后只使用一个核验地址建立本次连接，防止校验后第二次DNS改向内网。允许origin变化立即取消连接，旧快照在DNS完成、派发前、响应返回三个阶段再次核对。

## 验收与证据

专项命令：`npx tsx --test --test-concurrency=1 tests/mcp-network-policy.test.ts tests/mcp-connections.test.ts`，21/21通过（13个既有MCP回归、8个新增网络/协议夹具）。原始日志与源码SHA-256快照分别为 `.test-data/production-network-policy-20261011.log`、`.test-data/production-network-policy-20261011-source-hashes.json`。

覆盖真实本机HTTP SDK DCR/PKCE/state、恶意metadata发现/注册/浏览器授权/token四阶段、SDK后台refresh grant、精确企业origin、IPv4/IPv6/映射地址、混合DNS答案、DNS重绑下一次请求拒绝、DNS取消、响应后撤权、真实undici lookup单次固定地址且保留Host/原生Request正文、3xx不跟随、真实SSE正常首帧与取消后socket关闭、真实HTTPS自签名证书拒绝且HTTP正文未发出，以及工具401/403只发一次。自签名证书/私钥仅为无信任的测试夹具，未安装到系统信任库。

实现过程中原生Request直接传给单独undici.fetch曾真实失败；修为Node native fetch配公开undici Agent后该夹具通过。不能把早期失败或mock响应写为真实账号通过。

## 边界

真实Vercel/Supabase或企业OAuth账号登录、公网发布、企业网络DNS与受信证书尚未验证；本机夹具不替代这些集成认证。企业额外origin设置的UI/IPC往返由本批另一实现者验证，完整批次记录以主交付说明为准。

浏览器初始授权URL经过同一目的地核验；浏览器自身后续DNS/页面跳转由系统浏览器控制，Slash不能在外部浏览器中固定socket或拦截后续导航。严格DNS固定和重定向拒绝的声明仅适用于Slash发出的协议网络请求。本机OAuth回调仅监听随机127.0.0.1端口，不授予生产出站回环权限；测试须显式传allowLocalFixture，本地夹具例外精确绑定配置origin且只允许解析127.0.0.1，生产main未传该标志。

地址选择当前只使用首个已核验地址，连接失败不自动改另一地址；部分IPv6特殊分配采用保守拒绝策略。请求返回后的正常stream由Agent.close排空，取消或失败由Agent.destroy释放。该修补没有声称完整网络渗透测试或所有服务可用性验证。主进程修改需重启开发应用；未打包。

参考：[MCP 2025-11-25安全实践](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)，2026-10-11核读；保留原官方SDK处理OAuth，未把server部署条款直接作为桌面客户端强制要求。

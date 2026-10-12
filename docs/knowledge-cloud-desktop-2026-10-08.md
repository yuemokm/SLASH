# 知识库桌面发布闭环

2026-10-08。需求 PF09/PF11 与本轮可分享知识库：在资源→知识库集合中配置、预检、确认发布或更新、核对未知结果及停止分享。继续复用已选择资料、原件版本、本机索引和官方 Supabase API；不要求 PM 手写发布脚本或 SQL。

## 实现

- `shared/knowledge-publication.ts`：严格 IPC schema、发布目标/已有同事账号、预检及回执契约。`main/knowledge-publication.ts`：safeStorage 专用密钥、正式 REST/Auth Admin/RPC、持久化操作及未知结果保护。`src/KnowledgePublication.tsx`：在原知识库集合详情中展示向导。
- 核心发布白名单和回执复用 `knowledge-web/lib/bundle.ts` 与 `knowledge-web/lib/publication.ts`，没有复制第二套正文/指纹/中文分词算法。网页依赖使用显式 `.ts` 导入，根 TypeScript `rewriteRelativeImportExtensions` 在 Electron emit 时转为 `.js`，同时兼容 Next/Turbopack 与 NodeNext。最初使用 `.js` 导入通过根检查但被真实 Next UI 揭示不能解析，已按同一核心复用方案修复。
- 官方 MCP 现有连接可管理项目，但 OAuth 令牌不能假定为 Supabase 发布管理凭据。首次需维护者准备已迁移目标、独立网页、模型环境变量和发布专用管理密钥。保存配置不查询云端、不部署、不上传资料；管理密钥不进入模型/renderer 返回值/日志。
- PM 输入同事登录邮箱；预检只读查询 Supabase Auth 已注册账号，解析为 UUID。最多分页查询 10000 个账号，未找到明确阻断；不自动邀请或创建账号。高级配置兼容 UUID。发布确认页显示邮箱，真实 RPC 和回执绑定已解析的 UUID。
- 预检绑定项目、目标配置修订、前置云版本、本机 manifest、成员，并在 5 分钟后失效。发布前再次检查云前置版本与当前原件，原件/选择/配置变化不能上传旧正文。
- 发送前原子持久化 `outcome_unknown`。断连、超时、网关 5xx、无效或不匹配回执均保持待核对，跨重启禁止新写。核对只查询原 operation，校验 operation/知识库/版本/manifest/前置版本/成员；没有回执不重发。
- 确定的认证拒绝与可识别 PostgREST/SQL 事务 4xx 记 `failed`，保留审计并允许用户修正后重新预检。不会把任意 400 或网关失败猜成事务回滚。
- 停止分享仅基于本机已确认发布记录及云当前版本，完全不重读原件。原件修改、删除或来源目录撤权不阻止撤销；仍遵循项目管理和外部操作权限。存在未停止或待核对的任一目标时拒绝移除集合。
- 回执同时进入既有 `operations` 审计，按原创建顺序保留完整发布历史。再次核对旧操作不能覆盖最新停止分享状态。

## 验证与限制

`tests/knowledge-publication.test.ts` 通过真实 localhost HTTP 协议验证白名单、邮箱解析、明确确认、RPC/回执、断连重启、成员/目标/版本绑定、原件变化以及确定失败恢复。使用合成服务和专用测试密钥，不读取任何用户现有密钥。

`scripts/knowledge-publication-ui-smoke.mjs` 在根负责构建后启动真实隔离 Electron，验证实际 preload/IPC/safeStorage、配置零网络、只读预检、明确发布、unknown、应用重启、核对不重发，以及原件变更后的停止分享。固定向量及本机 REST 响应只证明软件路径，不代表云授权/RLS、真实问答效果或网页部署。

最终根构建 `index-v9-JjPus.js` 上实际 Electron 5 组通过，证据 `.test-data/knowledge-publication-ui-1791473485620/result.json` 与 `.test-data/knowledge-publication-ui-final.log`。包含新增 401 失败后的明确按钮恢复，以及停止成功后的按钮收起。无页面异常、公网请求 0，应用与本机服务已关闭，截图已查看。第一轮 4 组证据保留在 `.test-data/knowledge-publication-ui-1791473026783/result.json`。

最终类型检查通过：`.test-data/knowledge-publication-desktop-check-final.log`。发布专项 10 项与既有知识库 11 项共 21 项通过：`.test-data/knowledge-publication-desktop-tests-final.log`。新增正式 Service 检查确认禁外部调用不影响本地历史与无分享集合移除，并发双确认只发一次 RPC。初次专项因测试误写中文 bigram 预期少了“址只”失败；修正预期后通过，分词实现未改。

本模块没有发起任何真实云写入或部署。目标云环境的部署/RLS/问答验收以根代理的独立记录为准，发布回执成功不冒充网站已上线。

通俗说：资料发出去前，先看清楚发到哪里、哪些同事能看；网络中断就查原记录，不连续重复上传。以后即使本机资料改了或删了，仍可用原发布记录关闭分享。

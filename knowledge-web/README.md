# Slash 独立资料问答网页

2026-10-09：此工程已退出 Slash 当前产品范围，保留源码、迁移及验收历史。不再作为默认开发或部署目标。桌面云发布入口已移除；本次没有删除或下线已有远端网站、数据库。以下操作说明均为历史资料。

已实现可运行的 Next.js 页面、Supabase Auth 注册/邮箱确认/登录、按集合成员授权的查询/来源/反馈 API、pgvector＋关键词混合检索迁移和显式版本发布脚本。云项目与迁移状态见本轮部署记录；网站上线、真实资料和模型问答仍需单独验收。Pi 仍是桌面 Agent 底座；这个网页没有桌面工具或另一套 Agent harness。

## 本机开发

Node 24，依赖和锁文件已固定。新环境在本目录执行 `npm ci --ignore-scripts`，随后 `npm run check`、`npm test`。网页通过 `npm run dev` 打开 `http://127.0.0.1:3210`。没有配置时展示维护者提示，不需要填写假密钥。

需要看完整交互时，PowerShell 设置 `$env:KNOWLEDGE_LOCAL_FIXTURE='true'` 再启动开发服务。点击“进入本地演示”，问“门店地址由谁维护？”或没有依据的问题。页面始终标注演示；只使用固定答案和来源，不连接 Supabase/模型。生产构建及 Vercel 环境强制禁用演示。

`node scripts/smoke-ui.mjs` 会自启本机 3321 端口的演示服务，使用主项目已有 Playwright，结束后关闭自身浏览器和服务。结果和桌面/手机截图在 `test-results/ui-smoke/`。这是本机 UI 验证，不能证明真实问答效果。

## 配置与访问

复制 `.env.example` 为 `.env.local`。浏览器仅接收 Supabase 地址与 publishable key（兼容 legacy anon key）。模型凭据仅服务端读取。同事可主动用自己的邮箱注册；需要邮箱确认时，页面提示先打开邮件再登录。注册不授予任何资料权限，维护者仍须在发布时明确添加成员。

Supabase Auth 的 Email provider、Signups 和 Confirm email 必须由维护者在实际项目核对；Site URL 设为正式网站地址，Redirect URLs 精确加入正式网站根地址（本机开发可单独允许 `http://127.0.0.1:3210/`）。注册调用官方 `signUp`，`emailRedirectTo` 使用当前网页的 `origin + '/'`；默认浏览器 SDK 处理确认后的会话。正式发信还需核对 SMTP/限流。网页无自动邀请、管理员创建账号或自行授权入口。注册 UI 仅以本地网络隔离替身验证，尚未实际发送验证邮件。

页面由浏览器官方 SDK 管理会话和刷新；请求带短期 Bearer token。服务端每次 `getUser(token)` 核实身份，再用同一个用户 JWT 查询数据库，让 RLS 按当前成员记录和已发布版本过滤。服务端不使用 service-role。退出、切换集合和刷新身份会清理旧答案；延迟到达的来源与反馈不会恢复到另一个身份页面。用户取消传递到模型 HTTP 请求，已发送到远端的请求是否最终计费仍由提供者决定。

`EMBEDDING_ENDPOINT` 是**完整 `/embeddings` 接口地址**，与桌面配置一致，保留 URL pathname 尾斜杠。provider 指纹自动派生为 `openai-compatible:<origin><pathname>`；模型、revision、dimensions 和桌面完全一致。发布预览输出可直接复制的非敏感配置。不能把聊天模型名称当作 embedding 模型。向量响应的 model、index、维度、有限数值与非零向量均严格检查，不静默降级为关键词成功。

`ANSWER_BASE_URL` 是 OpenAI 兼容基础地址，服务端请求 `/chat/completions`。没有依据时直接返回“当前资料没有足够依据”；有冲突时列出至少两处引用并提示无法裁决。模型只能引用本次命中 ID，服务端绑定文档名、原文位置、正文哈希及来源版本。引用真实不代表解释一定正确，仍需中文业务评测。

## 数据库迁移和验收

迁移文件 `supabase/migrations/20261008135740_knowledge_qa.sql` 的原空模板由既有 CLI 创建，本轮补齐。覆盖所有暴露表的 RLS、显式 GRANT、当前发布快照、成员关系、问答回执、反馈及管理专用发布事务；所有函数使用 security invoker，无 SECURITY DEFINER 绕过。只有离线发布器使用独立管理凭据。

本机 Docker 守护服务当前不可用。已提供 `npm run test:db`：使用固定版本 PGlite 0.5.8，在进程内新建并销毁内存 PostgreSQL，不需要账号、网络连接、系统安装或常驻服务。原迁移真实执行，pgvector 0.8.1 下 11 项 RLS 与 16 项发布事务 pgTAP 断言通过，覆盖跨库、旧版、撤权、停止分享、禁止自行加成员、版本冲突、幂等回执和失败回滚。测试只补最小 `auth.users`/`auth.uid()`/角色契约，PostgreSQL 18.3 与 Supabase 目标版本有差异，**不能替代 Supabase Auth、PostgREST、目标扩展和真实问答验收**。

2026-10-08 云端进展：用户授权免费新建的 `slash-knowledge`（`apxdejyicmuzfhbtckup`）已实际应用迁移；同一 11+16 项 pgTAP 在目标 Supabase 全部通过，聚合证据由主代理存于 `test-results/supabase-cloud-sql-2026-10-08.json`。这证明本次目标数据库权限/事务断言通过，真实网页登录、模型问答与线上可用性仍以独立链路结果为准。

若实际 SQL 连接器只返回最后一个结果集，用 `node scripts/database-evidence-sql.mjs knowledge_rls.sql`（或 `knowledge_publication.sql`）生成聚合 SQL：每条 pgTAP 结果存入临时表，不全通过则抛错，最后返回完整 JSON 证据，随后回滚全部测试写入。不要只凭最后一条 `ok` 宣称整组通过。

在明确的本机临时 Supabase 环境应用迁移后执行：

```powershell
./node_modules/.bin/supabase test db --local supabase/tests
./node_modules/.bin/supabase db query --local "select extversion from pg_extension where extname='vector'"
./node_modules/.bin/supabase db advisors --local
```

先检查 CLI `--help` 和目标身份；不要把 `--local` 换为线上目标进行试探。实际目标迁移前核对 Data API 设置、pgvector 安装 schema/version，以及不影响既有表的命名。此模板使用 `extensions.vector`，首次发布集合最多 3MB（过滤后的 JSON），向量精确扫描；没有承诺大库 ANN 性能。中文采用同一 `zh-bigram-v1` 双字分词，但阈值和业务召回仍需真实评测。

## 显式发布与停止分享

桌面导出的 `KnowledgeExportBundle` 是本机快照。发布器核验 `sha256(JSON.stringify({schemaVersion:1,title,snapshot}))` 和块正文哈希，剥离 mountId、projectId、本机资料路径和原件定位，只上传明确集合的正文、展示名、版本、位置及向量。它不会扫描或上传整个项目。

`SUPABASE_DEPLOYER_SECRET_KEY` 只放在单独的 `.env.deployer.local` 或离线进程环境，配合 `NEXT_PUBLIC_SUPABASE_URL`；不放网页的 `.env.local`，不配置到 Vercel 问答项目。预览和 `--help` 在没有环境文件时也可运行。下面是显式操作说明。

```powershell
# 默认只校验及预览，不访问网络
npm run publish:bundle -- --bundle <桌面导出文件>

# 维护者核对目标、资料及成员后显式发送一次
npm run publish:bundle -- --bundle <文件> --commit --operation <新UUID> --members <已有Auth用户UUID,另一UUID> --expected-active none

# 更新：expected-active 填线上当前版本，拒绝覆盖已变化的版本
# 每次发布明确替换这个集合的成员清单；不继承未知授权
npm run publish:bundle -- --bundle <新文件> --commit --operation <新UUID> --members <用户UUID> --expected-active <旧索引ID>

# 超时/中断只核对，不重发
npm run publish:bundle -- --reconcile --operation <原UUID>

# 停止分享先禁止新查询和来源访问，保留历史快照供审计
npm run publish:bundle -- --revoke <知识库ID> --commit --operation <新UUID> --expected-active <当前索引ID>
```

发布是单个数据库事务：资料、向量、成员和活动版本全部成功才切换。旧版退休后不能通过查询或来源 API 读取。本机在发送前先写 `.publication-receipts/<UUID>.json` 为 unknown，绑定目标地址、operation、动作、集合、版本、清单和成员；断线或崩溃保持 unknown。HTTP 成功和后续查询都须逐项核对回执后，才以临时文件原子替换为 confirmed。`--reconcile` 必须有原始本机登记；换目标或旧格式缺少目标的登记会阻断并要求保留文件人工核对。没有确认不自动再次发送。回执不能当作网站仍在运行的证明。

Vercel 项目 Root Directory 使用 `knowledge-web`，Node 24，按 `.env.example` 设置网页环境；安装使用固定锁文件。`npm run deploy:preflight` 只检查配置，不联网/调用模型/部署/打印密钥，阻断演示模式、公开高权限密钥、混入网页的管理密钥及缺失的模型配置；Vercel 构建自动先执行这一步。网页部署与资料快照发布是两件事，部署完成后仍须核对成员、模型指纹和真实中文问答。

`node scripts/stage-deployment.mjs` 在系统临时目录生成部署白名单：仅网页源/锁/配置、部署预检及必要的 `shared/knowledge-base.ts`。不拷贝环境文件、桌面、业务资料、node_modules、数据库迁移或回执。Vercel 部署从生成的 stage 根目录执行，项目 Root Directory 仍设为 `knowledge-web`；不要直接上传整个桌面项目。web 的 zod 类型依赖明确固定，Next 直接解析 `.ts`；桌面编译通过 `rewriteRelativeImportExtensions` 转成 `.js`，共用同一发布白名单算法。

实际云端链路脚本为 `tsx --conditions=react-server scripts/smoke-cloud.ts --commit`。维护者从安全进程环境注入 Supabase URL/publishable/admin key、`KNOWLEDGE_SMOKE_WEB_URL` 和与网站一致的模型配置。脚本只用合成短文，创建并登录一个 `example.invalid` 测试账号，校验发布/真实问答/引用/停止分享，再按本次随机知识库 ID 精确删除合成记录和测试账号；最多 1 次建索引 embedding + 网站问答的 embedding/answer，共 3 次模型请求，不自动重试。失败或清理不完整保留不含密钥的结果 JSON。当前固定验收模型为 `BAAI/bge-m3` 1024 维、`GLM-5.3-Flash`；本段是可执行验收入口，是否实际通过以主代理保存的结果为准。

若需验证本机生产服务与真实 Supabase/模型的业务链，先用网页环境启动 `npm run build` / `npm run start`，再在独立验收进程设置 `KNOWLEDGE_SMOKE_WEB_URL=http://127.0.0.1:3210` 并显式添加 `--local-web`。该开关只接受 `127.0.0.1` 或 `localhost` 的 HTTP 根地址，默认云模式仍强制 HTTPS；模型和 Supabase 地址要求不变。结果另存 `test-results/local-production-<UUID>/`，标记 `webMode=local-production`、`cloudWebAvailabilityVerified=false`，只能证明本机生产服务的真实业务链，不能作为 Vercel 调用模型成功的证据。

## 官方依据（2026-10-08 核对）

- [Supabase Auth 方法与会话](https://supabase.com/docs/guides/auth/server-side/creating-a-client)：浏览器取 token；服务端 `getUser` 实时核实，不信任客户端 session 的 user 字段。
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)：实际集合成员过滤，显式授予 Data API 权限。
- [Supabase 混合检索](https://supabase.com/docs/guides/ai/hybrid-search)：向量和关键词排名融合；中文分词由同一版本预处理。
- [Supabase Changelog](https://supabase.com/changelog.md) 已获取；[PostgreSQL 15.19/17.11 变更](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) 已核对，本实现不创建自定义选择率算子或 ltree/btree_gist/旧 pgcrypto 加密索引，仍需实际目标 advisors。
- [Vercel Functions 时长配置](https://vercel.com/docs/functions/configuring-functions/duration)：Node.js Route Handler 的 `maxDuration=120`，不依赖旧 Edge runtime。

通俗说：网页已经能在本机完整演示“提问、回答、点开依据”；真正分享给同事，还需要在你授权的云账号上配置模型、核对数据库权限并正式发布资料。

# 静态多文件 MCP 发布路径：调查与集成验收

当前根：发布aggregate 28文件已按封存SHA合入，integration.json位于`.test-data/production-static-publishing-root-integration-20261011`；Word/模板/v6保留。check exit0，必要定向54524终态44/45（唯一整文件失败为私有ZIP/loader夹具依赖）；改成同字节自包含ZIP和tsx公开入口后，operation52565单独13/13、34639.3583ms。两轮结果分开保留。发布+目录原统一31128自然终态1389/1386/3失败、check0、未build，三处旧目录ID错误码断言保留原日志后精确修复；随后加入已批准局部修稿，新的完整check/test/build待当前必要定向通过后进行；以下最初只读调查和隔离验收按历史时点保留。实际管理IPC5/5为合成凭据，正向账号核对、云发布及远端页面仍未验证。

用户最新平台取舍：HTML原型在线分享优先复用项目既有Vercel；数据、登录、存储按需Supabase。Netlify仅是已实现的可选适配，不是生产级Agent必需，不要求用户注册，停止Netlify专属新增/真实账号验收主线。通用快照、审批、恢复和防重发逻辑保留，未验证不冒称远端完成。

以下为历史调查：2026-10-11 查询。当时结论：**Netlify 官方本地 MCP 是下一步最值得验证的目录上传候选，但目前没有可以直接登记的生产 codec。** 保持 registry 为空，不把本机 fixture、CLI 回执或云端构建开始当作 MCP 发布完成。本次未安装包、登录、配置连接、执行发布或修改源码。

先复核了现有 `pi-package-reuse-audit`、`mcp-official-connections`、`production-multifile-delivery-design` 和多文件隔离候选。候选目前是完整快照绑定加 fixture file-list，MCP 参数上限 100KB；真实 provider/schema/codec 仍未验。调查不重做底层连接或权限系统。

## 复用底座和下载口径

先查询 [Pi 包目录的 MCP 筛选](https://pi.dev/packages?name=mcp) 与 [deploy 筛选](https://pi.dev/packages?name=deploy)。高下载优先选择已有 adapter，不因低下载部署 skill 或 Web UI 包扩大平台范围。

| 包 | 查询时版本/许可 | 滚动月下载 | 公开接口与取舍 |
| --- | --- | ---: | --- |
| pi-mcp-adapter | 项目固定 5.1.0 / MIT；目录最新 5.2.0 | 1,608,890 | 固定版导出 `./host-managed`，已在项目使用 ready/close/extensionFactory 和真实 dispatch hook；公开 peer 接受当前 Pi 0.86。保持固定版，不升级。 |
| @netlify/mcp | npm latest 1.18.0 / 声明 ISC | 167,280 | 官方包提供本地 stdio 可执行入口；未声明公开 SDK exports，不因 CLI 形态否定其 MCP/headless 可用性。完整许可文件及发布包执行兼容性未另验。 |

下载为 npm 官方 `last-month` 返回的 **2026-09-10 至 2026-10-09** 下载次数，不是自然月或用户数。[adapter 下载](https://api.npmjs.org/downloads/point/last-month/pi-mcp-adapter)、[Netlify 下载](https://api.npmjs.org/downloads/point/last-month/@netlify/mcp)、[固定 adapter metadata](https://registry.npmjs.org/pi-mcp-adapter/5.1.0)、[Netlify metadata](https://registry.npmjs.org/@netlify%2Fmcp/1.18.0)。Pi 目录显示最新 5.2.0，不代表项目已换版本。[Pi adapter 详情](https://pi.dev/packages/pi-mcp-adapter)

## 两条相关路径

**Netlify 本地 MCP：真实上传入口，仍需窄适配和验收。** npm 1.18.0 的 gitHead 为 `47f7840709a4cddc1f984ec614443b5e92acafea`；本次按该 commit 阅读源码，未把移动 main 分支等同固定发布包。`deploy-site` 接受绝对 `deployDirectory` 和 `siteId`，由 MCP 回调实际 ZIP 目录并以 multipart 上传 `/sites/{siteId}/builds`，二进制原字节进入 ZIP，不塞入 100KB JSON。默认 grouped tool 为 `netlify-deploy-services-updater` 的 `selectSchema`，verbose 模式另有工具；生产注册仍须实际 `tools/list` 冻结 schema，不能凭文档拼名字。[固定部署实现](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/tools/deploy-tools/deploy-site.ts)、[工具注册](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/tools/index.ts)

它有三个关键边界：目录 glob 会排除若干名称，另会写临时 ZIP 和 `.netlify/state.json`，因此不能直接指向用户原成果目录；云端构建可能改变最后资产，返回 `deployId/buildId` 只是启动回执；源码未给 ZIP 总字节硬限额且把 ZIP 读入内存，不能宣称上传无限。现有 100文件/16MiB 快照界限仍保留。服务限额、取消后远端状态和最终逐文件字节一致性均待实验。[固定部署实现](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/tools/deploy-tools/deploy-site.ts)

**Netlify remote 与 Vercel remote：未证明完整包在 MCP 调用中上传。** Netlify remote 同名操作不接收目录/文件，而是返回带短期 proxy 的本机命令；不能把其工具成功当上线。官方文档同时支持 remote 和 local MCP。[Netlify 连接说明](https://docs.netlify.com/build/build-with-ai/agent-setup-guides/agent-setup-overview/)、[固定 remote 实现](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/tools/deploy-tools/deploy-site.ts)。Vercel 公开 `deploy_to_vercel` 文档未列全文件/二进制 schema；Slash 的客户端审核没有回执，不能借已批准客户端身份绕过。[Vercel 工具](https://vercel.com/docs/agent-resources/vercel-mcp/tools)、[客户端限制](https://vercel.com/docs/agent-resources/vercel-mcp)

Netlify/Vercel 官方 REST API 有文件清单或 ZIP 上传能力，但 **REST 能部署不证明官方 MCP 暴露相同输入**。Netlify REST ZIP 提取上限 25,000 文件，不可套用成上述 MCP `/builds` 的字节限额。[Netlify API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)、[Vercel 部署方式](https://vercel.com/docs/deployments/overview)。Cloudflare 官方通用 API/Code Mode MCP 不属于已核实的静态整包 codec，本轮不引入另一通用执行路径。[Cloudflare MCP](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)

## 下一步最小选择

优先仅验证 **Netlify 固定 1.18.0 本地 stdio**：从已有可信快照复制唯一封存 staging（不改用户原件），绑定全部字节、目标 siteId、真实 schema 和已授权连接；先确认其上传枚举/云构建配置确实能得到相同静态文件。需要适配候选当前尚无的受控目录传递，不把本机绝对路径本身当字节证明。之后再分别验实际 MCP 派发、ready、线上完整资产 hash、桌面/手机业务流程、取消/未知结果及不重发。若云构建无法保留字节，继续拒绝登记，不静默回落仅发布入口。

用户需明确目标 Netlify 账号/已有项目和发布授权；本地包优先读取已有 CLI 登录状态，未登录时可能主动运行 `netlify login`，所以当前不调用该工具。现有 Slash 手动 stdio 连接只传 command/args，没有 per-connection env 接线，不建议把 PAT 放到参数。官方 token 处理还会记录登录命令结果，其本机日志边界应在采用前核验。[官方本地配置](https://github.com/netlify/netlify-mcp)、[固定鉴权实现](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/utils/api-networking.ts)

本机 Node 为 24.15.0；官方说明要求 22+，固定代码最低检查 20，版本门槛可满足。当前没有项目安装的 `@netlify/mcp`，PATH 未发现 Netlify CLI；没有读取用户 token 缓存，账号/项目是否已有授权保持未知。因此本机下一步可以做批准后的独立包/schema/上传枚举检查，当前不能宣称真实远端可发布。[官方前提](https://github.com/netlify/netlify-mcp)、[固定兼容检查](https://raw.githubusercontent.com/netlify/netlify-mcp/47f7840709a4cddc1f984ec614443b5e92acafea/src/utils/compatibility.ts)

独立原始公开证据位于 `.test-data/static-mcp-publication-audit-017d5258-a2a7-49c3-915c-44ad0e549097`，含 URL、实际日期、状态码和内容 SHA-256，以及 npm 原 JSON、固定 commit 源码。没有实例或远端写入证据。

通俗解释：已经找到一个真正能把整个网页目录上传的官方 MCP，但“收到了文件、开始构建”还不等于“检查过的那份网页原样上线”。下一步应只验证这条路径，不为填满候选列表增加新平台。

## 固定发布包离线验证补证

2026-10-11 在独占目录 `.test-data/netlify-fixed-offline-validation-42d4abd4-a4ef-420e-9193-f9ef623b8bbf` 完成批准的发布包检查；根源码、依赖、配置和真实账号/profile 均未修改或读取。包 `@netlify/mcp@1.18.0` 为 23,872 字节，registry SHA-512/SHA-1 均相符，gitHead 与前述固定 commit 一致。发布物仅含 JS、README、package.json 三文件，隔离安装前后这些字节完全不变；声明 ISC，但发布物及该 commit 完整树没有 LICENSE 正文，因此没有独立验证许可条文。未验证 registry 签名或 provenance。三段部署函数经现有 esbuild 去除 TypeScript 类型后，规范化 AST 与实际发布 JS 相同；不把这一点扩大为全部模块等价证明。

**实际 stdio schema 已捕获。** 独立 HOME/USERPROFILE/cache、空 npm 用户/全局配置及最小环境运行原发布 JS；SDK server/core 固定 2.2.0，archiver 7.0.1，其他包按声明范围解析并在独立 lock 封存（zod 实际 4.6.5，不能声称是原发布 CI 依赖快照）。只发送 initialize、initialized 和 tools/list，得到 9 个工具，子进程 exit 0。启动实际请求公开 `https://www.netlify.com/context-files/manifest.json`（GET、200、无 Authorization/Cookie）；不是全程无网络。没有任何 tools/call、CLI 登录或部署。真实 schema 确认 `netlify-deploy-services-updater` → `selectSchema.operation='deploy-site'`、`params.deployDirectory`、可选 siteId；没有 no-build 参数。stdio 第一尝试因审核脚本 Windows --import 未使用 file URL 而失败，原日志保留；修正的是独立审核脚本，不是发布包。

**ZIP 与字节检查已通过，但不是上传验收。** 从原包 AST 提取实际 zipFiles/prepareZipUpload/zipAndBuild 三段声明，使用真实 archiver 7.0.1 和本地文件，传输函数仅离线捕获并明确返回合成 ID。五个文件（HTML/JS/CSS/含中文路径的 PNG 二进制/合成 .env.production）ZIP 解压后的 SHA-256 与原字节全等；八项原排除路径没有进入 ZIP；multipart 中的 ZIP 字节及 Content-Length 相符。真实函数创建 `.netlify/state.json`、保留已有 siteId/其他字段，删除本次临时 ZIP，并未改原五文件内容。`.env.production` 被包含，不能把只排除 .env 当完整敏感文件保护。

**采用判断：可保留为整目录二进制 codec 候选，不可直接登记为免构建静态发布的默认 provider。** 实际包仍 POST multipart ZIP 至 `/sites/:id/builds`；官方直接静态 ZIP 文档是 `/sites/:id/deploys`，两者不能混称。无构建参数、空构建站点的行为、服务体积上限、真实上传/ready/线上逐文件 hash、取消与未知结果、符号链接/重解析边界都未验证。没有 cloud-ready 回执，也没有账号登录。[官方直接 ZIP API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)

本次完整报告 `audit-report.json` SHA-256：`9fe9f215cfd075707b0b5420ddd4459dd3a8eaf70eafc3a60df59fa61c84ff3f`；封存 `seal.json`：`7789dfe13cac64431359d2a1fdef6e26926621244846c302ba4142514937fce5`。其中包含原包、独立 lock、真实 MCP schema、公开请求、合成 ZIP、状态写入证据与失败历史。没有新增 adapter 或 provider registry 项。

通俗解释：官方工具确实能打包整套网页，包括图片，但它会走云构建、改目录状态，还可能带上未排除的环境文件。现在证明的是“包和接口可用”，尚未证明“这份合格网页安全、原样上线”。

## 不构建的最小复用选择

2026-10-11 后续只读核验固定源码：**官方 MCP 1.18.0 未提供直接 `/deploys` 的静态目录操作，也没有公开 SDK exports 或外部工具注册扩展点。** 原有 Pi adapter 是 MCP 客户端，不能把一个 CLI 命令自动变成 MCP 工具。推荐保留官方 CLI 为发布引擎，仅评估窄 MCP 桥接；不是把 CLI 回执登记成 MCP 成功，也不重新实现目录哈希、上传及部署轮询器。本阶段未实现桥接。

查询固定 `netlify-cli@27.12.0`（commit `e137887a52f062f8cd24bf8bbd5f9160db9a3ef4`）与 `@netlify/api@15.1.2`（commit `aaee524cfed2fc082e6cb7268ce7230071b39068`），均声明 MIT，并已读取对应源码许可正文；本轮没有下载安装或运行这些包，不能宣称发布物执行验收。滚动月仍为 2026-09-10..2026-10-09：CLI 1,834,734，API 2,085,404 次。先查询了 pi.dev/packages?name=netlify。现在 npm `netlify@27.12.0` 是 CLI/兼容 API 别名；维护中的独立客户端为 `@netlify/api`，不要依据历史网页安装旧目录 SDK。[固定 CLI 文档](https://github.com/netlify/cli/blob/e137887a52f062f8cd24bf8bbd5f9160db9a3ef4/docs/commands/deploy.md)、[固定 SDK](https://github.com/netlify/build/blob/aaee524cfed2fc082e6cb7268ce7230071b39068/packages/js-client/README.md)

建议引擎公开接口为 `netlify deploy --no-build --dir <宿主封存目录> --site <已确认现有siteId> --json --message <宿主关联标识>`；默认 draft，只有明确选择替换生产才加 --prod。凭据将来须经安全环境传入 NETLIFY_AUTH_TOKEN，不能放参数/模型提示；缺凭据不得自动登录、匿名发布或创建新站点。固定源码证明 --no-build 跳过 build，随后创建 deploy、生成目录 digest、上传 required 文件并轮询 ready；但仍处理配置、functions/edge 与内部配置文件，因此要隔离工作目录并真实核对上传完整集合，不能只凭 --dir 推断恰好五文件。[固定部署调用链](https://github.com/netlify/cli/blob/e137887a52f062f8cd24bf8bbd5f9160db9a3ef4/src/commands/deploy/deploy.ts)

SDK 提供 `new NetlifyAPI(token)` 和 createSiteDeploy/uploadDeployFile/getSiteDeploy 等公开低层方法；7.0 起移除了整个目录部署高级方法。自己重建目录枚举、哈希、缺失文件上传和轮询不作为优先复用。其 node-fetch opts 可传 body/header/signal；直接 ZIP 经 opts.body 的可行性只有源码推断，尚未做请求体捕获，不能把 JSON 中 binary 字段当已验证编码。[SDK 接口与移除说明](https://github.com/netlify/build/blob/aaee524cfed2fc082e6cb7268ce7230071b39068/packages/js-client/README.md)

重试按阶段区分，而非全面否定：

| 阶段 | 已核证据 | 采用前缺口 |
| --- | --- | --- |
| 创建 deploy | SDK 对 429、ETIMEDOUT、ECONNRESET 最多初次加五次重试，含 POST；未找到公开关闭参数 | 响应丢失可能已经创建。薄桥不能只“不重启 CLI”就避免内部重发；须先得到公开按操作关闭重试/受控单次传输接口，或验证等效防重发机制。否则停在真实写请求前。 |
| 同一 deploy 的 missing 文件 | 官方 digest 文档明确允许超时后有限重试上传；CLI 用 known deployId、路径、原 SHA1 列表上传字节 | 仅同 ID/路径/hash 的内容寻址上传可按此依据评估；不能扩大到创建 POST、ZIP 新建、变更字节或 401 撤权后继续写。 |
| CLI 上传重试 | 内部 maxRetry=5，但公开 deploy flags 无对应参数；零值还被内部 guard 拒绝，调用侧不传值。除 400/422 外会重试包括 401 的错误 | 不能靠一个假设的环境变量/CLI flag 声称已关闭。鉴权失败停止及撤权/取消边界仍需实际离线反例。 |
| GET 状态核对 | getDeploy/getSiteDeploy 与 listSiteDeploys 可复用 | 这是只读核对，不创建新部署；关联标识的单一匹配不是平台幂等保证，零/多匹配仍 unknown。 |

SDK signal 进入 node-fetch，但 retry sleep 是普通 setTimeout，不监听取消；因此不能声称取消立即终止。CLI 普通错误 catch 在已知 deployId 时调用 cancelSiteDeploy，而取消 helper 会捕获警告并返回；尚未发现部署链绑定 SIGINT→云端取消。最终 --json 只在 ready 后输出，没有公开逐请求/首个创建 ID 的稳定增量 JSON。强杀本机 CLI 不代表取消远端任务。恢复须分别证明 Windows 子进程树已终止、GET /deploys/:id 或 /sites/:site/deploys/:id 的真实状态；取消 POST /deploys/:id/cancel 也要再读取结果，失败/未知不自动重发。[固定 SDK 重试](https://github.com/netlify/build/blob/aaee524cfed2fc082e6cb7268ce7230071b39068/packages/js-client/src/methods/retry.js)、[CLI 上传重试](https://github.com/netlify/cli/blob/e137887a52f062f8cd24bf8bbd5f9160db9a3ef4/src/utils/deploy/upload-files.ts)、[取消 helper](https://github.com/netlify/cli/blob/e137887a52f062f8cd24bf8bbd5f9160db9a3ef4/src/lib/api.ts)

最小完整链仍是：现有质量门禁和完整快照 → 宿主唯一封存目录/已授权目标 → 真实注册的窄 MCP 工具 → 固定官方 CLI no-build → 持久创建/上传/轮询阶段和 deployId → 本机终态与云端 ready/unknown 分开 → API 原上传文件 hash 和实际 immutable URL 全资源/业务核对 → 最终绑定回执。官方说明公开 URL 的 HTML 可能经过后处理，API 原上传文件才是原字节；CLI exit 0/ready 不能代替文件一致性验收。[官方 digest 上传与文件核对](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)

因此下一步可做隔离 schema/请求体/阶段/取消验证，**在创建部署内部重发尚不可控制前，不接通真实写请求，也不登记生产 provider**。将来需要用户明确账号/team、现有 siteId、draft 或替换生产、公开范围及凭据存放方式；当前不提问、不读账号缓存。独立报告目录 `.test-data/netlify-static-reuse-audit-69181ad4-5c68-453b-a576-6439ed5fed6d`；audit-report SHA `d83edae1fc6380efd5f65a832769a6ebbf7e3784e9791d05246e16919adbbd97`，seal SHA `cd9942bfb3ad13aac6f0853ba61165be5db2d28bb6118c24138021582bf90ffb`。原 404 与报告生成脚本语法失败原件均保留。

通俗解释：可以复用官方“直接上传网页”的引擎，但还缺一个真正的 MCP 接口和“失败时不要重复创建”的可靠控制。先把这两点离线验证清楚，再接真实账号；已有网页和发布记录都保留。

## 单次 draft 清单接口的隔离 proof

2026-10-11 经父审批准，仅在 `.test-data/netlify-direct-zip-contract-a0fca770-db4c-4a5b-89da-d9a5015a111c` 做定向适配实验。官方 MCP 缺免构建工具、固定 CLI/SDK 创建 POST 内部重试不能公开关闭；raw ZIP 的 draft 编码未获明确官方契约证明，因此改用已有官方 JSON `files`/SHA1 清单加 `draft:true`、按 `required` 上传 raw bytes、按已知 ID GET 状态。没有再造目录扫描或 ZIP 引擎。固定 `@netlify/open-api@2.60.0` commit `065567609ce5b47bd210876b86460c659d077d3c` 的源码与实际发布 tgz 相关合同投影一致；包 65,065 字节、registry SHA512 相符，签名/provenance 未验证。[固定官方合同](https://github.com/netlify/open-api/blob/065567609ce5b47bd210876b86460c659d077d3c/swagger.yml)、[官方 digest/draft 说明](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)

可执行 schema 先于代码；复用 Pi adapter 5.1.0、现有 SDK/受控 fetch 和原封存五文件 ZIP，沿用 100 文件/16MiB 上限，新增官方要求的 SHA1，内部 SHA256 绑定保留。工具只收宿主交付 binding/attempt，不能传 URL、token、任意目录/site/deployId。实际 stdio→本机 HTTP 第三轮 **9/9、17,682.8086ms、exit 0**：五文件及中文 PNG 原字节、缺失 hash 定向上传、未知 hash 拒绝、响应丢失不重复创建（含进程重开和换 attempt）、401 不重发、错误 site 的响应 ID 不能触发 GET、100KB 流读取上限，以及真实 MCP 取消后保留已知 ID/状态并关闭上传 socket。11 个夹具的子进程 PID 均已不存在，本机 HTTP 均关闭。服务端 ready 是合成结果，不是云端验收。

原 **1/7** 保留：错误地拒绝 ZIP 的空目录项导致启动失败，测试 HTTP 资源泄漏，已核身份后终止该独占测试子进程。原 **8/9** 保留：测试误期待客户端 Promise 拒绝，实际服务端严格 schema 返回 isError、HTTP 零派发，已修断言。YAML 误作 JSON，以及已发布 spec 内联 `$ref` 导致字面比较失败的原件也保留。根复用源码/依赖 hash 前后相同，没有账号、登录、付费模型、云发布或生产注册。

**此实验仍不可直接启用生产。** 当前仅夹具逐 await 顺序调用；Pi 底座并不禁止并发。并行 status 可把旧 uploadedPaths/uploadsComplete 追加成最后状态；claim 落地至首日志写入间的重复 create 可读到 ENOENT（独占 claim 仍挡第二次 POST）。下一最小生产候选须复用已有 Operation/资源锁，以 binding 串行或 revision CAS 保护进度及跨进程未知结果，不能把实验 JSONL 变成第二套产品状态。真实权限/凭据、账号目标、draft 可见性、费用、云 ready、公共页面后处理与完整资产 hash、云取消和业务流程均未验证。合成 `.env.production` 仅测试字节保留，不是批准发布真实环境文件。

报告 SHA `0047e93e412ef00cd351adf39d8a45eb42877f6130213c7d82090be52c9d4490`；四新增实验文件 patch SHA `8aaffccc4b8fc1ecfce3d9f76e786885db3711edea78aed1e9226207edf30a73`；seal SHA `1bea556021bc0bdd965666573c1162f5112085fedf82aad71d2c7f87244c70c7`。封存的文件和协议不会回填任何旧云试次。

通俗解释：已证明在本机“只创建一次、只传检查过的字节、取消不丢记录”可以工作。真正接账号之前，还要让同时发生的操作不会相互覆盖状态，并检查云端拿到的网页是否仍是原来的那一版。

## 宿主Operation与私有stdio并发补证（隔离候选）

2026-10-11 独占 `.test-data/netlify-host-operation-candidate-79c7d7b4-f8b6-422a-bac9-d286459bdfb4`，根 Store 原 SHA `423851e7fc7645b377f1ae935b3b46118ad71142f2d58c061790d367290216ae` 及复用底座/配置/依赖不变。八文件候选只修改 Store 两事务方法，并新增可执行receipt schema、宿主领域、单次HTTP阶段worker、私有stdio与测试支持。claim/首Operation/recovery在既有SQLite同事务提交，CAS精确匹配binding/op/run/tool/scope/request/旧结果；没有新表/迁移，也没有搬入旧实验JSONL。真实子进程不持有宿主Store。

最终定向 **13/13、105127.824ms、session85551 exit0**；独立tsc session24106 exit0，三个mjs nodecheck通过。实际两个宿主进程同binding只产生一次create POST，一次stdio会话完成四个唯一SHA1上传（五个合法网页路径，其中两个PNG原字节相同）；status与upload真实交错不回退进度。上传期间收到ready只记观察，全部ACK后必须发起新GET才能结算。GET派发前先写started，回复以CAS增量合并confirmed；两个并发GET都保留增量，ready之后同terminal状态只补事实，既有settled recovery不重写。GET丢响应重开仅GET，started=2/confirmed=1仍可凭新真实ready核对，计数相等不是完成依据。取消、错site/非法ID、同hash重复调用、创建或上传响应丢失均不重发；12个本机HTTP夹具和全部stdio进程实际关闭。

原8/9冷启动观察窗失败、10/11旧早ready断言失败及改前11/11均保留。本候选checkpoint worker是在首事务后正常退出，不能扩称断电/强杀/SQLite锁争用已验证。seal SHA `3869f1cc3b3f87aadf836a91ebc6e9cf62644b2d4102834a44e24db5caca5d37`，相对patch SHA `14bd7d776d6a2f10cb2bf6487e0bd8b0b121002dd98d312d83989c4016b0441a`，report SHA `9a5e05d09bcb3f3443563850fc4bfa4092179776f7a145c771e47eac250da2c7`。`checks-evidence.json`记录实际命令并纠正不可变report命令标签漏写.test-data前缀，原seal/report不覆盖。

**不直接生产注册。** fixture入口仍需TSX、普通JSON里仅有合成token、写evidencePath；真实PAT不准沿这条fixture路径。后续须编译JS私有入口、既有加密vault/短生命周期白名单环境注入，普通连接不能放开fixtureOrigin/evidencePath。真实Service守卫、批准外部action、来源/成果版本、credential/site配置尚未接；常规root测试也不能依赖前一隔离ZIP。`integration-design.md`和`integration-topology.mmd`列出了复用位置及具体缺口：自身may_have_run不能把自身派发永久阻断；production recovery.scopeHash要用授权指纹，不能混用publication binding；现run-recovery追加文本会破坏typed receipt，需保留结构；私有三phase工具不能冒充已注册整项目公开工具。真实账号/云ready/公开网页质量/云取消仍未验证。

通俗解释：现在证明了“两次同时点击也只创建一次，检查状态不会把上传进度抹掉”。它仍是离线候选；接进应用时还要用现有审批和安全保存账号的机制，不能把测试配置直接拿来发布。

## 私有编译入口、加密凭据与链接交付（已合根，定向复验已完成）

独占目录 `.test-data/netlify-private-entry-candidate-0244aa7f-6fd7-411b-b838-6f84155a9687`；代码及检查配置为 GPT-6.1 Sol / High。最终 `production-seal.json` SHA `28885931037db4321df28a6a9e6733fdc977808acff8737f2a06779d12da088c`，28 文件根基线相对总补丁 SHA `c31bbead58883c5a7271c4194566c20e27f97e3543bd9569b8c014cf64922478`，报告 SHA `d277c83b08084f56c236a2642098117b684e02608e2db2378ebcc7e2d92b8cd9`。源文件逐项原/新 hash 位于 `production-final-files.json`；`final-source/` 是可审阅最终快照。总补丁已包含 Store → 修订 Service → private 三层最终逻辑，不可再依次叠加旧层后套此根基线补丁。

继承 Service `word-preserved-seal` 身份 `6d370b406ff4a963894c7da44dc9f894147f87a85ec937d72ab70fc2acb7864a`。错误撤回 Word 功能的 `090308...` seal 保留为 rejected，不可集成。本次相对补丁无 Word 相关删除/旧 mammoth 回退；五个 Word 支持文件与根 byteExact，Service.readWordDocument 文本与根一致，shared.DocumentContent.wordPresentation 保留。

新增 `main/netlify-static-{bootstrap,private,site,stdio}.ts` 和 `shared/netlify-static-private.ts`；复用原 Pi MCP、受控 fetch、加密 vault 和 Operation，没有新依赖。生产入口为编译 JS，固定官方 API、固定 site、draft:true；token 只在短生命周期子进程白名单环境，不进 argv、快照、State 或模型工具。快照目录先限制 ACL，lstat 与实际 Buffer 双重 24MB 上限，身份 hash 后再解析；状态恢复仅携带已核 ID/小型绑定信息，不保存整组 bytes。撤权在每次派发前后检查。启动 await 与 invalidate 交错中，迟到 handle 仍被 close，关闭 Promise 复用并在子进程释放 cwd 后清理自有目录。

既有连接编辑器新增固定 Site ID 的发布类型，凭据保存/核对/断开沿受信任 IPC。没有凭据或没有明确站点核对时发布不可用；模型不能增改目标配置，也不能直接调用私有 phase。UI 不回显秘密、不自动访问发布链接。站点核对与普通工具健康状态分开，私有卡片不再同时显示“未检查”；ready 改为“部署已就绪”。连接/站点/call 与会话状态按 scope 实例绑定，往返相同 ID 不复活旧快照；迟到成功、失败、finally 与旧 reload 不污染当前页面。

链接是交付判据：仅已绑定 site/deploy 的官方 GET ready 响应可补 HTTPS 无凭据 URL；不猜域名格式，不自动打开。ready 无 URL 保留事实但说明链接交付未完成。旧已结算 receipt 无 URL 可以 GET-only 补链接，绝不重发 create/upload，不重写旧 settled recovery。

检查分别记录，不能混称远端通过：
- Node/renderer 定向 tsc exit 0；根基线 git apply --check exit 0。
- 新自包含编译测试 **17/17、14062.3549ms**。测试自行创建项目内唯一编译目录并清理，不依赖旧 .compiled、调用者 TEMP、真实资料或账号；覆盖 vault、purpose、白名单环境、固定站点核对、撤权、24MB Buffer、真实 compiled stdio、真实 Electron-as-Node 工具声明/关闭、启动交错与取消 GET。
- 旧操作并发/恢复用例在 HTTPS 合成链接 fixture 下 **13/13、45812.606ms**，原 CAS/未知/单次 create/GET audit 断言保留。
- 实际 Service→Pi stdio→本机 HTTP 链接专项 **1/1、20139.9659ms**。业务/视觉事实由明确标识的合成测试预置，不是真人或真实云验收。
- 实际 Edge 组件正常操作 **5/5**、迟到响应 **6/6**；四份真实应用 CSS、pageErrors[]，页面截图在 ui-evidence/ 与 ui-evidence-races/。管理响应为 synthetic IPC，不能称完整 Electron IPC 或真实站点核对通过。

原 14/15、CIM 匹配夹具失败、子进程 cwd 清理失败、TS18003 Windows glob 失败及未加载应用样式的原 UI 证据均保留。真实 Electron-as-Node 子进程不是完整应用设置链；下一窄验证在独立 profile 上复用已编译主进程/真实 preload 与 renderer，通过 window.pm 保存合成凭据、读取状态、关进程、重开、断开与页面回读，不发真实 API。无凭据 verify 仅检查派发前拒绝；正向站点 verify、真实账号、云部署/URL/网页完整字节与业务质量、云取消、强杀崩溃及第二台 Windows 均未验证。

通俗解释：测试已经证明账号秘密能按现有加密机制保存，发布记录不会被旧请求串到别的站点或会话，部署完成后仍要拿到实际链接才算交付。真正接你的 Netlify 账号和云端发布尚未执行；隔离测试不会碰现有项目或账号。

### 同一封存后的完整 Electron 管理 IPC 补证

`production-seal.json` 保持 SHA `28885931037db4321df28a6a9e6733fdc977808acff8737f2a06779d12da088c` 与 28 文件最终源码不变。仅运行候选内证据脚本 `scripts/private-publisher-desktop-proof.mjs`：实际编译主进程/preload、实际 App 与连接设置页、独立空白 profile、Windows safeStorage，不替换 window.pm、不伪造管理 IPC 返回。**5/5、session5455 exit0**：UI创建固定站点连接并保存合成凭据；SQLite仅存加密行（证据只有hash/长度），State不含秘密、密码输入清空；正常关宿主重开后凭据可解密但仍未核站点；实际断开IPC后无凭据verify在fetch前拒绝；第三个宿主重开页面仍显示未连接。

补证目录 `desktop-management-d179b162-ebc8-48fd-bcb3-6d2441eb573d`，实际宿主 PID 19236、6696、18940 均已退出，pageErrors[]、rendererOutsideRequests[]。renderer请求观察不是全进程网络拦截声明。此用例没有正向调用官方站点API、登录、模型请求或云部署；正向verify/真实账号/真实链接与云端质量仍未验证。原首轮隐藏profile路径夹具失败（保存前，PID9852已关闭）在 `desktop-management-attempt1.log` 与 f354eb5d 目录保留。新证据另封 `desktop-management-proof-seal.json`，不回写原production报告的历史“待桌面补证”观察。

通俗解释：除了组件测试，现在已用真正的桌面程序验证“保存账号秘密、关掉再打开、断开后不再连接”。站点是否真的能访问、是否真的发到网上，仍要用你实际选择的账号和站点验证。

# Pi 高下载包复用审计

查询日期：2026-10-08。用户要求：优先采用 pi.dev/packages 中高下载现成模块，不先从零实现；重要且符合 PM 工作的遗漏能力可以补入。已写入根 AGENTS.md。本文是选型与接入顺序，不是安装或集成成功记录。

## 筛选口径

以目录显示的月下载（/mo）排序；本次优先看5万/月以上，1万至5万/月仅保留高度相关候选，1万以下不推荐。这是本轮工作筛选阈值，不是用户给定数字或成熟度认证。下载不是独立用户数，版本、公开接口、许可证和宿主适配仍需核对。没有安装、执行或自动启用下列包。

## 对照 Slash 的能力

| 优先级 | 模块 / 月下载 | Slash 对应项 | 采用判断 |
| --- | --- | --- | --- |
| 1 | [pi-web-access](https://pi.dev/packages/pi-web-access) 603.4K | 资料研究、网页搜索、抓取、来源检查 | 优先直接接其本地stdio MCP服务，配置选定搜索服务；不另写多搜索源和网页提取内核 |
| 2 | [pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter) 1.5M | 新建的MCP发现、调用、连接生命周期 | 用公开SDK/host-managed接口定向复用；桌面凭据、审批及发布流水需要适配，避免双重注册和两份配置 |
| 3 | [pi-subagents](https://pi.dev/packages/pi-subagents) 583.4K | 当前phase3主要是单工具授权/调度，尚非完整子Agent | 优先复用子运行、独立上下文和并行执行；父Run权限、取消、目录及结果合并仍由Slash约束 |
| 4 | [pi-lens](https://pi.dev/packages/pi-lens) 106.8K | HTML/JS原型代码检查 | 复用诊断和语言工具，不自写LSP；接入草稿临时目录。不能把代码诊断通过当作视觉或业务通过 |
| 5 | [@plannotator/pi-extension](https://pi.dev/packages/@plannotator/pi-extension) 119.8K | Plan确认、逐段批注、修改意见 | 优先复用计划评阅能力；适配Slash已有研究型Plan和会话UI，不再独立做另一套批注系统 |
| 6 | [@langfuse/pi-observability-plugin](https://pi.dev/packages/@langfuse/pi-observability-plugin) 293.3K | 复杂任务耗时、token、失败链排查 | 复用观测采集；官方仍标experimental，先锁版本和隔离验证，不能默认上传用户全文/图片 |
| 候选 | [pi-goal-x](https://pi.dev/packages/pi-goal-x) 142.5K | 长任务持续推进、完成核查 | 与Run/验收重合，复用其调度与审计前先防止双循环和模型自行宣告完成 |
| 候选 | [pi-background-tasks](https://pi.dev/packages/pi-background-tasks) 109K | 长进程与后台只读任务 | 与pi-subagents二选一或明确分工；不同时堆多套后台运行器 |
| 候选 | [@gotgenes/pi-permission-system](https://pi.dev/packages/@gotgenes/pi-permission-system) 58K | 权限规则及执行限制 | 查看其策略实现可复用部分，不替换Slash原件只读、ChangeSet与已发出外部动作的事实记录 |
| 候选 | [pi-memory](https://pi.dev/packages/pi-memory) 40.4K | 跨会话记忆、知识检索 | 其qmd检索值得复用；先核对与项目隔离、已确认知识规则及云问答部署方式的适配 |
| 暂不接 | [billion-context](https://pi.dev/packages/billion-context) 646.5K | 长上下文压缩 | 与已复用的Pi原生压缩重合，不同时叠压缩；只有真实任务证明不足再比较，许可附加署名要求需保留 |
| 暂不接 | [context-mode](https://pi.dev/packages/context-mode) 92.9K | 大工具输出与会话检索 | 不是Supabase向量问答服务；发布许可Elastic-2.0，不按MIT云服务依赖处理 |

下载量来自各目录详情页。Langfuse实验状态来自其README；压缩比例和质量数字是作者声明，本项目未复测，不转述成Slash效果保证。

## 可复用性核对

当前实际安装 `@earendil-works/pi-coding-agent` / pi-ai 为0.86.1。`main/agent.ts`显式设置noExtensions，但Pi仍支持显式extensionFactories/additionalExtensionPaths。无需为了可信模块打开任意项目扩展发现。`main/tool-catalog.ts`固定注册数量校验、工具组及Plan策略必须一起适配；只安装npm包不会自动让Slash正确调用。

`pi-mcp-adapter@5.1.0`、`pi-web-access@0.37.0`均为MIT，公开peer范围容纳当前Pi版本。这是声明兼容，不是运行验证。

[adapter公开嵌入文档](https://github.com/nicobailon/pi-mcp-adapter/blob/main/docs/extension-api.md)提供`createHostManagedMcpAdapter`、ready/close/extensionFactory、审批broker和至多一次dispatch，区分not_sent与may_have_run。它要求宿主提供transport，且host-managed路径不负责OAuth/钥匙串、未提供现有服务商确认handler；因此现有`mcp-oauth`/`mcp-elicitations`不能在没有替代证明时直接删掉。它的新SDK2依赖与Slash SDK1须边界隔离，不能强行传不兼容transport。

web-access官方提供无需Pi的stdio MCP入口及web_search/fetch_content/get_search_content/source_check，可通过Slash当前MCP工具网关复用。必须使用固定版本、隔离配置及工作目录，禁用不需要的provider自动回退和图片/视频等能力。它的MCP模式不包含全部Pi UI与订阅能力；搜索结果缓存仅进程内，引用回执仍由Slash持久化。

## 知识库判断

pi-memory是本地Agent记忆，context-mode是工具输出/会话文本检索，billion-context是上下文代理压缩；没有证据证明它们可直接替代带授权、发布版本和引用回执的Vercel+Supabase问答。目录knowledge/vector/rag检索中，直接对题的pi-knowledge约2.3K/月及其他数百/月包不纳入推荐。

这不意味着自行实现检索内核。下一步先核对高使用量包所复用的检索底座及Supabase官方能力，再补Slash的资料选择、版本和网页适配。保留Vercel+Supabase部署目标，不擅自换成只能本机访问的记忆界面。

## 当前未完成代码与验证边界

用户转向生态优先时，新增知识库实现已停止扩展并保留。`main/knowledge-base.ts`、`knowledge-settings.ts`、shared契约和资源内集合UI已接线，根`npm run check`通过；尚无完整专项/桌面/真实向量验收。`knowledge-web/`为独立未完成骨架，独立typecheck通过，但无可运行网页/API/发布链；CLI生成的迁移文件为空，SQL未执行，不可部署。根包没有引用其独立依赖。

未构建新知识库产物，未使用云模型/向量服务，未部署或上传资料。向量模型信息由用户后续提供。下一步以本清单的现成模块优先，不继续无依据扩写自研通用层；原输出质量长期目标继续保留。

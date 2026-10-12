# Pi 上下文与记忆包选型复核

查询日期：2026-10-08。范围：复核 [上一轮审计](pi-package-reuse-audit-2026-10-08.md)，按 pi.dev/packages 月下载优先筛选上下文、记忆及相关遗漏能力。版本取查询时 npm registry 的 latest，再固定到表中版本；目录可能缓存旧版本。此次只下载 npm 发布物供静态阅读，未安装、导入或执行包，未修改产品代码，未上传项目资料。

## 结论

最小组合是 **Pi 0.86.1 原生压缩 + 一套经过项目隔离的长期记忆**。当前继续使用原生压缩；长期记忆首选评估 `pi-memory@0.4.2`，通过隔离与权限验收后接入。大工具输出确有不足时，再增加 `context-mode@1.0.169` 的受控索引/搜索子集。不要同时叠加多套压缩器、多个记忆库或另一个执行器。

`pi-memory` 是候选，不是本轮已接入成果。`billion-context`、`billion-context-pi`、Blackhole 暂不默认启用；没有真实任务对照证据支持替换已有压缩。所有这些包都不能直接代替面向同事的 Vercel + Supabase 问答网页。

通俗解释：压缩负责“聊天太长时整理前文”，记忆负责“下次聊天还能找到重要信息”，工具输出索引负责“日志太长时只找需要的部分”，云知识库负责“让同事访问已发布资料”。四件事应分清，避免重复存储和互相干扰。

## 下载、固定版本与接入判断

月下载来自各包 Pi 目录详情页；不是独立用户数，也不是兼容性认证。本次不推荐低于 1 万/月的包。下表除特别标注外均读取了对应 npm 发布包的 manifest、README 和可用 LICENSE。

| 包 | 月下载 | 固定版本 / 许可 | 用途与判断 |
| --- | ---: | --- | --- |
| [billion-context](https://pi.dev/packages/billion-context) | 646.5K | 0.1.188；MIT **加附加署名条款** | 本地模型流量代理与分层上下文压缩。涉及请求路由、服务生命周期和原生压缩所有权；当前不接默认路径。 |
| [context-mode](https://pi.dev/packages/context-mode) | 92.9K | 1.0.169；Elastic-2.0 | 大工具输出保存在 SQLite FTS5 中，按需检索；有 stdio MCP 和 Pi 扩展。可评估隔离 MCP 子集，不直接开启其代码执行/抓取及全套 Pi 工具改路由。 |
| [billion-context-pi](https://pi.dev/packages/billion-context-pi) | 66.2K | 0.1.83；发布包 LICENSE 为标准 MIT | Pi 进程内 `compress/decompress/search_context`，接管会话压缩；与原生压缩及 billion-context 代理方案互斥选型。暂不启用。 |
| [pi-memory](https://pi.dev/packages/pi-memory) | 40.4K | 0.4.2；MIT | Markdown 长期记忆、日记、便笺及 qmd 搜索。下载优先的记忆候选；必须隔离后接入，不能直接全局载入。 |
| [@moyai/pi-session-hoarder](https://pi.dev/packages/@moyai/pi-session-hoarder) | 37.8K | 0.2.0；Apache-2.0 | 本地内容寻址会话归档，并带 S3 相关依赖。归档不是知识确认或语义记忆；Slash 已有会话持久化，本轮不重复建设，不默认云备份。 |
| [pi-cache-optimizer](https://pi.dev/packages/pi-cache-optimizer) | 28.6K | 2.8.21；MIT | 提示词/KV 缓存稳定性与缓存诊断，帮助减少重复请求成本；不增加模型窗口或提供长期记忆，先观察真实缓存问题。 |
| [gentle-engram](https://pi.dev/packages/gentle-engram) | 23.1K | 0.3.0；npm 声明 MIT | 可选本地 Go 服务 + SQLite/FTS5，有 HTTP/MCP 接口及可选 Cloud。服务边界适合隔离，但增加独立二进制与服务管理；作为 pi-memory 的替代候选，不并装。发布包根目录未包含独立 LICENSE，采用前补核对应核心发行许可。 |
| [pi-hermes-memory](https://pi.dev/packages/pi-hermes-memory) | 23K | 0.9.10；MIT | 本地 SQLite FTS5、全局/项目两层记忆，默认仅注入策略、按需搜索，含敏感信息扫描。若 pi-memory 的隔离适配成本过高，可二选一；需核 Electron/Node 原生 SQLite ABI 和全局记忆权限。 |
| [pi-blackhole](https://pi.dev/packages/pi-blackhole) | 12.7K | 0.5.11；MIT | 合并结构化压缩和观察式记忆；默认接管压缩并运行三个额外模型 worker。虽然能关闭压缩接管，仍重叠且增加调用成本，本轮不推入默认组合。 |
| [om-memory-system](https://pi.dev/packages/om-memory-system) | 10.6K | 4.13.3；MIT | 自动后台记忆、历史导入、跨项目用户画像及本地嵌入模型。依赖和自动行为更重，README 明确 Windows 验证较少，本轮不优先采用。 |
| [openwiki](https://pi.dev/packages/openwiki) | 169.1K | 0.7.1；MIT | 代码库文档生成/维护 Agent，是相关高下载遗漏项，但不是 PM 资料发布问答或通用长期记忆的替代品；引入另一 Agent 栈，当前不扩范围。 |

以上 Pi peer 声明：pi-memory `>=0.81.1`、Hermes `>=0.80.6`、cache-optimizer `>=0.82.0`、Blackhole `>=0.85.1 <1.0.0` 均容纳当前 0.86.1；billion-context-pi / Engram / OMMS 为宽泛声明。context-mode 有 Pi 适配器但没有 peer 约束。**声明容纳不代表已完成 Slash 的嵌入验收。** Node 下限：pi-memory/hoarder 22.19、context-mode 22.5、billion 两包 20、OMMS 22.14、openwiki 22.22；运行时与独立子进程应分别核对。

## 与现有实现的冲突和适配缺口

### 原生压缩继续作为唯一默认机制

`main/agent.ts` 已通过 Pi 的 SettingsManager / AgentSession 负责估算、自动压缩、溢出恢复及取消，订阅真实 compaction 事件。`main/session-compaction.ts` 只在未显式覆盖时调整近期保留量，不另写压缩算法。既有真实服务验收见 [Pi 原生上下文记录](pi-native-context-2026-10-05.md)。

静态核实 `billion-context-pi@0.1.83/dist/index.js` 的 `wireCompactionDisable` 在 `session_before_compact` 返回 `{cancel:true}`；它会改写上下文并保存 ACP 状态，并非安装后与原生压缩自然叠加。`billion-context` 的 native Pi 入口又是代理方案；官方文档明确 native 与独立 billion-context-pi 互斥。若将来对照实验，应只在隔离副本切换，核对恢复、取消、压缩状态、模型协议和原会话保存；压缩比例及“一亿/十亿上下文”不能当作实际模型容量或本项目效果保证。

### pi-memory 的必要隔离

固定发布物 `index.ts` 显示：默认目录是 `~/.pi/agent/memory`；`PI_MEMORY_DIR` 覆盖路径在模块加载时解析；`MEMORY_DIR` 及相关路径是模块级可变状态。它直接调用文件系统，并将 MEMORY、SCRATCHPAD 与近期日志注入每轮；qmd collection 名固定为 `pi-memory`。已有 `_setBaseDir` 是测试辅助入口，不能作为并发项目生产配置 API。只改变工作目录不足以隔离，Electron 多会话中改全局环境变量也不安全。

接入前最少需要：

- 每个项目独立记忆目录、qmd 配置/索引及运行实例，优先独立子进程；模型不能自行选择项目目录。保留现有项目身份与授权目录解析，不搜其他项目或个人 Pi 全局库。
- 读取、搜索、写入、遗忘/恢复都经过 Slash 网关；Plan 只读，权限撤销后下一次访问立即拒绝。源资料索引仅覆盖已授权内容，记忆不能绕过当前目录权限。
- 记忆保留项目、来源、时间和版本；模型沉淀的内容先是候选，不能把日记提升为已确认业务规则。既有 `upsert_knowledge` 草稿/确认依据与版本记录继续作为业务真相。
- qmd 是可选外部程序，不在 pi-memory 的 npm dependencies 中。普通记忆读写不要求 qmd；语义搜索需要额外安装、固定底座版本并验收。不能把安装 pi-memory 描述为已有向量检索。
- 默认不要自动迁入个人全局记忆或全部历史，不因新包创建第二套不可追溯业务规则。搜索只返回必要段落，避免每轮大量重复注入。

Hermes 的项目分层和按需检索更贴合这些要求，但其全局层、自动写入/整理、站立指令及直接文件访问仍须网关审查；敏感词扫描不能替代权限。Engram 则可复用服务/MCP边界，但不能允许 `all_projects`、个人/全局 scope 或自动提示词捕获穿过项目权限；Cloud 必须保持关闭，除非用户另行明确选择。

### context-mode 只作为输出检索候选

固定版本提供 Pi extension 和 MCP bridge，并会注册 `ctx_execute` 等工具、指导 Agent 改用自身执行入口，还监听会话压缩生命周期。其“sandbox”描述不能当作 Slash 已有的操作系统隔离保证。

如采用，优先由现有 MCP 网关连接独立进程，限定允许调用的索引/搜索方法和输入来源；不开放任意代码/文件执行、网络抓取或全盘读取。缓存按项目/会话隔离，来源版本和权限撤销继续由 Slash 校验。避免与本轮 pi-web-access 重复抓取，也不要让它绕开本轮统一 MCP 生命周期。是否增加此包，以真实大输出问题和复用收益决定，当前无需默认打开全套插件。

## 许可证复核

- `billion-context@0.1.188` 的 npm 字段虽然是 MIT，**发布包 LICENSE 还有产品可见署名条款**：使用到产品/服务时须在主页、文档或 About/Credits 中标明使用 billion-context，并附其仓库链接；涉及 acp-kernel 时也要求相应署名和链接。不要只根据 npm 标签认定标准 MIT。依据：[固定版本 LICENSE](https://cdn.jsdelivr.net/npm/billion-context@0.1.188/LICENSE)。
- `billion-context-pi@0.1.83` 的发布包 LICENSE 是标准 MIT，当前 README 称内联 acp-kernel 为 MIT。不能直接将另一个包的附加条款说成此固定版本已经包含；若实际采用或升级仍须核捆绑核心的授权来源。依据：[固定版本 LICENSE](https://cdn.jsdelivr.net/npm/billion-context-pi@0.1.83/LICENSE)。
- `context-mode@1.0.169` 是 Elastic-2.0，可使用、修改和分发，但不得向第三方提供能访问其重要功能集合的 hosted/managed service；须保留许可/版权通知、分发许可证，修改副本须标明修改，并不得绕过受许可密钥保护功能。该限制不等于“一切云端代码都禁止”，也不等于“桌面集成无需保留通知”。本轮不把它用于同事问答的托管核心。依据：[固定版本 LICENSE](https://cdn.jsdelivr.net/npm/context-mode@1.0.169/LICENSE)。

## 云知识库仍是独立交付

上述本地记忆/日志检索/压缩工具未提供 Slash 所需的已发布资料版本、同事身份授权、引用回执及撤回发布链。Engram Cloud 是另一产品的记忆共享服务，也不能据此擅自替换已选定的 Vercel + Supabase 部署目标。保留现有知识库骨架，后续先复用其官方检索和授权底座，再适配来源选择、版本与网页；不因本次调研宣布云问答已完成。

## 证据与未验证项

目录入口：[第 1 页](https://pi.dev/packages)、[第 2 页](https://pi.dev/packages?page=2)、[第 3 页](https://pi.dev/packages?page=3)。表中每个包名链接为对应月下载来源。固定版本 manifest 的核对来源为 `https://registry.npmjs.org/<包名>/<固定版本>`，源码与 LICENSE 为同版本 npm tarball；不以 GitHub main 代替固定发布内容。

静态发布物位于本机临时目录 `slash-pi-context-audit-20261008`，包含 manifest 和所读源码；它们未进入项目依赖。未执行安装脚本、包测试、真实模型或 qmd，也未验证 Electron 原生 ABI、压缩质量、跨项目隔离和云服务。本报告完成选型复核，后续集成必须另有运行证据。

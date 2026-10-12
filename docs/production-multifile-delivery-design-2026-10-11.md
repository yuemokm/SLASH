# 多文件原型构建产物发布：复用设计

状态：原生静态目录绑定已进入隔离候选实现与本机传输验证；根工程尚未集成多文件候选，未执行远端发布。当前单文件文本绑定不满足“全部原型 MCP 发布完成”。ADR-010 的默认交付是可运行静态构建包，源码 ZIP 与单 HTML 是分别记录的可选形式。

## 已有接口与实际缺口

| 现有位置 | 已有能力 | 适用边界 |
| --- | --- | --- |
| `PrototypeAcceptanceDomain.snapshotForTask` / `deliverySnapshot` | 原始 bytes、入口、逐文件 manifest/hash、真实草稿覆盖、版本/权限复核 | 可以复用为已构建静态目录的不可变发布快照；当前最多100文件/16MiB，按网页资源扩展名筛选，不是任意目录压缩 |
| `main/prototype-browser.ts` | 同一快照的隔离浏览器及完整检查、截图 | 仅快照 GET/HEAD，网络/权限/下载/弹窗阻断；能检查真实静态构建产物，不能替远端部署验证 |
| `exportAcceptedPrototype` | 从已经绑定的 bytes Map 生成 ZIP，提交前重复 `assertCurrent` | 可复用同一快照打包，不能把单入口复制说成完整项目 |
| `packageHtmlProject` | 遍历已授权目录并生成准确捕获内容的 ZIP，beforeWrite hook | 返回明确 `packageKind:source_zip`。没有 build 命令、构建回执或静态包证明，不可重命名为“已构建包” |
| `TaskDeliveryDomain` / Service 门槛 | 合同、来源、报告、人审和 unknown 屏障；审批/导出重查 | 可保持现有核对和权限语义，不另建验收框架 |
| `McpArtifactBinding` / `prepareExternalTaskDelivery` | 单文件 UTF8原文与一个 args text leaf 完整相等，宿主持久绑定 | 不能证明 CSS/JS/图片等其它文件，更不能把目录 path 或模型自报 ZIP hash 当发布证据 |
| `mcpCall` / Pi MCP adapter | 已有连接/能力校验、派发、回执与 unknown 结果处理 | JSON参数100KB上限；完整静态包一般不能直接内联。真实发布适配器与账号/目标需各自验收 |

只读检索没有找到当前产品通用“执行构建并登记构建产物”的宿主接口。前端构建工具由真实项目决定；后续应沿用已有审批后的 `run_process` 能力，不自行执行用户未批准的安装/构建，不为了此处新建通用 Agent 运行时。

## 最小宿主契约

下一批先定义严格 Zod 与示例，再写业务。模型仅声明本任务已有输出的项目定位与一个宿主注册适配器 ID；实际字节、文件清单、hash、构建证明、report/args 绑定由宿主生成。目录定位不能扩展已有 Run 输出或授权范围。

建议宿主持久 `PrototypeBuildArtifact` 包含：artifactId、runId、workspaceId、源项目清单 hash、实际构建入口/目录、构建执行 operation/receipt（无需构建的原生静态项目明确记 no_build_required）、入口相对路径、按规范路径排序的 `files:[{path,bytes,sha256,mime}]`、完整 manifestHash、依赖范围、快照存储定位、合同 hash 与版本。源项目 ZIP、静态构建包、在线链接记录使用不同交付类型。模型不能写入这些证明字段。

快照保存在 Slash 管理的不可变产物目录：宿主从已授权目录读取、校验、复制真实 bytes，再原子封存；ID定位不能指向任意文件。复用现有路径/符号链接/体积检查，额外拒绝跨目录、重复规范路径和大小写冲突。产物与来源清单分别绑定，不能只检查入口 HTML 或借单入口通过遗漏新添/删除/改变的资产。

对于已有 build 脚本项目，只有可信构建回执与源清单一致才登记 static_build；重新 build、源文件/配置/锁文件或生成资产变化使旧绑定失效。构建命令仍是现有受批准进程工具，崩溃/取消/未知回执不得伪装为构建成功。原生静态多文件项目可直接封存完整目录，无需多余 build。

## 复用发布路径

1. 原型输出登记和自动检查绑定实际构建产物入口及同一完整文件清单；浏览器直接使用该 bytes Map，报告记录 manifestHash。沿现有任务合同核对业务、来源、视觉和回归，不自动人审。
2. 用户选择明确配置并已验过接口 schema 的发布适配器。适配器由 connectionId、真实 MCP tool及其输入 schema标识；不猜工具名，不授权任意路径/参数改写。首个适配器只支持其可完整表达的产物格式，不能因此宣称全平台支持。
3. 宿主适配器从快照构造或完整核对实际 payload，持久 artifactId/manifestHash、adapter版本、完整 argsHash、来源/合同/report及人审绑定。若为 file-list payload，每个路径与文本/二进制编码解码后的字节都必须等于快照；若为本地目录工具，仅传宿主封存目录，不能传当前活目录。
4. 首次审批允许冻结同合同、来源和完整 manifest 均相同的最新人审报告；任一版本不同需新提案。审批与真正工具发送前重复所有 guard，发布后保留该产物身份和远端回执，超时 unknown 不重试。
5. 本地 ZIP 从同一不可变快照生成；平台发布传同一字节清单。静态包验收通过不自动证明在线链接真实可访问，线上入口、路径、资源和交互另做真实验证。

100KB参数上限不能被隐式扩大。小型多文件 JSON payload 可作为首个明确适配范围；大包需要真实服务支持受控文件上传/资源或宿主目录读取，按适配器明确验收。若发布过程多步上传，每步保留 operation/回执及 unknown 屏障，提交前复核 manifest，不把 staging 完成当最终上线。当前没有可确认的通用多文件发布目标/输入协议，不能凭连接存在宣称成功。

## 真派发边界的当前接线

原设计时发现：`main.executeMcp` 仅在进入 `mcpCall` 前执行交付closure，连接/catalog等待期间成果或人审变化未被真派发前覆盖。此缺口已经通过独立候选修正，并由唯一builder集成根工程；当前不能继续将它写成未实现。

现有 `mcpCall` 已增可选async beforeDispatch；stdio复用 `createPiMcpSession` 已有hook，HTTP在连接/catalog结束、紧邻callTool前await同一交付closure，然后重验连接才设置dispatched/invoked。既保留not_sent/may_have_run，也复用现有Pi接口，无第二框架。隔离候选有真实Service绑定与本地stdio/HTTP等待反例13/13、既有MCP4/4，修改实际成果时真实调用计数0；派发后失联unknown一次、不重传。删除人审记录只模拟持久证据缺失，不代表已实现用户撤回入口。[候选证据](production-mcp-dispatch-candidate-2026-10-11.md) 分层保留。

根集成已完成源码接线，真实Electron主入口的派发前竞态仍待下一桌面验收；本地真实传输证据不能代替生产发布渠道或桌面入口通过。多文件候选将复用当前hook再绑定完整manifest，不重复开发这处传输修复。

## 下一批有用验收

- 真实 HTML+CSS+JS+图片静态项目：构建/浏览器报告/本地 ZIP/实际 MCP payload 的 manifest 完全相同，在线目标全部资产可访问，桌面与手机实际业务交互通过。
- 审批后更改/新增/删除任一资产、来源/构建配置变化、目录撤权、合同/report变化都阻止发送；源 ZIP 不能冒充静态构建包。
- 连接/catalog 等待期间更改资产或撤回人审，真正 callTool/dispatch 前拒绝，服务器实际调用计数0；派发后丢回执保留 unknown且不重传。
- 文件列表与正文/二进制 bytes 不一致、大小写冲突、符号链接、越界、参数体积超限拒绝；错误不回落到“仅发布入口即可通过”。
- 真实单文件老提案兼容，人审不自动迁移，普通非成果外部动作保留已有权限语义。旧 proposal 缺构建证明不能补造已验事实。

通俗说明：真正交付一个网页项目，要把网页、脚本、样式和图片一起固定成同一份版本，再检查和发布。只确认一个 HTML 文件，不足以证明整个项目已经发布正确。

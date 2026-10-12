# Agent 架构与实现审查

日期：2026-10-11。对象：当前工作区 Slash 0.3.12，包括已有未提交修改；不是某个已发布版本的认证。本轮只审查，未修改产品代码、依赖、用户配置或资料，未打包。

后续实施说明：下文保留首次审查时的代码状态与复现，不能当作修复后的实时清单。A01恢复保护、A02网络策略及部分A04交付核对已实现并有专项与桌面证据；真实业务质量仍未达标，A03主运行时隔离仍待实施。最新集成、失败记录和未验证项以[生产级方案实施记录](production-agent-implementation-status-2026-10-11.md)为准；本审查不构成生产级认证。

结论：**核心设计符合主流 Agent 工程实践；当前实现仍有恢复与连接安全缺口，不能判定为生产可靠性全面达标。建议保留 Pi 底座，定向补强。**

## 判断依据

“Agent 规范”不是一项统一认证。本次把工程建议、协议安全要求与项目自身约定分开，不能用是否采用某个框架、多 Agent 或向量数据库判定合格。

- [Anthropic：Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)：简单可组合结构、清晰工具接口、环境反馈、停止条件。该文已提示部分工具介绍过时，因此同时核对其当前架构文章。
- [Anthropic：Managed Agents 架构](https://www.anthropic.com/engineering/managed-agents)：执行器、持久会话、工具环境解耦及故障边界。其云端部署形态不是个人桌面应用必须照搬的要求。
- [OpenAI：A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)：工具风险分级、确定性权限保护与必要人工介入。
- [MCP 2025-11-25 安全实践](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices)：OAuth 地址、SSRF、重定向及本地服务安全。主要采用明确版本，未把 draft 当作已采用的协议要求；服务端部署的 MUST 不能直接套用桌面客户端。
- [Anthropic：Agent 评测](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)：结合代码、模型和人工评判，区分能力评测与回归评测。

## 已落实的部分

| 维度 | 代码证据 | 判断 |
| --- | --- | --- |
| 推理循环与业务控制分离 | `main/agent.ts:326–355` 使用 Pi AgentSession / SessionManager；`main/service.ts:975` 注入业务工具 | 符合。未自行重写模型推理循环；不需要为“主流”更换底座 |
| 工具结构与按需加载 | `main/tool-catalog.ts`、`main/tool-input-schema.ts`、`main/tool-execution-policy.ts` | 已有运行时参数校验、固定工具组、读并行/副作用串行；未知执行策略拒绝 |
| 权限由宿主执行 | `main/capabilities.ts`、`main/service.ts:691–716`、`main/files.ts:29–45` | Plan、显式拒绝、目录授权、物理路径与原件只读有代码保护，不只依赖提示词 |
| 桌面边界 | `main/main.ts:392–395,828`、`main/preload.cts` | IPC 校验发送者与请求，渲染器关闭 Node、启用 contextIsolation/sandbox；不等于工具进程有系统沙箱 |
| 草稿、版本与提交分离 | `main/files.ts:130–131`、`main/service.ts:1497–1503`、`main/draft-edit.ts` | 存在哈希检查、快照与资源锁；仍不承诺任意外部编辑器下的跨介质原子事务 |
| 中止与已完成事实分离 | `main/store.ts:23–26`、`main/service.ts:996–1007` | finishOperation 防止已完成工具被后续取消覆盖；未知副作用停止后续工作 |
| 持久状态与受控恢复 | `main/store.ts`、`main/service.ts:182–190,913–930` | SQLite 操作、事件、检查点与 Pi 历史已存在；崩溃恢复缺口见 A01 |
| 有界任务与辅助 Agent | `main/run-limits.ts`、`main/pi-subagents.ts` | 主任务 30 分钟/120 次工具；辅助任务有只读工具上限、并发、时限，不能自行扩权 |
| 可观测性与数据范围 | `main/pi-observability.ts`、`main/runtime-events.ts` | 本机运行记录存在；Langfuse 默认关闭，启用时只发送受限元数据。关闭云追踪本身不是缺陷 |
| 质量门禁 | `main/task-acceptance.ts`、`main/content-review.ts`、`main/prototype-acceptance.ts`、`main/delivery-gate.ts` | 已区分执行成功、版本、业务与视觉验收；评测覆盖仍须完成，见 A04 |

复用边界补充：`main/pi-subagents.ts:31–39` 通过包内 `src/runs/shared/child-session.js` 导入已发布且有类型的工厂，代码明确说明它不是稳定 export-map 入口。固定版本与现有运行时测试降低了风险，但不能把所有生态适配概括为稳定公共 API；以后升级该包应单独验证工具权限、取消与状态持久化。

## 需要处理的问题

### A01 · P1：崩溃后未决命令没有进入结果核对

关联：F02 / PF03 / PF09。

位置：`main/service.ts:177,182–190,918,992–1007`。

启动恢复只把 `external-actions` 中的 executing 转为 outcome_unknown；普通 operations 表中的执行中命令没有对应处理。`recoverPersistedRuns` 会让 Run 变为 interrupted/resumable，`resumeRun` 却只拦截 outcome_unknown。

隔离复现：保存一个 running Run 和 executing 的 powershell 操作，关闭/重新打开真实 Store 并重建 Service。结果：Run 可恢复、操作仍为 executing，resumeRun 穿过核对门槛并调用 send。脚本把 send 替换为记录器，因此没有实际模型或命令执行。

影响：若程序已产生副作用后应用异常退出，后续模型可能重复操作。**已证明恢复门槛遗漏，未证明用户真实资料已被重复修改**；启动也没有自动重放命令。

建议：恢复时按宿主工具 effect 区分只读与可能产生副作用的未决操作；后者先进入核对状态并阻断自动续作。复用既有执行策略和回执，保留数据；不要把所有 read/审批等待一律判成未知写入。

验收：覆盖副作用前退出、副作用后但回执前退出、已成功回执后退出；分别测试 powershell、run_process、处理脚本与只读工具。真实终态不能被覆盖，未决副作用核对前不得进入新执行。

### A02 · P2：MCP OAuth 网络目标限制不足

关联：F03 / PF11。

位置：`main/mcp-oauth.ts:24,70`、`main/mcp-client.ts:48–49`。

交互登录 fetch 对每次地址校验 HTTPS/URL 凭据并拒绝重定向，但没有限制私有 IP、回环 IP 和 DNS 解析结果。直接调用当前 URL 校验函数，`https://127.0.0.1/token`、`https://192.168.1.1/token` 与 `https://[::1]/token` 均被接受。后台 transport 刷新使用另一条 fetch 路径，也需要一起核对。

影响：用户连接的恶意或被入侵 MCP 服务可能通过 OAuth 元数据引导桌面程序访问内部地址。HTTPS 和 TLS 仍有保护作用；本轮没有发送这些请求，也没有复现数据外泄，因此不将其描述为已成功利用。

建议：复用已有受控网络访问思路，对 OAuth 发现、注册、令牌交换、刷新统一执行目的地限制；用户明确配置的企业内网服务采用明确允许范围，不能只按 https 放行，也不能简单禁止所有合法内网集成。核对 DNS/重定向及 SDK 行为，避免重复实现 OAuth。

验收：恶意 metadata 指向回环/内网、DNS 变化、重定向、刷新路径、显式授权企业内网五类场景。

### A03 · P2：故障隔离和模块边界尚未完成

关联：ADR-003 / ADR-013 / PF03 / PF09。

位置：`main/main.ts:341` 直接构造 Service；`main/service.ts:167,975` 直接构造主运行时；`main/agent.ts:263,289` 说明通用命令没有操作系统沙箱。

Service 与主 Agent 同处 Electron 主进程；部分辅助工具虽有工作进程，但不构成完整隔离。主进程内 SDK/同步计算/解析出现阻塞或崩溃，会扩大影响范围。当前 Service 约 277 KB，权限、恢复、来源、审批、质量、交付集中，改动容易产生跨功能回归。

此项是架构风险与维护成本，**不是宣称当前已有卡死复现，也不是单体架构不合格**。通用进程已有审批；有参考原件时 `assertHostProcessAllowed` 还会拒绝启动。这些保护有价值，但不是系统沙箱。

建议：先抽出恢复/工具执行/质量协调的清晰接口，再根据实测故障与耗时把主运行时或重计算移至受监督工作进程。进程隔离和系统权限沙箱分别验收；无需改成微服务，也不要一次性替换底座。

验收：工作进程退出、长时间无响应、取消、应用退出后残留进程；确认 UI 可响应，既有状态和草稿完整，副作用未知时不重放。

### A04 · 交付前优先：真实业务质量尚未构成稳定通过的基线

关联：PF08 / PF10 / QE05 / QE12。

依据：`docs/qe05-independent-validation-2026-10-10.md`、`docs/qe12-astra-full-visual-validation-2026-10-10.md`、`docs/active-development-goals.md`。

既有记录包含 PRD 业务 violated、原型局部验收通过但 needs_human/partial，以及用户认为设计感和实用性不足。这不是“缺一个框架”，也不能用软件单元测试通过推导为 Agent 真正完成 PM 工作。

建议：复用已有 16 个业务基准及验收机制，冻结真实输入、要求、模型与版本；分别统计业务完成率、原型任务成功率、耗时、工具失败及人工修正次数，并保留失败样例。能力挑战与已通过任务回归分开维护。

验收：完整生成→实际操作/业务核对→修改→保存→导出在同一版本证据下闭环，桌面与手机分别检查；模型自评和局部 DOM 通过不能替代最终验收。

## 本轮验证与限制

- `npm run check`：通过。
- `npm test`：1056 项，1052 通过、4 失败、0 跳过，退出码 1，耗时 353.521 秒。日志：`.test-data/agent-architecture-audit-20261011-tests.log`。
- 对失败所在三个文件串行复跑：`npx tsx --test --test-concurrency=1 tests/pi-worker-lifecycle.test.ts tests/prd-review-responses-proxy.test.ts tests/project-context.test.ts`，14 项中 13 通过、1 失败，退出码 1，耗时 39.145 秒。不能将这两轮合并宣称全量通过。日志：`.test-data/agent-architecture-audit-20261011-rerun.log`。
- `.test-data/agent-architecture-audit-20261011.ts`：隔离复现完成，退出码 0。复现的是上述两个缺口，不表示安全性通过。
- `.test-data/agent-architecture-audit-20261011-repro.json`：保存实际恢复状态、send 门槛命中与 URL 校验结果。
- `.test-data/agent-architecture-audit-20261011-source-hashes.json`：记录主要审查源码及锁文件 SHA-256。验证环境 Node v24.15.0 / Windows。
- 未调用真实付费模型、未进行公网发布/真实 OAuth 登录、未验证 SMB 双机、未启动本轮桌面端到端体验；这些不计为已通过。
- 未执行 build/electron-builder：本轮无产品代码修改，类型检查与测试用于审查当前源码，不生成新发行包。
- 这是一轮重点路径审查，不是逐行覆盖全部工程的形式化证明或完整渗透测试。

### 本轮测试失败的具体判断

| 失败项 | 全量结果与复跑 | 判断与后续 |
| --- | --- | --- |
| `tests/pi-worker-lifecycle.test.ts:22` 的正常退出/强制退出两项 | 全量均在等待 fixture ready 的 20 秒上限失败；串行复跑均通过 | 尚未到进程退出断言，不能据此声称发现孤儿进程。并发环境下的启动时序敏感需收敛，不能仅延长超时掩盖问题 |
| `tests/prd-review-responses-proxy.test.ts:36` 的取消项 | 全量 `calls=0` 与预期 1 不符；串行复跑通过 | 测试固定 120 ms 取消并要求已进入流式阶段，存在竞态；需用明确阶段信号触发取消，保留取消前/后覆盖。本轮不判成已证实的取消功能故障 |
| `tests/project-context.test.ts:69` 的原型指导项 | 两轮都失败，首个不匹配为 `/资料单元格坐标/` | 当前提示已改成“来源单元格坐标”，且同一断言表仍要求“模拟身份简短醒目”“不能为界面简洁隐藏真实限制”等旧文案；与 2026-10-10 的用户新取舍及新指导不一致。应按最新需求更新真实请求断言，不能为通过旧测试恢复已撤销的界面声明。当前整体回归仍未全绿 |

上述属于测试与需求同步/稳定性问题，独立于 A01/A02 的缺陷复现。本轮未修改测试断言来消除失败。

## 建议顺序

1. 修复 A01 并加入崩溃窗口回归。
2. 补齐 A02 的 OAuth 访问策略和真实本地协议夹具验证。
3. 完成 A04 的真实 PM 任务闭环，作为下一次交付依据。
4. 在上述路径稳定后按模块逐步处理 A03，保持现有数据和回退路径。

本次没有新增或替换通用 Agent 能力，所以未触发重新选包；如后续涉及替换，应按 AGENTS.md 先查 pi.dev/packages、比较效果与稳定性。

审查关系图见 `agent-architecture-audit-2026-10-11.mmd`。

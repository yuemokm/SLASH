# 受控增量成果草稿（2026-10-05）

已生成的 HTML、PRD 等局部修改不再要求模型再次输出整个文件。`read_draft` 返回当前 run 最新 pending 文本；`edit_draft` 生成待应用内容，沿用既有变更卡和应用流程，没有新增编辑页面，也不会直接写正式文件。模型容量与输出上限不变；后续真实修订暴露的原生压缩配置适配见文末。

## 工具契约

- `read_draft({mountId,path,offset?,limit?})`：仅可写普通成果目标；没有当前 pending 时读取正式文件。默认每段 8000 UTF-16 字符，上限 16000，返回 `content`、宿主 `contentHash`、`baseHash`、可选 `changeId`、`offset`、`total`、`truncated`、`nextOffset`。哈希覆盖完整内容，但分页未读部分不能宣称已阅读。
- `edit_draft({mountId,path,changeId?,expectedContentHash,oldText,newText})`：将读回的 `contentHash` 填入 `expectedContentHash`。有 pending 时必须同时传该 `changeId`；针对正式文件不传 `changeId`。可用 `edits:[{oldText,newText}]` 替代单对字段，两种形式不可混用。最多 30 项，每项文本最多 200000 字符。
- 批量 `edits` 各项均匹配同一原始内容，不是顺序补丁。重叠、重复匹配和找不到匹配均由 Pi 原生拒绝，不自行猜测位置。成功返回最新 `contentHash`、`changeId`、原始 `baseHash`、Pi 实际 diff（最多 12000 字符）、完整 diff 的 `diffHash`、`diffTruncated` 与首个变更行。
- 后续局部修改重新读取最新稿及哈希。同 run 同目标修改保留 pending 的 ID、原始 `before` 与创建时间。其他 run pending 禁止编辑。既有 `write_draft` 仍允许完整文件草稿；新工具选择最新卡，并以最终 CAS 拒绝被追加/更新越过的版本，不全面改写历史写入工具。

## Pi 复用与宿主边界

使用已安装 `@earendil-works/pi-coding-agent` 0.86.1 的 `createEditToolDefinition` 和 `EditOperations`。Pi 负责精确优先、必要时规范化模糊匹配、BOM/行尾处理、替换、diff 和重复/重叠错误。模糊规范化并非任意行内空格折叠，实际 diff 仍须核对；不能宣称每次均字节精确匹配。未复制 SDK 编辑引擎。

原生工具的 `readFile/access/writeFile` 全部替换为宿主受控内存操作。`writeFile` 只暂存输出，Pi 完成后才最终复查授权、任务取消、原件哈希和 pending CAS，再同步提交。原生内建 `edit/write` 继续从 Agent 可用工具排除。

`edit_draft` 外层经 `artifact_write` 网关，读取输入额外经 `workspace_read`。`read_draft` 经读网关；两者在 Plan 不可调用。仅接受已知可编辑扩展、有效 UTF-8、无 NUL、2 MB 内普通文本；二进制、未知扩展、参考原件、越权路径和链接写入由 Files/文本守卫拒绝。模板 JSON/注册表、AGENTS.md、模板迁移组及已登记处理输出采用专用流程，不能普通编辑绕过元数据约束。

Service 使用 Pi mutation queue 串行本宿主草稿事务，并保留既有 `applying` 互斥和资源写锁；相同物理目标的 enabled 别名目录锁也核对。原生 Pi 编辑使用每次独立虚拟路径避免同队列嵌套死锁。最终同步 CAS 比对草稿集合，若无关完整写入恰好并发发生也可能保守拒绝，重新读取即可。共享盘其他机器的实际字节变动仍在编辑后检查及原有 apply 的两次哈希/锁/版本校验处理；本轮不宣称跨主机原子事务。

应用仍由原有 `Files.apply` 执行，不覆盖 `before`，不绕过版本备份、锁或冲突态。操作历史保存有限且按原有策略脱敏的 Pi diff 和完整 diff 哈希。取消/失败在最终提交前不新增或修改 pending。

流程源：[draft-edit.mmd](./draft-edit.mmd)。

## 离线验证

`tests/draft-edit.test.ts` 使用真实 Pi 编辑器与真实隔离 Files：BOM/CRLF、连续两次同卡修改、原生模糊规范化、重复/缺失/重叠拒绝、批量原文语义、分页、旧哈希/ID、write 后最新稿、原文件变化、撤权、Plan、其他 run、专用元数据、无效 UTF-8/二进制/NUL/参考原件、Pi 暂存后取消/撤权/原件变化无草稿、同文件竞争与不同文件保留。

`tests/draft-edit-service.test.ts` 使用真实 Service/Store 及离线 runtimeFactory，验证经 options.log 网关读写、write→edit→apply、真实 diff 操作记录、workspace_read/artifact_write deny、Plan、别名资源锁与外部变更后 apply 冲突。未调用云模型；真实模型修改和运行产物验收由后续单独证据记录。

### 2026-10-07 首次编辑已验证 HTML 的参数边界修复

真实修改测试发现：首个写操作直接 `edit_draft` 已保存且有旧验收基线的 HTML 时，Service 把完整编辑输入传给修改前检查；构造 Task 成果目标时，expectedContentHash、oldText/newText 或 edits 被展开到严格的 target，导致 `outputs[0].target` 拒绝未知字段。错误发生于原生编辑与提交之前，没有新 Change。先 write_draft 冻结基线后再 edit 的旧测试因提前返回而未覆盖这个边界。

`main/service.ts` 现在在调用方显式传入 mountId/path，修改前检查入口也投影出同一干净引用，统一用于成果目标和 prototypes.get。编辑指令仍由 DraftEditDomain 的严格编辑 schema 校验；Task strict schema、权限、原件/草稿哈希、原生匹配、取消与最终 CAS 均未放宽。旧必检或此前验证用例在首次编辑前冻结，不能靠删除基线解除回归。

`tests/task-first-edit-service.test.ts` 把隔离目录内两组失败复现转为正式成功回归：首轮真实 apply 合成 HTML，次轮不先 write_draft，直接单次/批量编辑生成 pending；冻结旧 readonly 用例，确认 target 仅包含成果身份字段，过期哈希仍拒绝，连续编辑复用同一 Change，旧基线不变，正式文件哈希始终不变。另有已保存 PrototypeAcceptance required spec 分支，首 edit 冻结的来源为 user_confirmed，验证同一入口能读取并保护用户必检范围。模型与浏览器适配器明确模拟，只验证实际 Service/Store/Files/原生编辑/Task 流程；不当作真实模型或浏览器通过。

首次单次/批量、既有 draft-edit 领域、Service 权限/锁/版本及 Task 回归共 21 项定向通过；补充 required spec 后首 edit 专项 3/3 通过，相关唯一用例合计 22 项。Plan、撤权、资料原件保护、哈希冲突和暂存后取消复用既有守卫专项，npm run check 通过。未调用云模型、未修改真实 profile/业务文件；根代理负责全量验证与统一构建。

通俗解释：直接编辑已有网页时，软件现在只把目录和文件名交给验收登记，不再夹带替换文字。仍会保留旧功能检查，编辑只生成待确认草稿，原网页不会被自动覆盖。

## 原生压缩配置适配

真实修订 NiJUFi 的 length 终态为 output 1819、usage 61665；同模型且压缩阈值达到，但 Pi 默认 keepRecentTokens=20000 使原生切点仍保留首条完整用户消息，`prepareCompaction` 无可摘要前缀。它在 compaction_start 前返回，不能把此情形说成摘要调用已完成或需要无限重试。只读分支重放使用8192后由原生切点产生7条回合前缀，近期保留的工具结果都有配对的 toolCall。

`main/session-compaction.ts` 通过公开 SettingsManager/createAgentSession 接口，只对没有显式普通/对应模型 keepRecentTokens 的当前 session 应用 `min(Pi默认值, floor(contextWindow/8))` 模型覆盖：65536→8192，200000仍20000。保留用户普通及模型级设置（含0）、reserveTokens、retry和实际模型容量，不写全局/项目 Pi settings 文件。SDK资源加载会重新读取设置，因此仅在 session 初始化完成后 applyOverrides。容量若来自未验证兼容 fallback，仍属于未验证，配置适配不证明上游窗口能力。

Pi 继续负责上下文估算、工具关联切点、摘要、阈值和一次 length 恢复；没有复制算法、修改SDK源码、新建预算拦截或新的调度 harness。`tests/session-compaction.test.ts` 验证小窗/200k/显式设置/真实文件未写；`tests/runtime-context.test.ts` 的本地HTTP假供应商运行真实Pi agent loop，证明默认8192下实际摘要请求、一次恢复、summary入上下文和终态成功，并保留取消/摘要失败/恢复耗尽等既有边界。此离线验证不代替真实云修订验收。

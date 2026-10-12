# 项目备忘：pi-memory 最小接入

日期：2026-10-08。需求 PF03 / F02 / F05 / F10。本轮接入本地跨会话候选备忘；原生 Pi 压缩继续负责上下文，正式项目知识继续使用现有 `upsert_knowledge` 草稿、来源和用户保存流程。

## 固定包与复用边界

- 查询 [Pi 包目录](https://pi.dev/packages/pi-memory)：40.4K/月，口径为包下载次数，非用户数。固定 `pi-memory@0.4.2`，发布物 `package.json`、`index.ts`、`LICENSE` 已读取；MIT，版权 Jay Zeng 2026。Node >=22.19；peer Pi >=0.81.1，包含当前0.86.1。
- 安装执行 `npm install --save-exact --ignore-scripts --no-audit --no-fund pi-memory@0.4.2`。其 `postinstall` 未执行。前后比较已有 lock 的全部包 version 无变化，仅新增该包；Pi仍0.86.1、Electron仍44.0.0。
- 真实调用发布入口 `default(ExtensionAPI)` 捕获注册的 `memory_read/write/forget/restore`。官方实现负责 `MEMORY.md` 追加、完整条目撤回及 `recovery/*.json` 幂等恢复；Slash没有另写这套存储/删除算法或新增数据库。
- 每次交易独立辅助进程，`PI_MEMORY_DIR` 在加载前固定为应用私有目录 `pi-memory/<项目身份SHA256>/`。不使用 `_setBaseDir`、不改变主进程环境、不载入个人全局库。
- 五个生命周期 hook 均不安装，既不自动注入系统提示词，也不执行日记、压缩handoff或退出总结。`PI_MEMORY_QMD_UPDATE=off`、`PI_MEMORY_NO_SEARCH=1`、`PI_MEMORY_EXIT_SUMMARY=0`；qmd不探测、不安装、不调用，不后台下载模型。返回资料只经过当前工具结果。

## 接口与数据

可执行契约：`shared/pi-memory.ts` 的严格 Zod schema。磁盘格式v1为包内单个带时间戳的Markdown条目，其内容行是 `SLASH_MEMORY_V1:` + JSON。字段有项目身份、UUID、固定 `candidate` 状态、标题/正文、创建时间、真实run/conversation/inputHash，以及宿主绑定的文件来源/版本/readAt/locator。无SQL迁移；旧正式知识和用户文件保留，不自动搬入或复制。

```json
{"group":"memory"}
```

先通过现有 `load_tool_group` 按需载入 `memory`，下一轮再调用：

```json
{"title":"退回原因待核对","text":"旧资料将退回原因列为必填，尚需业务确认。","sources":[{"mountId":"实际已读mountId","path":"参考资料/审批.md"}]}
```

`memory_write`只接受标题、正文和可选来源，不接受confirmed、授权、路径或全局scope。宿主自动合并本Run真正读过及回忆过的来源，不让省略sources解除已知依赖；完全没有文件来源时绑定本次实际用户输入。正文是模型候选，来源绑定不证明语义正确。超过100个不同来源拒绝写入，不输出源文。

`memory_read({query?,offset?,limit?})` 做本地词面包含匹配及分页，不宣称语义/向量检索。每条来源在返回前复核当前目录权限；任何来源不可访问则整条隐藏。版本变化返回 `sourceState=stale` 及中文来源变化提示，仍是候选历史参考；重新读取来源后可记录新候选。

`memory_forget({id})` 按实际回执UUID撤回，返回恢复编号；`memory_restore({recoveryId})` 必须仍有原来源权限，恢复后仍是candidate。写/删回执不透出官方工具的“其他记忆预览”，避免旧来源撤权后泄露。

## 权限、取消与稳定性

- 四工具复用原`o.log`/capability broker。Build读为workspace_read，写/撤回/恢复为artifact_write，并额外要求读权限。Plan仅注册memory_read；即使直接触达宿主callback，写也拒绝。完全访问不会改candidate或把资料变成规则。
- 每次访问及异步返回复核项目、授权、Run存活和取消。项目间独立进程/目录，同项目交易队列串行，防止同时追加丢失。交易完成退出进程；辅助worker已有宿主结束/孤儿检测。
- 写入派发后若取消、失去回执或权限变化，返回 `PI_MEMORY_OUTCOME_UNKNOWN`，保留真实磁盘内容，先读当前备忘核对，绝不自动重试。遗忘保留恢复记录，**不是安全擦除**。
- 私有文件上限2 MB；拒绝受控文件/目录的符号链接或junction；恢复也检查容量。独立进程是状态隔离，不宣称操作系统沙箱。
- 初始Build仍18个工具；memory为延迟组，完整注册由63增至67。原生Pi compaction设置及取消/重载继续由既有底座控制。设置的“现成能力”显示项目记忆版本与安装状态；业务交互复用会话及工具记录，不增设独立知识中心。

## 验收与限制

本轮实际执行结果：

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过，包含renderer与main类型检查 |
| `npx tsx --test tests/pi-memory.test.ts tests/pi-memory-service.test.ts` | 最终完整复跑8/8通过，约56.2秒 |
| `npx tsx --test tests/pi-memory.test.ts tests/lazy-tools.test.ts tests/session-compaction.test.ts` | 先前16/16通过，初始工具18、原生压缩保留 |
| Pi MCP /包设置相邻专项 | 6项通过，原六包固定身份和memory新增身份均核对 |
| Electron源码独立验收 | Electron44.0.0 / Node24.18.1，真实包写、跨实例读、撤回、恢复、candidate五项检查通过；不等同桌面compiled验收 |
| 依赖版本前后比较 | 既有全部lock包version变化为空；只新增pi-memory0.4.2 |

实际取消专项曾暴露guard异步边界后的signal漏检，已补复核并完成最终8/8全量复跑；不会以之前失败的run当作成功证据。桌面compiled验收由主代理对最终现有构建另行运行并记录。

真实包专项在 `tests/pi-memory.test.ts`：项目A/B并发隔离、同项目队列、重建适配器后持久化、候选严格schema、词面筛选分页、撤权隐藏、来源过期、官方撤回/幂等恢复、派发后权限变化/取消结果未知、worker退出、无全局导入。

`tests/pi-memory-service.test.ts` 通过真实Service网关核验：自动绑定实际读取、跨聊天保留origin、Plan双层写拒绝、过期回忆重新读取后保存新候选、目录撤权后不可恢复。`tests/lazy-tools.test.ts`、`tests/session-compaction.test.ts`回归工具载入和原生压缩；`node scripts/pi-memory-electron-smoke.mjs`默认由Electron Node加载实际桌面使用的`dist/main/pi-memory.js`验证真实包，使用已有构建、不执行build或模型；`--source`仅用于独立源码调试。

本机测试证明接口、持久化和边界，不认证云模型会正确选择/总结候选。未启用qmd、个人全局导入、自动历史迁移、自动确认或同事问答共享；这些不是本轮完成项。未来升级须重核注册API及生命周期hook，固定版本不匹配时拒绝加载。MIT LICENSE随依赖发布物保留，分发时必须保留其版权及许可。

通俗解释：现在同一项目下换个聊天，也能找回之前留下的待核对备忘；它不会自动变成正式业务规则。撤回写错的备忘后可以恢复，另一个项目的内容不会混进来。

架构源文件：[pi-memory-integration-2026-10-08.mmd](pi-memory-integration-2026-10-08.mmd)。

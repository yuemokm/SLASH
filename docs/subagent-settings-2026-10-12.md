# Subagent 列表、设置与实际执行

日期：2026-10-12。需求 F02/F03/F10、PF03/PF05/PF09/PF10。最新用户要求统一名称 Subagent；列表展示，新增/编辑进入独立页；各项可设置名称、用途、模型、思考和提示词；输入框下方保留总开关。

## 产品行为与迁移

列表展示名称、用途、模型/思考摘要、默认项标记；点击进入编辑页，最多20项。全局开关和默认折叠的共享预算只存一份，本轮不新增删除、角色库或权限配置。编辑页包含名称、用途说明、模型、思考强度和“工作指令（提示词）”。保存仅在内容变化且有效时可点，粘性页头保留保存及错误；失败保留草稿、可重试。返回未保存显示“继续编辑”或“放弃修改并返回”，不静默丢弃。停用仍可准备下一次配置；能力加载/未知/失败、模型不可用有明确反馈。

输入底部 Subagent 开关显示开/关/保存/失败，Space/Enter 可操作，只更新 enabled，不覆盖 profiles/预算。tooltip 明确全局新任务语义，设置与 composer 通过事件同步。Service 开始任务固定完整快照，编辑配置不改变在途任务，也不停止活动任务。

仍存原 SettingsStore 的 pi-subagents:settings KV，不新增表或删除数据。schema 读旧单配置时将 modelEntryId、thinkingLevel、instructions 无损迁入 slash-default / “通用助手”，保留 enabled 和全部预算；旧对象缺 instructions 补空值。读取不改写，下次保存才写新结构。原“辅助任务”的 subAgentMaxTasks/subAgentTools 是独立旧 IPC broker，不控制 Pi delegate_readonly，本轮保留。

名称1–60字符，用途最多400字符，工作指令最多6000字符；ID稳定、ID和名称唯一，defaultAgentId 必须存在。工作指令为空使用默认，可恢复默认。总预算任务≤3、并行≤2、每项工具≤24、每项≤120秒，仅可收紧，并行不超过任务数。不同项共享同一 Run 的任务/并行/父总预算，不因换 profile 重置。开启或保存开启配置时验证全部项，失效模型/凭据明确指出名称，不静默换模型；关闭时允许保留失效引用以便修复。

## 契约与运行

可执行 schema：shared/subagent-settings.ts；IPC 保留 get/save，增加 enabled-only patch。新配置示例：

```json
{
  "type": "subagentSettingsSave",
  "config": {
    "enabled": true,
    "defaultAgentId": "slash-default",
    "profiles": [
      {"id":"slash-default","name":"通用助手","description":"资料研究与成果检查","modelEntryId":null,"thinkingLevel":"auto","instructions":"先核对原始资料；按问题、依据、建议返回。"},
      {"id":"review-helper","name":"成果核对助手","description":"检查遗漏与矛盾","modelEntryId":"existing-model-entry-id","thinkingLevel":"high","instructions":"指出证据和修订建议。"}
    ],
    "tasks":3,"concurrency":2,"toolsPerChild":24,"durationMs":120000
  }
}
{"type":"subagentSettingsSetEnabled","enabled":false}
```

delegate_readonly 例：{"task":"核对授权资料","purpose":"review","agentId":"review-helper"}。agentId 可省略，省略走默认项；未知 ID 拒绝，不静默回退。工具描述列可用名称/用途/ID，主模型需要时选择。用途文字不能提升权限。

运行链：PiPackageSettings → Service固定本轮配置 → 按选中profile解析实际模型/凭据/思考 → 现有 createOpenAICompatibleModelRuntime → 固定包 child factory。child 的 runtime.agent 使用稳定ID；状态/回执记录 agentId/agentName、实际模型与思考。工作指令作为普通文本追加在宿主只读安全规则之后，只进入该项 child，不进入父或其他项 prompt；不执行模板变量/动态代码。凭据只由宿主读取，Pi 内存使用，不存入前端配置/Run正文。

原父网关逐次校验授权目录、来源、停止和预算。Subagent 只能研究/检查，修改由主任务经 ChangeSet 完成，不能递归委派、写入、执行或发布。非视觉子模型排除图片读取工具。关闭后 Build/Plan 不注册 delegate_readonly，严格工具目录也移除关闭组。

## 复用、代码与验收

已读固定包 pi-subagents/docs/agents.md 和 AgentConfig：name/description/model/thinking/systemPrompt 与 headless child 能力可复用。profiles 是 Slash 受控适配层配置，复用原包真实会话；没有开放默认文件发现/内建角色或重造内核。继续锁定 Pi0.86.1、pi-subagents0.76.1/MIT。2026-10-12 [Pi目录](https://pi.dev/packages)展示613.4K/mo、目录版本0.77.0；下载量不是稳定性证明。公开 delegation 底座缺口仍见[独立协议记录](pi-subagents-public-validation-2026-10-12.md)。

实现位置：src/SubagentSettings.tsx、subagent-settings.css、ComposerSubagentToggle.tsx、subagent-settings-state.ts；App/SettingsModal/settings-navigation 精确接入。后端：shared/subagent-settings.ts、shared/pi-packages.ts、main/pi-package-settings.ts、main/main.ts、main/subagent-model.ts、main/service.ts、main/agent.ts、main/pi-subagents.ts。

定向命令 node --import tsx --test tests/subagent-settings.test.ts tests/pi-subagents-runtime.test.ts tests/lazy-tools.test.ts tests/pi-package-settings.test.ts **27/27通过**。验证旧值迁移、长度/唯一性/default ID、enabled-only保留配置；真实固定包localhost验证不同profile的模型/指令隔离、不进父prompt、未知ID拒绝、启动快照和跨profile共享预算，并复用原只读/取消/父总预算验证。

最后 npm run check、npm run build 均已实际 exit0；renderer index-B9FP_JNE.js / index-D5THob7p.css，只有既有Vite大chunk提示。最后构建包含列表编辑和可见Subagent术语清理。未执行electron-builder。

编译版 `node scripts/subagent-settings-ui-smoke.mjs` **9/9组通过、退出0**；最终证据 `.test-data/subagent-settings-ui-KX3rKh/report.json`，记录主进程/共享schema/实际renderer文件SHA256，运行前后保持一致，pageErrors为空、cloudExecuted=false。独立profile、授权夹具、localhost真实Pi会话；一次保存/开关故障和能力延迟明确是注入测试。覆盖旧配置迁移、编辑未保存返回、保存失败保留草稿并重试、独立新增/放弃、1366/860px列表和编辑页、真实两具名child按agentId采用不同模型/凭据/指令且互不泄漏、开关失败重试和禁用后真实Build无委派工具、设置/composer同步与Space/Enter、一个配置失效时总启用拒绝及修复。

截图同目录：settings-subagents-list.png、settings-editor-narrow.png、settings-instructions-narrow.png、settings-add-subagent.png、settings-capability-loading.png、settings-capability-unknown.png、settings-save-error.png、settings-model-unavailable.png，composer-subagent-on/off/error/narrow.png。主代理已人工查看同构建的列表/窄编辑/指令图，最终开关图另复验。保存失败原因在页头可见、提示词在窄窗滚动后粘性保存可达；无需修改真实用户profile。

额外回归 `tests/settings.test.ts` / `tests/phase3.test.ts` **20/20通过**；`node --import tsx --test tests/pi-subagents-public-contract.test.ts` 独立复跑 **4/4通过、退出0**。这些与主27项按各命令分别报告，不伪造一次统一总数。`git diff --check`相关受控文件通过（只提示现有换行格式）。

排错记录保留：X8rz0M 是被新列表需求取代的旧单配置验收。初次列表 HLF5Wz/report.json 前五组UI通过后，整轮30秒观察窗口超时，不能算运行完成；该初次脚本误在构建会话退出确认前启动，仅作排错。构建exit0之后 yZ0PyS/report.json 前六组（含真实两配置）通过，第七组因脚本选择器“重试 Subagent 设置”与实际aria“重试Subagent 设置”的空格差异失败；仅修脚本后，同产物最终KX3rKh九组完整通过。整轮观察窗口90秒，产品子任务预算不变。额外公开协议回归并行初跑24项中23通过、1 fixture初始化超时取消，不计为通过；独立复跑四项完整通过，没有修改包或扩大运行权限。

未新增云模型复杂成果质量、发布或SMB双机验收；未动真实用户profile/模型配置/窗口，未打包。主进程/IPC修改需重启开发应用。流程：[subagent-settings-2026-10-12.mmd](subagent-settings-2026-10-12.mmd)。

通俗解释：可以保存几个用途不同的小助手，各自用自己的模型和工作指令。主任务需要时选合适的助手；总开关统一控制后续任务，它们仍只查资料和给检查建议。


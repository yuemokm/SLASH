# 模型列表获取与批量添加

需求：F02/F03、PF03/PF09。用户要求同一上游可获取模型列表，并一次添加多个 model ID；本轮不调整 MCP。

## 实现与兼容

- 设置 → 模型 → 添加模型：每个 model ID 使用一个独立输入框，点击“添加模型行”增加空白行，可移除多余行，至少保留一行。填写 API 地址、密钥、协议与供应商后点击“获取模型列表”，仅本次连接获取成功后每行右侧才显示下拉按钮；打开可搜索并选一个模型填当前行。未获取或失败仍可逐行手填，不显示下拉。一次最多保存 100 个，重复输入在保存时合并；一框多个 ID 的分隔符会明确提示并阻止提交。
- 每个模型保留原有独立 `ModelEntry.id` 和加密凭据结构，无数据库迁移或新依赖。按供应商规范化名称、去尾斜线 API 地址、协议、modelId 识别已保存项，跳过且不更新旧项名称、密钥、能力或默认选择。不同供应商保持独立。已有 Subagent 引用无需改写。
- 模型列表中的“添加同供应商模型”复用连接参数及宿主密钥引用；不把已保存密钥回显到界面。地址或协议变化时不得沿用引用，须填写新密钥。
- 批量新增预先校验所有条目、容量和加密可用性；逐项返回 added/existing/failed。部分失败保留成功项与失败草稿，显示失败原因，重试时已有项继续跳过。保存期间禁止修改或关闭表单。
- 批量新增不逐项串行联网检测能力；保存后由已有单模型能力检测、文字测试和编辑入口核对。列表可见不代表当前协议、工具、图片或思考能力已经验证。视觉能力不由目录推断；高级配置应用于本次新增的全部模型，可保存后分别编辑。

## 只读协议与安全边界

查询日期：2026-10-13。依据 [OpenAI List models](https://developers.openai.com/api/reference/resources/models/methods/list) 与 [Anthropic List Models](https://platform.claude.com/docs/en/api/models/list)。OpenAI Chat/Responses 共用配置地址下 `/models`，Bearer 认证；Anthropic 根地址补 `/v1/models`，已有路径保持，使用 `x-api-key` 与 `anthropic-version: 2023-06-01`，按 `has_more`/`last_id` 和 `after_id` 翻页。中转未必实现该接口，404/405、权限失败、空列表或格式不兼容明确提示重试/手动添加；列表获取不作为保存的前置条件。

宿主只读请求复用现有显式模型代理，禁止重定向；15 秒总请求预算，每页最多 2 MB、20 页/2000 项，超限显示已获取范围。响应正文不直接作为错误输出，草稿密钥在宿主错误中脱敏。改变地址、协议、密钥或代理时清空发现状态、移除下拉并忽略旧请求回包。重新获取先清空旧列表，失败后不继续展示上次成功列表。成功空列表允许打开下拉查看空状态并手填。

接口示例（假密钥）：

```json
{"type":"modelDiscover","baseUrl":"https://example.invalid/v1","protocol":"openai-responses","key":"fixture-only-key"}
{"type":"modelBatchAdd","connection":{"provider":"example","baseUrl":"https://example.invalid/v1","protocol":"openai-responses"},"models":[{"modelId":"model-a","name":"model-a"},{"modelId":"model-b","name":"model-b"}],"key":"fixture-only-key"}
```

代码：`shared/types.ts`（可执行 IPC schema）、`main/model-discovery.ts`（有界只读获取）、`main/settings.ts`（凭据引用、批量保存）、`main/main.ts`（宿主 IPC）、`src/ModelPicker.tsx`/`src/SettingsModal.tsx`/`src/settings-focus.css`（独立行与逐行下拉）。空白新增行不经去空/去重处理，行身份独立于 model ID；Escape 关闭下拉并回输入框，Tab/Enter 可选列表项。

## 验收记录

- `npm run check`、`npm run build`：通过。build 有已有的大于 500 kB chunk 提示，不影响本轮成功。
- `npx tsx --test --test-concurrency=1 tests/model-discovery.test.ts tests/settings.test.ts tests/model-limits.test.ts tests/subagent-settings.test.ts`：41/41 通过。包括新增模型目录协议/真实 CONNECT 代理/分页/错误与有界响应、批量前置验证/重复/部分失败重试/凭据引用保护，以及旧容量、设置迁移和 Subagent 回归。
- `npx tsx --test --test-concurrency=1 tests/model-proxy.test.ts`：3/3 通过，正式 Pi 文字/会话/只读审查代理、522及取消保护保留。首次与四组回归并行时该旧测试子进程在 168887 ms 异常退出、仅报告 test failed，41/42 通过；独立复跑无需代码修改后全部通过，异常根因未确定，保留原记录。
- `scripts/model-discovery-ui-smoke.mjs`：最终独立输入框/逐行下拉版本 8/8 通过，`.test-data/model-discovery-ui-1791864003305/result.json` 保留完整结果与请求路径，同目录 `01-multiple-rows-dropdown.png`、`02-failure-manual-rows.png`、`03-narrow-form.png` 为最终截图（下拉名称和 ID 分行）。包含空白行增删、未获取与404不显示下拉、成功后每行下拉搜索只填当前行、Escape关闭列表、两个模型真实保存、同供应商手填多框去重/密钥引用、原项id/default不变、改地址/协议移除旧下拉并忽略旧请求、640窄窗和实际应用重启读回。pageErrors为空；最后 CSS 微调后 build 和这8组UI补验通过。前一轮新 UI 8/8 在 `.test-data/model-discovery-ui-1791863963024`，仍保留。
- UI 夹具失败保留：`.test-data/model-discovery-ui-1791863845940` 在选项 accessible name 的 exact 匹配遗漏附带 ID；`.test-data/model-discovery-ui-1791863918145` 在协议 select 标签的 exact 匹配遗漏 option 文本。两次为夹具定位失败，调整选择器后8/8通过，无业务实现修复。之前复选/textarea 版本证据 `.test-data/model-discovery-ui-1791863562170` 已被最新交互取舍替代，不能作为新 UI 通过依据。
- 主代理最终截图及 `result.json` 人工审查通过：独立行/逐行下拉符合最新要求，下拉显示名称和实际 ID 分行，不再粘连。

仅使用内存存储、隔离 profile、假密钥与本机 HTTP 上游，不修改真实用户配置。

未验证：真实外部供应商和中转模型列表、其协议及工具/图片能力。此功能不新增 MCP 发布或 SMB 双机证据。未打包。涉及主进程 IPC，查看修改需重启开发应用。

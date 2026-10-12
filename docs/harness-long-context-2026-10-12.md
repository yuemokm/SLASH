# 长资料原文窗口与既有全文读取

日期：2026-10-12。关联 F02/F08/F10、PF03/PF05/PF09、QE05。范围是已有通用内容审查选段的确定缺口；没有新增执行底座、压缩器、工具或权限。

## 复用判断

先读取[Pi 生态调查](pi-harness-reuse-options-2026-10-12.md)及[固定源码评估](harness-source-reuse-review-2026-10-12.md)，并于本轮重新打开 [Pi 目录](https://pi.dev/packages)：`billion-context` 为 1.2M/mo，`context-mode` 为 102.1K/mo。这是目录实时月下载展示，与早先同日快照不同，不能视为稳定性证明。版本/许可沿用同轮固定调查：前者 0.1.195，目录 MIT 而上游另有出处条款；后者 1.0.169 / Elastic-2.0。未安装、升级或运行这两个候选。

前者会引入另一套压缩/路由所有权；后者的 Pi lifecycle + MCP 接口能够无界面接入，但还需要执行路由、文件访问及网关兼容验证。它们均不适合直接修复这处已有选段函数的窗口偏移问题。Slash 继续使用 Pi 0.86.1 唯一原生压缩，保留已有数据。

已打开 Deep Agents JS 固定 commit `389e8da2325cd726171a32f6f1ce9103c8789119` 的 [fs.ts](https://github.com/langchain-ai/deepagentsjs/blob/389e8da2325cd726171a32f6f1ce9103c8789119/libs/deepagents/src/middleware/fs.ts)，参考其长回执保留全文、明确导航及保存失败的原则。该版本清单 1.14.2 / MIT；其 LangChain 中间件不是 Pi 的直接插件。本轮不复制其源码，也不引入 FilesystemBackend 或第二套上下文状态。

## 已复现缺口及最小契约

`main/content-review-text-excerpts.ts` 已有关键词相关度、最多8段、同预算、Markdown 标题链和下一同级/上级边界。实际缺口是：对长段全文命中关键词后，只截段首，段末命中的原句仍可能完全缺失。

实施前用6000字符前文和段末 `TARGET FACT` 做240字符预算反例：实际范围 `[0,240]`，`targetCovered=false`，限制为 `BODY_EXCERPT_LIMIT`。这是确定性选段缺口；不能由此推断原 QE05 业务错误或无效 finding 的唯一原因。

本轮沿用已有类型/固定 limitation，无持久 schema、数据库迁移或外部接口变化：

- 全文能容纳时仍提供完整原文；HTML、Excel 专用选段保持原逻辑。
- 对超预算通用段落，优先保留第一个实际关键词命中附近的原文；最多保留128字符前文，前文成本计入同预算。较小预算的前文不超过预留窗口的四分之一。
- 标题文本仍通过原标题链/边界策略预留；正文窗口保持原 UTF-16 偏移、原行号和冻结文本哈希，不生成摘要或替换文字。
- 无命中或命中已经在首个窗口中时保持原段首逻辑。词重合只选候选上下文，不判定业务事实、许可或完整覆盖。
- 有遗漏继续 partial，窗口跳过前文记录 `BODY_EXCERPT_LIMIT`；单窗口不能保证多个相距很远的关键词全部覆盖。预算/8段/总 prompt 限制不扩大。

窗口执行例：`# POLICY` 下长段末存在目标条款，240字符预算内提供标题、条款前文、条款原句与下一分节标题；省略的长前文仍保持未审查。

## 全文回读现状

`main/authorized-read.ts` 已有受控 `read_file`：复用 Pi `createReadToolDefinition` 行分页；超长单行明确返回 `nextRead`，字符分页 UTF-16 0起算、每页最多12000；`expectedContentHash` 可拒绝变更版本，每次复核授权与取消、生成原来源读取回执。`read_draft`、任务验收另有各自现成分页。本轮没有重复实现分页/磁盘 offload，现有全文读取保持。

独立内容审查本身只审冻结输入中的选段，没有新的工具回读能力；来源完整快照保留在宿主输入，未提供内容不能宣称模型已审查。原文可达性与真实模型是否使用原文是两个不同验收项。

## 检查与边界

新增5项到 `tests/content-review-text-excerpts.test.ts`：长段末条款和标题背景；无标题长单行、CRLF、中文、emoji、İ 大小写展开后的原 UTF-16 坐标；早期匹配及确定性；无命中回退；实际有界 prompt 的原句、原 hash 和 partial 限制。专项13/13通过。

相邻回归命令 `node --import tsx --test tests/content-review-text-excerpts.test.ts tests/content-review.test.ts tests/content-review-html-selection.test.ts tests/content-review-spreadsheet-selection.test.ts tests/content-review-cross-sheet-selection.test.ts tests/content-review-allocation.test.ts tests/content-review-identity.test.ts tests/authorized-read-concurrency.test.ts` **74/74通过**（包含上述13项，不相加）。覆盖原文绑定、无效引文拒绝、HTML/Excel选段、预算分配、当前Service身份缓存及授权分页并发。`npm run check`、`git diff --check` 通过；diff检查仅有既有仓库LF转CRLF提醒。

离线证据在 `.test-data/harness-long-context-20261012-window/comparison.json`，脚本 `replay.ts`、`new-input.json` 保留。从 git HEAD 保存旧选择器，两类确定反例均 `targetCovered=false→true`，原文本哈希不变。

对冻结QE05 snapshot 重建当前输入，报告仍为 `d926cd23ba5ad1a27b7b2e14ee69e82da9b3b6459a68d287b12bcfb8a592fe8a`，原请求、来源全文和原正式评分文件未改。使用**同当前 builder，仅替换旧选择器**做隔离对照，新旧 `inputHash`、`promptHash` 完全相同，prompt 33344/59392字符，来源范围相同；说明这处窗口修复没有改变该真实样本，不能归为QE05质量提升。更早wire v3冻结输入的差异另列 `oldFrozen`，不能混算本轮收益。

真实模型、桌面UI、外部发布、SMB双机没有由此子任务验证；没有构建或打包。主控另行执行最终集成验收。主进程选择器修改后需重启开发应用。

流程源：[harness-long-context-2026-10-12.mmd](harness-long-context-2026-10-12.mmd)。

通俗解释：资料里的关键句在长段末尾时，现在会把那一小段原文带给审查模型，并保留它属于哪一章。其余没提供的内容仍然算没审查，完整资料也没有删掉。

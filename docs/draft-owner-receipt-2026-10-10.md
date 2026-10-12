# 草稿回执的实际 Run 归属

关联 QE12、当前 PRD/原型修改交付、ChangeSet 版本检查与同会话恢复。真实 QE12 首次原型查询中，模型给 draft.parentRunId 填入了字面占位符 `current`，随后一次才改为真实 Run ID；两次 artifactId 仍为 `current`，因而先被成果身份校验拒绝。只读核对确认现有 read_draft/edit_draft 有 changeId/hash，却没有直接给草稿当前 owner。这次给已有回执补充权威定位信息，沿用已有工具与权限；不宣称缺少 owner 是本次全部工具失败的原因。

## 契约与来源

`shared/draft-edit.ts` 沿用现有 receipt TypeScript 契约；输入 readDraftSchema/editDraftSchema 不变，不让模型填写或修改 owner。

| 回执 | parentRunId 来源 | 意义 |
| --- | --- | --- |
| read_draft，source=pending | 本次真实 snapshot 的 `s.pending.runId` | 当前草稿 owner；可能是合法恢复祖先，与调用 Run 不同 |
| read_draft，source=applied | 省略此字段，同时省略 changeId | 已保存文件，不虚构 pending 或 owner |
| edit_draft 成功 | 最终提交 `change.runId` | 提交后的实际 owner；合法续作编辑成功时转为新 Run |

`DraftReadReceipt.parentRunId` 为 optional 以表达正式文件无此字段；当前 pending 必返回。`DraftEditReceipt.parentRunId` 为必填，因为成功编辑会产生/更新 pending。历史操作记录不会补字段或改写；使用最新 read_draft 回执，不把旧结果缺字段解释为当前 Run。没有数据库迁移或新工具。

实现只在 `main/draft-edit.ts` 的两个成功回执取值，并在 `main/agent.ts` 的 read_draft/edit_draft 对应说明行解释复制方式。owner 仍由宿主已有 Change.runId 管理，`originRunId` 和 `resumptionHistory` 仅表示历史；原件哈希、精确草稿 ID、CAS、资源锁、取消及显式恢复链校验继续沿用。

原型引用复制 `{changeId, expectedContentHash: contentHash, parentRunId}`。显式 CSS/JS 依赖也按各自最新草稿回执复制，不能假设其 owner 总与入口相同。原型现有 `prototypeDraftTargetSchema`、`draftChanges` 的 owner/权限校验保持严格，未改为自动猜测或默认当前 Run。

## 已有可信回执与缺口

原型 define/get 的 `target.draft.parentRunId`、`runRequest.input` 以及 manifest 中的 draft metadata 已提供权威 owner，可直接复用；但首次 get/define 前须已有正确引用，不能用后续成功回执解释首次该如何找 owner。Service `taskPrototypeTarget` 也按 Change.runId 生成正确引用，属于内部宿主组装。

恢复输入定位清单仅含 `originalRunId=originRunId ?? runId`，在多次续作后可能与当前 owner 不同，不能填到原型 parentRunId。新增 read 回执补齐首次及续作读取后的信息；不扩大普通发送或跨会话接管权限。单纯读取、匹配失败或取消仍不转移 owner。

## 验证与限制

`tests/draft-owner-receipt.test.ts` 用真实隔离 Files/Store、DraftEditDomain 与 PrototypeAcceptanceDomain 验证：

- 续作读取返回实际祖先 owner，不取调用 Run 或 origin；读取不转移所有者，回执能绑定现有原型 snapshot，猜当前 Run 和无关 Run 仍拒绝。
- 续作编辑成功返回新的 owner；同卡历史保留，旧 owner 与混合依赖省略 owner 仍拒绝；分别复制入口/依赖回执才成功，原件仍未落盘。
- 已保存文件读取省略 owner，新建 pending 的编辑回执给实际新 owner；原正式文件保持原状。

`tests/draft-resumption-service.test.ts` 在真实 Service 连续两次恢复中核对读取前 owner 与提交后 owner；只读中断的下一轮仍读祖先 owner。`tests/draft-edit-service.test.ts` 核对网关回执、pending→apply→正式文件省略 owner；既有权限、冲突和锁测试继续运行。新增 owner 测试也拒绝将回执字段塞入 read/edit 输入，不允许调用方伪造 owner。

实际执行 `node --import tsx --test tests/draft-owner-receipt.test.ts tests/draft-edit.test.ts tests/draft-edit-service.test.ts tests/draft-resumption-service.test.ts tests/prototype-acceptance-draft.test.ts`：**47/47 通过**，零云调用。新增回执与原型身份检查互通；本机脚本化 runtime 不作为云模型准确性验收。类型检查和统一构建由主代理负责，本代理未执行 build。

本次没有新模型请求、修改验收身份校验、创建新工具或依赖、构建或写 dist。主代理统一构建后，新的 Agent/主进程行为需要重启开发应用才生效；真实模型是否能正确复制新字段仍需后续实际任务观察。

流程：[草稿 owner 回执 Mermaid](draft-owner-receipt-2026-10-10.mmd)。

简单解释：软件现在直接告诉模型“这张草稿目前属于哪次任务”，避免它把“最早是谁创建”或“现在是哪次任务”误当成正确归属。跨任务权限仍按原规则检查。

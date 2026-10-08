# 2026-10-06 任务恢复与未完成草稿承接

关联需求：运行可见性与同会话恢复、ChangeSet 版本检查和资源锁、Plan / Build 权限边界。产品入口沿用原生 `resume` IPC，新增对会话输入中精确继续词的受限路由；不重放未知结果的外部操作。

## 行为与安全边界

明确恢复只允许同会话的 `failed` / `interrupted`、可恢复且原 runtime 已完全退出的 Run。宿主在新 Run 启动前记录 `resumedFromRunId`、尝试次数并关闭父 Run 的重复恢复资格。任务模式和权限不变；Plan 恢复仍只读。取消的 Run 不进入恢复，项目变化、结果未知的外部/数据库操作继续阻止恢复。

Build 恢复可以读取并增量编辑显式恢复链祖先持有的普通 pending 草稿。每个祖先必须同会话、同项目、同权限、Build 且终态无活动写入。普通发送、另一会话、非恢复关系均不能接管其他 Run 的草稿。仍需读取当前草稿并传精确 `changeId` / `expectedContentHash`；正式文件基线与资源锁的检查保持生效。只有增量编辑通过事务和版本核对后才转移草稿所有者，保持同一草稿卡、原始文件基线、`originRunId` 和 `resumptionHistory`。单纯读取或编辑失败不转移所有者，也不应用半成品。

恢复输入附宿主核对过的草稿定位清单，字段为 mountId、path、changeId、currentHash、originalRunId。清单不包含正文，明确标记为数据而非指令，不代替 `read_draft`。只包含当前授权且正式文件版本匹配的普通草稿；最多 30 项、12,000 字符。正式文件先检查 regular file 和 2MB 上限，再验证 UTF-8 / 非二进制；无法核对的项省略。专用处理/模板草稿不通过此通用恢复路径承接。草稿卡显示原任务续接标记和次数，来源可追溯且不重复创建旧卡。

会话发送的文字 trim 后严格等于“继续”或“继续任务”，且无附件（空数组允许）、无工作流、无内部 Run / Plan 来源时，才考虑转官方恢复。只选择该会话 `startedAt` 最新 Run；它必须失败/中断且可恢复，当前模式、权限、实际选中的 modelEntryId 与原 Run 精确相同，显式思考档位也不得不一致。内部恢复调用带宿主父关系，避免递归。含标点、附加指令、改变模型/模式/权限/思考、后续已成功或不可恢复时均保留普通发送语义，不搜索更旧失败任务，不按自然语言猜测。

## 精确编辑错误

真实 Responses 合成任务已成功创建小骨架并 `read_draft`。其失败编辑携带正确 hash 但漏传 changeId，旧提示将其描述为内容变化。现返回 `DRAFT_ID_REQUIRED`，提供当前已授权 ID 并说明必须复制读取结果的两个字段；未执行写入。错误 ID 或过期 hash 仍返回真正 `VERSION_CONFLICT`，不补 ID、不改变 hash。

该 Responses 测试因原 harness 在 600 秒主动取消，实际 Run 为 cancelled，不作为可恢复失败处理，也未修改状态。Completions 对照曾连接失败；正式恢复与原型功能的真实验收由独立隔离脚本记录，本文件不将本地 fake runtime 回归当成云集成成功。

## 代码与验证

- `main/service.ts`：执行前恢复关系、显式祖先链、宿主定位清单、精确继续词路由。
- `main/draft-edit.ts` / `shared/types.ts`：权限边界、缺失 ID 提示、成功编辑的原卡所有者与历史。
- `main/agent.ts`：pending 编辑必须传 ID 和 hash 的工具说明。
- `src/App.tsx`：草稿续接来源标记。
- `tests/draft-resumption-service.test.ts`：连续恢复、祖先草稿、跨会话/普通发送拒绝、原 runtime 退出、取消/Plan、错误 ID/hash、正式文件冲突/锁、超大/二进制元数据排除。
- `tests/exact-continue.test.ts`：精确输入真实 Service 路径同卡编辑、拒绝变化条件、按最新时间选择且不搜索更旧失败。

流程见 [草稿恢复 Mermaid](diagrams/draft-resumption.mmd)。源代码通过检查与定向回归后由主代理统一构建；当前实际云任务使用固定构建，未在任务执行中替换 runtime。

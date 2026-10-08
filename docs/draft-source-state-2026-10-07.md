# 2026-10-07 草稿应用后的读取与继续编辑

关联任务恢复、普通草稿增量制作与 ChangeSet 版本检查。会话生成时用户可以查看并应用当前草稿；随后 Agent 必须根据新的读取回执继续，不能沿用已应用卡的 ID。

## 已证实问题

隔离合成任务的第二次正式恢复 f85f4b52… 在 16:12:58Z 成功增量修改 ca22f095…，约 29KB 内容的 hash 为 bd60b680…。该卡 16:13:23Z 已进入已应用状态，版本备份与正式文件一致。后续读取返回正式文件（baseHash=contentHash、没有 changeId），但旧 notice 仍说“草稿尚未应用”，模型继续沿用旧 ca22 ID，三次编辑遭 VERSION_CONFLICT。最终模型任务 succeeded，但续作 harness 的 pending 门禁拒绝，不能据此称完成交付。

旧操作记录没有普通 apply 的调用来源，不能仅凭旧 DB 指认具体操作者。full_access 只允许能力审批，没有自动应用分支。真实 session 中新 UTF-16/default8000 工具声明已更新；小块读取均来自模型显式参数，未发现宿主默认值或回执被截断。该事实与此次准确状态修复分开记录。

## 契约与兼容

`DraftReadReceipt.source` 为兼容可选字段，当前宿主总会返回 pending 或 applied。pending 返回当前 changeId、contentHash、正式基线 hash，并明确尚待应用。applied 表示当前读取已保存正式文件，无 pending：省略 changeId，返回必填 contentHash/baseHash，notice 明确应省略 ID、按最新 hash 创建新 pending。UTF-16 分页契约与实际内容不变；状态字段不扩大权限。

无 pending 却携带旧 ID 时返回 `DRAFT_ID_STALE`，要求重新 read_draft，并按回执缺少 changeId 时省略该字段。宿主不自动接受旧 ID、不自动补 ID、不替换 hash；正式文件变化的 hash 冲突仍返回 VERSION_CONFLICT。正确无 ID / 最新 hash 的增量编辑生成新 pending 卡，以当前正式文件为 before 基线，不改变已应用历史。

示例读取正式文件回执（其他分页字段略）：

```json
{"source":"applied","contentHash":"<宿主64位hash>","baseHash":"<同一正式文件hash>","notice":"当前为已保存正式文件，没有待应用草稿；编辑须省略 changeId…"}
```

## 最小应用审计

普通应用接入既有 operations 表的 `apply_draft`：executing / succeeded / failed 保存来源、changeId、mount/path、内容 hash、原基线、开始时 Run 状态和最终 Change 状态；不保存正文。UI 应用按钮在兼容 apply IPC 中附 source=ui；其他/旧 IPC 缺省记 ipc，宿主直调缺省记 host。来源是入口标记，用于定位调用链，不作为身份或授权依据。

保留运行中应用行为；资源锁、正式文件版本检查和失败不覆盖仍生效。不增加复杂审计系统、不新增设置。

## 验证

`tests/draft-edit-service.test.ts` 通过真实 Service / Files 交错：pending read → Service.apply（Run 仍 running）→ applied read → 旧 ID 拒绝且无新写入 → 外部变化旧 hash 拒绝 → 无 ID / 最新 hash 编辑成新卡。继续验证应用冲突、成功/失败来源审计和兼容 IPC schema。工具描述同步准确状态与 ID 规则。

`npm run check` 与 50 项草稿/恢复/预算/流错误定向回归通过，日志 `.test-data/draft-source-state-targeted-20261007.log`。源码由主代理统一构建；本地回归不替代新构建下的真实模型修订与独立原型验收。流程见 [草稿状态 Mermaid](diagrams/draft-source-state.mmd)。

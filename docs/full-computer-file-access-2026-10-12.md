# 完全访问与运行中切换

2026-10-12，按用户最新明确取舍替换上一版“识别明确目录并持久登记只读 mount”的默认行为。上一版记录及历史自动目录保留，不删除用户资料，也不将旧检查当作此次全盘访问的证据。

完全访问现在提供本会话的虚拟 `computer:<conversationId>` 文件范围。Agent 可通过现有文件网关指定本机绝对路径，读取、按指定目录列举/检索、创建或修改草稿；正式写入仍走 ChangeSet、版本检查与资源锁。没有持久全盘 mount，没有启动全盘扫描或索引，也不提升 Windows 用户身份。官方 Codex 对 Full access 的文件范围说明作为本次产品取舍参考：[Sandboxing](https://learn.chatgpt.com/docs/sandboxing)。本次没有扩大网络或外部发布范围。

活动任务的权限菜单调用可信 `runPermissionModeSet`，绑定 conversationId 与当前 runId，等待宿主更新成功后显示实际模式。闲置会话保留同会话当前模式；不同会话互不借权。降回标准权限后，电脑范围及历史电脑引用不可继续使用；重新选择完全访问不会让降权前已启动的旧异步工具恢复资格。Plan 保持只读，能力 deny、禁用目录、用户显式只读目录与参考原件保护仍优先。历史自动只读授权不被当作用户主动禁止写；用户明确设置只读后仍受保护。

电脑工具的绝对输入会转换为稳定盘根目录标识和相对路径。返回引用保持既有来源、草稿、处理及验收 schema；`write_draft` 返回 mountId/path，后续 `read_draft` 原样复用。Word/Excel 可作为电脑来源，经现有 copy_for_processing → extract_text → 项目过程文件链读取，不把全盘当处理目录。宿主内容审查、来源版本核对与用户应用草稿同样使用当前授权；不是只让模型的直接读取放行。

补充消息在宿主队列中可编辑/取消；普通补充在 Pi 公开 awaited turn_end 的正常停止边界每次送一条，立即发送用 steer。真实提交后的原始用户文字写回会话一次，未送达不冒充已送达。准备阶段附带宿主当前模式与电脑范围回执，运行中从 standard 切 full_access 后模型不会仅依赖初始提示中的旧模式。没有为切权限自动发起模型请求，也没有修改项目 Skills。

本次实际失败诊断：原用户精确目录是在已经运行的原生会话中追加，之前 fresh-only 自动授权不覆盖此入口。当前 `%APPDATA%/slash` 数据库未找到与该原生会话匹配的 Run，因此无法证实原失败 Run 的实际 permissionMode；不能把数据库空记录猜成用户没有选择完全访问。没有修改用户当前 profile，也没有重跑其原 PRD 任务。

最终有效证据位于 `.test-data/full-access-followup-20261012/`：

- `combined-attempt3.log`：38/38、exit 0，覆盖 Service 活动 standard/full 切换、读/列举/检索、降权后异步拒绝、跨会话借权拒绝、外部草稿应用/版本冲突、XLSX 处理来源链、Plan/禁用/只读保护，以及普通目录和电脑引用共享物理文件锁。原 35/38、37/38 失败保留，锁兼容修复未改断言。
- `tool-ref-attempt2.log`：真实 Service → Pi → 本机合成 HTTP，write_draft 后按真实回执调用 read_draft，1/1、exit 0。首轮仅夹具把 content 错写为 text 的失败保留。该测试不使用付费模型，不代表远端模型业务正确。
- `final-check-ref-exit.json` 与 `final-build-ref-exit.json`：最终 check/build 均 exit 0。上一轮缺 mountId 返回字段的 check/build 仅作为历史保存。
- 队列独立证据 `.test-data/run-input-queue-ui-20261012/final-result.json`：28/28 Service/Pi 与队列检查、renderer 0、实际 App 9 场景；其中界面夹具不是完整 Electron 管理 IPC。
- 单次短 Wangshu 验证 `real-f41f2db1-79b4-47e0-a483-40dd4e6b1ef0/evidence.json`：原 session 35696 实际 exit 0，同 Run 从 standard 开始，运行中可信 IPC 切 full_access，follow_up 实际 delivered，约 47 秒自然 succeeded；回复包含未在 prompt 提供的临时标记。`model-tool-pair.json` 封存真实 read_file 的 computer scope/绝对路径、正常工具结果 hash，以及规范来源 receipt 的同字节 hash。PID 3428 正常关闭并确认退出。该次沿用已配置 Wangshu gpt-6-astra/openai-responses，未改变模型路由；实施代理为 GPT-6.1 Sol / High。它仅检验活动同 Run 的权限切换与读取临时外部文本，不是完整 PRD/原型质量验收。

代码接点：main/computer-file-scope.ts、main/files.ts、main/authorized-read.ts、main/service.ts、main/agent.ts、shared/evidence-search.ts；可信 IPC 和实际权限 UI 沿 shared/types.ts、main/main.ts、src/App.tsx、src/ComposerControls.tsx 接入。没有新增依赖、表或数据库迁移。每次工具仍校验 OS 文件可达性；操作系统拒绝、明确禁用或受保护原件不能由“完全访问”越过。

通俗解释：切到完全访问后，Agent 不用先把每个项目外文件夹加进目录列表。任务进行中切换也立即有效；切回标准权限后停止电脑范围访问。改文件仍先保存草稿，避免悄悄覆盖用户的原文件。

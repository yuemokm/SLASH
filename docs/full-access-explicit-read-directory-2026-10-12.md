# 完全访问下的用户明确资料目录

历史实现记录：本页的 fresh-only 自动只读目录方案已被用户后续明确的全 PC 文件访问取舍替代，当前行为见 [完全访问与运行中切换](full-computer-file-access-2026-10-12.md)。原证据保留；下文不代表当前默认权限范围。

2026-10-12。需求依据：当前用户指定目录读取故障，以及 product-spec.md 的目录授权、显式禁止、Plan 只读和完全访问权限约定。

此前完全访问只自动放行能力级 ask，search_files/read_file 仍只能使用已登记 mount。用户直接说“根据 C:\Users\yuemokm\Desktop\qianhe\qh PRD\参考 下的资料，生成prd文档”，目录没有登记时，模型拿不到对应目录 ID。此处属于应用范围限制，不是 Windows 管理员权限不足。

现在 fresh send 完成会话、工作空间、模型和权限时机核对后，仅在本 Run 为 full_access 时，从当前用户原始输入保守识别明确资料目录。截图句式、完整引号路径和单独路径可保留空格与中文；路径歧义或不存在会明确失败，不尝试授权更大的父目录。否定、Markdown 引用、整段引文、代码块及 untrusted 数据不自动授权。检测不是通用自然语言理解，不能声称能理解全部否定句式；单文件路径不自动挂载父目录，本轮只支持资料文件夹。

宿主先核对所有精确目录，再沿既有 Mount/工作空间持久化路径同步登记，只新增只读 mount。已启用父目录可复用；禁用范围与新增父/子目录重叠时拒绝，workspace_read deny 仍优先。授权历史按 Run/input hash/mount/原路径写既有 KV，无新表或迁移。资源设置里可见、可撤销；resume 或由方案生成的后续执行不重新授权旧路径。手动目录原有授权不改变。

新自动目录保存 readRootIdentity，Files.resolve 每次核真实根，索引也拒绝真实位置发生变化的自动目录。目录或祖先被替换成 junction 后不会按新位置读取。State 保存及目录开关在原对象上更改，保留此字段；自动授权不提升 write。仍沿真实路径、原件保护、版本核对和工具网关读取，不开放全盘或新模型工具。

代码位置：main/explicit-read-directories.ts、shared/explicit-read-directories.ts、main/service.ts fresh send、main/files.ts、main/agent-index.ts、shared/types.ts。独立聊天呈现调整位于 main/reply-presentation-guidance.ts 与 main/agent.ts 的真实 Pi loader：长回复可用标题/少量粗体/列表，普通说明不包代码块。它不改项目 Skills、业务规则或原型页面，也没有用付费模型验证格式效果。

最终有效证据在 `.test-data/full-access-explicit-path-audit-20261012/`：

- `targeted-final-attempt3.log`：权限/Files/草稿编辑/恢复组合 29/29，exit0。
- `index-pin-attempt2.log`：最终新增 12/12，exit0，含祖先 junction 与真实索引拒绝。
- `existing-index.log`：现有索引摘要/资源禁用/授权变化 4/4，exit0。
- `real-directory-service-evidence.json` / `.log`：独立 Store 与真实 Service，合成 Runtime 一次，paidModelCalls=0；Runtime mounts 含指定目录，网关 search_files 成功，Files.list 可见 7 份文件，每项 Files.resolve 成功；只读、原七文件 SHA256 前后一致。未输出正文，未修改用户实际 profile。
- `final-check.log` / `final-build.log`：npm run check 和 npm run build 均 exit0；仅既有 renderer chunk 大小提示。未全量测试、未打包。

历史失败保留：`targeted-attempt1.log` 9/10，Plan 合成 Runtime 没有输出可确认方案；修夹具后 10/10。名称 `index-pin-final.log` 是历史失败 11/12，Windows 文件监测句柄导致夹具 rename EPERM；停掉夹具自身监测、模拟关闭监测后的真实目录替换后，最终有效日志为 `index-pin-attempt2.log`，不能用旧文件名推断通过。

限制：实际用户原失败 Run 未重跑，PRD 业务正确性未验证；大型 Word/Excel 仍须原有官方处理副本/提取流程，目录可读不等于全文已经进入模型。APPDATA 下默认 profile 的只读调查不能认定为截图所属 profile。主进程及 agent 改动需关闭并重新双击根目录“双击启动开发环境.bat”。

# G4 隔离备份恢复与回退验收设计

状态：本机隔离恢复验收已执行，6/6 通过。仅新增独立 `tests/store-backup-restore.test.ts`；没有修改生产源码、默认路径、脚本、构建目录，也没有打开真实 profile。旧安装包桌面回退及真实用户 profile 替换仍未验证。

环境边界：用户已明确目前没有第二台 Windows 电脑，SMB 双机验收保持未验证。以下恢复验收只证明本机隔离 profile 与资料副本，不算双机验收；保留 SMB 功能，也不影响本机开发与评测继续。

## 固定边界

真实 profile 与真实工作区全程保持原状。旧 Store 的代码会无条件写 `user_version=2`，因此不能用旧程序直接打开新版真实 profile。回退先建立独立 profile 与独立工作区，旧程序只读取/写入该副本。

备份数据库不等于备份全部资料。必须同时保存旧/新 profile 的持久目录及工作区文件：会话 agent、草稿/版本、原型证据、附件、本机记忆、资料与成果；目录引用要记录原始指纹与隔离映射。缓存可不带入运行副本，但不为减小验收夹具删除原件。

## 可执行入口与夹具

独有 `tests/store-backup-restore.test.ts` 使用现有 Node SQLite、Store、Service 与 fs，无新增依赖、无真实模型或云连接。已执行定向入口：

```powershell
node --import tsx --test --test-concurrency=1 tests/store-backup-restore.test.ts
```

每例 `mkdtemp` 建立独立父目录，分成 `upgraded-profile`、`rollback-profile`、`return-new-profile`、`evidence` 和各自 workspaces。每次复制/打开前断言绝对路径位于该例临时父目录；拒绝路径相等、跨目录与 UNC。SQLite/Service 闭合后仅清理本例生成的临时目录，真实 AppData 不进入夹具。日志保留，临时无凭据数据在验收后删除。

夹具矩阵为 v0/v1/v2 × 迁移前后恢复。旧 Store 从固定 commit `1e5303ba7dddab7d2ff9985833f7ff3062593c24` 提取到临时作用域，源码 SHA-256 为 `53ba252bb4e377f2cb5523c27e80dcde7dc12f7ba4a7b27a8195db6e16ccc5e2`，没有用当前 Store 模拟旧运行时。Git 只有旧 v2 Store；v0/v1 是生成的无 events 表历史基础 schema 夹具，不能说是采集到的真实用户旧库或原 v0/v1 二进制。旧二进制桌面验收单列。

## 执行顺序及断言

| 步骤 | 执行动作 | 必须通过的断言 |
| --- | --- | --- |
| 1 旧数据种子 | 写旧库 kv、真实 operations/events；在独立 workspace/profile 写来源、成果、草稿、版本及会话文件 | 记录每张表的行与关键值、stream 序列、每个持久文件的相对路径/字节 SHA-256；所有数据均为生成的无凭据夹具 |
| 2 当前迁移 | 当前 Store 打开旧库，取得真实 `slash-before-v3-*.sqlite`；退出再打开 | v3、旧行与文件保持；备份 v0/v1/v2 与旧 kv/events/operations 全内容可读；每次打开不重复迁移 |
| 3 产生新数据 | v3 写新的 kv、event、成功与未决 operations、recovery 侧记录；创建新草稿/版本/会话与成果文件 | 记录迁移后新旧数据全集和文件全集；用户核对前/后版本与未知事实均列入，不只比较记录数 |
| 4 保存当前完整快照 | 停止业务写入，由唯一备份连接 VACUUM INTO 一致快照，随后关闭连接，再复制持久 profile/workspace 文件 | 独立 `evidence/current-v3` 保留新旧全集，manifest 与 hash 匹配；不能用正在 WAL 写入的单个 sqlite 文件复制代替一致快照 |
| 5 恢复旧快照 | 将迁移前备份复制到全新 rollback-profile 的 slash.sqlite，复制旧持久文件到独立 rollback-workspace | 先用 readOnly SQLite 验证旧版本与全集；隔离路径有效，不能继承指向真实项目的根路径/挂载 |
| 6 验证旧运行时 | 旧 Store/旧桌面只打开 rollback-profile；试读旧数据并在隔离 workspace 写一个 rollback-only 成果 | 旧数据/引用可用；原 upgraded-profile、evidence/current-v3 和原 workspace hash 全部未变；未知副作用不得自动执行 |
| 7 回到新运行时 | 将第4步 v3 快照与配套文件复制到 return-new-profile；只用当前 Store/Service 打开 | 所有迁移后新增数据、recovery 证据、新草稿/版本/会话恢复；未知操作仍挡恢复；不得因旧版测试把 schema 倒回2 |
| 8 处理回退期间新改动 | 单独保留 rollback-only 文件/记录，输出差异清单 | 不自动覆写当前 v3 的同路径成果；需要回带时走用户确认的 ChangeSet 与版本检查，不合并未知事实为成功 |

工作区路径替换只发生在“运行副本”，原快照及 manifest 保留原始引用不改写。复制前后的业务内容及版本 hash 相同；路径映射本身另记，以免把隔离适配误报成原样恢复。

## 新数据保留规则

回退后旧版只显示旧快照中的数据，这是旧版可读性的边界，不表示新版数据被删除。第4步完整 v3 快照与对应文件必须一直保留；后续回新版本可恢复全部新数据。不可把新版 KV、recovery 表或未知操作直接拼接进旧版库，也不可把旧版产生的变更自动写回新版真实项目。

当前未提供自动双向数据库合并。若验收只能保存但不能在旧版显示新版功能记录，应明确报告“已归档保留，旧版不可见”，不能报告“已兼容回退”。真实 profile 的可替换恢复需要独立备份、用户停止应用、最终审查与实际回退证据；本设计没有授权覆盖真实 profile。

## 故障注入

- 备份损坏/缺表、恢复文件 hash 不匹配、目标路径越界：在打开运行时之前失败，当前 v3 与旧备份都保留。
- 文件复制中断、恢复重开失败：保留原快照和不完整副本，不把部分完成目录切成活动 profile。
- WAL 中存在已提交的新行：一致备份与 return-new-profile 必须包含该行。
- 新版含 may_have_run/pending 操作：返回新版后仍要求核对，不因复制或旧版测试生成可信执行回执。
- 旧版回退目录产生同路径不同内容：只列冲突，真实新版成果不覆盖。
- 未来版本库和损坏 v3：当前运行时拒绝，原版本/资料保持。

## 实际证据与限制

日志：`.test-data/production-g4-store-backup-restore-20261011.log`，最终运行 exit 0，6/6 通过，`duration_ms 6334.5974`。每个矩阵例均对完整 kv/operations/events/recovery 表内容进行深比较；文件按相对路径与原始字节 SHA-256 对比，不以记录数代替内容校验。日志中的数目仅是辅助摘要。

- 真实迁移备份被复制到 rollback-profile，旧源码 Store 实际重开；迁移前 profile 持久文件及工作区实际备份后复制恢复，没有用文本字面量重建旧文件。
- 新版 7 项 kv、成功终态、未知回执、用户核对的 before/after hash，以及 7 个 profile 文件、4 个工作区文件在新快照与返回新版副本中一致。文件包括中文资料/成果、草稿、版本、会话、本地记忆和二进制附件。
- 单独复制 SQLite 主文件确实缺少 `committed-wal` 行；VACUUM INTO 快照与恢复后数据库包含该已提交行。直接证明 WAL 备份方法的必要性。
- 新版 `Service.resumeRun` 对恢复后的 pending/may_have_run 操作抛 `RUN_REQUIRES_RECONCILIATION`；模型运行入口调用次数为 0，effect 文件保持一次。成功操作及人工核对的原始未知回执保留。
- 回退期间同路径成果修改、独有文件及 rollback-only kv 保存在旧副本中；只列差异，返回新版的同路径成果和封存快照不变。没有自动双向合并。
- hash 不符、越界路径、非 SQLite 文件、缺表、未来 schema、复制实际抛错均拒绝或保持不完整副本；原归档/记录不变。恢复前检查是验收夹具步骤，没有宣称产品已提供一键恢复界面。

限制：没有使用旧 exe 安装包，也没有验证会话 JSONL 在旧桌面 UI/SDK 中实际加载、本地记忆功能读取、原型截图等所有持久目录。夹具只证明所列数据和文件的完整保存与恢复；真实用户全 profile 替换、文件 ACL/SMB 离线权限、进程断电及双机仍未验证。用户当前没有第二台 Windows 电脑；该缺口不取消 SMB 目标。

本轮没有发现需修改生产代码的产品缺陷。测试依赖固定 Git 对象可用；源码 SHA-256 和归档 SHA-256 在日志中，未读取账号凭据/连接 args/env/用户原始资料。

通俗说明：回到旧版本前先把新版本的数据完整封存，再用另一个目录运行旧版。旧版看不到的新记录仍然保存着；回到新版本时能取回，不会为了“回退成功”把刚做的内容覆盖掉。

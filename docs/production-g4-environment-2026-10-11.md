# G4 环境只读核实 · 2026-10-11

范围：仅本机命令定位、官方 CLI help/版本/明确只读状态命令、只读 SQLite 公共元数据与 Windows SMB 查询。未运行登录、CLI 发布/预览、MCP 调用、共享创建、映射、ACL 或账号变更；未读取或输出密钥、连接 args/env 或 URL 凭据。状态命令原始响应未保留，只输出认证状态枚举和布尔摘要。本轮环境核实没有修改生产源码、脚本或测试。

| 环境项 | 已找到的事实 | 验证状态 |
| --- | --- | --- |
| 飞书官方 CLI | `C:\Users\yuemokm\AppData\Roaming\npm\node_modules\@larksuite\cli\bin\lark-cli.exe` 存在；npm 包及实际 `--version` 都为 1.0.33 / MIT；PATH 有 lark-cli.cmd / .ps1，独立 exe 位于应用现有 known-location | 离线 doctor 检查失败，明确一项认证过期；未登录或发布 |
| 钉钉 DWS CLI | PATH 找到 `D:\Tools\dws\dws.exe`，文件存在；exe 的公开版本资源为空；实际 `dws version` 返回 1.0.61 | 官方只读 auth status 返回 authenticated=true；不证明远端交付可用 |
| Slash 默认 profile | `C:\Users\yuemokm\AppData\Roaming\slash\slash.sqlite`，只读打开显示 schema v2；state 与 workspace-state 的 connections 均为空，没有共享/mapping 配置键或 UNC mount | 缺少已保存连接配置；不能据此说 CLI 未安装 |
| 其他历史目录 | Roaming 下 `PM Slash`、`pm-slash` 目录存在，但未找到 `slash.sqlite` | 没有可核对的该格式连接数据库 |
| 普通用户上下文 | 当前 `DESKTOP-5J9IQQU\yuemokm`，Session 1；token 非管理员且不含 Administrators SID；Explorer 在同一会话 | 当前查询属于普通桌面用户上下文；未提权验证管理员行为 |
| SMB 基础能力 | SmbShare 查询命令可用；LanmanServer 与 LanmanWorkstation 均 Running / Automatic | 系统服务可用；不能证明远端访问、ACL 或读写通过 |
| 本机共享 | 非系统共享 `DESIGN`、`seaanime`、`sfa-share` 已存在 | 仅列表确认；未打开共享资料、未检查权限或写入 |
| SMB 映射与连接 | 当前用户 Get-SmbMapping 0；Get-SmbConnection 0；网络逻辑盘 0；HKCU Network 持久映射键 0 | 当前没有可用既有映射/连接作为双机验收证据 |
| 第二台测试设备 | 用户本轮明确说明目前没有第二台 Windows 电脑；当前 profile 也没有远端 UNC mount 或共享邀请配置 | 双机验收缺少第二台设备，保持未验证；本机共享与本机测试不算双机通过。SMB 功能保留，后续本地开发与评测继续 |

当前 `PM_SLASH_DATA_DIR` 未设置，查询时没有运行的 slash/electron 进程。默认 profile 根据 `main/main.ts` 的现有路径规则定位；无法从未运行的应用证明其他启动器是否另设 profile。真实 profile 没有用 Store 构造器打开，因此没有触发迁移。

读取方法：Get-Command / 文件 stat；SQLite `DatabaseSync({readOnly:true})` 仅选投连接 id、kind、provider、command、enabled，URL 仅计算 origin；Get-SmbMapping / Get-SmbConnection / Get-SmbShare / Get-Service / Win32_LogicalDisk。连接为空，因此没有泄露任何连接参数或认证内容。

可识别安装文件 SHA-256：

- 飞书 exe：`589A74661706251155239640690CECF348337B482181BAB33305D6FD85DCDBDD`
- 钉钉 exe：`134111858AF3ED250D294C9ED9C4CCFB6C46DD70DF3BC5CEFE78BD8F06CA90EF`

后续真实验收还需要明确账号连接、发布目标及第二台设备身份，再分别核对文档交付和普通用户网络盘可见/读写。这些渠道仍保留为产品目标；当前发现只限制相应实机证据，不使整个生产目标阻塞。

## CLI 只读账号状态补验

先读实际安装版 help，之后只运行明确读取模式：

| 命令 | help 依据 | 结果 |
| --- | --- | --- |
| `lark-cli --version` | 根 help 的 version flag | 1.0.33，exit 0 |
| `lark-cli doctor --offline` | doctor help 明示 `Risk: read`；offline 仅检查本地、不检查网络 | exit 1；JSON 中 4 项 pass、1 项 fail、ok=false；失败项为认证过期。没有尝试刷新或登录，未判定用户/应用账号类型 |
| `dws version` | 根 help 明示显示版本信息 | 1.0.61，exit 0 |
| `dws auth status --format json` | auth/status help 明示“查看当前或指定组织 profile 的认证状态” | exit 0，authenticated=true；未保留个人资料、组织标识或认证值，也未调用发布/API |

飞书 `config default-as` 虽然 help 描述无参数可读取默认身份，但整项标记 `Risk: write`，本次没有执行。CLI 本地账号状态与 Slash 连接配置是不同事实：钉钉 CLI 的认证状态不自动建立 Slash 连接，默认 Slash profile 仍无连接。

通俗说明：飞书和钉钉工具已经装在电脑上，但 Slash 还没有保存它们的连接；共享服务也在运行，不过目前没有连接另一台电脑的网络盘。已有安装或共享名称，都不等于已经测试成功。

# 完全访问：项目外目录浏览与读取修复

2026-10-12。需求 F02/F10、PF03/PF05/PF09。用户要求完全访问能够查看项目授权之外的目录。本轮沿用已有电脑文件虚拟 scope、Files、Pi 及权限网关，没有新增依赖、数据库表或永久挂载。

## 已定位的问题

- 原电脑 scope 的精确绝对路径读取有效，既有 Service/Pi 检查 11/11 通过，不能把整个权限实现说成失效。
- `search_files` 只递归列文件，空文件夹和子目录不可见；已登记目录传 `directory` 也被忽略，仍扫描整个挂载根。新增两条回归在原实现分别返回 2 项而不是预期 3 项、2 项而不是预期 1 项，已复现。
- 模型传绝对 `directory` 却省略 `mountId` 时，原 Files 静默检索项目挂载，未查看指定目录。
- 真实 `pi-subagents` 使用独立上下文，原提示没有当前电脑 scope 和挂载 ID；旧 IPC 子任务路径另有只允许实体 mount 与丢失 `directory` 转发的问题。

## 实现与调用契约

`shared/evidence-search.ts` 增加可选 `shallow` 可执行 schema；`main/agent.ts` 和旧 `Service.runSubAgent` 均复用此契约。默认递归文件检索保持兼容。

```json
{"query":"","directory":"C:\\明确文件夹","shallow":true}
```

当前完全访问下，宿主为绝对 directory 绑定当前会话的既有电脑 scope。已登记目录仍用 `mountId` 与相对 `directory`；相对目录未绑定 ID 时明确拒绝，避免静默扫描其它位置。`Files.listWithCoverage` 实际限定指定子目录。

浅层浏览返回直接子文件和子目录。`FileRef.entryType` 区分 `file` / `directory`，目录仅有路径元数据；不读取目录正文、不产生 sourceRead 正文回执。coverage 分别统计文件/目录，分页和 resultVersion 绑定 directory/shallow；切换范围拒绝旧页。读取文件原样复用返回的规范化 mountId/path。

`computerReadContext` 为新建只读子 Agent 提供宿主当前模式、电脑 scope 和有效挂载 ID；它只是调用说明，不是权限令牌。子任务继续调用父任务原工具闭包。旧 IPC 子任务电脑读取也绑定父会话/活动 Run/权限 revision，经既有 `assertComputerAccess` 与 Files 逐次核对。

标准/自动接受仍拒绝项目外读取；Plan + 完全访问可只读列举/读取。明确 deny、禁用目录、显式只读、参考原件保护、Windows 身份、草稿/ChangeSet、版本检查与资源锁保留。本轮没有扩大写权限。

## 验收与证据

- 定向 60/60 通过：电脑范围/模式切换、读取中降权再升权、外会话拒绝、外部草稿与冲突/锁、路径穿越、浅层空目录、子目录范围、分页变化、明确禁用与 deny、旧 IPC 子任务、Pi 子任务取消/预算、参考原件与普通 Files。
- 真实 Service → Pi → 本机 HTTP → 真实 pi-subagents 链路完成父 Agent 精确目录正文检索、省略 mountId 的浅层浏览、规范化引用读取、独立子 Agent 浅层浏览/读取；另实测标准和自动接受相同请求被拒、Plan 完全访问只读成功。16 次本机协议请求；无云模型请求。原临时文件字节未改、无新增永久挂载、无成果草稿；临时 profile/文件夹已清理。
- `npm run check`、`npm run build` 均 exit 0，未运行 electron-builder、未打包。
- 日志：`.test-data/full-access-directory-20261012-{tests-final,check,build}.log`。初次组合 59/60 的失败为新测试把 Plan 的正确 `awaiting_plan` 写成 `succeeded`；另一次新夹具误将同文件正文回执去重数写为 2（实际 1），均修正断言，没有放宽产品行为。原失败日志 `.test-data/full-access-directory-20261012-tests.log` 保留。

本轮证明隔离真实本机工具/网关/子任务路径；未用用户私密目录试读、未验证真实云模型自主调用效果、未做新的桌面截图或 SMB 双机验收。主进程已变动，重启根目录双击启动开发环境 BAT 后生效。流程见同名 `.mmd`。

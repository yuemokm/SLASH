# 模型保存与开发启动稳定性（2026-10-13）

对应 F02/F03、PF03/PF09/PF10。本轮修复三项已确认审查问题，并调查根 BAT 偶发失败；未打包，主进程/preload 改动需重启开发应用。

## 实现及代码

- `main/settings.ts`、`main/store.ts`：单项模型配置和密钥在原 SQLite 中用同步 savepoint 一起保存。写入失败同时回滚持久状态，并恢复模型列表、默认与旧格式模型的内存快照；重试失败项会真正写入，已成功项和既有密钥保留。savepoint 支持嵌套，未新增数据库或依赖。
- `src/SettingsModal.tsx`：保存开始时同步更新 `busyRef`，键盘 Escape 和关闭按钮读取当前值；部分失败以本次提交的完整草稿恢复，只筛选失败 ID，连接、协议、密钥及限额保留。
- `scripts/model-discovery-ui-smoke.mjs`：使用隔离隐藏 profile，并按实际 `index.html` URL 选择与调整主工作台，避免新启动动画窗口被误认为工作台。
- `scripts/dev-electron.mjs`：Windows 用按真实项目路径区分的 OS 命名管道原子取得启动租约，编译前拒绝重复双击。本次拒绝不改已有诊断日志、不编译、不终止已有实例；进程退出或异常终止由 OS 释放，无旧锁文件/PID 复用恢复竞态。Vite 首次就绪后仍监听退出，若开发服务停止则清理本次自有 Electron 并保留失败码。端口失败不操作其他进程。

原 BAT、顺序编译、完整 HTML readiness、主窗真实数据就绪与重试、九款透明动画、默认 light 和 Windows opacity 0.99 保留。没有缓存/跳过编译、关闭 HMR 或扩大权限；Windows 之外保持原启动行为和错误日志。

## 验收证据

- `node --import tsx --test tests/model-discovery.test.ts tests/settings.test.ts tests/model-save-recovery-ui.test.ts tests/dev-electron.test.ts tests/dev-renderer-readiness.test.ts tests/dev-vite-watch.test.ts tests/startup-readiness.test.ts tests/startup-animation-settings.test.ts`：**61/61 通过**。日志：[定向检查](../.test-data/model-startup-review-20261013/targeted-tests.log)。包含真实 SQLite 写入拒绝及密钥回滚、嵌套事务、失败重试、模型编辑保护、保存中 Escape、部分失败完整草稿与 IPC 抛错、Vite 后续退出、重复启动、强制终止测试自有启动器树后重新启动、端口/HMR/启动就绪及全部动画配置回归。
- `npm.cmd run check`、`npm.cmd run build`：退出 0。build 仍有现有 renderer JS 大于 500 kB 提示；没有 electron-builder。
- `node scripts/model-discovery-ui-smoke.mjs`：**8 组真实 Electron UI/IPC 通过**。实际新增多个模型、复用受限密钥、目录失败手填、改连接阻止旧回包、640px 表单及重启持久恢复通过。证据：[结果](../.test-data/model-discovery-ui-1791879305234/result.json)。测试只有隔离资料和本机假上游，不代表外部供应商验收。
- SettingsModal 保存故障测试使用真实浏览器组件与延期返回的测试 Call，**不冒称真实 Electron IPC 保存故障**。证据：[结果](../.test-data/model-save-recovery-20261013/result.json)。上述 Electron 脚本另外验证正常 IPC 保存及实际重启。

## 启动调查及速度边界

根 `dev-startup.log` 最近一次慢轮记录编译 **9,736 ms**、Vite HTML **30,187 ms**，随后重试编译 **3,872 ms**、HTML **828 ms**。两次 Electron 退出记录是 `0xC000013A` 中断退出，不能据此认定原始 `0xC0000409` 崩溃再次发生。已有仅首页扫描和测试目录 watcher 过滤仍生效；未找到新重复生产构建、固定 sleep 或重复扫描证据。

改启动器前尝试复制后的真实 BAT 冷缓存基线：只写独立源码副本、dist、Vite cache 和空隐藏 profile，不操作用户应用与根日志。编译 **18,587 ms**、完整 HTML **2,801 ms**；总体约 **190 秒超时失败**，热轮未执行。Electron 启动器派生到诊断观察器入场之间约 100 秒，而观察器入场到 app-ready 约 2.8 秒；界面随后建窗并请求资源，但未在总期限内形成完整 UI/IPC 回执。没有原生崩溃码或 renderer 错误证据。复制/调试观察器/系统负载与产品路径的差异尚未分离，不能把这一样本等同用户双击耗时或业务初始化瓶颈。原始证据：[结果](../.test-data/startup-profile-1791878715087/result.json)、[BAT/Vite 日志](../.test-data/startup-profile-1791878715087/cold.log)、[观察器记录](../.test-data/startup-profile-1791878715087/fixture/.test-data/cold-profile/startup-evidence.json)。自有进程树已结束，用户实例未操作。

**本轮不声称稳定提速，也不声称偶发原生失败已根治。** 未上线未经实测的并行编译/Vite准备或编译缓存。确认修复的是可重现的重复启动争用与 Vite 后续失败后的失联桌面。根 BAT 在最终修改后的真实双击、长期偶发稳定性及原生调用栈仍未新增验证；本轮开发编排用实际启动器和故障注入验证，真实桌面由模型 UI 脚本验证。

通俗解释：保存失败后可以接着重试，填写的连接和密钥不会被 Escape 清空；重复双击不会同时抢着编译。软件的启动检查更稳，但暂时没有足够证据保证每次更快。

流程：[Mermaid 源](model-save-and-dev-startup-reliability-2026-10-13.mmd)。

## 用户现场卡启动续修

用户随后实际双击卡住。原启动器27948已编译/Vite就绪，Electron main27576及renderer仍存活；用户启动日志明确60秒门禁超时。现场HMR阶段日志确认初始资料已提交，但 `visibility=hidden`，没有进入正常ready。主窗初始 `show:false` 又显式 `hide()`，同时React要求隐藏窗口的 `requestAnimationFrame` 才发ready，首次绘制门槛也未满足，形成隐藏与就绪互等。此前测试主动关闭后台节流，掩盖了普通启动路径的问题。

本次先尝试只在运行时关闭节流，真实BAT仍为 `loaded=true/painted=false`、隐藏快照提交；该尝试不足，没有当作修复成功。最终从主窗创建起临时关闭节流，首次已隐藏的窗口不重复 `hide()`；React快照提交后的useEffect直接发送ready，主进程仍独立要求同导航代号、完整加载、首次绘制和真实初始数据。每轮加载关闭节流，ready/failed/close恢复明确的正常策略 `true`；失败时正常用户窗口可见，隐藏测试不显示。阶段日志仅记录门禁布尔值、代号和可见性。

只读确认卡住实例没有活动任务后，仅结束确认属于本项目的27948及第一次未完成修复验证的17952进程树；用户资料没有清理，其他应用没有终止。最终再次执行**根真实 BAT，默认5173、普通用户profile、无测试观察器或测试后台节流覆写**：启动器26760、Vite26928、Electron main28200。08:46:01Z进入 `visibility=visible`、`loaded=true/painted=true/rendererReady=true/accepted=true`，实际原生主窗标题slash、有非零窗口句柄且Responding=true，正常应用留给用户继续使用。编译5,394ms、HTML773ms，从本次启动器入场到ready约11秒；单次结果不等于稳定提速。[现场证据](../.test-data/model-startup-review-20261013/actual-current-startup.json)。未在用户profile自动点击业务按钮。

最终 `npm.cmd run check` 与主进程/preload `tsc` 通过；启动就绪/九款动画9/9回归通过。此续修证实当前真实卡启动已恢复，覆盖上节“最终BAT未新增验证”的旧边界；原历史0xC0000409异常及长期稳定性仍未宣称解决。没有打包或关闭恢复后的应用。

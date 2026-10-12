# 开发启动原生退出诊断（2026-10-12）

需求 PF10：用户双击根 BAT，主进程/preload 编译完成后退出 `-1073740791`，没有 renderer 就绪输出；用户首次重试仍失败。

## 事实与结果

- `-1073740791` 的无符号十六进制是 `0xC0000409`，属于 Windows 原生异常退出范围。仅凭该码不能定位具体函数、依赖或控制台故障；不能直接归因 GPU、前端业务或 TypeScript 编译。
- 本机使用 `C:\Program Files\nodejs\node.exe`、Node `v24.15.0`。排查时没有 NODE/ELECTRON 环境覆写。工具的 pipe 启动及实际 BAT 的 TTY 启动均越过原故障阶段，没有重现该退出。
- **用户最新在默认 5173 双击复验，确认“窗口打开并能使用”。** 该结论来自用户实际操作；本轮恢复已确认，但原生退出根因仍未证实，不能把诊断改动称为已证明的根因修复。
- 用户该轮阶段日志：launcher PID 18836，编译约 4985 ms、renderer HTML 约 2989 ms，并派生 Electron。用户进程树未被测试清理。

## 最小修改

- `scripts/dev-electron.mjs` 增加 Node 版本、TTY/pipe、启动阶段、自有子进程 PID、退出码/信号与 Windows 十六进制异常码诊断。阶段同步追加到根 `dev-startup.log`，使启动器自身突然退出时保留已完成步骤。
- 日志超过 256 KiB 后覆盖 `dev-startup.previous.log` 并轮换；写日志失败只提示一次，不阻断开发启动。不会记录环境变量值、命令参数、聊天或业务正文；已有 `*.log` 忽略规则生效。
- 根 BAT 失败时显示日志位置，继续保留原退出码和暂停提示。编译、Vite、Electron、端口检查和本轮子进程清理顺序沿用原实现。
- 诊断观察器补充实际侧栏/新会话按钮可见、加载壳消失的要求；隐藏测试窗口关闭后台节流并等待两个动画帧后截图，避免把旧加载壳画面当成视觉通过。

## 检查及证据边界

- `node --import tsx --test tests/dev-electron.test.ts tests/dev-renderer-readiness.test.ts tests/dev-vite-watch.test.ts`：**21/21 通过**。覆盖阶段日志、Vite 失败、Windows 异常码保留、已有 previous 日志轮换、编译失败、端口占用、HTTP 就绪/取消及真实 Vite HMR。
- `npm.cmd run check`：退出 0；根 BAT 的实际主进程/preload 编译成功。没有 electron-builder 或便携版制作。
- Windows 异常码测试通过夹具 `process.exit(-1073740791)` 检查诊断格式，并未触发或重现用户的原生崩溃。
- `.test-data/startup-profile-root-1791788109834/` 的实际 BAT 退出 0，DOM marker 与 IPC 成功；采样脚本最终失败是本轮修改 BAT 文案导致源哈希断言变化。其截图仍为加载壳，**不作为完整界面视觉通过**。
- `.test-data/dev-bat-tty-20261012/` 的 TTY BAT 退出 0、DOM/IPC 成功，旧观察器截图同样不能证明实际画面。
- 用户真实复验可用已确认；间歇性原生退出的触发条件、原生调用栈及长期稳定性仍未验证。若再次退出，先依据 `dev-startup.log` 的 launcher PID 和最后阶段定位，避免盲目替换依赖或反复自动重试。

图源：[Mermaid](dev-startup-native-diagnostics-2026-10-12.mmd)。

通俗解释：现在双击能打开软件。此次增加了“启动走到哪一步”的记录，今后再意外退出时能判断卡在哪个环节；这次没有找到足以证明原始崩溃原因的证据。

## 主代理验收补充

最终隔离 TTY 记录位于 .test-data/dev-bat-tty-20261012-final/profile/startup-evidence.json；主代理已复核工作台截图。用户默认端口的真实窗口保持运行，不进行额外重启。

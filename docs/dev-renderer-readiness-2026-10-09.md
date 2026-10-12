# BAT 开发服务就绪检测修复（2026-10-09）

需求 PF10：用户真实根 BAT 在 Vite build 成功、Vite 输出 Ready 后，报 `renderer did not become ready` 并退出 1。本轮只修这一启动门槛，保留此前加载占位、异常恢复、字体与布局修改。

## 已确认事实

- 旧 `scripts/dev-electron.mjs` 在构建完成后开始计时，给 Vite 初始化及 HTTP 检测共 30 秒；每次 `fetch` 的整个请求仅允许 750 毫秒，且吞掉全部错误。用户日志中的 build 8.23 秒不计入这 30 秒，Vite 初始化 5.799 秒计入。500 kB 提示是构建警告，不是本次退出原因。
- 本机慢 HTTP 夹具每次 1100 毫秒返回：旧检测连续三次在约 763–769 毫秒中止。一次真实 Vite 冷采样在 1750 毫秒输出监听地址，随后首次完整首页 HTTP 200 用时 4920 毫秒，超过旧单次期限。证据：[冷采样](../.test-data/renderer-readiness-probe/result.json)。
- 同次单独请求 `/src/main.tsx` 在 60 秒内没有完整响应；这属于后续模块准备阶段，不能用 Vite Ready 或首页 HTTP 成功声称完整工作台已加载。此次 Node 24.15.0 未配置 HTTP(S) 代理或 NODE_USE_ENV_PROXY；用户报错当时的最后 HTTP 错误没有保留，不能宣称已取得其当时的具体错误。
- 此前隔离启动成功不能证明这次冷启动稳定，也不能把一次成功作为长期稳定性证明。

## 最小修改

- 新增 `scripts/renderer-readiness.mjs`。使用直接 loopback HTTP 检测，750 毫秒只限制建连；首次连接后允许同一请求继续完成，不再每 750 毫秒取消一个正在正常准备首页的请求。
- 保留有界等待：监听阶段最多 30 秒，首次连接后完整首页阶段最多 30 秒，合计最多 60 秒。重试不会反复重置首页期限。退出、启动失败和取消立即中断。
- 必须 HTTP 200、`text/html`、正文完整，且包含 Slash root 和源码入口。仅开放端口、错误页、错误内容类型和只有一半正文均不算就绪。失败显示真实最后 HTTP 状态、连接错误或等待正文超时。
- 原脚本保留 `--strictPort`、HMR 和只清理本轮子进程树。取消启动后禁止继续派生编译器、Vite 或 Electron；日志明确为 `renderer HTML ready`，不表示 UI/IPC 已完成。
- 原首页后的中文加载/重试路径继续使用；没有修改 Agent 底座或用户资料。

## 验证与限制

- `node --import tsx --test tests/dev-renderer-readiness.test.ts`：12 项通过，覆盖旧 750 毫秒慢响应回归、重试/错误 HTML、HTTP 503、未结束正文、退出/信号/启动失败、取消、ECONNREFUSED、断连及分阶段预算。
- 增加分阶段预算用例后的复跑捕获诊断竞态：下一次连接或响应头可能在总期限到达前覆盖上次 HTTP 503/断连；已将“最近完成结果”和“当前请求状态”分别保留并共同输出。原失败原因与最终复跑记录保留在 `.test-data/renderer-readiness-validation/`。
- `npm run check` 通过；真实根 BAT 中的正常 Vite build 和主进程 TypeScript 编译通过。没有运行 electron-builder，没有生成便携版，没有云模型请求。
- 默认 **5173 原 BAT**、新隔离 profile 实际启动到完整工作台和 `window.pm.request({type:'state'})` 成功，`errors=[]`、`cloudRequests=[]`，最终 BAT **退出 0、总计 151990 毫秒**。证据：[完整 UI/IPC](../.test-data/dev-bat-readiness-1791507511515/startup-evidence.json)、[BAT 结果](../.test-data/dev-bat-readiness-1791507511515/bat-result.json)、[截图](../.test-data/dev-bat-readiness-1791507511515/workbench.png)。截图已人工核对；测试应用正常退出，自有 Vite 随启动脚本清理。
- 本轮**没有优化启动速度**。观察到 Electron 08:58:37 启动，直到 09:00:52 观察器的 `setImmediate` 才执行，约 135 秒发生在窗口创建前；09:00:58 建窗，09:01:01 完整 UI/IPC 成功。该延迟位于 Electron 早期初始化/主模块导入阶段，是否受 NODE_OPTIONS 测试观察器影响尚未分离验证，不能直接归因某个依赖。Vite 冷 optimizer 也出现慢准备；保留为后续性能排查项，不在本轮展开依赖重构。
- 保留所有早期夹具结果并附 `operator-note.json`：NODE_OPTIONS 路径转义失败；首轮观察器无输出后主动停止自有 BAT；15 秒预加载器诊断；额外 Playwright 诊断撞上成功 BAT 已关闭 Vite 后主动取消。它们不作为产品自然启动失败或新的成功验收。用户进程和已有资料未被清理。

流程图见 [Mermaid 源](dev-renderer-readiness-2026-10-09.mmd)。

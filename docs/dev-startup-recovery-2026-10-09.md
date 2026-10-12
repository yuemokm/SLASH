# 开发启动加载与故障恢复（2026-10-09）

后续用户提供了真实 BAT 的 `renderer did not become ready` 日志；另已定向修复首页就绪检测的750毫秒误判，完整验收与冷启动耗时见 [后续修复记录](dev-renderer-readiness-2026-10-09.md)。下文是前次验收时点，不能作为本轮冷启动稳定性的证明。

需求：用户通过根目录“双击启动开发环境.bat”查看最新修改，反馈一次白屏、一次报错。

## 事实与边界

- 原 BAT 与 `npm run dev` 均可在隔离 profile 启动。主进程编译使用同一个 `tsconfig.node.json`，没有复现 TypeScript 编译失败；不能把知识库 `.ts` 导入直接认定为本次报错原因。
- 原启动链先检查 HTTP 首页，随后才由浏览器加载 Vite 的源码模块。首次完整工作台/IPC 就绪曾耗时约 51 秒，原 `index.html` 的 root 为空，等待期间没有可读状态。这与白屏现象一致，但用户当时具体错误文字未提供，原报错根因仍未确认。
- 未终止旧用户应用或占用端口的其他程序，未更换 Vite 热更新/Agent 架构，未制作便携版。

## 修改

- `index.html` 内置中文加载状态；`public/startup.js` 独立于模块编译，入口失败时显示重试，等待较久时显示仍在准备的说明。诊断脚本在入口模块前执行，避免漏掉模块加载错误。
- `src/main.tsx` 添加 React 错误边界，渲染异常显示中文恢复页面。
- `main/startup-window.ts` 接管页面导航失败及 renderer 退出，提供“重新加载/退出”，在用户数据目录写 `startup.log`。日志只记录安全错误类型/加载诊断，不记录用户消息、模型参数或业务正文。
- `main/main.ts` 在加载前注册退出清理；放行当前页面相同 URL 的重新加载，其他页面导航仍拦截。
- 实际流程图：[Mermaid 源](dev-startup-recovery-2026-10-09.mmd)。

## 验证

`npm run check` 与正常构建通过。`node scripts/dev-startup-smoke.mjs` 最终 7 组真实 Electron 检查通过：生产页面/IPC、慢入口加载提示、恢复后页面/IPC、入口 404 点击重试、导航失败重试、renderer 强制崩溃恢复以及错误日志/对话框。证据：[最终结果](../.test-data/dev-startup-1791476076647/result.json)；截图在同目录。

早期夹具失败记录保留：有意阻塞模块使截图等待字体；初次导航未提交使 Playwright firstWindow 等待；renderer 崩溃使旧 Page 调试对象失效；Electron evaluate 的动态 import 不可用。最终只调整隔离验证脚本的等待/截图/读取方式，没有为让夹具通过增加产品等待预算。

根 BAT 默认 5173 的最终验证退出码 0，真实工作台文字及 `window.pm.request({type:'state'})` 成功，`errors=[]`，测试应用及自有 Vite 正常退出。见 [BAT 结果](../.test-data/dev-bat-oct09-final/startup-evidence.json) 与同目录 console.log。全部测试采用新建 profile、本机合成故障，无模型或云请求；原用户应用 PID 19976 保留，5173/5217 已无测试监听。

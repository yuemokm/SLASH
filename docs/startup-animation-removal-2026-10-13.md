# 启动动画移除

需求：F02/PF10；用户明确要求删除无用的启动动画。

- `main/main.ts`：普通用户主窗口创建即显示，隐藏测试保持隐藏；删除透明启动窗、九款风格、预览IPC、独立偏好读取及生命周期。通用偏好原键仍读取和写回，旧动画字段没有任何行为；不删除真实SQLite或做清空迁移。
- `main/startup-window.ts`、`src/App.tsx`、`shared/types.ts`：移除动画readiness、握手、绘制/快照等待及临时节流。保留页面超时、加载失败/renderer崩溃重试、主frame错误诊断和初始资料错误反馈；隐藏测试错误只记录和反馈，不显示窗口/对话框。
- 设置组件、搜索注册及CSS去掉动画入口；仅删除动画专属源码、资产和验收脚本。`public/startup.js`、React错误边界作为真实加载兜底保留。
- 模型事务、保存中Escape保护、模型验收脚本、开发OS租约和Vite退出清理保留；历史动画方案/过程记录继续保留，当前实现以本文和同名Mermaid为准。

验证：

- `npm run check`、`npm run build`通过；构建仍有既有大chunk提示，无构建错误。源码专用引用扫描无残留；7个动画专用旧编译文件已移除，未删除其他历史hash bundle。
- `node --import tsx --test tests/model-discovery.test.ts tests/settings.test.ts tests/model-save-recovery-ui.test.ts tests/dev-electron.test.ts tests/dev-renderer-readiness.test.ts tests/dev-vite-watch.test.ts tests/test-profile.test.ts`：53/53通过，覆盖模型事务/Escape、开发启动租约/Vite清理及隐藏profile边界。
- 实际Electron普通启动、默认节流、设置/搜索无动画、旧IPC拒绝、SQLite其他偏好保持、隐藏正常启动、页面失败重试、初始资料失败重试共7组通过：[阶段证据](../.test-data/startup-removal-1791886205982/result.json)。该组合脚本随后因Playwright持续把已恢复Page标记为crashed而失败，不把其整体状态伪写为通过。
- `node scripts/startup-recovery-ui-smoke.mjs --crash-and-hidden-only`：余下2组通过，实际强制renderer崩溃后重载，通过替换页面的真实DOM及`state` IPC验证可用；隐藏初始资料失败反馈和日志存在，窗口/对话框均不显示。[最终恢复证据](../.test-data/startup-removal-1791886326014/result.json)。
- [通用设置截图](../.test-data/startup-removal-1791886038616/01-general-settings.png)已查看，外观与交付检查保留，无动画入口。早期脚本入口、暂停state的Shell断言和crash等待问题属于验收脚本错误，已修正；本轮没有重复运行整个组合脚本，不宣称单次9组全绿。

未关闭或重启正在运行的用户应用；未打包或提交。实测使用隔离profile及package入口，没有重跑用户默认profile根BAT，也不代表长期硬件稳定性。主进程改动需用户重启开发应用生效。

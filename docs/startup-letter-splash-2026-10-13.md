# slash 透明字母启动

2026-10-13 后续：用户要求删除启动动画，本功能已退出当前产品。本文保留历史实现及验收事实；当前路径见[移除记录](startup-animation-removal-2026-10-13.md)。

2026-10-13续作：通用设置已增加九款风格及关闭，默认light不变，见[启动动画设置](startup-animation-settings-2026-10-13.md)。此前capturePage透明alpha只证明渲染内容，不证明Windows DWM实际合成；用户黑矩形反馈促成统一的Windows单窗opacity0.99兼容路径，实际合成证据和限制分别记录，不把原9项检查改称桌面合成通过。

需求：F02、PF10。用户选定05柔光悬浮、标准强度；最新调整采用06聚合入场：五个字母靠拢一次，随后轻微悬浮呼吸。只显示小写slash，没有背景、边框、加载点或文字。

## 实现

- `public/startup-splash.html`、`main/startup-splash.ts`：本地透明无边框窗口，无preload、业务IPC、Node权限；不接焦点、不占任务栏，减少动态时静态显示。字母在显示时才开始入场。
- `main/main.ts`：Electron ready后先显示字母，再初始化服务；主窗口初始隐藏。隐藏测试不创建字母窗。应用退出、失败、就绪时销毁字母。
- `src/App.tsx`、`shared/types.ts`：复用真实state、projects首次读取，提交页面后通过RAF发送本次导航代号的`startupReady`。沿用现有主frame校验和严格schema，无新增业务权限。
- `main/startup-readiness.ts`、`main/startup-window.ts`：页面加载、绘制能力、新页面初始数据回执同时满足才显示主窗口；不设最低动画时长。重载重新等候，拒绝旧回执。初始化、页面就绪各有60秒上限，失败保留日志与重试；初始化失败重启应用，页面/进程失败重新加载。
- 控制日志只接受主frame；只有loading阶段的明确启动错误触发恢复，普通任务日志不重启界面。

初始回执证明本轮首次快照与项目列表已读取、页面已提交，不代表后续业务或远端连接都已验证。已可绘制窗口重载时保留绘制标记；新页面仍必须完成加载并在提交后发送新代号回执。

## 验收

- `npm run check`、`npm run build`通过；Vite保留已有大chunk提示，没有打包。
- `node --import tsx --test tests/startup-readiness.test.ts tests/test-profile.test.ts`：5项通过。
- `node scripts/startup-splash-ui-smoke.mjs`：9项实际Electron通过，覆盖字母先于服务初始化、透明四角/仅字母/无IPC、初始数据延迟、就绪后显示、重载旧回执拒绝、普通日志、进程故障重试、隐藏模式及初始数据失败重试。验证实例已关闭。
- 证据：`.test-data/startup-splash-1791873364305/result.json`及同目录`actual-transparent-splash.png`。首轮观察fixture连接超时保留于`.test-data/startup-splash-1791873231090/result.json`，未冒充通过。
- 直接正式package入口的新隔离profile计时：`.test-data/startup-direct-1791873585224/timing.json`。本次从自动化请求启动到字母显示约3.65秒，Electron ready后约0.62秒；包含原生启动与调试开销，是单次观测，不是性能保证或零延迟承诺。

未制作便携版，也未修改开发BAT/启动脚本；用户已明确编译阶段无需覆盖。实际exe打包启动未验证。主进程变动需重启开发应用。用户资料、配置与运行记录保持原有存储及权限约束。

流程源：`startup-letter-splash-2026-10-13.mmd`。

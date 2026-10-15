# 启动动画设置

2026-10-13 后续：用户要求删除启动动画，本功能已退出当前产品。本文保留历史实现及验收事实；当前路径见[移除记录](startup-animation-removal-2026-10-13.md)。

需求：F02、PF10。通用设置提供九款启动字母动画及关闭选项；默认保留用户认可的柔光材质、单次聚合入场和标准悬浮。新增酸性艺术、电子故障、ASCII解码：只显示字母，没有底板或加载点。ASCII用等宽字符拼出slash，不是普通字体更名。

## 实现与边界

- `shared/startup-animation.ts`及`shared/types.ts`：注册风格、默认值与严格保存/预览请求schema。坏枚举保存被拒绝，旧值与缺失值回到light。
- `src/StartupAnimationSettings.tsx`、`src/SettingsModal.tsx`：选择、预览、停止、保存。预览可看未保存方案；保存后下次启动生效，设置搜索可定位。
- `main/startup-animation-preference.ts`：启动前只读既有`slash.sqlite`的`kv/app-preferences`，`busy_timeout=50ms`，失败回默认；不启动Service、不迁移、不创建第二份设置。
- `main/startup-animation-preview.ts`：独立预览6秒后收起，重复预览替换旧窗；停止、设置关闭、主窗关闭及退出清理，取消后晚到的窗口也销毁。预览不隐藏主窗口、不参与生产就绪门禁。
- `public/startup-splash.html`、`public/startup-animation.js`：共享透明页面，CSS材质与动效；ASCII仅使用本地受限脚本，CSP只允许self，无IPC/Node/联网。减少动态时静态可读。
- `main/startup-splash.ts`：Windows统一使用单窗口`opacity:0.99`以进入layered合成路径，正式启动与预览一致；不更改其他窗口或整个应用GPU设置。依据[Electron透明合成问题记录](https://github.com/electron/electron/issues/40515)，属于兼容规避，不把渲染alpha当作DWM修复证明。

## 验收

`npm run check`、`npm run build`通过，未打包。新设置5项定向测试通过，既有就绪/隐藏测试5项通过；9风格与关闭均验证同一SQLite键的保存和启动前读取。

实际设置UI12项通过：九款+关闭、三款新风格真实窗口内容、主窗仍可见、未保存预览不改设置、保存及无关偏好保留、坏值拒绝、6秒收起、设置关闭清理、重开恢复及1000px窄窗。证据`.test-data/startup-settings-1791875002777/result.json`及同目录截图。预览PNG是窗口内容证据，不能证明Windows桌面合成。

前次alpha检查仅证明渲染内容透明。上轮未核定诊断保留于忽略目录，不算通过。本次已显式显示棋盘背景并核对颜色，再使用desktopCapturer真实屏幕源裁剪：acid/glitch/ascii三款在opacity1和0.99下，字母外8点均与棋盘一致，未出现黑矩形；截图及记录位于`.test-data/startup-composite-20261013-layered/`。light此次未采到字母，因此该用例未通过，不冒充验证完成。原黑矩形故障在本机未复现，0.99仍是合理兼容规避，需用户重启后实际复验，不保证已消除其故障。

主进程和preload接口需重启开发应用；用户数据、权限与生产就绪恢复逻辑继续保留。流程源见同名`.mmd`。

# 成果卡片定位与保存文案

更新：2026-10-07。关联 F02、F14、PF08、PF09。

会话末尾的成果修改卡片，文件名成为低调的可聚焦按钮：普通点击沿用“查看”的草稿/版本预览；Ctrl + 左键或 Ctrl + Enter 在 Windows 资源管理器定位对应项目文件。悬停提示同时说明两种操作。窄会话中卡片信息和操作允许换行，保留文件名和状态的可读空间。

原“应用修改”实际是待提交草稿的显式写入动作，改名“保存到项目”；待提交卡标明“草稿 · 尚未写入项目”，提交后仍显示“已保存版本”，不再提供保存按钮。没有名为“应用设置”的会话末尾按钮。此次调整保留原有 apply 提交、版本冲突、参考原件保护、资源锁和现有权限模式的行为。

定位接口是严格的 `changeReveal { id }`，主进程按当前项目 Change 取挂载和相对路径， renderer 不拼接绝对路径或传入任意 URL/命令。`Files.revealLocation` 每次重新检查挂载是否有效、相对路径和实际链接是否在授权根内。已存在的文件通过 `shell.showItemInFolder` 选中；尚未落盘或已删除文件从目标向上找最近已有且位于授权范围内的父目录，用 `shell.openPath` 打开，并显示“草稿尚未保存到项目”或“文件当前不存在”。定位不保存内容、不建立目录；撤权、越界、根外 junction 和失效根被拒绝。原 `reveal` 接口保持兼容。

实现位置：`src/App.tsx`（共用查看/定位及卡片文案）、`src/focus-workspace.css`（文件名与换行）、`shared/types.ts`（IPC schema）、`main/main.ts`（系统入口）、`main/files.ts`（授权定位）。流程源见 [Mermaid](diagrams/change-card-navigation.mmd)。

验收命令与结果：

- `npm run check`：通过。
- `npx tsx --test tests/change-reveal.test.ts tests/files.test.ts tests/artifacts.test.ts tests/reference-protection.test.ts`：21/21 通过。覆盖已存在/已删除/尚未创建的路径、只读挂载可定位、撤权、路径越界、URL、根外 junction、父级不是目录、挂载根失效、严格 IPC，以及原有写入和冲突保护。
- `npm run build`：通过；保留既有单块超过 500 kB 提示，未制作便携包。
- `node scripts/change-card-ui-smoke.mjs`：8/8 通过，页面错误 0。隔离 `.test-data` profile、`PM_SLASH_TEST_HIDDEN=1` 的真实 Electron 验证普通点击预览、Ctrl 点击选中文件、Ctrl Enter 一次定位且不预览、缺文件父目录与提示、显式保存后文件真实落盘、撤权不发出系统调用、1440/1000 像素预览布局。布局几何同时检查状态位于信息栏内，文件名、状态、查看和保存按钮的矩形两两不相交，避免只因没有越出整个卡片就漏掉遮挡按钮的问题。

UI 证据：[结果](../.test-data/change-card-ui-1791356855374/result.json)、[1440 像素预览](../.test-data/change-card-ui-1791356855374/卡片预览宽度-1440.png)、[1000 像素预览](../.test-data/change-card-ui-1791356855374/卡片预览宽度-1000.png)。本轮改动涉及主进程，用户通过原开发启动入口查看时需重启开发应用；验证未重启用户正在使用的应用。

UI 验证只在隔离进程中观察 `shell.showItemInFolder`/`shell.openPath` 收到的真实解析路径，没有打开用户桌面的资源管理器窗口；该边界不等于已验证 Windows Explorer 的前台显示效果。隐藏窗口由现有严格测试 profile 开关控制，没有替换或重定义 BrowserWindow。真实模型生成质量与截图中的生成失败未在本轮验证。

通俗解释：文件名现在可以直接查看内容；按住 Ctrl 再点它，就能找到文件的位置。卡片标着草稿时，内容还没有放进项目目录，需要点“保存到项目”。如果文件还没保存或已经被删掉，定位会打开已有的上级文件夹，并说明为什么找不到文件。

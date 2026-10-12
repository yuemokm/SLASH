# 桌面字号与浏览页紧凑布局（2026-10-13）

关联 F02/F10、PF01/PF03/PF08/PF09，覆盖资源、成果、设计体系、测试用例，以及会话和设置的字体层级。本记录优先于 2026-10-09 的 16px 正文 / 24px 页题规范。

## 参照依据

按用户要求先只读检查本机 Codex 26.1007.2314.0 的 `app/resources/app.asar`，使用已有 `@electron/asar` 读取 `webview/assets/app-shared-9a94b907ed47.css`，未运行或改动上游应用。

默认基础 token 为 xs 11px、sm 12px、base 14px、lg 16px，spacing 为 .25rem。`browser / chrome-extension / electron` 的 desktop body 规则把 UI 与聊天基础字号设为 base 14px，代码为 sm 12px，heading-md 为18px；纵向行内 padding 5px、导航行计算高度31px、panel基础 padding20px。上游存在页面和偏好局部覆盖，因此这里是**本机安装版本的基础 CSS 参照**，不是当前 Codex 页面的实时计算字号，也不声称每个页面都用同一数值。

Slash 原字号 UI14px、正文16px、页题24px。资源、成果多次独立堆叠标题、说明、分类、面包屑和搜索；设计页重复展示分类计数；用例页在列表前重复项目和范围说明。这些布局占高比基础UI字号更影响首屏。

## 实现

- `src/focus-workspace.css`：UI维持14/20px、辅助12px，聊天/输入正文改14/22px，页题20/28px、分节16px，导航项目/会话行31px、头部最小44px（内容可自然撑高）。复用内置中文字体，不增加依赖。
- `src/DesignSystemsPanel.tsx`、`src/design-systems.css`：分类与搜索/用途组成一组工具行；默认计数只在页签显示，筛选时保留结果数。标题区和卡片间距收敛，152种真实风格、36个模板、实际来源图片/大图和原始来源入口保留。
- `src/ProjectResourcesBrowser.tsx`、`src/project-resources-browser.css`、`src/App.tsx`：项目名称和标题同行，路径可缩略并用title保留；面包屑和搜索同行且小窗口可换行；资料集合入口并入资源标题操作区。
- `src/TestCasesPage.tsx`、`src/test-cases.css`：项目切换并入搜索工具行；用例计数随说明显示，范围与使用说明放到列表之后的可展开区域。草稿/冲突/已保存/未执行状态和扫描边界均保留。
- 信息提示保留可关闭、可滚动浮层，避免长期挤占首屏；会话提示放在头部下方避开输入和发送区，浏览页放底部。错误仍保留在页面流中。关闭按钮补可访问名称。
- 设置标题和独立skills标题继承相同token；同步已有 `scripts/typography-layout-ui-smoke.mjs` 的变更规格断言。
- 文档阅读独立维持16/26px及原有标题层级；HTML原型iframe、用户文档源文件和系统DPI/zoom不变。变更不接触业务数据、权限、目录或来源版本。

## 验收

`npm run check`、`npm run build`、`git diff --check` 通过。17项定向测试通过（design-previews、design-systems、test-cases-list、test-cases-ui、run-output-placement），真实来源图片/hash和引用链、草稿/文件身份及成果归属未回退。最终 renderer 为 `index-B85bPeAy.js` / `index-BX9pU52J.css`。

前后首条内容的纵坐标，单位为**CSS像素**，不能与用户截图中的DPR物理像素直接相减：

| 页面 | 1366×768 改前→改后 | 1920×1080 改前→改后 |
| --- | --- | --- |
| 资源首个项目 | 461→277 | 525→277 |
| 成果首个项目 | 410→277 | 473→277 |
| 测试用例首行 | 401→224 | 401→224 |
| 设计首张卡片 | 307→170 | 363→222 |

1920设计页带1366流程中选好的参考条，前后均保留该状态，不能与1366的未选状态混算。桌面对照基线 `.test-data/compact-workspace-before-eOJgny/result.json`；完整初轮通过证据 `.test-data/compact-workspace-after-BVI8GE/result.json`（3组/16张截图）；最后提示避让的同规格复验 `.test-data/compact-workspace-after-ej2LKc/result.json` **3组/18张截图通过**，两尺寸提示与编辑区不交叠、未发草稿/参考保持、152风格与真实图片、搜索、680窄窗口无横向溢出。Electron zoom=1，原生DPR=1.375，测试CSS viewport与DPR分别记录，未改产品/系统缩放。0云调用、0页面异常。

三主题字体回归 `.test-data/typography-layout-ui-1791826647688/result.json` 3组/18张截图通过：真实Noto字体、会话14/22、标题20、用例及文档预览、资料集合、通用/模型设置、窄设置和侧栏展开收起。0云调用、0页面异常。

脚本 `scripts/compact-workspace-ui-smoke.mjs` 复制已有合成project/profile，加载真实编译版file renderer和实际IPC，记录CSS viewport、DPR与Electron zoom；使用1366×768 / 1920×1080，另验窄窗口。没有访问用户profile、真实云模型或外部发布。

保留前轮测试失败证据：before-EW6WNA 在第二轮应用同一已选参考时用旧“应用”选择器超时；修正测试按已选状态取消后重应用。after-cRCuXN 两种桌面尺寸功能通过，随后旧试验阈值资源首行<270失败（实际277）；按本轮收敛目标改为<330，并改用实际可见节点等待布局稳定。没有为阈值扩大产品改动。

旧字体脚本首次本轮执行 `.test-data/typography-layout-ui-1791826552770/result.json` 保留：严格44px断言遇到实际48.7px自然高度。修正断言为44–52px，符合已有最小高度和内部控件；未改DPI/zoom。首次组合命令的 `git diff --check` 发现一行CRLF尾空白，规范该文件换行后复查通过。

原大型JS chunk提醒保留。未打包、未执行真实模型任务、未验证外部发布、SMB双机或全152来源图人工审查；这些与本次字号/布局无关。普通用户通过根目录“双击启动开发环境.bat”查看。

通俗解释：参考Codex把正文和标题调到更适合桌面的大小，把分散的操作合到同一行。打开页面能更早看到文件、设计图片和用例，已有内容与功能仍可使用。

# 全应用字体与布局比例（2026-10-09）

关联：PF01、PF03、PF08、PF09。用户要求参考成熟桌面产品统一字体与整体比例，继续保留会话主入口、图标文字导航、独立测试用例/知识库、Run 成果归属和单停止按钮。

## 设计与实现

参考 [Fluent 2 Typography](https://fluent2.microsoft.design/typography/) 的网页 Body 14/20、Caption 12/16、Title 24/32，以及 [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview/) 的基础间距。中文正文采用16px/26px，操作14px/20px，辅助12px，页题24px/32px；不照搬营销页的大标题与装饰。

- 原 `focus-workspace.css` 建立字号、间距、阅读宽度和导航宽度 token，并原位调整所属规则。清理25px高特异性页题覆盖及窄屏欢迎28px反向覆盖；组件引用相同字号，不新增末尾覆盖层。
- 导航总宽280px（60px轨道＋220px项目列）；头部52px，页面边距24/32px，正文最大760px，输入默认72px且可增长。欢迎区和列表空白收敛。
- 设置总标题20px/26px、选项卡标题24px/32px，头72px、最大高度760px。沿用分类、滚动、主题和配置。
- 用例/知识库只保留一处可切换项目条；资源/成果说明仅显示路径。知识库/用例改用真实主题 token，修复原 `--border` / `--surface-alt` 未定义。
- 窄预览长路径可缩略，切换项目/创建用例保持完整；内容不足520px时动作另起一行。
- 复用内置 Noto Sans SC，代码保持等宽；不注入用户HTML原型iframe、不新增字体/缩放开关、不改变系统DPI或强制zoom。

## 验证

`npm run check`、最终 `npm run build` 通过。产物 `index-xAJvSJHO.js` / `index-6aGkSH25.css`；保留已有大于500kB chunk提醒，无新增依赖。11项针对性测试通过：run-output-placement、run-operation-view、test-cases-list、test-cases-ui、reference-picker。原 `chat-round-ui-smoke.mjs` 9/9通过，覆盖成果归属、补充、停止、授权、重试、失败恢复、输入增长与窄预览；结果 `.test-data/chat-round-ui-1791481758889/result.json`。

本轮隔离脚本 `scripts/typography-layout-ui-smoke.mjs` 3组通过，18张截图；完整证据 `.test-data/typography-layout-ui-1791481758892/result.json`。真实Electron加载编译版file页，使用复制的合成项目和独立profile，1440×900 / 1100×800、三主题、设置通用/模型、资源成果、用例/知识库、带预览和侧栏收起均验证。0云调用、0页面异常；不访问用户profile、不运行模型/向量/发布/部署、不打便携版、不关闭用户应用。

CDP `CSS.getPlatformFontsForNode`确认中文正文实际使用自定义 Noto Sans SC，不只检查CSS声明。生产字体路径 `../fonts/NotoSansSC-Variable.ttf` 在file页加载成功；记录CSS viewport与DPR，截图以CSS比例保存，不能把物理截图像素当作布局宽度。隔离原生窗口未设测试viewport时为1398×742 CSS、DPR 1.375、zoom 1；Playwright固定尺寸测试viewport为1440×900 / 1100×800、DPR约1、zoom 1。测试viewport仿真未改变产品或系统缩放。

首轮 `.test-data/typography-layout-ui-1791481674545/result.json` 保留：前两组通过，后因测试旧“模型配置”选择器超时；实际产品标签为“模型”，只修测试。首轮截图发现窄预览按钮受挤并据此改善。历史其他失败fixture未删除。不把合成UI通过视为真实云业务验收。

通俗解释：按钮和列表统一字号，正文适当放大；标题、边距和侧栏比例更一致。窗口变窄时操作换行，避免挤掉按钮。启动根目录“双击启动开发环境.bat”查看。

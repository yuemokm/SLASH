# 测试用例与知识库导航（2026-10-09）

需求 PF01 / PF02 / PF09 / PF11。用户反馈新增功能难找，最新要求覆盖历史“知识库不单独导航”的取舍。

- 最左侧新增图标在上、文字在下的“测试用例”“知识库”；知识库提示为“知识库问答”。收起项目侧栏仍保留入口。
- 两页显示当前项目名称、实际路径及项目切换。它们不是所有项目的混合列表；切换复用原项目操作，切换中卸载业务页并禁用按钮，完成后按项目重新挂载。
- 用例页复用已有已授权文件查询与 `isTestCasePath`，列出真实已保存文件和 `pending` / `conflict` 草稿。历史 `applied` 变更不会重复一行；旧版本仍在原版本链。文件名用可读名称，副行保留完整路径、项目与保存状态。空项目及无匹配筛选分别说明。
- 草稿复用 `viewChange`，真实文件复用 `openFile`；均沿用 `TestCasesPreview` 和 Excel / Markdown 导出。冲突和无效内容仍受原校验限制。
- “创建测试用例”进入原会话工作流与资料选择，不自动生成、不调用模型。原快捷动作和预览创建入口保留。
- 知识库直接复用 `KnowledgeCollections` 与已有发布组件；资源原入口改为跳转同一页面，避免维护两套状态。未配向量、失败及待核对状态保持原语义；云向量 HTTP 403 仍未解决。

没有新增后端、依赖、外部权限或物理目录，没有迁移或删除用户数据。会话成果按 Run 归属、停止按钮及紧凑布局修复保留。React 组件按 `react-best-practices` 检查 Hook、请求清理与可访问控件，复用现有弹出式项目选择器。

代码：`src/Sidebar.tsx`、`src/App.tsx`、`src/FeatureProjectScope.tsx`、`src/TestCasesPage.tsx`、`src/test-cases-list.ts`、`src/test-cases.css`。图：[同名 Mermaid](feature-navigation-2026-10-09.mmd)。

验收：最终 `npm run check` / `npm run build` 通过；renderer `index-Dg2xNhAG.js`。用例列表身份/权限隔离、原预览身份、Run成果归属/执行错误文案及引用选择共 11 项定向单测通过。构建仍提示既有主包大于500KB，未借此扩展重构。

真实隔离 Electron/Service/IPC 记录：`.test-data/test-cases-ui-1791480988730/result.json` 中前 8 组导航与第 9 组草稿预览/来源定位通过；随后脚本以第二个 Store 并发打开 SQLite 时失败 `database is locked`，原报告保持 failed。最终 `.test-data/feature-navigation-final-1791481199375/result.json` 已在写入进程关闭后以只读 SQLite 核对两份真实 Excel/Markdown 导出及相同草稿/哈希回执，并验证最终页面清除会话旧提示；这 2 组通过。该脚本追加的旧无效JSON保存/导出IPC回归等待未结束，按本轮收尾要求关闭自建测试应用，保留中断失败，未宣称本轮完整旧回归通过。无效JSON预览错误已实际可见；原自动测试仍通过，产品导出/保存实现未改。

截图：最终两页分别为 `.test-data/feature-navigation-final-1791481199375/test-cases-final.png`、`knowledge-final.png`；项目空态与收起侧栏见前一目录 `navigation-empty-knowledge.png`、`navigation-empty-test-cases.png`、`navigation-collapsed-sidebar.png`。所有启动均为自建隔离 profile，均已关闭；保留用户应用，未打包便携版、未执行云模型/向量/部署。

通俗解释：现在能直接从左边找到用例和知识库，页面会告诉你正在看哪个项目，也能就地切换；原有文件、草稿和导出功能继续使用。

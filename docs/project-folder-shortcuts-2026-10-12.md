# 项目文件夹快捷操作

需求：F02 / F10，PF01 / PF09。2026-10-12 用户要求项目下资源/成果点击打开系统文件夹，拖入文件时悬浮显示目录并落在选定目录。

## 实现

- 所有已展开项目显示资源/成果快捷入口；普通点击通过严格 `projectOpenDirectory` IPC 打开对应真实根目录，独立验证目录存在。左侧全局资源/成果继续在应用内查看。
- 真实文件拖到入口后通过现有 `projectCatalog` / `projectBrowse` 读取该根目录的直接子文件夹，包含空目录；可投到根或所选子目录。加载、不可读取、空目录与截断均有反馈；离开/松开/取消关闭列表。本轮不显示深层文件树。
- 复用 `importFiles.target`，增加可选 `projectId`，明确绑定目标项目/挂载/相对路径。通过原 `Files.copyFrom` 排他复制，不切换当前会话/项目；外部原件保留，重复文件名追加数字。当前资源页浏览目录不会覆盖显式快捷目标。
- 所有文件操作在宿主执行，保留实时目录授权、资料读取显式 deny、只读/禁用挂载、越界和目录链接拒绝。导入沿现有用户直接拖入语义，未增加或改变 Agent 写入授权。项目移除或目标目录消失后拒绝导入，不创建已删除的目标目录。既有无 projectId 导入接口保持兼容；无数据库迁移或新依赖。

接口示例：

```json
{"type":"projectOpenDirectory","projectId":"project:…","mountId":"…","path":""}
```

```json
{"type":"importFiles","files":["C:\\Users\\user\\Desktop\\brief.md"],"category":"resource","target":{"projectId":"project:…","mountId":"…","path":"参考资料"}}
```

代码：`src/ProjectFolderShortcut.tsx`、`src/Sidebar.tsx`、`src/App.tsx`、`shared/project-catalog.ts`、`shared/types.ts`、`main/project-catalog.ts`、`main/service.ts`、`main/main.ts`。流程：[Mermaid 源](project-folder-shortcuts-2026-10-12.mmd)。

## 验收与边界

- `npm run check` 通过。
- `npx tsx --test tests/project-folder-import.test.ts tests/project-catalog.test.ts tests/files.test.ts`：12/12 通过。覆盖跨项目根/子目录复制、重复路径去重、重名副本、当前会话与项目登记不变、目录类型、目录消失/只读/链接/越界/deny/项目移除拒绝和严格 IPC。
- 首轮 11/12：测试发现跨项目导入判断调用 `listProjects()` 会更新当前项目 `lastOpenedAt`；已改用纯项目身份比较并通过重跑。这个失败保留为修复事实，不能以类型检查替代。
- 受影响旧项目资源/成果 Electron 回归 10/10 通过：`node scripts/project-catalog-ui-smoke.mjs`。全局目录、技能包分层、跨项目原文、会话草稿、引用与空目录继续正常；证据 `.test-data/project-catalog-ui-development-1791817607930/result.json`。旧“项目下资源点入应用”断言依用户最新需求调整，全局浏览仍有实际验收。
- 最终编译版 Electron 新专项 6/6 通过：`node scripts/project-folder-shortcut-ui-smoke.mjs`，实际加载统一负责人构建的 `index-DUCBGo0T.js`；证据 `.test-data/project-folder-shortcut-ui-1791817697231/result.json`。原生 Chromium 文件路径拖入、按钮→悬浮目录连续拖动、实际 preload/IPC/宿主复制、跨项目落点、原件/会话草稿保留、重名副本、拖离关闭及成果/Escape 均通过，pageErrors 为 0。两张截图已实际查看，无侧栏裁切或主题缺失。
- UI 失败证据保留：`project-folder-shortcut-ui-1791817346319` 首轮夹具提前读取异步 openPath 数量；`1791817377741` 在上一批仍导入时开始第二批，被既有 busy 保护阻止，补等待反馈后成功；`1791817425142` 真正发现跨拖放区域只发 dragenter 而不发 dragover 时旧列表残留，已补捕获 dragenter/窗口边缘 dragleave 并按最终 build 重验通过。前两项是夹具问题，第三项是产品修复。
- 系统文件夹操作已通过真实 IPC/目录校验，并记录 `shell.openPath` 的资源/成果正确目标；专项截获系统打开调用以避免弹出额外系统窗口，因此不能代替真实资源管理器窗口或 SMB 双机验收。本轮列表展示当前根的直接子目录，深层目录仍由系统资源管理器或应用内资源浏览操作。
- 未打包、未调用云模型。主进程/IPC 修改需重启根目录开发启动 BAT 后查看。

# 退役知识库源码清理

日期：2026-10-13。关联 PF03/PF09/PF10/PF11。范围：移出已经退役的云知识库源码依赖，保留本机资料集合、历史索引与处理记录；不增加或替换通用 Agent 能力。

## 审计结论与实现

`main/knowledge-publication.ts` 仍静态导入网页工程的 `prepareBundle` 与 `receiptMatchesOperation`。前者校验向量快照、筛选云发布字段并生成中文关键词和指纹，后者核对云 RPC 的操作、版本与成员回执。这些职责全部属于已退役的云知识库；发布类仅在旧发布执行测试中实例化，当前 `main/main.ts`、`Service`、IPC 和 UI 没有调用。没有必须搬进其他模块的活跃通用逻辑。`shared/knowledge-publication.ts` 也只有该退役模块及其测试引用。

- 完整网页目录同盘重命名为本机 `过程文件/历史模块/knowledge-web/`，包括源码、SQL、锁文件、本地环境配置、部署配置、缓存、依赖和历史验收证据。归档由已有 `/过程文件/` 规则忽略；当前版本中的原目录文件呈删除，Git 历史仍可恢复。
- 退役桌面发布实现、发布契约及原测试完整副本在归档的 `desktop-companion/` 中保留；当前 `main/knowledge-publication.ts`、`shared/knowledge-publication.ts` 与旧发布测试退出源码。
- 旧发布执行测试 7 项随源码归档；现有 2 项退休请求拒绝/历史云记录保留回归迁到 `tests/knowledge-retirement.test.ts`，继续在根测试命令运行。
- `scripts/dev-startup-profile.mjs` 不再复制网页历史源码。当前 TypeScript、构建和启动只需要本机工程。
- 已将明确的旧生成文件 `dist/knowledge-web/`、`dist/main/knowledge-publication.js`、`dist/shared/knowledge-publication.js` 移到归档 `generated/`。Vite 使用 `emptyOutDir:false` 且 TypeScript 不清旧文件，因此仅移出源码还不足以清除旧编译产物。

本机集合仍使用 `main/knowledge-base.ts`、`shared/knowledge-base.ts` 与 `shared/knowledge-desktop.ts`，原授权、来源版本、软删除及索引查看保持。`main/knowledge-settings.ts` 及本机向量历史测试未在此次网页源码清理中扩展范围。数据库无需迁移；用户配置、加密凭据、已有索引、会话、原件与处理副本未操作。未调用 Vercel、Supabase 或云 API，远端网站和数据库不会因本次本地清理自动下线。

## 归档证据

原目录共 15,352 项，其中 14,177 个文件、741,975,398 字节。前后全部路径、文件类型、链接属性和字节长度逐项一致，50 份原 Git 跟踪源码 SHA-256 一致。采用同盘 `Directory.Move` 保留整个目录，未逐文件删除。清单在本机 `过程文件/整理记录/knowledge-web-archive-20261013.json`，迁移脚本同目录；没有读取或输出凭据正文。

## 验收

- `npm run check`、`npm run build` 均退出 0。构建仍有既有 renderer 大包提示，新增插件耗时提示；无编译错误，没有执行 electron-builder。
- `node --import tsx --test tests/knowledge-retirement.test.ts tests/knowledge-base.test.ts tests/knowledge-service.test.ts tests/evidence-search.test.ts tests/evidence-search-subagent.test.ts tests/pi-memory-service.test.ts`：31/31 通过，0失败/取消，124.03秒。涵盖退休的13种请求拒绝、云 Service 方法不存在、旧云配置/未知回执/加密值原样保留、集合及历史索引、源文件不变、权限撤销、版本与取消，以及普通原文检索/项目备忘保护。向量契约使用本机 HTTP 合成夹具，不证明重新启用了向量功能或真实云服务。
- 窄范围 `node --import tsx --test --test-isolation=none tests/knowledge-retirement.test.ts tests/knowledge-base.test.ts tests/knowledge-service.test.ts`：13/13 通过，10.24秒。默认隔离首轮等候期间输出延迟，处理停止前它已经自然完成；未将该轮记作失败或中止，全部原日志保留。
- 当前 `main/shared/src/scripts/tests`、包和编译配置扫描无 `knowledge-web` 或 `knowledge-publication` 依赖；`dev-startup-profile.mjs` 语法检查与 `git diff --check` 通过。归档被已有忽略规则命中，3份桌面配套源码与原 Git blob 一致。
- 新构建后，旧网页根目录、退役发布源码和三处明确旧 `dist` 输出均不存在；`dist/main`、`dist/shared` 无旧导入。构建没有重新生成旧发布模块，也未清空无关构建产物。

日志与静态证据位于本机 `过程文件/整理记录/knowledge-source-cleanup-{check,build,tests,tests-isolation-none,static}-20261013.*`。本轮未做新的桌面UI、完整BAT启动、远端部署/数据库操作、云模型或SMB双机验收；不以源码清理宣称这些项目通过。没有打包或提交。重启开发应用可加载清理后的主进程构建。流程见[Mermaid](knowledge-source-cleanup-2026-10-13.mmd)。

通俗说明：此前是已停用的旧发布代码和旧测试还牵着整个网站工程。现在把这套旧工程完整收进“过程文件”，软件开发不再依赖它；整理资料和读取旧资料的能力仍在。

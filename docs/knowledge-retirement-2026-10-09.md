# 云知识库移除与向量取舍

日期：2026-10-09。关联 PF01/PF03/PF09/PF11。用户要求“云知识库的功能直接去掉”，并评估向量化是否必要。本条覆盖此前云知识库发布、独立问答和向量配置的交付要求。

## 取舍与已实现行为

- 移除独立知识库导航、云发布组件、发布配置/预检/提交/核对接口及宿主初始化。
- 停用专用向量配置、构建、恢复、激活、检索、发布包导出入口和 IPC。不是只隐藏按钮；旧请求在当前 `requestSchema` 校验即被拒绝，主进程也没有对应分支。
- 资源 → 资料集合保留集合新建、资料选择、清单更新、显式移除和有效历史索引只读查看。内部旧 `知识库` view 名称仅为兼容路由，侧栏归资源高亮。
- 普通资料检索、Word/Excel 读取、项目候选备忘及已确认 Markdown 知识条目继续使用原链路。通用 Vercel/Supabase MCP 连接保持，因为它们也服务于原型发布与其他项目操作。
- 没有删除或改写用户原文件、集合、索引、版本、处理副本、云回执或加密凭据。显式移除集合仍沿用原软删除语义。本次没有触碰用户实际数据库。
- `knowledge-web/` 和后台历史发布/向量实现保留为非激活历史代码；不再加载桌面发布器或向量设置，旧云/向量功能没有可达产品入口。保留实现用于历史契约测试和数据兼容，不作为已启用功能。
- 本次未调用云 API、下线网站或删除远端数据库。旧远端部署可能继续存在；不能把桌面移除等同于云资源已销毁。既有云 403、问答质量、邮件投递不再属于当前开发待办。

## 向量化是否必要

当前不作为必需能力保留。依据是代码与现有验收，而非认定向量检索普遍无用：

1. `main/agent.ts` 的 `search_files` 调用 `Files.searchEvidence`，后者通过 `main/evidence-search.ts` 查询授权目录的文件名和正文，包含中文分词、位置、来源版本与覆盖限制；没有向量依赖。表格定位和原文读取仍由原工具完成。
2. `pi-memory` 当前是项目隔离的候选备忘文本查询，未启用语义 qmd；项目目录索引是文件扫描与哈希，也不需要 embedding。
3. 新向量知识库此前主要服务于独立同事问答，真实中文召回增益尚无对比证据，却要求额外端点、密钥、模型/维度、索引版本和网络成本。云问答移除后，继续要求日常用户配置它缺少实际收益依据。
4. 当前原文检索是字面/关键词匹配，不能保证同义词或改述召回，也有扫描和正文预算。若以后真实查询反复漏检，再按生态复用约定比较现成方案，并以来源权限/更新正确性、召回率、耗时、费用和故障恢复做准入，不能只看下载量。

本轮没有新增或替换通用检索能力，没有新依赖，也没有为去掉云功能重建本地搜索引擎。

## 契约与数据兼容

`shared/knowledge-desktop.ts` 保留 7 类请求：`knowledgeList`、`knowledgeGet`、`knowledgeCreate`、`knowledgeSetSources`、`knowledgeInspectLocal`、`knowledgeRevealSource`、`knowledgeRemove`。

保留示例：`{"type":"knowledgeCreate","title":"审批资料","sources":[]}`、`{"type":"knowledgeList"}`。向量示例 `{"type":"knowledgeEmbeddingGet"}` 和历史发布请求全部校验失败，不触发外部操作。

数据库无需破坏性迁移：继续读取 `knowledge-base:v1:*` 原结构，原 cloud 配置/回执、加密设置不重写。当前查看历史正文仍受原授权与源版本检查；原件变更或目录撤权会阻断旧片段，不因退役而放宽检查。

## 代码与验收对应

| 范围 | 代码 | 验收 |
| --- | --- | --- |
| PF01 导航与界面 | `src/App.tsx`、`src/Sidebar.tsx`、`src/KnowledgeCollections.tsx` | 资源进入集合；旧独立导航、云及向量操作不存在；切换项目保持隔离 |
| PF03/PF11 退休接口 | `shared/knowledge-desktop.ts`、`main/main.ts`、`main/service.ts` | 13 种有效形状的退休请求被拒绝；云发布 Service 方法不存在；无外部请求 |
| PF09 数据保护 | `main/knowledge-base.ts` 既有结构与集合服务 | 云未知回执不阻塞本机管理，历史数据原值保留；集合更改/移除不删除原件 |
| 普通资料查询 | `main/files.ts`、`main/evidence-search.ts`、`main/pi-memory.ts` | 相关既有回归，不改变关键词/权限/来源版本检查 |

## 实际验证

- 最终 `npm run check`、`npm run build` 均退出 0。日志：`.test-data/knowledge-retirement-check-final-20261009.log`、`.test-data/knowledge-retirement-build-final-20261009.log`。最终 renderer `index-BDUFdkAi.js`。仍有原有大包体积提示，无编译错误；没有执行 electron-builder。
- `node --import tsx --test tests/knowledge-publication.test.ts tests/knowledge-base.test.ts tests/knowledge-service.test.ts tests/evidence-search.test.ts tests/evidence-search-subagent.test.ts tests/pi-memory-service.test.ts`：37/37 通过、0失败。证据 `.test-data/knowledge-retirement-tests-20261009.log`。包含保留历史模块的本机 HTTP 契约回归，不能解释为恢复了云/向量产品入口。
- 最终编译版运行 `node scripts/knowledge-collections-ui-smoke.mjs`：真实隔离 Electron 7组通过。覆盖13种退休请求经 preload/IPC 拒绝、资源入口与标题、历史索引、源文件变化阻断、无向量配置的集合创建/更新/移除、原件保留。结果 `.test-data/knowledge-retirement-ui-1791560401702/result.json`，日志 `.test-data/knowledge-retirement-ui-final-20261009.log`；外部 fetch 0、页面异常0，自建应用已正常关闭。没有操作用户应用或用户 profile。
- 首次桌面7组同样通过，证据 `.test-data/knowledge-retirement-ui-1791560306015/`；审查截图发现顶部仍使用旧路由名称，随后只改为“资料集合”，重新check/build并完成上述最终复验。旧截图保留。
- 三份关联导航/字体 smoke 脚本已同步入口并通过语法检查，本轮未完整重跑这些广泛场景。前端进行 React 最佳实践审查，移除旧网络与界面状态后保留跨项目及跨选择的异步结果保护。
- 子代理早期两次测试启动长时间无输出，已按已核对的本任务进程停止；不作为通过记录。最终主代理组合测试正常结束，未修改产品超时或放宽断言。

未验证/未操作：远端网站下线、数据库删除、真实云问答及语义召回效果。本次没有云请求，后两项已退出当前交付范围。重启根目录开发 BAT 才会加载新的主进程入口；无便携版、PPT或视频。流程见 [Mermaid](knowledge-retirement-2026-10-09.mmd)。

通俗说：去掉需要单独搭网站、配向量服务的那套功能。仍可整理资料清单、让会话找文件和读资料；旧资料保留。以后真的经常出现“换个说法就找不到”的问题，再拿实际例子决定是否加回语义检索。

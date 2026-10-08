# 项目重载误切换修复

需求：真实任务结束后，重新打开或刷新界面应继续显示宿主当前项目及其会话、待确认方案和成果；浏览元信息不能擅自切换工作空间。

合成真实任务第三轮Plan已进入`awaiting_plan`，页面重载却显示“还没有会话”。只读SQLite核验发现，测试项目分区仍保留同一会话和Plan，当前state被切回空默认项目，数据没有丢失。

原因位于`src/App.tsx`的projectEntries effect：为了读取项目元信息调用`type:'project'`，而该IPC实际执行Service.workspace。旧localStorage项目ID在页面初始化时触发写操作，projects刷新也会反复触发同一副作用。

修复仅移除元信息effect的写IPC，改从已读取的projects元数据派生条目。`loadProjects`继续以宿主currentProjectId为准；用户显式onProjectChange仍使用project IPC。真正目录内容继续由现有projectCatalog/projectBrowse提供，不新增导航或切换规则。流程见[Mermaid源](diagrams/project-refresh-fix.mmd)。

根代理已执行统一check/build通过，日志`.test-data/synthetic-project-refresh-check.log`、`synthetic-project-refresh-build.log`。`scripts/project-refresh-ui-smoke.mjs`实际桌面回归4/4通过，pageErrors为空，证据`.test-data/project-refresh-ui-1791210810915/result.json`：在独立合成profile设置旧localStorage指向甲、宿主保持乙，reload与元信息刷新保持乙及同会话/Plan/mounts，随后显式切甲/乙仍有效。其Plan为纯合成待确认状态，仅用于工作空间恢复测试，不作为真实模型成功证据。

真实任务续跑通过`--continue-from-plan`先验证原测试项目仅含同一个待确认Plan及对应会话、0草稿、来源哈希未变，再直接planConfirm；不重复发送原Plan。旧失败result保留为result-before-continue.json，新回执记录当前renderer入口哈希。真实四任务和关闭重启闭环随后全部完成，证据`.test-data/pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm/result.json`，pageErrors为空；宿主执行完成与独立业务验收分开记录，详见[合成真实任务验证](pm-synthetic-real-tasks-2026-10-05.md)。

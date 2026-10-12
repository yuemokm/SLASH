# / 菜单调用 skills 与设置精简

2026-10-09，需求关联 F02/F10/PF08。会话输入 `/` 时先显示当前可用 skills，再列内置命令；按名称或说明过滤，↑↓、Enter/Tab 选择，Escape 关闭。弹层按用户最新参考图贴输入框上方，与输入框同宽，高度最多320px；每行约34px，图标、名称与弱化说明同行，窄列说明省略，管理入口直达设置 → skills。技能显示name，底层仍使用原 `/skill:名称`。没有技能、没有匹配及读取失败均有提示。

设置中的“全局技能”更名为 **skills**。管理范围仍为本机各项目共用的已安装技能；菜单同时包含当前项目已授权技能，并标明来源。项目同名优先，同一作用域重复名称阻断，停用/损坏/未授权项不列。`disable-model-invocation` 技能仍可由用户显式选择。skill 与内置命令同名时使用 `/skill:名称`，例如 `/review` 和 `/skill:review` 各自独立。

通俗解释：输入 `/` 就能找到已装好的工作方法，选中后再写任务。它会真正读取对应技能，沿用原来的权限保护。

## 原能力接线

- `shared/types.ts` 增加只读 `skillCommands` 请求，`main/main.ts` 交给 `Service.skillCommands()`。后者复用原 `GlobalSkillsRegistry.runtimeSnapshot`、授权目录和 `AuthorizedSkills.discover()`；仍由已锁定的 Pi 0.86.1 `loadSkills` 解析。没有新包或第二套运行时。
- `src/slash-commands.ts` 生成 `/skill:名称`，保留任务正文。输入/选择显式skill时清理不兼容工作流和PRD模板，保留原引用资料；`resolveComposerIntent` 同样阻止继承旧工作流，避免命令被生成任务包装。
- UI发送原命令；原 `Runtime.prepareUserInput` → `expandAuthorizedSkillCommand` → `AuthorizedSkills.load(...,'command')` 复核授权/版本并读取正文，进入实际Pi请求及加载回执。运行中追加复用原 `RunInputQueue` 的prepare链。菜单发现不登记“已读取”。
- 没有新增安装生态功能，没有自动执行技能脚本，没有放宽目录权限。技能开关/文件发生变化后，旧任务仍按原版本守卫拒绝静默切换。

## 交付检查设置

单独“质量检查”导航移入通用 → 交付检查。搜索结果直接定位新位置，旧 `policies` 目的地映射通用。开关文案为“交付前强制检查”，说明覆盖支持的文档发布和原型交付。

原 `qualityGateEnabled`、`forceQualityCheckBeforeDelivery` 默认值、存储键及联动保存逻辑保留，后端门禁没有修改。空文件、版本冲突和未核对的发布结果仍拦截；检查报告、成果页操作和测试用例模块保留。

## 验证与限制

- `npx tsx --test tests/slash-commands.test.ts tests/skills.test.ts tests/global-skills-service.test.ts tests/composer-intent.test.ts tests/run-inputs.test.ts`：35/35通过，包含当前目录覆盖、停用、重复名、撤权、原Pi实际请求、队列及输入边界。
- 最终 `npm run check`、正常 `npm run build` 通过，仅既有bundle体积提示；最终renderer为 `index-BCYkJjNe.js`。未打包便携版。
- `node scripts/slash-skills-ui-smoke.mjs`：8组通过，证据 [report.json](../.test-data/slash-skills-ui-HiPzil/report.json)。真实Electron/IPC/UI发送 `/skill:review`，本机HTTP捕获的Pi首请求含项目技能正文；真实 `list_skills` 工具边界后的补充请求含手动技能正文，Run保留两份command加载回执，renderer无错误。设置两项偏好真实保存后恢复默认。未调用云模型。
- 最后菜单改为参考图的紧凑单行/skills置前，只定向复验UI，不重复模型流程；`node scripts/slash-skills-ui-smoke.mjs --ui-only` 6组通过，证据 [UI报告](../.test-data/slash-skills-ui-Regobg/report.json)、[菜单截图](../.test-data/slash-skills-ui-Regobg/slash-menu.png)、[skills设置截图](../.test-data/slash-skills-ui-Regobg/settings-skills.png)、[空态截图](../.test-data/slash-skills-ui-Regobg/no-skills.png)。最后Plan图标改用现有flow图标，check/build通过；其余布局与上述截图一致。命令单元2/2再次通过。
- 保留早期夹具失败：[无工具直接结束的报告](../.test-data/slash-skills-ui-w4Dkxm/report.json)。技能已受控读取，但首回合直接stop，没有后续模型请求；追加记录最终为 `cancelled / RUN_INPUT_RUN_ENDED`，现有运行记录可见，不能宣称模型采用。最终夹具按默认steer“当前工具返回后处理”的语义覆盖真实工具边界，没有修改原队列底座。运行时新安装或变化的技能仍可能需另开任务。
- 初次在仓库测试目录直接安装时遇到Windows目录rename EPERM；最终夹具在系统临时目录用真实Registry安装，再复制隔离profile到仓库测试目录满足隐藏窗口约束。未修改正式用户profile，也未更改生产安装路径或文件操作。

源图：[接线与设置](slash-skills-and-settings-2026-10-09.mmd)。主进程/IPC有变更，已打开的开发应用需退出后通过“双击启动开发环境.bat”重启。

# Slash 全局技能安装与运行边界

当前状态：全局安装、管理、跨项目使用及实际模型读取均已验证；不只是把文件下载到了磁盘。后续 QE16 三轮真实原型任务均实际加载全局 frontend-design，证据见 [QE16 三轮结论](../.test-data/quality-evaluation-IvMlI5/cases/QE16/QE16-one-page-conclusion.md)。另一个后续修复版本的三尺寸可用性结果见[真实资料后续验收](quality-real-followup-2026-10-07.md)。这些事实不代表所有原型都能达到相同质量，也不能代替业务核对；下方早期中断记录继续保留。

## 使用方式

1. 通过根目录的“双击启动开发环境.bat”启动 Slash；如果应用在本次修改前已经打开，先退出再启动。
2. 打开 **设置 → 全局技能 → 添加技能**。
3. 已下载的技能选择“本地文件夹”，选择包含 `SKILL.md` 的目录；在线安装选择“GitHub 地址”，粘贴公开仓库或技能子目录地址，再点击“安装技能”。
4. 安装后保持列表中的技能开关开启，在项目会话中说明需要使用的技能。它对本机 Slash 的各项目可用，不需要在每个项目重复复制；同名项目技能优先。
5. 暂时不用可以关掉开关；需要更新或卸载使用包列表中的对应操作。卸载不删除原来源文件夹或项目里的技能。

测试中已验证官方 `anthropics/skills` 的 `frontend-design` 子目录可以安装，并被真实模型读取。测试安装位于隔离测试空间，没有替用户向日常配置自动安装。技能可以提供设计方法和规范，但不能保证每次生成物的业务规则、交互和视觉都合格，仍需实际预览和检查。

通俗解释：全局技能相当于给 Slash 放一份各项目共用的工作手册。安装成功后，模型可以按任务读取这份手册；它不是自动执行所有附带脚本，也不等于已经检查过最终作品。

架构源图：[全局技能安装与运行](diagrams/global-skills.mmd)。

全局技能由 `main/global-skills.ts` 的 `GlobalSkillsRegistry` 管理，持久根为应用自己的 `userData/global-skills`。本地技能文件夹或包含多个技能的目录导入后，项目无需再次挂载；GitHub HTTPS 仓库、tree 子目录和 SKILL.md 的 blob 链接可显式安装。按安装包列出来源、时间、固定提交和说明，按技能启停；更新和卸载是显式操作。本功能不扫描 Codex 或其他应用的全局技能目录。

`shared/global-skills.ts` 导出 `globalSkillsRequestSchema`、`GlobalSkillsView`、`GlobalSkillMutationReceipt` 和 `GlobalSkillsRuntimeSnapshot`。后端方法是 `view()`、`importLocal(path, options)`、`installGitHub(url, options)`、`setEnabled(skillId, enabled, expectedRevision)`、`removePackage(packageId, expectedRevision)`、`updatePackage(packageId, options)`。options 支持 `expectedRevision` 和取消 signal；过期列表修改明确提示刷新。设置界面使用包级更新/卸载和技能级开关，目录选择由宿主原生选择器处理。

## 复用与取舍

技能声明和实际正文继续使用 Pi 的 `loadSkills`、`stripFrontmatter` 和现有 `AuthorizedSkills`，不会把下载过程当作加载证据。Pi `DefaultPackageManager.installGit` 会执行包的 npm 安装，且该路径没有合适的取消入口，所以此功能采用限定 HTTP 获取和已有 adm-zip 检查，只取得技能文件；不安装通用 extension、不运行生命周期脚本、不修改工具权限。references、assets、scripts 都可作为包资源复制，但脚本是否能执行仍由原有工具和权限控制。

GitHub 仓库首页查询默认分支，子目录链接从最长可能 ref 逐段查询，支持分支名含 `/`，随后固定 commit。选择子目录时只获取对应 Git tree 和 raw 文件，不下载整个大仓库。每个 raw 文件同时核对长度和 Git blob SHA1。无子目录的仓库使用固定 commit 的 ZIP，超限明确失败。仅公开 GitHub HTTPS 地址可下载，无凭据字段、重定向或任意站点地址。

检查覆盖路径越界、Windows 保留名称、大小写重名、目录/符号链接、ZIP 特殊文件与 CRC、解压比例、文件数量和总字节数。限额为单文件20 MiB、下载ZIP25 MiB、资源合计80 MiB、4096项、100个技能、12层目录、单SKILL.md64 KiB；网络安装60秒并支持取消。失败不会覆盖已有安装。

## 运行与恢复

`runtimeSnapshot()` 返回只读 `runtimeMounts`、带global scope的 `runtimeDirectories`、`revisionToken` 和诊断。Service 将它们注入当前运行环境，不写入项目原始 mounts，不把应用全局目录放进用户的项目资料列表。每个已启用技能单独挂载，停用兄弟技能不会因共享包目录仍可读。项目同名技能优先；项目自身重复名称仍给冲突提示。

运行 token 同时固定 registry 版本和实际授予的有效包集合。每次技能/资源读取重新核对：启停、更新、卸载或外部文件变化都会拒绝旧任务继续读取。单包文件损坏时，设置列表保留该包及中文提示，可更新或卸载；新任务排除该包，正常包及普通聊天仍可用。registry 本身损坏或恢复记录无法确认时明确报错并保留文件，不能假称已经修复。

修改使用进程锁和 journal。锁包含 pid 和开始时间，仅能确认持锁进程已经退出时恢复，不按超时抢占活锁。journal 在移动目录前保存操作前后完整 registry；重启时以 registry 的实际版本/hash确定恢复旧目录或清理已提交备份。无法匹配时保留目录、备份和记录并提示核对。覆盖安装、更新、卸载中断；测试通过实际构造中断后的目录/记录来验证恢复。

## 验证与证据

`tests/global-skills.test.ts` 使用真正 Pi 解析及授权文件层，HTTP 全部为 fixture，无模型调用、无真实GitHub请求。覆盖跨项目、只读资源、不执行脚本、显式调用、同名优先、修订失效、失败回滚、路径/ZIP限制、含斜杠分支和固定commit子目录、中断恢复、活锁、无法确认的 journal、坏包隔离和缺失包卸载。

`node --import tsx scripts/global-skills-local-preflight.mjs` 只读用户的 `E:\code\slash test\资源\skills`，复制到新建 `.test-data/global-skills-local-*` profile，真实发现和加载 `create-prd`、`drawio-process-redraw-vertical`、`qianhe-marketing-product-design`。报告保存原件全部文件前后SHA-256、实际加载正文hash和两个独立项目运行快照；不启动Electron、不构建、不调用模型和网络。正式 UI/真实 GitHub 下载及模型使用的结果由主集成测试记录，不从离线fixture推断。

此阶段结果：global fixture最终16/16通过，包括真实GitHub 422语义及相同长度错误blob内容；旧技能和质量基准联合23/23通过，TypeScript检查通过。真实用户离线报告为 `.test-data/global-skills-local-VV4XKH/report.json`：原件253个文件前后hash一致，三个技能均从全局副本在两个独立运行快照实际发现和加载。目录中的 `source-hashes.json` 可逐文件复核。子目录 ref 404或精确的422 `No commit found for SHA: <candidate>` 才缩短重试，其他422不被吞掉。

通俗解释：现在技能相当于安装在 Slash 自己的“公共书架”上，换项目也能取用。取用只是读说明和资料，不会因为装了技能就自动执行它附带的程序。如果某一本被改坏，软件会指出哪一本有问题，仍允许处理其他技能；旧任务也不会悄悄换读不同版本。

## 主集成实际验收记录

2026-10-07，正常 `npm run build` 通过，未制作便携版。真实公开 GitHub 下载与 Pi 正文读取通过：`.test-data/global-skills-github-WQT7NX/result.json`，来源 `anthropics/skills/tree/main/skills/frontend-design`，固定提交 `683bc88e56f3e09ba94f7055977f3d3aa499f202`。校验了 registry 重建后记录保留及全局副本拒绝写入；未调用云模型，不代表原型视觉质量已改善。

隐藏 Electron 在隔离 profile 实际点击设置安装、启停、更新及卸载通过，截图见 `.test-data/global-skills-ui-XjfKOx/全局技能安装列表.png`。该轮附带真实本地包的 Service 测试超时，整体报告保留失败，正在核对；不能把前半段 UI 通过当成该轮全部通过。正式用户 profile 未被修改。

后续定位为测试逐份读取近200份references超出其10秒等待预算；实际技能发现、正文读取及后续read_file一直成功。调整测试为每技能最多3份代表性参考文件的实际读取，并保留全量原件前后哈希核对。最终完整重跑 `.test-data/global-skills-ui-anKutS/result.json` 为 passed、pageErrors为空；附带 `real-source/result.json` 证明两个项目及Store/Service重启后仍可加载，所有200个该技能包原始文件保持不变。模型传输为本地流程fixture，报告明确抽样范围，不宣称模型已使用该Skill产出合格原型。其他两个技能的离线安装证据仍为前述253个原始文件合计。

最终 `npm test` 为462/462通过，日志 `.test-data/quality-global-final-tests.log`。新增host检查阶段导致的两条旧终态预期已调整为等待真实finishedAt/active清理，仍保留终态一致性断言。正常build通过，仅有既有前端bundle体积提醒。

后续集成内容审查后，正常 `npm run build` 通过，全量 `npm test` 为483/483通过（`.test-data/quality-integrated-final-tests.log`）。真实模型原型基准改为正式 `globalSkillsChooseFolder` 授权后再导入，测试仅替代隔离应用的原生目录选择结果，未更改生产授权检查。`.test-data/quality-evaluation-c8482i/cases/QE16/execution.json` 已记录真实 IPC 安装成功及来源固定提交；实际模型加载、原型视觉与交互结论必须等待独立运行证据，不由此推定。

该 QE16 云模型尝试最终 interrupted，原件及运行构建哈希均保持不变。模型实际成功调用 get_task_acceptance、list_skills 和 search_files，已能看到全局 frontend-design；尚无 load_skill 正文回执或成果。上游最后返回 length，但记录 output 仅1 token，不能直接解释成正常用尽12000输出额度。终态上下文估算76798（声明65536的117%），初始资料、约54628字符AGENTS索引和23688字符目录返回是明显负担；本次没有可见Pi压缩事件。未捕获原HTTP payload，不断言端点实际限额或唯一根因。后续应收缩模型索引和搜索/来源片段，再做真实原型验证；不得把这次安装/发现成功改写为Skill已改善设计质量。

已追加最小 managed 索引投影修正，见 [agent-index-context-2026-10-07.md](agent-index-context-2026-10-07.md)：该真实索引注入由54628降至5888字符，磁盘全文及人工规则保留；Pi继续负责压缩。全量487/487通过（`.test-data/quality-global-index-final-tests.log`），正常build通过。同期旧构建QE05研究对照仍未完成，主集成人工通过正式cancel IPC结束，原因记录在 `.test-data/quality-evaluation-c8482i/cases/QE05/operator-cancellation.json`，不是产品超时或语义审查完成。新构建原型用例采用独立 `.test-data/quality-evaluation-zM1Gz5`，结果另记。

新构建实际云模型在QE09中于09:03:45 UTC成功调用 `load_skill`，读取 `scope=global` 的 frontend-design，正文hash与已安装的GitHub固定版本一致；完整证据为 `cases/QE09/global-skill-runtime-proof.json`。同一运行也验证了显式 `/skill:frontend-design` 的受控正文加载。原型测试随后被收敛为本次优先要求的安装/发现/读取验证，追加指令与人工终止均另存记录；原始QE09业务基准仍为未验证，运行终态为人工取消，不宣称完整原型任务或视觉质量通过。Pi会话存在真实原生compaction记录，未自建替代压缩循环。正式用户profile未安装该测试技能或被修改。

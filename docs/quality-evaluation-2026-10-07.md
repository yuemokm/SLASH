# 真实业务输出质量基准与可复核记录

状态：已实现16条可执行基准、隔离资料预检、官方IPC执行器及独立证据记录器；已完成离线验证。该阶段没有调用云模型、启动Electron、重启用户应用或构建/打包。离线通过表示基准资料可核验，不表示模型已经完成业务任务。

本轮范围依据用户的“按建议顺序开发，开发完用真实数据测试”目标。工程沿用现有Electron、Pi、IPC、草稿和版本路径，只增加开发验收工具；没有新增用户操作入口、数据库或Agent调度器。已有真实模型门店作战中心任务使用合成资料，其结果继续按[历史真实任务记录](real-task-test-review-2026-10-07.md)解释，不能冒充本次用户业务资料测试。

## 资料与独立预期

真实原件位于 `E:\code\slash test\资源\参考资料`。prepare只读取原件以计算字节SHA-256，并复制到新建的 `.test-data/quality-evaluation-*` 目录；Office转换仅接收复制文件的字节。前后核对原件及副本。下列哈希来自本次重新复制/提取，匹配旧资料记录；事实表示“资料如此记载”，不表示制度已经正式生效。

| 来源 | SHA-256 | 已核验事实 |
| --- | --- | --- |
| 新增终端流程v2.0.docx | `0eec395ffd704a7b46c0bb270c8a2db2a7bb1f71e1d9fafe673d36dc0c682817` | 机会门店步骤10–70含POI来源、直接新建/后台导入、填写提交、MDM+外部系统判重 |
| 门店运营管理制度-V4.docx | `ad42cce64fb0c9f9604c1c3ed2fa5be8d139217ccc71b3db84d86619dd14a6e0` | 1.2区分正式建档必录字段是否完成；提取行332限定上线初期批量导入、后续SFA手工 |
| 字段梳理/05 网点主数据.xlsx | `995f8eb8534cfb88e73ba186062506625017e363aad09f1915cb3a0642366fe8` | “03 机会门店主数据”编码自动计算/唯一/JHWD+10位顺序码、新增展示/前端不可变更；名称手动录入/长度50；维度区分正式落库、必填、展示和变更 |

期望来源与“01终端网点主数据”的ZDWD及新增不展示规则明确分开。手机/桌面尺寸、50/51字符输入、成功/重复/失败模拟、评审例外和三轮修改是**测试设计要求**，不是宣称这些细节已由原业务资料规定。每个check保存 `basis=verified_source/test_requirement`、来源ID、定位和证据类型。

Office解析沿用 `main/office-extraction.ts`，不运行宏、公式或外部链接；DOCX图片未做OCR、版式未提取。字段表的“50”本次输出为带类型标注的文本，名称来源原文写“手动录入”。prepare匹配实际格式，避免使用错误的合成值判断模型。

## 16条基准

| 用例 | 任务 | 独立验收重点 |
| --- | --- | --- |
| QE01 | 编码业务对象字段定义 | JHWD与ZDWD对象区分、自动/唯一及引用 |
| QE02 | 必填与正式落库研究 | 首次新建与正式建档阶段条件 |
| QE03 | 创建/变更矩阵 | 展示、输入、后续修改权限分开 |
| QE04 | 名称规则与原型 | 手动录入/50限制，浏览器50/51边界 |
| QE05 | 导入资料矛盾研究 | 原文冲突、阶段与生效范围待确认 |
| QE06 | 判重PRD与演示 | 后端依赖未知，三种模拟状态 |
| QE07 | 生命周期PRD | 机会与合作中定义及未明确条件 |
| QE08 | 新增完整流程PRD | 来源、角色、填写、提交、系统校验 |
| QE09 | 编码只读原型 | 可见不可手填，分配时机及模拟标识 |
| QE10 | 提交状态原型 | 成功/重复/失败、失败保留输入 |
| QE11 | 原型响应布局 | 390×844、1280×800、1440×900实际操作 |
| QE12 | PRD/原型一致性 | 字段和来源落实位置一致 |
| QE13 | 评审后名称反馈修改（两轮） | 真实差异，50规则与已有行为保留 |
| QE14 | 明确试点例外修改（两轮） | 新要求与旧来源区分，不写参考原件 |
| QE15 | 不明确范围评审（两轮） | 具体澄清、第二轮不改成果 |
| QE16 | 修改与回归（三轮） | 重复/失败/编码/长度共同有效、版本可定位 |

用例提示、独立预期的SHA-256、源码/编译产物哈希、可用项目技能及包文件哈希进入manifest。真正运行后记录本轮实际系统提示词hash、技能发现/加载、思考配置、模型路由、来源读取回执、Run/应用草稿/成果与版本。可用技能不等于已加载技能，模型生成成功也不等于业务通过。

## 执行与记录

离线准备：

```powershell
node --import tsx scripts/quality-evaluation-preflight.mjs --prepare --model-database "$env:APPDATA\slash\slash.sqlite"
```

默认原件目录可通过 `--source-root` 显式指定。元数据SQL只投影模型身份、协议、配置限额、默认标记及密钥条目是否存在，绝不读取/打印凭据内容或会话历史。APPDATA/slash本轮可见一条 `DeepSeek-V4-Flash-0731 / openai-completions` 配置，限额为null，凭据条目存在性为0；这不能证明供应商能力或代表最近真实任务的有效profile。实际执行者必须选择当前有效配置所在profile。

先执行小完整研究任务建议选择QE05，单轮只注入制度和新增流程两个来源。下列命令明确允许一次该case的真实运行，由主代理选择已有当前模型及同一协议；没有自动协议切换、额外发送或恢复：

```powershell
node --import tsx scripts/quality-evaluation-run.mjs --run --allow-cloud --test-dir "<新prepare目录>" --case QE05 --source-profile "<当前有效profile>" --model-id baishan-deepseek-v4-flash-0731
```

启动前必须满足源码、资料、技能和prepare时的dist哈希一致；启动前源码或dist变更后重新prepare。执行期间仅源树变化记录 sourceTreeChangedDuringExecution，运行版本仍绑定启动manifest；执行后的dist、资料或skill变化判 verification_invalid，不把无关开发新增源码误判成模型失败。compiled预算必须与源码 `DEFAULT_RUN_LIMITS` 相等：当前每轮30分钟/120次工具调用，观测从send返回后开始，加15秒收尾，避免短于宿主预算。需要dist包含已实现的 `PM_SLASH_TEST_HIDDEN` 隔离保护；执行器只通过官方Electron入口与 `window.pm.request` 调用，不重新定义BrowserWindow。关闭继承的开发服务器变量，避免连接用户正在使用的开发界面。

每个case目录用独占创建的 `run-once.lock` 防重复，失败也保留。执行器只复制选中模型的加密凭据及能力缓存到隔离profile，凭据不会进入stdout或回执；真实运行时由应用本身解密。用户业务项目的数据库和文件不写入，web/process/external_action权限关闭。草稿只允许该case目录中的成果路径，按用例要求检查产出，不统一要求三个文件；QE02允许实际研究回复，QE05明确要求保存约束对照报告。使用官方apply保存并核对字节和版本；后续轮保存前后哈希及实际变更路径。失败的原生资料与待应用草稿仍在隔离profile中，不能把失败改成通过或隐式续跑。

`execution.json` 的生成状态与 `result.json` 的业务评分分开。满意/违背/未知必须有相符类型的独立人工、浏览器或运行证据，绑定实际模型成果字节哈希、证据文件hash、观察者和说明；关键词和模型自评不能计为满足。未执行的项为unknown，缺项列表如实保留，耗时和人工修改次数没有实测时保持unknown，不默认填0或计算节省比例。

把实际观察写到同一test目录内的 `observations.json`，例如：

```json
[{"checkId":"QE05-conflict","status":"satisfied","kind":"business_review","artifactSha256":"<真实64位hash>","evidencePath":"<隔离目录内人工核对记录绝对路径>","observer":"实际核对人","note":"已逐段比对两份资料、冲突适用范围及成果位置"}]
```

记录器要求该case存在真正生成完成的execution回执，并再次核对成果与证据文件：

```powershell
node --import tsx scripts/quality-evaluation-preflight.mjs --review --test-dir "<test目录>" --case QE05 --observations "<observations.json绝对路径>"
```

人工修改次数由执行者实际计数后显式写入execution字段，再导入评审；评分器不推断人是否改过文件。该证据机制提供记录与版本核验，不能自行证明填写者的业务判断正确。浏览器可用性和视觉质量仍需实际试用与目视核对。

## 此阶段离线验证

- 三份原件及副本前后哈希一致；7项独立资料断言通过，16份结果均为not_executed/unknown。
- `npx tsx --test tests/quality-evaluation.test.ts` 4/4通过，覆盖未知指标、证据类型/来源绑定、只读元数据不泄露或改变数据库、越界路径与被改成果拒绝。
- `npm run check` 前后端TypeScript通过；`node --check scripts/quality-evaluation-run.mjs`通过。
- 最终本阶段prepare目录 `.test-data/quality-evaluation-Llb8SF`：7项来源断言及9种官方IPC请求schema例子通过，schema样例没有执行。执行器缺少显式云端门禁的调用实际返回 `EVALUATION_EXPLICIT_CLOUD_GATE_REQUIRED / cloudExecuted=false`，没有启动应用或读取密钥。
- 保留第一次失败目录 `.test-data/quality-evaluation-f5ZwaV`：提取文本带“文本:”类型前缀，且名称实际写“手动录入”，初始预检匹配表达式错误；修正匹配表达式后独立断言通过。没有修改原资料或放宽业务预期。
- 后续通过目录及manifest以主代理最终prepare记录为准；曾通过的目录 `quality-evaluation-G5Scwt` 对应当时源码/编译产物，之后源码变化即不能复用。

实现：`shared/quality-evaluation.ts` 定义用例及评分契约；`main/quality-evaluation.ts` 处理隔离副本、来源/版本和记录；两个 `scripts/quality-evaluation-*` 是准备/评审与显式真实执行入口。关系图见[Mermaid源](diagrams/quality-evaluation.mmd)。真实IPC执行器的启动、云端完成及16条模型业务结果，在这一阶段尚未执行和验证。

通俗解释：这相当于先给软件准备一套有标准答案和证据要求的真实业务考题。现在已经确认考题来自你的资料、原文件没有被改，并且每道题都能留下检查记录。之后让当前模型实际答题，再打开它做出的文档和页面逐项检查；“答题程序跑完”与“业务做对了”会分别记录。

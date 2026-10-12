# 设计体系参考库：实现与验收

日期：2026-10-12。需求关联：PF01、PF05、PF08、PF09 / F02。最新用户要求优先：左侧主导航独立“设计体系”完整页面，排除图片、视频、音频和PPT；原型及PRD修改继续通过会话。点击“应用”将参考加入会话并返回；输入与发送后的用户消息只展示有色描边的“设计体系”集合小卡，包含名称和类型，不平铺模板正文。最新布局与验收见[独立页面与命令收减](design-navigation-and-command-cleanup-2026-10-12.md)。

## 实现

- 2026-10-12 最新导航修复：左侧主功能导航显示“设计体系”，进入主区域独立宽页；右上入口与右侧design tab删除。提供返回会话，应用时回原会话且未发送内容保留。窄屏保留既有隐藏侧栏策略，设计页面自身响应布局。
- 152种真实设计风格、36项网页/UI模板，分组、名称/摘要搜索和用途筛选；可展开摘要，显示按安全颜色参数生成的示意。152是固定版本实际有效manifest目录数，并非预估的151。
- 每次任务最多一项设计风格和一项网页模板。同类新选择替换旧选择；输入区可移除，发送后绑定原Run显示不可修改的集合小卡。选择不会自动发起任务、写文件或创建成果；具体业务仍由用户在会话中描述。
- IPC只返回安全元数据。发送时仅传`{id, contentHash}`；宿主在固定内置目录中解析和验证，拒绝任意路径、正文伪造、重复类、未知ID与过期哈希。
- 宿主把原始DESIGN.md、tokens.css和选定SKILL.md作为不可信设计资料附加到模型任务。它们不进入用户`text/input`、不注册为执行技能、不授予目录或工具权限，不执行上游HTML和脚本。资料中的联网、执行、输出包装等要求不能覆盖Slash原有网关/草稿/交付规则。
- 设计资料正文总预算32,000字符：风格24,000、模板8,000，单文件最多16,000。tokens先于描述；DESIGN.md与tokens.css冲突以tokens为准。逐文件回执持久化总字符数、实际包含数、truncated和来源哈希；部分资料不能当作全文已读。
- Plan→Build、普通继续和短上下文继续均继承原选择并重新验证版本，哈希冲突时拒绝创建后续Run且保留原记录。旧任务没有设计参考时维持原发送行为。
- 未新增数据库表/迁移：复用Run可选元数据字段及既有持久化，原会话、文件、版本、处理记录不删除。

## 来源、许可与筛选

来源：[nexu-io/open-design](https://github.com/nexu-io/open-design)，2026-10-12读取，固定commit `0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7`。目录数据存于`main/data/open-design-catalog.json`。`scripts/import-open-design.mjs`仅维护时读取匹配commit的本地checkout，重新生成目录及许可记录；不在用户应用中在线下载。

许可：Apache-2.0，完整LICENSE及归属NOTICE位于`public/licenses/open-design/`，由Vite复制进应用资源。DESIGN.md、tokens.css和选定模板SKILL.md原文保留，元数据分类和中文模板标签为Slash适配。品牌名称仅用于识别参考风格，没有复制品牌logo、远端素材、HTML示例或执行脚本，也不声明品牌授权。

网页模板采用明确36项页面/UI选集，并同时核对上游`od.mode`为prototype/template/live-artifact及`preview.type=html`。另外79项未纳入，包含deck/PPT、image/video/audio、海报/轮播/动画素材及运行/调研代理型入口。不能仅靠mode=prototype把媒体或Agent操作模板混进页面库。摘要与原文仍可包含上游对工具或品牌的描述；它们作为不可信资料，不代表Slash实际集成那些服务。

缩略示意仅用于比较颜色和页面布局；并非运行上游模板或实际成果截图。颜色取去掉注释后的第一个`:root`，支持受限十六进制/数字rgba/oklch及本地变量解析，避免后续暗主题覆盖。不能解析的色值使用示意回退；完整原始tokens保留供模型借鉴。字体没有本地许可资源时使用本地回退。

这是设计参考数据复用，并非新增通用Agent能力或执行底座；不改Pi模型/工具执行架构、无新依赖、账号或网络权限。

## 代码与接口

| 位置 | 职责 |
| --- | --- |
| `shared/design-systems.ts` | 可执行schema、IPC元数据、Run引用/回执契约 |
| `main/design-systems.ts` | 固定目录、版本验证、有界不可信正文准备 |
| `main/data/open-design-catalog.json` | 固定来源原文、路径、逐文件SHA256 |
| `main/main.ts`、`main/service.ts` | IPC入口、发送/恢复继承和宿主prompt注入 |
| `src/DesignSystemsPanel.tsx`、`src/design-systems.css` | 列表、筛选、安全示意、输入/历史集合小卡 |
| `src/App.tsx` | 右栏入口、选择范围、发送绑定、消息历史 |

请求示例：

```json
{"type":"designCatalog"}
```

```json
{"type":"send","id":"existing-conversation","text":"生成审批后台，保留现有业务规则。","mode":"build","designReferences":[{"id":"template:dashboard","contentHash":"列表返回的64位SHA256"}]}
```

第二例哈希是说明占位，不能直接通过schema；实际调用使用目录返回值。

## 已执行验证与边界

- 入口可发现性修复：`npm run check`、`npm run build`、`git diff --check`均退出码0；编译版`node scripts/design-systems-ui-smoke.mjs`八组通过、pageErrors为空。新增一组验证默认收起右栏时文字入口可见、点击直接展开、390px标题保留且头部无横向溢出；其他七组沿用既有检查。证据`.test-data/design-systems-ui-7xUQc1/result.json`，实际查看`desktop-direct-entry.png`和`mobile-direct-entry.png`。无新主进程修改、无打包。
- `npx tsx --test tests/design-systems.test.ts`：7/7通过。核对真实来源哈希、许可、列表不含原文、限定色值、ID/正文伪造与过期版本拒绝、预算和部分回执、真实Service发送、Plan确认/普通恢复/短上下文恢复继承、冲突保留原任务。
- 与`tests/pm-workflows.test.ts`、`tests/fresh-context-resume.test.ts`合并回归25/25通过，保留旧工作流、授权来源、计划确认和恢复行为。
- Renderer及Node定向TypeScript检查已通过；最终集成check/build由单一负责人执行，详见本轮主交付记录。
- `npx vite build --outDir .test-data/design-ui-renderer-20261012 --emptyOutDir false`与`node scripts/design-systems-ui-smoke.mjs --renderer .test-data/design-ui-renderer-20261012`：隔离Electron七组通过、pageErrors为空。临时编译仅写独立测试目录，不写最终dist。UI bridge为fixture，使用真实目录元数据；验证搜索、用途筛选、应用/移除、输入集合卡、发送的id/hash请求、历史只读集合卡、加载失败/重试及390px窄屏无横向溢出。关键宿主发送链另由真实Service专项验证。
- UI证据：`.test-data/design-systems-ui-Xq1ZZG/result.json`。实际看图：`desktop-template-selected.png`（输入区两类参考共享有色整框）、`desktop-sent-design-card.png`（历史仅名称/类型、不带移除）、`mobile-template-selected.png`（390px右侧抽屉与列表）；另有风格选择及加载失败截图。这是应用UI与本地契约验收，不等于真实模型的成果质量通过。
- 首次Vite开发服务fixture出现导航/关闭等待，无成功UI结论；改用既有编译renderer+独立HTTP fixture。不把一次环境等待说成产品通过，也未操作真实用户profile。
- 尚未证明选择某参考后真实模型生成成果的视觉/业务质量提升；正式原型仍须沿用宿主、冻结业务回归、桌面/手机实际流程及独立图审。没有执行真实云模型、MCP发布、SMB双机验收或打包。

主进程/IPC有变更，用户需重启开发应用看到新入口。

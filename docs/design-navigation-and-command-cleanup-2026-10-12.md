# 设计体系独立页面与斜杠预设收减

日期：2026-10-12。需求：PF01、PF03、PF08、PF09 / F02、F10。用户最新纠正优先：设计体系放在左侧主功能导航，与会话、资源、成果同级；进入独立完整页面，不再使用右上入口或右侧窄栏。斜杠菜单中的PM提示词预设直接删除。

## 实现与边界

- `src/Sidebar.tsx`、`src/App.tsx`：增加“设计体系”主视图及选中态，去除右上文字入口、右侧design tab和专用侧栏宽度规则。设计页不受成果预览或详情栏挤压。
- `src/DesignSystemsPanel.tsx`、`src/design-systems.css`：复用原152风格、36网页模板和注册元数据；响应网格最小卡宽280px，预览示意152px。保留搜索、用途筛选、展开摘要、参考移除、加载失败重试与来源许可；“返回会话”始终可见。
- 应用新参考立即回原会话。原会话ID、未发送文字、引用文件、模板、图片和已有设计参考保留；同类替换、不同类组合规则不变。取消已选参考留在设计页，输入与历史继续使用原有色描边集合卡。没有自动发送任务。
- `src/slash-commands.ts`、`src/composer-intent.ts`、`src/App.tsx`：移除 `/research`、`/prd`、`/prototype`、`/review` 四项PM预设，以及搜索/键盘建议、发送提示词替换、隐式工作流/模型分类。保留 `/plan`、`/help` 和授权发现的真实 `/skill:名称`。手输旧PM命令按普通原文发送，历史消息不改写。
- PRD模板冲突后的“使用 PRD 模板”去除冲突命令前缀，复用既有模板工作流，不再插入已移除的 `/prd`。
- 本轮仅收减斜杠菜单及同一调用链。首页起点、“添加→快捷动作”、成果转PRD、测试用例和真实版本差异说明保留。未删资料、历史、模板原文或业务工作流底层。
- 沿用既有Pi、IPC和可信设计注册ID/hash校验，没有增加通用Agent能力、依赖、权限或数据库迁移。

## 验证

- `npm run check`、`npm run build`：通过；仅既有renderer大chunk提示，未执行打包。renderer `index-DHOOAc29.js`。
- `node --import tsx --test tests/slash-commands.test.ts tests/composer-intent.test.ts tests/design-systems.test.ts`：12/12通过，包括旧预设无隐藏路由、真实skill/system保留、版本/授权、Plan与恢复保护。
- `node scripts/slash-skills-ui-smoke.mjs --ui-only`：真实编译版Electron与Service/IPC六组通过，证据 `.test-data/slash-skills-ui-s8SIL7/report.json`；仅复验UI，未重复云模型流程。
- `node scripts/design-systems-ui-smoke.mjs`：11组通过，证据 `.test-data/design-systems-ui-apPQaQ/result.json`。实际目录元数据与Electron；bridge为隔离fixture，不当作真实模型接入。检查宽页/导航、152+36目录、搜索筛选、应用和返回保留输入、390px页面、引用移除、发送id/hash及历史集合卡、slash菜单/键盘和旧命令原文发送、失败重试；无pageerror。截图含 `desktop-design-page.png`、`desktop-template-filter.png`、`desktop-style-selected.png`、`desktop-sent-design-card.png`、`mobile-design-page.png`、`slash-system-and-skills.png`。本代理实际查看桌面完整页，主代理独立图审另行记录。
- 首轮 `.test-data/design-systems-ui-BTiJsl/result.json` 在390px等待左导航失败：既有max-width720规则隐藏整个sidebar。按本轮范围保留该策略，窄页验证改为先进入设计页再缩到390px。次轮 `.test-data/design-systems-ui-rPcizT/result.json` 为夹具技能请求键错误失败，后修正为实际 `skillCommands`；两次失败证据保留。首轮桌面图还捕获到0.14s导航切换动画中间帧；最终截图禁用有限动画，并断言设计按钮active、会话按钮非active，选中态明确。

主代理独立审查最终 `desktop-design-page.png` 通过：宽页布局和设计体系选中态明确；本代理同时实际查看最终手机页及模板筛选图。此轮是导航和菜单修改，无需由新云模型任务证明页面路由；本轮不声明真实模型成果质量提升。本轮无主进程改动；MCP发布和SMB双机未新增验证，未制作便携版。既有手机侧栏隐藏策略意味着390px只能验证设计页自身响应布局和返回操作，不能宣称该尺寸可从左导航进入。

通俗说明：从左边进入设计体系，参考能在大页面看清；点应用就回到原聊天，写到一半的内容还在。输入 `/` 时保留技能和系统命令。

# 原型设计与视觉自检的 Pi 复用调研

查询日期：2026-10-10。范围：网页设计规划、真实浏览器视觉/操作自检、组件与设计技能。仅公开目录/README/registry 和本机已存在实现的只读核查；未安装包、运行第三方代码、发模型请求、修改源码或 dist。

结论：优先复用已锁定 Pi 0.86.1、全局 frontend-design、现有真实浏览器/截图和视觉审查链。没有发现可直接替换这些能力、同时已证明 Slash 权限、版本、取消及 Windows 稳定性的高使用量设计包。下一步重点应是让通用原型任务实际形成设计判断、按主任务和状态检查、根据当前截图反馈修正与复查；加载技能或 DOM passed 均不等于这条完整链已执行。

## 下载口径与筛选

先访问 [Pi 包目录](https://pi.dev/packages)，再按 [browser](https://pi.dev/packages?name=browser)、[design](https://pi.dev/packages?name=design)、[frontend](https://pi.dev/packages?name=frontend) 筛选。目录高使用量入口先评估，主题不相关的热门包不扩进本轮。

精确数字来自 npm `GET /downloads/point/last-month/{package}`，本次响应窗口均为 **2026-09-08—2026-10-07，30天**，不是9月自然月、独立用户数或已通过集成的数量；目录缓存的 `/mo` 可能略有差异。该口径见 [npm 下载 API 文档](https://raw.githubusercontent.com/npm/registry/master/docs/download-counts.md)。版本、license、engines、peerDependencies、exports 另核对 `registry.npmjs.org/{package}/latest`。下载量只用于先后筛选，不证明质量或稳定性。

| 候选及查询版本 | 30天下载/许可 | 已核对的公开入口 | 与 Slash 的兼容与取舍 |
| --- | --- | --- | --- |
| [pi-mcp-adapter 5.1.0](https://pi.dev/packages/pi-mcp-adapter) | [1,550,704](https://api.npmjs.org/downloads/point/last-month/pi-mcp-adapter)，MIT | `./host-managed`，Node≥20，Pi AI peer 含0.86 | 仓库已锁定并接入宿主管理的 MCP。可复用授权连接能力，但本身不提供设计判断，也没有理由为本地原型另开一套无版本绑定的浏览器。 |
| [@plannotator/pi-extension 0.28.8](https://pi.dev/packages/@plannotator/pi-extension) | [125,636](https://api.npmjs.org/downloads/point/last-month/@plannotator/pi-extension)，MIT OR Apache-2.0 | 官方 plan server/HTML；peer Pi coding-agent≥0.79.1 | 已锁定并接入 `review_plan`，回执绑定 plan hash/Run。需要比较方案时可复用；不把新增人工确认设为每次生成的强制步骤，也不把计划评阅当视觉自动验收。 |
| [@onkernel/browser-loop 0.12.1](https://pi.dev/packages/@onkernel/browser-loop) | [28,510](https://api.npmjs.org/downloads/point/last-month/@onkernel/browser-loop)，MIT | framework-neutral core、`/pi` 的 `attach/compile`；Node≥22.19；Kernel执行 | 有公开 SDK，不能因 TUI 排除。但发布包硬依赖/peer Pi core0.83.0，与现有0.86.1不同；浏览器执行需要 Kernel key/远端会话，增加新服务与路由。未验证桌面快照、草稿 hash、取消/恢复兼容，当前不替换。 |
| [pi-agent-browser-native 0.9.3](https://pi.dev/packages/pi-agent-browser-native) | [25,718](https://api.npmjs.org/downloads/point/last-month/pi-agent-browser-native)，MIT | Pi extension 原生 `agent_browser` 工具，真实浏览器操作/截图 | 不只是 CLI，但 registry 要求 Node≥24.21.0，本机 Node为24.15.0，不能称当前可直接运行；README也区分 Pi 兼容与平台/真实浏览器验收。持久登录浏览器不是当前隔离草稿快照的同等授权路径，未做 Windows/权限/版本验收。 |
| [@agimon-ai/doompi-web-components 0.0.1-alpha.82](https://pi.dev/packages/@agimon-ai/doompi-web-components) | [21,708](https://api.npmjs.org/downloads/point/last-month/@agimon-ai/doompi-web-components)，MIT | React组件、theme tokens、样式导出；React/DOM peer ^19 | 能提供组件实现，主要适配 DoomPi cockpit/theme。不能把特定产品组件库当通用生成质量保证；为当前单HTML/离线原型引入React19和主题迁移不构成最小改动。 |

相关但使用量明显较低，不作为默认新增候选：

- [design-playbook 0.25.4](https://pi.dev/packages/design-playbook)：[4,682/30天](https://api.npmjs.org/downloads/point/last-month/design-playbook)、MIT、Pi skills/prompts，公开声明设计基线、criterion-bound evidence、repair guidance，并明确不替代人工语义批准。方向与 Slash 现有合同/范围/证据门禁重合，README说明仍在维护者自用维护；可参考其方法，不照搬另一套工作流或把它当成熟集成。
- [pi-playwright 0.1.2](https://pi.dev/packages/pi-playwright)：[2,511/30天](https://api.npmjs.org/downloads/point/last-month/pi-playwright)、MIT、Node≥20、skill+`@playwright/cli`，提供截图/DOM/点击。需要新浏览器/脚本路径，现有 Electron 受限执行器已有这些基础；未证明能补设计判断或遵守 Slash 同版本门禁。
- [@bacnh85/pi-ux 0.6.6](https://pi.dev/packages/@bacnh85/pi-ux)：[1,889/30天](https://api.npmjs.org/downloads/point/last-month/@bacnh85/pi-ux)、MIT、skills+extension，设计方向/规则审计可参考；没有实际替代或稳定性证据。
- [pi-design-deck 0.5.1](https://pi.dev/packages/pi-design-deck)：[270/30天](https://api.npmjs.org/downloads/point/last-month/pi-design-deck)、MIT、extension+skills+prompts，公开 `design_deck` 以JSON展示多方案和预览，并附组件参考。不能因 macOS native window 排除，它也支持浏览器；但低使用量、额外 server/选择流程且不检查最终成果，当前不另建默认设计审批入口。

## 已有能力与真实缺口

- `package.json` 及 `main/pi-packages.ts`：Pi core/AI/coding-agent/TUI 全为0.86.1，Electron44.0.0；现有 web、MCP、subagents、lens、Plannotator 等有固定版本入口。本轮不跟随目录新底座升级。
- `main/global-skills.ts` / `main/skills.ts`：已复用 Pi `loadSkills` 与宿主授权发现/完整正文加载。此次 QE12 全局技能来源为 [Anthropic frontend-design](https://github.com/anthropics/skills/tree/683bc88e56f3e09ba94f7055977f3d3aa499f202/skills/frontend-design)，commit `683bc88e…`，Apache-2.0；原件 hash `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3`。这是 Slash 实际冻结技能；Codex本机同名技能并非这个版本，不能混写身份。固定技能本身已要求计划→对照brief→制作→批评，不能据加载成功断言模型执行了各阶段。
- `main/prototype-guidance.ts`：已包含操作工作面、主次布局、token、中文可读性、模拟事实、离线、分段保存及真实截图/操作检查建议，避免再复制一份同义通用提示词。
- `main/prototype-browser.ts` / `main/prototype-usability.ts`：现有真实运行、具体行为、触达/遮挡/溢出检查与截图；是可执行基础，不替代主任务是否方便、视觉层级/密度/文案是否适合使用者的判断。
- `main/prototype-visual-review.ts`：已有当前入口hash/真实截图匹配、视口覆盖优先、有限图片预算、结构化发现与限制；不是“系统还没有看图能力”。最新真实 Run `f3911bf0…` 自动 host3/4+required9/88均通过，但最终 content review 为 unverified、visual review为needs_human，主生成模型未调用原型截图读取工具。这说明完整质量尚未核定，不能宣称已证明技能或模型固有能力是根因。

建议下一步复用现有链做**通用原型任务**改进：在用户目标内保留紧凑可观察的设计依据（使用者、主任务、信息层次、布局/token、必要状态）；实际检查既有工作面的任务完成路径和边界状态，并用同版本截图核对可读性与层级；对有范围、位置和版本依据的反馈进入既有有限修正，再复查新hash。不要将这变成必须采用某个视觉风格、必须开人工审批或每次重造全站，也不要用专门QE12换行规则作为通用能力。

此建议是后续实施方向，不是本轮新增实现或真实质量通过。包选型仍有明确缺口：候选新包均未跑 Slash 工具调用、取消、恢复、持久化、权限/草稿版本及真实视觉/操作对照验证；现有门禁与隔离浏览器继续保留。

通俗解释：现在已有设计方法、浏览器和看图入口，缺的是可靠地用它们完成“设计—实际试用—发现问题—改好—再检查”。单纯换热门包或加更多风格提示，不能保证原型更好用。

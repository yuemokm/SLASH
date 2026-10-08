# 第一版实现与验证记录

本文件记录 0.1 测试版的实施证据，不代替完整产品规格或真实外部渠道验收。

## 已执行验证

| 项目 | 证据 | 当前结论 |
| --- | --- | --- |
| TypeScript 检查 | npm run check | 子代理整合后通过 |
| 自动化测试 | npm test | 当前 105 项通过；覆盖 PDF、DOCX、ZIP、模板、版本、文件权限、产品记录、决策记录与状态历史、流程图、SMB 邀请与映射边界、共享读写权限脚本、连接健康快照、运行恢复、持久事件序列与补读、统一质量检查、统一交付门禁与持久化确认、资源锁、模型路由、受控子 Agent、图片附件与视觉桥接、归档会话删除 |
| 授权文件操作 | tests/files.test.ts | 读取越界、只读写入、撤销权限、外部修改冲突、junction 越界通过 |
| Electron 启动 | scripts/smoke.mjs | 开发构建实际启动，工作空间创建、设置和会话可调用 |
| Baishan 模型连接 | .test-data/live-result.json | 精确模型 ID DeepSeek-V4-Flash-0731；实际回复“连接成功” |
| Pi 工具调用与产出 | 同上 | 查找并读取跨目录资料，生成 HTML 与 PRD 草稿，应用到正式目录 |
| 评审后修复 | scripts/prototype-check.mjs --repair | 同一会话读取已有原型并生成修复草稿 |
| 生成原型交互 | .test-data/prototype-check.json、prototype.png | 首次列表有4条数据；提交新增客户后可见；测试过程无捕获到的页面错误 |
| Windows 便携版 | release/slash-0.1.0-portable.exe、release/build-info.json | 最终源码已完成 npm run pack；178,673,702 bytes，约 170.4 MiB；包内实际应用回归通过 |
| 交付 EXE 直接启动 | .test-data/portable-direct/result.json、portable.png | 实际启动便携 EXE，通过 CDP 确认主界面可见、IPC 可用、精确模型及加密配置恢复；关闭窗口后启动器退出码 0 |
| 打包应用模型与恢复 | .test-data/packaged-smoke/result.json | 实际启动 win-unpacked/slash.exe；模型连接、目录权限、撤销授权、会话与工作空间重启恢复全部通过 |
| 正式用户模型配置 | scripts/packaged-smoke.mjs --configure-user；.test-data/formal-model-config/result.json | 已在默认 %APPDATA%/slash 保存系统加密凭据，精确模型 ID 验证通过；最终构建再次确认配置保存，未重复消耗模型调用 |
| 打包应用 PDF 解析 | .test-data/pdf-packaged-smoke/result.json | app.asar 内 pdf-parse 经生产 IPC 提取真实 PDF 正文通过 |
| 打包桌面 UI | .test-data/ui-smoke.json、ui-smoke.png、settings-ui-smoke.json、settings-modal-smoke.png、composer-select-smoke.png | 最终 win-unpacked 程序通过：iframe 点选、文档选段、三栏、会话选择稳定、产品记录与模板工作流显示、隔离 SVG、共享认证模式、长文档输入框，以及设置八个选项卡、设置布局无横向溢出、模型/连接表单校验、模式/权限/模型自定义下拉的点击回显；页面错误为 0 |
| 新工具真实模型回归 | .test-data/domain-smoke/result.json | DeepSeek-V4-Flash-0731 实际调用 check_flow 成功，并生成 JSON 报告与 SVG 两份草稿；不是直接调用 helper 代替 Agent |
| 官方 CLI 可执行检查 | 本机 dws.exe / lark-cli.exe --version | 钉钉 v1.0.61、飞书 1.0.33 可启动；未据此声称登录或文档写入成功 |

## 已发现并修复的问题

1. Electron ESM 入口顶层等待 app.whenReady 导致启动停滞，改为异步启动函数。
2. DeepSeek 在网关上默认进入思考模式，短输出预算无法得到正文；对该模型显式发送 thinking disabled。实测修正后连接返回正文。
3. 首轮模型原型没有初始渲染、表单按钮触发刷新等问题；将可复现反馈交给同一 Agent 修改，再验证交互。
4. iframe 选择模式存在消息时序问题，补上状态握手及 load 后同步，并通过真实 iframe 复验。
5. 长文档挤出会话输入框，修正 flex/grid 高度约束，增加输入框可见与阅读器独立滚动检查。
6. 流程图返回边穿过判断节点，增加正交路由避障；几何测试与实际截图均已核对。
7. 模型测试隔离 profile 只复制数据库无法解密 safeStorage，改为同时复制密文数据库与 Chromium Local State，不读取或记录明文密钥。

## 验收边界

- 已完成 check、105 项测试与 build；DeliveryGate、持久交付确认和交付面板状态已在最新 `win-unpacked` 构建中通过 `node scripts/packaged-smoke.mjs --skip-model` 验证；`ui-smoke.mjs` 与 `settings-ui-smoke.mjs` 也已通过。该回归覆盖工作空间、会话、权限撤销、重启恢复、左侧快捷导航、稳定项目顺序、归档会话删除和加高后的会话输入区；真实外部交付仍需按验收边界单独验证。
- 正式用户模型配置已完成；asar 文件列表检查未包含测试数据、认证文件、SQLite 配置或 Pi 凭据文件。
- Word 导出测试实际反向读取正文与表格；HTML ZIP 实际解包核对相对依赖、覆盖策略和路径边界。
- 真实飞书、钉钉写入和目标 MCP 发布需要分别验收，连接测试不能替代。
- 双 Windows 设备验证盘符可见性、账号权限、断线重连；当前单机未证明该项。
- 当前业务服务与 Agent 尚在 Electron 主进程内调用；与目标独立工作进程架构存在差异，需要在最终说明中明确，不能声称已实现进程隔离。
- 当前普通文件修改仍采用“生成草稿—手动应用”；通用多成果原子提交、URL 导入、费用预算、自动升级等未达到完整设计要求。图片粘贴/拖放已经接入主进程附件快照和会话发送链路。

测试工作空间使用虚构客户资料。截图和详细测试记录存放在被版本控制忽略的 .test-data 中，密钥仅保存在系统加密的本机配置，不记录在本文件中。

完整范围差距另见 [F01–F19 功能覆盖事实表](feature-coverage.md)。当前架构已经形成“渲染进程—主进程服务—Pi 运行时—能力网关—文件/SQLite/外部适配器”的可运行闭环，但仍有明确交付边界：Agent 和预览尚未拆成独立工作进程；真实飞书、钉钉写入及目标 MCP 发布仍需外部账号验收；影响关系图和并行任务已有后端契约，桌面端管理入口仍需补齐；事件序列补读、自动检查点、通用多成果原子提交和多设备共享尚未完成。因此可以进入受控试用和功能联调，不能把当前版本标记为无条件的生产发行版。

## 当前架构审计（2026-09-26）

- **已闭环**：Run 生命周期与恢复诊断、Plan/Build、RunCheckpoint 与 ContextManifest 来源摘要、权限策略、外部操作提案与统一交付门禁、统一质量报告、版本/差异基础能力、资源写锁、上下文清单、交付记录、任务类型模型路由、图片附件快照与 VisionBridge、连接能力健康快照，以及真实只读子 Agent 和受控并行查询。
- **仍需交付前验证**：Windows 双机 SMB 读写和断线恢复；钉钉、飞书 CLI 登录及真实文档写入；在线 MCP 的实际能力声明与错误回执。最新打包程序中的交付预检、人工确认和审批 IPC 已通过本地回归，外部渠道结果仍需单独验收。
- **仍属工程增强**：独立 Agent 工作进程、浏览器级原型路径检查、内容级差异和影响图的完整 UI、崩溃后检查点、冲突合并界面和团队协作。事件 sequence/补读已经实现为持久事件表、IPC 回放和渲染层游标恢复，但仍需在打包程序中补做断线重连实测。

当前目录版 SHA-256：`57E7D873E2FE207AF035CEF21BBD5AA3EF21CB5A2876F5364008D1B8A04AC179`，构建时间为 2026-09-27 19:45（Asia/Shanghai）。Windows 包未配置发行者代码签名；当前交付是可测试的目录版。此前便携版校验仍保留在对应历史记录中。

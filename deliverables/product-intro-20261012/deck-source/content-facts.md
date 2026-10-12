# 5页产品介绍：内容与来源

更新时间：2026-10-12。此文件为制作依据，不放入用户幻灯片正文。

| 页 | 已确认事实 | 来源与表达边界 |
|---|---|---|
| 1 | Slash是面向产品经理的Agent；Pi提供会话、模型适配、上下文与工具循环；Slash负责桌面、权限、来源版本和业务交付。架构包含任务协调、上下文、Pi主会话、只读子Agent、工具网关、质量交付、外部服务和分别保存的记录 | `docs/architecture-current.md`；`main/agent.ts`；`main/pi-subagents.ts`；已验架构工程。子Agent当前是独立只读Pi AgentSession，不是旧单工具。Pi与Service当前在同一Electron主进程。架构图为逻辑关系。本地优先不等于全离线。 |
| 2 | 模型支持OpenAI Chat Completions、Responses、Anthropic Messages三API协议；Skills可从本地文件夹和GitHub导入 | `src/SettingsModal.tsx:1129`；`src/GlobalSkillsSettings.tsx:31`。没有模型官方订阅OAuth登录；没有自带Skill Creator创建按钮。外部创建的SKILL.md可再导入。 |
| 3 | 标准权限、自动接受、完全访问；斜杠指令菜单快速选择任务与技能 | `src/ComposerControls.tsx:17`；`src/App.tsx`活动Run权限更新。自动接受针对成果编辑，其他能力仍按设置。完全访问不提升Windows身份，明确禁止优先。 |
| 4 | 右侧详情、成果、文件；共享使用SMB指向同一份目录，而不是复制整个目录 | `docs/sharing-network-drive.md`及真实界面截图。普通Windows资源管理器可映射盘符。减少副本与合版是目标工作方式；不宣称实时协同编辑，不宣称双机已验收。 |
| 5 | 真实预约管理PRD任务268281ms succeeded、1轮自动修正，自动检查passed，业务覆盖unverified。成果仍是待应用草稿，未保存正式项目 | `assets/assets-manifest.json` correctedRun；`14-prd-final-preview.png`。只展示真实输出，不人工修稿，不把自动检查当业务验收，不称生产级。 |

Pi官方：https://pi.dev/ 。OpenClaw早期采用过Pi的历史固定来源：https://github.com/openclaw/openclaw/blob/4f297a094aeb24ca3e37abc84134d84e5868c069/docs/pi.md 。当前OpenClaw官方文档称自有runtime：https://docs.openclaw.ai/pi 。不能把早期关系描述成当前依赖关系。

真实素材由baseline采集当前Electron独立profile界面，来源与边界以assets/assets-manifest.json为准。PPT嵌入实际截图，仅裁剪放大，不合成或伪造。06/07失败菜单图不用，权限页仅08真实菜单与闭合控件，权限语义用文字说明。

采用16:9、1280×720设计坐标，暖白/棕色，Microsoft YaHei（运行时字体库存已核实存在）；架构节点、连接箭头、标题和说明均为可编辑原生PPT元素。截图为嵌入图片。最终只交付5页，不增加附录。



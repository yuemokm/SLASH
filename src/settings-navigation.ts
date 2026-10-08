export type SettingsTab = "models" | "policies" | "connections" | "permissions" | "workspace" | "archive" | "general" | "prompt" | "skills";
export type SettingsAdvancedGroup = "routing" | "assistance" | "sharing" | "manual";
export type SettingsItem = { id: string; label: string; tab: SettingsTab; keywords: string; advanced?: SettingsAdvancedGroup };

// Search describes actual controls. Each result also owns its destination so
// moving a setting does not leave a second, category-only search inventory.
export const settingsItems: SettingsItem[] = [
  { id: "appearance", label: "界面主题", tab: "general", keywords: "通用 外观 经典瓷白 石墨深色 柔和米色" },
  { id: "system-prompt", label: "系统提示词与回答规范", tab: "prompt", keywords: "默认 提示词 格式规范 中文 编辑 保存 恢复默认 任务" },
  { id: "global-skills", label: "全局技能", tab: "skills", keywords: "skill skills SKILL.md 安装 导入 GitHub 更新 启用 禁用 卸载 设计 方法" },
  { id: "workspace-root", label: "工作目录", tab: "workspace", keywords: "工作空间 选择目录 当前目录" },
  { id: "project-structure", label: "项目结构与目录分类", tab: "workspace", keywords: "树 文件夹 资源 成果 过程 模板 PRD 蓝图 会议纪要 调研报告 流程图 规范 添加 删除 重命名 排序 应用结构" },
  { id: "directory-access", label: "目录权限与参考目录", tab: "workspace", keywords: "工作空间 添加参考目录 目录访问 只读 可读写 不允许访问" },
  { id: "share-lock", label: "共享锁有效期", tab: "workspace", advanced: "sharing", keywords: "共享编辑保护 共享锁 TTL 有效期" },
  { id: "model-list", label: "模型配置与默认模型", tab: "models", keywords: "供应商 密钥 协议 添加模型 编辑模型 默认模型 上下文 窗口 容量 最大输出 tokens 自动 能力" },
  { id: "vision-model", label: "图片辅助模型", tab: "models", keywords: "视觉 OCR 图片 自动回退" },
  { id: "model-routing", label: "模型分工", tab: "models", advanced: "routing", keywords: "模型选择方式 按任务类型 固定默认模型 研究 分析 PRD 文档 原型 代码 评审 普通任务" },
  { id: "quality", label: "在线文档发布前质量检查", tab: "policies", keywords: "质量检查 飞书 钉钉 交付 发布前检查" },
  { id: "connections", label: "MCP 与 CLI 连接", tab: "connections", keywords: "连接 配置 测试 启用 官方 CLI MCP" },
  { id: "manual-tools", label: "手动调用工具", tab: "connections", advanced: "manual", keywords: "高级 MCP 手动调用工具" },
  { id: "approvals", label: "工具权限与审批", tab: "permissions", keywords: "权限 审批 允许 禁止 每次询问 读取工作资料 访问互联网 调整连接配置 运行本机工具 对外发布 修改成果文件" },
  { id: "assistance-limits", label: "辅助任务限制与工具", tab: "permissions", advanced: "assistance", keywords: "辅助任务数量 并行 单次任务数 同时运行上限 总数上限 工具白名单 可用工具" },
  { id: "archive", label: "归档会话", tab: "archive", keywords: "归档 恢复会话 打开 删除" },
];

export function searchSettings(query: string): SettingsItem[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return settingsItems.filter(item => terms.every(term => `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(term)));
}

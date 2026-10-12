# 模型添加与编辑：连接字段前置

2026-10-12 用户要求将 Base URL、API Key、Model ID、协议放在前面，代理等低频配置下移。关联当前个人版模型配置与会话入口要求，结构流程见 [Mermaid 源](production-model-form-layout-2026-10-12.mmd)。

原表单把地址、模型 ID 放在连接详情，协议独立，密钥排在容量和视觉选项之后。现在复用 `src/SettingsModal.tsx` 的同一添加/编辑表单：常用配置仍可预填；API 地址/密钥、模型 ID/协议组成始终可见的两行核心字段；供应商名称与显示名称在后；代理、模型容量、视觉选项移至已有高级区域。桌面两列、390px 窄屏一列，响应样式位于 `src/settings-focus.css`。

只调整布局，不修改默认值、协议、校验或保存逻辑。高级区域保持原默认展开状态。编辑密钥始终不回显，保留空值保留原密钥与修改地址时清除原密钥的说明；高级项开合保留填写值。

验收：renderer `node node_modules/typescript/bin/tsc --noEmit` exit 0；真实 App 源码通过 Vite/Edge 执行添加/编辑、1440/390 布局与高级值保留共 5 场景，session 99985 exit 0，页面错误为空、浏览器已关闭。证据 [result.json](../.test-data/model-form-layout-20261012/attempt4/result.json)，日志 [ui-attempt4.log](../.test-data/model-form-layout-20261012/ui-attempt4.log)。截图为同目录的 `add-desktop.png`、`add-mobile.png`、`edit-desktop.png`、`edit-mobile.png`；`edit-mobile-advanced.png` 补充下方配置可达性。父代理已目视添加桌面/窄屏及编辑桌面图，验收通过。

这是实际 App renderer 验证，宿主请求为隔离夹具（`realElectronIPC:false`），0 模型调用；不宣称真实供应商连接成功。本轮无全量、构建、打包或提交。首三次夹具失败保留：项目树字段缺失、系统提示词字段缺失、协议 select 标签精确定位不匹配；没有据此修改产品逻辑。

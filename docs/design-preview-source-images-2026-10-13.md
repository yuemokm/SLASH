# 设计体系真实来源预览

需求：F02/F10、PF01/PF08/PF09。用户指出预览与来源外观不一致，要求链接到真实图片。

根因：原 `DesignReferenceSwatch` 只按颜色参数绘制统一CSS布局，目录没有图片映射；不是缓存失效或坏链接。此次移除示意，保留188项、原设计正文/hash及已有会话引用。

## 实现与来源

- 固定 OpenDesign commit `0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7`。152个风格采用各自实际 `design-systems/<id>/components.html` 首屏截图，标为“来源组件示例”。它们是上游参考组件页面，不是品牌官网截图。
- 33个网页模板复用同commit `data/plugin-previews/manifest.json` 对应 `example-<id>/<hash>/poster.jpg`，上游公开资源地址全部HTTP成功、image MIME/JPEG验证，原字节本地保存；使用时不联网抓图。
- `aster-atelier`、`contact-widget`、`live-artifact` 固定manifest没有对应poster，保留“暂无来源预览图片”和原始来源入口。前两项有源HTML，第三项为多个实时示例；本轮没有擅自选别的示例或执行脚本填图，这3项预览仍未提供。
- 维护脚本 `scripts/import-open-design-previews.mjs` 可重做导入。本机Chrome headless截图禁JavaScript、serviceWorker和全部网络；原内联CSS保留，外部字体用源页面回退。外部CSS或可见正文不足则列为缺失。先看Airbnb/Stripe/Brutalism三图，再生成152项；本轮没有逐项人工检查全部152张。
- 独立 `main/data/open-design-previews.json` 保存路径、类型、源URL、源哈希和图片SHA-256；185个本地图片约14MB。应用只展示静态图，不执行上游HTML。新增 `designSourceOpen` 只接收注册ID和目标，宿主解析固定URL，防止原有禁新窗口令来源链接无法点击。

## 代码与验收

|代码位置|职责与验收|
|---|---|
|`shared/design-systems.ts`、`shared/types.ts`|可执行预览/来源请求schema，拒绝任意路径和URL|
|`main/design-systems.ts`、`main/main.ts`|同commit图片映射、宿主按注册ID打开来源；设计正文hash不变|
|`src/DesignSystemsPanel.tsx`、CSS|懒加载、完整比例、大图dialog、原始来源/原图入口、无图/失败反馈|
|`scripts/import-open-design-previews.mjs`|维护期来源导入，无应用运行期抓取；185成功、3无官方对应poster|
|`tests/design-previews.test.ts`|185项实际文件哈希、152源码与33poster逐项匹配；拒绝未知ID/恶意路径/任意URL|

- `npm run check`、`npm run build`通过，保留Vite既有大chunk提示，未打包。
- `npx tsx --test --test-isolation=none --test-reporter=tap tests/design-previews.test.ts`：2/2通过。
- `npx tsx --test --test-isolation=none --test-reporter=tap tests/design-systems.test.ts`：8/8通过，含真实Service发送、Plan与普通/短上下文恢复的原引用链及旧数据兼容。默认进程隔离首次运行仅输出TAP后导入等待，未记为通过；停止该测试进程后改无隔离模式验证。
- `node scripts/design-preview-ui-smoke.mjs`：隔离Electron实际编译renderer/本地图片7组通过，pageErrors为空。证据 `.test-data/design-preview-ui-bxhSHb/result.json` 及截图：桌面真实列表、Airbnb大图、官方模板、缺图、真实404失败反馈、390px大图。IPC为fixture，注册ID→真实源地址由专项验证，本轮没有实际启动系统浏览器。首次fixture对404先写200响应头导致测试服务器退出，修正测试服务器后完整重跑通过。

未新增真实模型生成质量、MCP发布或SMB验收。主进程/IPC更新，需要重启开发应用使用来源按钮。

通俗说明：现在图片来自对应上游示例，点开可放大、查看原始出处；没有真实预览的3项明确显示无图。

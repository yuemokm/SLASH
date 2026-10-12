# Slash 产品介绍视频

本工程介绍当前 Slash 桌面 Agent。HyperFrames 制作架构动画，Remotion 编排实际软件截图、最终配音和字幕。

本次交付为 **无配音字幕预览**：`Slash产品介绍-字幕预览.mp4`。字幕来自最终口语稿，按自然阅读速度估时；不是配音实测时间。用户要求暂停本地语音生成，当前没有完整旁白，`voiceReady=false`。所选温柔清亮参考音色保留在本地制作目录，没有替换或冒充正式配音。

## 编辑与导出

- `hyperframes/`：架构动画源码，CLI 固定 `0.8.148`。
- `remotion/`：1080p、30fps 成片，Remotion 固定 `4.0.534`。
- `narration.json`：分章旁白；`SCRIPT.md` 是便于阅读的同一份文案。
- `timeline-preview.json` 为当前字幕预览章节与估时，`prepare-preview-timeline.py` 可重新生成。
- 正式音频后续放在 `remotion/public/voice-final`；`prepare-segment-timeline.py` 根据实际句 WAV 生成时间线和字幕。

进入 `remotion` 后执行 `npm ci`，再执行 `npm run dev` 查看可编辑预览。当前选择 `SlashSubtitlePreview`。导出命令为：

```console
npx remotion render src/index.ts SlashSubtitlePreview "../../Slash产品介绍-字幕预览.mp4" --codec=h264 --concurrency=1
```

以后最终旁白齐全，再运行实际句 WAV 准备脚本并选择 `SlashProductIntro`，导出正式配音版。无需在视频工程安装本地 TTS 模型。

当前字幕采用估计阅读时间，保留句间停顿；正式配音版接入后改用每句实际合成 WAV 的时长。`src/timeline.ts` 是可编辑章节与字幕数据，修改该文件后即可重新预览或导出。Windows 使用系统中文字体；其它系统需安装可显示中文的字体，或相应修改工程字体设置。

## 事实与素材

软件界面来自真实当前 Electron 主进程、preload、IPC，以及独立演示 profile。没有重绘假界面。PRD 使用合成预约需求资料，由真实 Wangshu 请求生成，保留为待应用草稿；已省略等待过程，不代表复杂业务验收通过。

模型配置支持 OpenAI 兼容 Chat Completions、Responses、Anthropic 兼容 Messages；没有官方订阅模型登录。技能可以本地/GitHub 导入；Skill Creator 是外部编写工具，不是目前内置按钮。SMB 双机协作尚未验证。

架构参考 `docs/architecture-current.md` 和当前模块实现，展示逻辑协作，不表示各模块为独立微服务。Pi 提供模型、会话与工具循环底座，Slash 管理桌面文件和任务。OpenClaw 历史使用 Pi，当前 OpenClaw 已有自己的运行时。

官方来源：[Pi](https://pi.dev/)、[OpenClaw 当前架构](https://docs.openclaw.ai/pi)、[OpenClaw 历史 Pi 文档](https://github.com/openclaw/openclaw/blob/4f297a094aeb24ca3e37abc84134d84e5868c069/docs/pi.md)、[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)。

用户选择了 Qwen 自生成样音，不涉及真人声音克隆。免费在线 demo 额度用尽后，曾准备隔离本地模型；用户因电脑卡顿要求暂停，当前没有完成全稿配音。历史失败、模型、缓存和样音不纳入工程 ZIP。

本地完整制作目录保留诊断与历史草稿；精简交付 ZIP 排除依赖、缓存、profile、废弃配音。

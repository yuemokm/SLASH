# Slash 产品介绍 · Remotion

本工程编排真实软件截图、HyperFrames 架构动画和字幕。当前是无配音字幕预览，字幕按阅读速度估时；`voiceReady=false`。正式旁白接入路径已保留。完整事实、素材来源与限制见上一级 `README.md`。

安装依赖并打开编辑预览：

```console
npm ci
npm run dev
```

在预览中选择 `SlashSubtitlePreview`。当前剪辑数据位于 `src/timeline.ts`，画面布局位于 `src/Composition.tsx`；素材在 `public` 中。

导出 1080p、30fps 视频：

```console
npx remotion render src/index.ts SlashSubtitlePreview "../../Slash产品介绍-字幕预览.mp4" --codec=h264 --concurrency=1
```

Remotion 固定为 4.0.534。工程使用的字体优先为 Microsoft YaHei；非 Windows 环境需安装中文字体或修改字体设置。

Remotion 对部分商业主体有许可要求，请参阅其[官方许可条款](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)。本项目没有替用户办理商业许可。

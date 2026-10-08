# slash 比赛演示视频工程

1920×1080，180秒，中文字幕版，无旁白、无BGM。实际产品录屏为0.3.11开发运行；交付版本与ZIP限制的截图来自已核验0.3.10打包工程回归，画面持续标注。工程使用HyperFrames 0.8.128、GSAP 3.14.2、FFmpeg及Playwright，本地字幕字体自包含。

第5段已录制并经根代理目视复核：实际生成HTML经3轮局部反馈修订后，13项独立界面交互通过。源HTML完整SHA256为9533e2dc10ab5bc094b6141d8275c54fe69e98de42f4a42464cd23e323b51d73。影片展示本地模拟失败→输入保留→修改详细地址清错→关闭失败开关→重试模拟成功。这里只验证所列HTML交互，PRD、约束对照和后台业务需分别核对，不宣称单次生成全对或后台已验收。

预览入口：http://localhost:3002/#project/video。事实与素材来源见EVIDENCE.json，独立验收结果与原件路径仅用于本地追溯。所有录屏只使用本目录的隔离profile/文件副本；应用源HTML未经修改，业务输入合成。第2段脚本准备的候选规则持续标注“功能演示样例”，第6段工程夹具与真实业务验收分开。没有复制真实用户profile、凭据或原始Office全文。

最终检查为review/check-final-v2.json：ok=true，browserSkipped=false；lint/runtime/motion/contrast均0错误0警告，motion实际300次采样。layout为0错误、1条container_overflow警告，来自第5段repair-mask有意裁去普通浏览器左右空白边距。110/122/140秒关键帧已实际查看并经根代理接受，完整保留原生控件和提示。review/check-final.json保留首次缺媒体ID失败记录；随后补齐稳定ID，最终检查通过。未通过隐藏警告或修改真实HTML获得通过。

可复现入口（在本video目录执行，固定版本）：

```powershell
node author-composition.mjs
npx --yes hyperframes@0.8.128 check --json --snapshots --at 5,30,55,64,70,86.6,97,105,110,115,122,140,160,165,175,178
npx --yes hyperframes@0.8.128 render --output "..\output\slash-competition-new.mp4" --fps 30 --quality looks --workers 1 --skill general-video
```

最终渲染已完成：../output/slash-competition-subtitles-20261005-1803.mp4（10168019字节），SHA256 bfe309cdbc023c6b038735cce4248878351bce039787f8ee47eb84b546eafc07。固定0.8.128单worker本地render退出0，用时4分25秒；drawelement capture / hardware GPU。ffprobe确认180.000000秒、1920×1080、30fps、0音轨。review/rendered-proof保留从实际MP4抽出的8帧与联系表，已目视复核原生失败/成功按钮、字幕与ZIP提示；没有黑屏。实际格式/输出哈希/检查汇总见review/DELIVERY.json，完整ffprobe见review/ffprobe-final.json，渲染日志见review/render-final.log。输出没有覆盖历史版本。

主要脚本：capture-product.mjs录制实际应用；capture-repair.mjs核hash后只读复制真实HTML并阻断非本地网络；localize-caption-font.mjs选取已下载字体原样子集；write-evidence.mjs生成实际素材清单；author-composition.mjs生成六个薄子合成与根入口。录制失败及修复前检查回执均保留在.capture/review。本任务不构建/打包应用、不请求云模型、不发布视频。

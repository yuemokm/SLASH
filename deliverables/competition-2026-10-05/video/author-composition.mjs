import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project = path.dirname(fileURLToPath(import.meta.url));
const captionFonts = await fs.readFile(path.join(project, 'assets/caption-font-faces.css'), 'utf8');
const scenes = [
  { id: '01-work', duration: 20, chapter: '01 / 资料到成果', heading: 'PM 的工作，从已有资料开始', video: true, captions: [[0, 7, 'slash：把资料、需求和原型放进同一个工作流程。'], [7, 7, '三份成果来自真实模型基线；本片交互输入均为合成示例。'], [14, 6, '看成果，也看它依据什么、还有哪些未确认。']] },
  { id: '02-rules', duration: 28, chapter: '02 / 规则有依据', heading: '一个字段，四个独立问题', video: true, captions: [[0, 8, '必填、仅正式落库、新增展示、后续变更，各自独立。'], [8, 10, '规则保留来源定位与版本；解释仍是候选，需业务负责人核对。'], [18, 10, '合成字段示例演示核对界面，不替代原始 Office 资料。']] },
  { id: '03-prototype', duration: 30, chapter: '03 / 真实控件', heading: '漂亮页面之后，还要验证交互', video: true, captions: [[0, 6, '真实基线：编码自动生成，创建页面不可手动填写。'], [6, 9, '模拟定位地址只读；详细地址带出后可以调整。'], [15, 15, '编码与提交均为页面模拟，不代表后台服务已验收。']] },
  { id: '04-evidence', duration: 25, chapter: '04 / 实际运行证据', heading: '缺少异常路径，是可定位的失败', video: true, captions: [[0, 8, '基线有成功与重复路径，却缺少提交服务失败入口。'], [8, 9, '宿主实际运行 DOM 断言，记录失败、时间与受控截图。'], [17, 8, '把证据带回会话，PM 可以编辑修订意图后再发送。']] },
  { id: '05-repair', duration: 50, chapter: '05 / 反馈到修订 · 实际生成成果', heading: '经反馈修订，再实际复验', repair: true, captions: [[0, 5, '实际HTML经3轮局部修订；先明确本次验证的成果版本。'], [5, 7, '本地模拟服务失败后，名称与详细地址输入仍然保留。'], [12, 5, '修改详细地址，旧服务错误即时清除。'], [17, 10, '关闭失败开关，重试提交进入模拟成功。'], [27, 23, '13项独立HTML交互通过；PRD、约束对照与后台业务需分别核对。']] },
  { id: '06-delivery', duration: 27, chapter: '06 / 交付有范围', heading: '验过什么，交付哪个版本', captions: [[0, 9, '工程合成场景：网页依赖已变化，旧报告不能继续当交付依据。'], [9, 9, '交付要求由用户确认；验收范围修改后需要再次确认。'], [18, 5, '核对后的 ZIP 是网页快照；同目录 PRD 等附件不包含在内。'], [23, 4, '复用成熟 Pi 的原生能力，连接 PM 的资料、规则、成果与运行证据。']] },
];
let start = 0;
for (const scene of scenes) {
  if (scene.id === '02-rules') scene.chapter += ' · 功能演示样例';
  else if (scene.id === '03-prototype' || scene.id === '04-evidence') scene.chapter += ' · 实际生成成果';
}
const hosts = scenes.map(scene => { const host = `<div id="host-${scene.id}" class="clip" data-composition-id="scene-${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${start}" data-duration="${scene.duration}" data-track-index="0" data-width="1920" data-height="1080"></div>`; start += scene.duration; return host; }).join('\n');
await fs.writeFile(path.join(project, 'index.html'), `<!doctype html><html lang="zh-CN" data-resolution="landscape"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>slash · 资料到可核对的成果</title><script src="assets/gsap.min.js"></script><style>${captionFonts}*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#f7f5f2;font-family:"Slash Caption",sans-serif}.clip{position:absolute;inset:0;width:1920px;height:1080px}</style></head><body><main id="competition" data-composition-id="main" data-start="0" data-duration="180" data-width="1920" data-height="1080">${hosts}</main><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`);
for (const scene of scenes) {
  const id = 'scene-' + scene.id, duration = scene.duration;
  const footage = scene.repair ? `<div class="clip repair-note" data-start="4" data-duration="46" data-track-index="0"><p class="eyebrow">真实HTML · 局部反馈修订</p><h2>失败可复现<br>输入未丢失<br>调整后可重试</h2><p>经3轮局部修订后<br><b>13项独立界面交互通过</b></p><p class="small">只针对所列HTML交互。<br>PRD与约束对照需单独核对；<br>模拟不代表后台业务已验收。</p><p class="hash">HTML 9533e2dc10ab…b51d73</p></div><div class="repair-mask"><video class="clip repair-video" src="assets/footage/05-repair-compact.mp4" muted data-start="0" data-duration="50" data-track-index="0"></video></div><img class="clip repair-overview" src="assets/footage/05-application.png" alt="当前HTML在实际应用中的来源全景" data-start="0" data-duration="4" data-track-index="1">` : scene.video ? `<div class="footage-window"><div id="${id}-focus" class="focus" data-layout-allow-overflow><video id="${id}-video" class="clip footage" src="assets/footage/${scene.id}.mp4" muted data-start="0" data-duration="${duration}" data-track-index="0"></video></div></div>` : `<div id="${id}-version" class="clip evidence-slide" data-start="0" data-duration="9" data-track-index="0"><img src="assets/footage/06-dependency-stale.png" alt="实际工程 GUI 依赖版本已变"></div><div id="${id}-scope" class="clip evidence-slide" data-start="9" data-duration="9" data-track-index="0"><img src="assets/footage/06-scope-confirmation.png" alt="实际用户确认验收范围界面"></div><div id="${id}-export" class="clip evidence-slide" data-start="18" data-duration="9" data-track-index="0"><img src="assets/footage/06-export-notice.png" alt="实际 ZIP 导出附件限制提示"><p class="closing">来源 → 候选规则 → 成果位置<br>运行证据 → 修订与版本</p></div><p class="fixture-label">真实产品截图 · 工程合成场景 · 0.3.10</p>`;
  const captions = scene.captions.map(([at, span, text], index) => `<div id="${id}-caption-${index}" class="clip caption" data-start="${at}" data-duration="${span}" data-track-index="2"><p>${text}</p></div>`).join('\n');
  const identifiedFootage = scene.repair ? footage
    .replace('class="clip repair-note"', `id="${id}-note" class="clip repair-note"`)
    .replace('class="clip repair-video"', `id="${id}-video" class="clip repair-video"`)
    .replace('class="clip repair-overview"', `id="${id}-overview" class="clip repair-overview"`) : footage;
  const tween = scene.captions.map(([at], index) => `tl.fromTo('#${id}-caption-${index} p',{opacity:0,y:18},{opacity:1,y:0,duration:.5,ease:'power3.out'},${at + .1});`).join('\n');
  await fs.writeFile(path.join(project, `compositions/${scene.id}.html`), `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body><template><style>
#${id}{position:absolute;inset:0;width:1920px;height:1080px;background:#f7f5f2;color:#18212d;overflow:hidden;font-family:inherit}
#${id} .header{position:absolute;left:48px;right:48px;top:20px;height:62px;display:flex;align-items:center;justify-content:space-between}
#${id} .chapter{font:400 22px "IBM Plex Mono","Slash Caption",monospace;color:#9c321e;letter-spacing:.04em}
#${id} h1{font-size:34px;font-weight:700;letter-spacing:-.025em;margin:0}
#${id} .footage{position:absolute;left:32px;top:91px;width:1856px;height:878px;object-fit:contain;background:#f7f5f2}
#${id} .footage-window{position:absolute;left:32px;top:91px;width:1856px;height:878px;overflow:hidden}
#${id} .focus{position:absolute;left:0;top:0;width:1856px;height:878px;transform-origin:100% 50%}
#${id} .focus .footage{left:0;top:0}
#${id} .repair-note{position:absolute;left:80px;top:152px;width:970px;height:790px}
#${id} .repair-note h2{font-size:56px;line-height:1.4;margin:0 0 28px}
#${id} .repair-note p{font-size:30px;line-height:1.65;margin:0 0 22px}
#${id} .repair-note p.small{font-size:26px;color:#455363}
#${id} .repair-note p.hash{font:400 21px "IBM Plex Mono",monospace;color:#455363}
#${id} .repair-mask{position:absolute;left:1218px;top:91px;width:568px;height:878px;overflow:hidden}
#${id} .repair-video{position:absolute;inset:0 auto auto -149px;width:864px;height:878px;object-fit:fill}
#${id} .repair-overview{position:absolute;left:32px;top:91px;width:1856px;height:878px;object-fit:contain;background:#f7f5f2}
#${id} .caption{position:absolute;inset:auto 48px 18px;width:1824px;height:76px;display:flex;align-items:center;justify-content:center;background:#f7f5f2}
#${id} .caption p{margin:0;font-size:30px;line-height:1.45;font-weight:700;letter-spacing:-.02em;text-align:center}
#${id} .progress{position:absolute;bottom:0;left:0;width:1920px;height:4px;background:#d84a2a;transform-origin:left center}
#${id} .evidence-still{position:absolute;left:48px;top:205px;width:1152px;height:620px;object-fit:contain}
#${id} .editorial{position:absolute;left:1280px;top:220px;width:560px}
#${id} .eyebrow{color:#9c321e;font-size:23px;margin:0 0 20px}
#${id} h2{font-size:70px;line-height:1.3;font-weight:700;letter-spacing:-.05em;margin:0 0 30px}
#${id} .editorial p:not(.eyebrow){font-size:28px;line-height:1.7}
#${id} .editorial p.small{font-size:23px;color:#455363}
#${id} .evidence-slide{position:absolute;top:140px;left:80px;width:1760px;height:790px;display:flex;align-items:center;justify-content:center}
#${id} .evidence-slide img{width:1080px;max-height:720px;object-fit:contain}
#${id} .evidence-slide .closing{position:absolute;left:220px;top:320px;font-size:48px;line-height:1.7;font-weight:700}
#${id}-export img{position:absolute;top:150px;width:1760px;max-width:1760px}
#${id}-export .closing{top:360px}
#${id} .fixture-label{position:absolute;top:99px;left:80px;font-size:22px;color:#455363;margin:0}
</style><section id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080"><div class="header"><span class="chapter">${scene.chapter}</span><h1>${scene.heading}</h1></div>${identifiedFootage}${captions}<div id="${id}-progress" class="progress" aria-hidden="true"></div></section><script>{const tl=gsap.timeline({paused:true});
// Registry staggered-fade-up integration: finite opacity/y reveal on actual copy.
${tween}
${['03-prototype','04-evidence'].includes(scene.id) ? `tl.fromTo('#${id}-focus',{scale:1},{scale:1.85,duration:1.2,ease:'power2.inOut'},3.5);` : ''}
tl.fromTo('#${id}-progress',{scaleX:0},{scaleX:1,duration:${duration},ease:'none'},0);
window.__timelines=window.__timelines||{};window.__timelines['${id}']=tl;}</script></template></body></html>`);
}
await fs.writeFile(path.join(project, 'meta.json'), JSON.stringify({ id: 'video', name: 'slash｜资料到可核对的成果', createdAt: '2026-10-05T08:51:35.133Z' }, null, 2));
console.log('Authored six scenes, 180 seconds. Silent Chinese subtitle edition; bounded HTML repair evidence, no backend/business success claim.');

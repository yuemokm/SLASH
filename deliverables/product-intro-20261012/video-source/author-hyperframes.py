from pathlib import Path
root=Path(__file__).resolve().parent/'hyperframes'
(root/'assets').mkdir(exist_ok=True)
original=Path('E:/code/slash/deliverables/competition-2026-10-05/video/assets/gsap.min.js')
(root/'assets/gsap.min.js').write_bytes(original.read_bytes())
s=(root/'compositions/components/constellation-hub.html').read_text(encoding='utf-8')
s=s.replace('data-composition-duration="4.5"','data-composition-duration="18"').replace('data-duration="4.5"','data-duration="18"')
s=s.replace('"Product"','"Slash"').replace('"Capture,Compose,Render,Share"','"Pi SDK,文件权限,来源与成果,修改记录"')
s=s.replace('Inter, system-ui, sans-serif','system-ui, sans-serif')
s=s.replace('<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>','')
s=s.replace('background: var(--bg, transparent);','background: transparent;')
(root/'compositions/slash-architecture-hub.html').write_text(s,encoding='utf-8')
(root/'index.html').write_text('''<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>Slash · Pi 架构</title>
<script src="assets/gsap.min.js"></script>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#f4f1ea;font-family:system-ui,sans-serif;color:#282621}
#root{position:relative;width:100%;height:100%;overflow:hidden;--bg:#f4f1ea;--fg:#282621;--surface:#fffdf9;--brand:#ce5538;--border:#d9d0c4;--font-body:system-ui,sans-serif}
.clip{position:absolute;inset:0}.eyebrow{position:absolute;left:100px;top:76px;font-size:26px;letter-spacing:3px;color:#b84c32;font-weight:650}
h1{position:absolute;left:96px;top:115px;font-size:64px;letter-spacing:-2px;margin:0;font-weight:650}.subtitle{position:absolute;left:100px;top:206px;font-size:29px;color:#77716a}
.desktop{position:absolute;left:96px;top:300px;width:1250px;height:560px;border:2px solid #d7cec2;border-radius:30px;background:#eee9df}
.desktop-label{position:absolute;left:32px;top:24px;font-size:22px;color:#81796e}.cloud{position:absolute;left:1450px;top:455px;width:360px;padding:36px;border-radius:24px;border:2px solid #d7cec2;background:#fffdf9}
.cloud h2{font-size:36px;font-weight:600;margin:0 0 18px}.cloud p{font-size:24px;line-height:1.65;color:#797168;margin:0}
.connection{position:absolute;left:1345px;top:561px;width:107px;height:2px;background:#ce5538;transform-origin:left}
.local{position:absolute;left:100px;top:906px;font-size:25px;color:#81796e}.stamp{position:absolute;right:110px;bottom:79px;font-size:24px;color:#81796e}
#hub{position:absolute;left:145px;top:355px;width:1135px;height:450px}
</style></head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="18">
<section class="clip" data-start="0" data-duration="18" data-track-index="0">
<div class="eyebrow">SLASH · ARCHITECTURE</div><h1>底层复用 Pi，桌面体验由 Slash 补齐</h1><div class="subtitle">模型适配 · 会话上下文 · 工具循环</div>
<div class="desktop"><div class="desktop-label">Electron 主进程 · 逻辑层示意</div></div>
<div class="connection"></div><div class="cloud"><h2>模型 API</h2><p>官方服务<br>供应商 / 兼容中转</p></div>
<div class="local">运行记录：SQLite　　资料与成果：本地文件</div><div class="stamp">OpenClaw 早期也采用过 Pi</div>
</section>
<div id="hub" data-composition-id="constellation-hub" data-composition-src="compositions/slash-architecture-hub.html" data-start="0" data-duration="18" data-track-index="1" data-width="1135" data-height="450"></div>
</div>
<script>
window.__timelines=window.__timelines||{};
const tl=gsap.timeline({paused:true});
tl.fromTo('h1',{opacity:0,y:22},{opacity:1,y:0,duration:.7,ease:'power3.out'},.1)
.fromTo('.subtitle',{opacity:0,y:15},{opacity:1,y:0,duration:.6},.35)
.fromTo('.desktop',{opacity:0},{opacity:1,duration:.65},.4)
.fromTo('.connection',{scaleX:0},{scaleX:1,duration:.6},3)
.fromTo('.cloud',{opacity:0,x:24},{opacity:1,x:0,duration:.6},3.2)
.fromTo('.local',{opacity:0,y:12},{opacity:1,y:0,duration:.7},5)
.fromTo('.stamp',{opacity:0},{opacity:1,duration:.7},7);
window.__timelines.main=tl;
</script></body></html>''',encoding='utf-8')

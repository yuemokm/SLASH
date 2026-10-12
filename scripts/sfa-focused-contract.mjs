import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const baselineHash='0be9757b651548831a19853a53fc79e0c6cc4799c14659450981b970989a6232';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function styleRange(html){
 const matches=[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];assert.equal(matches.length,1,'STYLE_SCOPE_INVALID');
 const m=matches[0],start=m.index+m[0].indexOf('>')+1;
 return{start,end:start+m[1].length,css:m[1]};
}
export function assertCssOnly(before,after){
 const a=styleRange(before),b=styleRange(after);assert.equal(before.slice(0,a.start),after.slice(0,b.start),'NON_CSS_CHANGED');assert.equal(before.slice(a.end),after.slice(b.end),'NON_CSS_CHANGED');assert.notEqual(a.css,b.css,'CSS_NOT_CHANGED');
 assert(!/@import|url\s*\(/i.test(b.css),'NEW_CSS_DEPENDENCY_DENIED');return{beforeCssHash:hash(a.css),afterCssHash:hash(b.css),protectedNonCssHash:hash(before.slice(0,a.start)+before.slice(a.end))};
}
const size=selector=>({action:'assert',assertion:'min-target-size',selector,minPixels:44});
const click=selector=>({action:'click',selector});
const overflow={action:'assert',assertion:'no-horizontal-overflow'};
const visible=selector=>({action:'assert',assertion:'visible',selector,expected:true});
export const focusedCases=[
 ...[320,390].map(width=>({id:'sfa-touch-home-'+width,title:'首页今日、外勤、行内去访销及复盘可点且至少44px',viewport:{width,height:844},steps:[size('.topbar .chip:nth-of-type(1)'),size('.topbar .chip:nth-of-type(2)'),size('.store-list-card .store:nth-of-type(2) .store-action'),size('.store-list-card .store:nth-of-type(4) .store-action'),size('.review-entry button'),click('.topbar .chip:nth-of-type(1)'),overflow]})),
 {id:'sfa-touch-route-390',title:'路线导航与临时新增按钮至少44px',viewport:{width:390,height:844},steps:[click('.nav button:nth-child(2)'),...[1,2,3,4,5].map(n=>size('.main section > .card:nth-child(2) .store:nth-of-type('+n+') .chip')),size('.main section > .card:nth-child(2) > .btn'),overflow]},
 {id:'sfa-touch-visit-390',title:'访销操作与签退按钮至少44px且保持点击反馈',viewport:{width:390,height:844},steps:[click('.nav button:nth-child(3)'),size('.flow-step:nth-child(5) button'),size('.main section > .card:nth-last-child(2) .btn.gray'),size('.main section > .card:nth-last-child(2) > .btn.ghost'),size('.main section > .card:nth-last-child(2) > .btn:last-child'),click('.flow-step:nth-child(5) button'),{action:'assert',assertion:'count',selector:'.flow-step.done',expected:4},overflow]},
 {id:'sfa-touch-review-390',title:'工作汇总查看和整改按钮至少44px',viewport:{width:390,height:844},steps:[click('.nav button:nth-child(4)'),size('.main section > .card:nth-child(2) .row button'),size('.main section > .card:last-child > .btn'),overflow]},
 {id:'sfa-touch-outside-390',title:'外勤抽屉操作至少44px',viewport:{width:390,height:844},steps:[click('.topbar .chip:last-child'),size('.sheet > .btn'),click('.sheet > .btn'),visible('.sheet'),overflow]},
 {id:'sfa-touch-miss-390',title:'失访弹层提交按钮至少44px且保留输入动作',viewport:{width:390,height:844},steps:[click('.nav button:nth-child(3)'),click('.main section > .card:nth-last-child(2) .btn.gray'),size('.sheet > .btn'),{action:'fill',selector:'.sheet textarea',value:'原模拟未联系到负责人'},click('.sheet > .btn'),{action:'assert',assertion:'value',selector:'.sheet textarea',expected:'原模拟未联系到负责人',match:'equals'},overflow]},
];
export function taskPrompt({mountId,path,html}){
 const range=styleRange(html);
 return `对已验收的移动端 SFA 离线原型做局部自动修订，保留品牌蓝、白头灰底与门店状态线信息层级。唯一目标是修复小按钮触控尺寸：所有既有有文字的操作按钮（今日、外勤、行内去访销、路线导航、临时新增、访销步骤、失访/保存/签退、复盘查看/整改、外勤抽屉）宽和高均至少44 CSS px。320及390手机宽度不能横向溢出、挤压遮挡；保留当前字号与业务字段、模拟数据、方法、预编译render及内联离线Vue依赖，不能改变汇总数字或补造业务接口。沿用frontend-design原则，仅精确调整现有样式尺寸，不重新设计页面，不下载字体/图片，不新增动画。
唯一写入目标 mountId=${mountId} path=${path}。源基线只读，不修改其他文件。先实际调用read_draft读取CSS片段：offset=${range.start} limit=${range.end-range.start}（UTF-16字符，完整文件前面是无需读取的内联依赖）。用真实回执contentHash作为expectedContentHash，已有pending时同时使用回执changeId；通过edit_draft做小范围CSS修改生成新的pending，不整页write_draft，不apply。允许分次读取/编辑；具体CSS方案由你判断，媒体查询中的更小尺寸也须处理。HTML正文、脚本和离线依赖必须逐字保留。
宿主将复跑原10例77步并额外以min-target-size检查上述按钮，DOM通过仅证明本版本交互与几何；主代理另看截图。当前模型视觉能力未确认，本任务仅使用文字依据，不发送图像，不声称你看过截图。停止时明确已保存pending和模拟/外部集成限制，不宣称原CDN稿全自动转换已验收。`;
}

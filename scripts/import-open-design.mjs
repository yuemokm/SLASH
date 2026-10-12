// Maintainer-only import. Reads a pinned checkout; never executes upstream code.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const commit='0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7';
const root=path.resolve(process.argv[2]||'.test-data/open-design-source-20261012');
if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('Source commit mismatch');
const digest=value=>createHash('sha256').update(value).digest('hex');
const isColor=value=>/^#[\da-f]{3,8}$/i.test(value)||/^(?:rgba?|oklch)\([\d.,% /]+\)$/i.test(value);
const document=relative=>{const content=fs.readFileSync(path.join(root,relative),'utf8');return{path:relative.replaceAll('\\','/'),content,contentHash:digest(content)};};
const clean=value=>value.replace(/^["']|["']$/g,'').trim();
const description=source=>{const match=source.match(/^description:\s*(.*)\r?\n/m);if(!match)return'';if(!['|','>','|-','>-',''].includes(match[1].trim()))return clean(match[1]);return source.slice(match.index+match[0].length).split(/\r?\n/).filter((line,index,all)=>index<all.findIndex(next=>/^\S/.test(next))||all.findIndex(next=>/^\S/.test(next))<0).map(line=>line.trim()).join(' ');};
const templateNames={dashboard:['管理看板','数据与后台'], 'live-dashboard':['实时数据看板','数据与后台'],'flowai-live-dashboard-template':['FlowAI 数据看板','数据与后台'],'github-dashboard':['研发工作看板','数据与后台'],'social-media-dashboard':['社媒运营看板','数据与后台'],'social-media-matrix-tracker-template':['社媒矩阵追踪','数据与后台'],'trading-analysis-dashboard-template':['交易分析看板','数据与后台'],'kanban-board':['任务看板','工作协作'],'team-okrs':['团队目标','工作协作'],'hr-onboarding':['员工入职','工作协作'],'meeting-notes':['会议纪要','工作协作'],'pm-spec':['产品需求页面','文档与报告'],'eng-runbook':['工程操作手册','文档与报告'],'docs-page':['产品文档站','文档与报告'],'blog-post':['博客文章','文档与报告'],'digital-eguide':['数字指南','文档与报告'],'finance-report':['财务报告','文档与报告'],'dcf-valuation':['估值分析','文档与报告'],'clinical-case-report':['临床报告','文档与报告'],invoice:['账单与发票','文档与报告'],'saas-landing':['SaaS 产品首页','网站与落地页'],'kami-landing':['Kami 品牌首页','网站与落地页'],'aster-atelier':['创意工作室','网站与落地页'],'pricing-page':['价格方案','网站与落地页'],'waitlist-page':['预约登记','网站与落地页'],'dating-web':['交友网站','网站与落地页'],'email-marketing':['营销邮件页面','网站与落地页'],'contact-widget':['在线联系组件','网站与落地页'],'mobile-app':['移动应用','移动端'],'mobile-onboarding':['移动端引导','移动端'],'gamified-app':['游戏化应用','移动端'],'wireframe-annotated':['带说明线框','线框与流程'],'wireframe-greybox':['灰阶线框','线框与流程'],'wireframe-mobile-flow':['移动流程线框','线框与流程'],'wireframe-sketch':['手绘线框','线框与流程'],'web-prototype':['交互网页','网站与落地页'],'live-artifact':['交互分析页面','数据与后台']};
const categories={'Professional & Corporate':'专业与商务','Media & Consumer':'媒体与消费','Productivity & SaaS':'效率与软件','Creative & Artistic':'创意与艺术','Editorial · Studio':'编辑与工作室','Layout & Structure':'布局与结构','Fintech & Crypto':'金融与交易','Automotive':'汽车与出行','Bold & Expressive':'鲜明与表达','Backend & Data':'后台与数据','AI & LLM':'人工智能','Morphism & Effects':'材质与效果','Modern & Minimal':'现代与极简','Developer Tools':'开发工具',Starter:'基础风格','Retro & Nostalgic':'复古与怀旧','Editorial & Print':'编辑与印刷','Editorial / Personal / Publication':'个人与出版','Social & Messaging':'社交与通讯','E-Commerce & Retail':'电商与零售','Themed & Unique':'主题与特色','Tech & SaaS':'科技与软件','Finance & Fintech':'金融与科技','Media & Entertainment':'媒体与娱乐','Productivity & Collaboration':'效率与协作','Travel & Hospitality':'旅行与服务','Lifestyle & Fashion':'生活与时尚','Food & Beverage':'餐饮与食品','Education & Learning':'教育与学习','Health & Wellness':'健康与医疗','Design & Creative':'设计与创意'};
const items=[];
for(const id of fs.readdirSync(path.join(root,'design-systems')).sort()){
 const base=`design-systems/${id}`;if(!fs.existsSync(path.join(root,base,'manifest.json')))continue;
 const manifest=JSON.parse(fs.readFileSync(path.join(root,base,'manifest.json'),'utf8'));const documents=[document(`${base}/DESIGN.md`),document(`${base}/tokens.css`)];
 const prose=documents[0].content;const summary=prose.split(/\r?\n/).find(line=>/^> /.test(line)&&!/^> Category:/.test(line))?.replace(/^> /,'')||manifest.description;
 const tokens=documents[1].content;const css=tokens.replace(/\/\*[\s\S]*?\*\//g,'');const rootTokens=css.match(/:root\s*\{([\s\S]*?)\}/)?.[1]||'';const variables=Object.fromEntries([...rootTokens.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(match=>[match[1],match[2].trim()]));
 const resolve=(key,seen=[])=>{if(seen.includes(key))return null;const value=variables[key];if(!value)return null;const ref=value.match(/^var\((--[\w-]+)\)$/);return ref?resolve(ref[1],[...seen,key]):isColor(value)?value:null;};
 const colors=['--bg','--surface','--accent','--fg','--border'].map(key=>resolve(key)).filter(Boolean);
 const previewColors={background:resolve('--bg')||'#f2f4f7',surface:resolve('--surface')||'#ffffff',accent:resolve('--accent')||'#6073a0',text:resolve('--fg')||resolve('--text')||'#243044',border:resolve('--border')||'#dce1e8'};
 items.push({id:`style:${id}`,kind:'style',name:manifest.name,category:categories[manifest.category]||manifest.category,summary,tags:[manifest.category,id],contentHash:digest(JSON.stringify(documents)),colors,previewColors,layout:'dashboard',sourcePath:base,documents});
}
const excludedTemplates=[];
for(const id of fs.readdirSync(path.join(root,'design-templates')).sort()){
 const base=`design-templates/${id}`;const file=path.join(root,base,'SKILL.md');if(!fs.existsSync(file))continue;const source=fs.readFileSync(file,'utf8');const mode=clean(source.match(/^  mode:\s*(.+)$/m)?.[1]||'');
 if(!templateNames[id]||!['prototype','template','live-artifact'].includes(mode)||!/^\s+type:\s*["']?html["']?\s*$/m.test(source)){excludedTemplates.push(id);continue;}
 const [name,category]=templateNames[id];const documents=[document(`${base}/SKILL.md`)];const layout=/wireframe/.test(id)?'wireframe':/mobile|gamified/.test(id)?'mobile':/dashboard|kanban|okrs|live-artifact/.test(id)?'dashboard':category==='文档与报告'||id==='meeting-notes'?'document':'landing';
 items.push({id:`template:${id}`,kind:'template',name,category,summary:description(source),tags:[id,mode,category],contentHash:digest(JSON.stringify(documents)),colors:['#f1f3f6','#ffffff','#596cba','#243044','#dce1e8'],previewColors:{background:'#f1f3f6',surface:'#ffffff',accent:'#596cba',text:'#243044',border:'#dce1e8'},layout,sourcePath:base,documents});
}
const data={schemaVersion:1,source:{repository:'https://github.com/nexu-io/open-design',commit,license:'Apache-2.0',retrievedAt:'2026-10-12'},items,excludedTemplates};
fs.mkdirSync('main/data',{recursive:true});fs.writeFileSync('main/data/open-design-catalog.json',JSON.stringify(data,null,2)+'\n');
fs.mkdirSync('public/licenses/open-design',{recursive:true});fs.copyFileSync(path.join(root,'LICENSE'),'public/licenses/open-design/LICENSE.txt');
fs.writeFileSync('public/licenses/open-design/NOTICE.txt',`OpenDesign design reference materials\nCopyright nexu-io/open-design contributors.\nRepository: ${data.source.repository}\nPinned revision: ${commit}\nLicense: Apache License, Version 2.0 (see LICENSE.txt).\nSlash adaptations: metadata categorization, Chinese template labels, source-bound static previews and bounded design-reference context.\nDESIGN.md, tokens.css and selected SKILL.md texts are preserved in main/data/open-design-catalog.json.\nStatic previews are recorded in main/data/open-design-previews.json; the application never executes source HTML. Brand names and upstream reference-image marks do not imply brand authorization.\n`);
console.log(JSON.stringify({styles:items.filter(item=>item.kind==='style').length,templates:items.filter(item=>item.kind==='template').length,excludedTemplates:excludedTemplates.length,bytes:fs.statSync('main/data/open-design-catalog.json').size}));

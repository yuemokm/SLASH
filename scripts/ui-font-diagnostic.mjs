import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Diagnostic only: a fresh persisted fixture and actual Chromium font usage.
const root=process.cwd();
const output=path.join(root,'.test-data',`ui-font-diagnostic-${Date.now()}`);
const profile=path.join(output,'profile');
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
await service.workspace(path.join(output,'字体测试项目'));
const id=service.conversation(undefined,'字体诊断会话');
service.state.conversations.find(item=>item.id===id).messages.push({role:'assistant',time:new Date().toISOString(),text:'中文产品工作：客户准入审批，整理需求与验收条件。English text 123。'});
service.save();store.close();
let app;
const evidence={output,samples:[],errors:[]};
try{
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_DEV_SERVER_URL:''}});
 const page=await app.firstWindow();await page.locator('.brand').waitFor();
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const sample=async(name,selector)=>{
  await page.locator(selector).first().waitFor({state:'visible'});
  const {root:document}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:document.nodeId,selector});
  const computed=await page.locator(selector).first().evaluate(el=>({fontFamily:getComputedStyle(el).fontFamily,fontSize:getComputedStyle(el).fontSize,text:el.value||el.textContent,placeholder:el.getAttribute('placeholder')}));
  const platform=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
  const shadowFonts=[];
  if(!platform.fonts.length){
   const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:-1,pierce:true});
   const inspect=async current=>{
    if(current.nodeType===1&&current.nodeId){const found=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:current.nodeId}).catch(()=>({fonts:[]}));if(found.fonts.length)shadowFonts.push({nodeName:current.nodeName,attributes:current.attributes,fonts:found.fonts});}
    for(const child of [...(current.shadowRoots||[]),...(current.children||[])])await inspect(child);
   };
   for(const shadow of node.shadowRoots||[])await inspect(shadow);
  }
  evidence.samples.push({name,selector,computed,...platform,shadowFonts});
 };
 await page.locator('.sidebar-main>.new').click();await page.locator('.welcome h1').waitFor();
 await sample('空会话中文标题','.welcome h1');
 await page.getByLabel('描述你的任务').fill('中文输入：整理需求文档与原型方案。English 123');
 await sample('输入框实际中文字形','.composer textarea');
 await sample('新会话按钮实际中文字形','.sidebar-main>.new');
 await page.locator('.project-conversations>button').filter({hasText:'字体诊断会话'}).click();await page.locator('.message.assistant .prose p').waitFor();
 await sample('助手中文与英文正文','.message.assistant .prose p');
 const strip=await page.evaluate(()=>{const el=document.elementFromPoint(innerWidth/2,18);return{tag:el?.tagName,className:el?.className,background:el?getComputedStyle(el).backgroundColor:null,appBackground:getComputedStyle(document.querySelector('.app')).backgroundColor};});
 evidence.titleStrip=strip;
 await page.screenshot({path:path.join(output,'font-samples.png')});
 await page.getByRole('button',{name:'＋ 引用资料',exact:true}).click();await page.getByRole('dialog',{name:'选择引用资料'}).waitFor();
 await sample('引用选择器中文标题','.reference-picker-head b');
 await sample('引用选择器中文文件行','.reference-picker-item-copy b');
 await page.screenshot({path:path.join(output,'font-picker.png')});
 evidence.status='completed';
}catch(error){evidence.status='failed';evidence.errors.push(String(error));process.exitCode=1;}
finally{if(app)await app.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}

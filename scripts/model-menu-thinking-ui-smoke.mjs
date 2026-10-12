// Compiled Electron + actual IPC; all provider metadata comes from loopback.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

const repo=process.cwd(),output=await fs.mkdtemp(path.join(repo,'.test-data','model-menu-thinking-electron-')),profile=path.join(output,'profile');
const evidence={status:'running',output,checks:[],metadata:[],postRequests:0,pageErrors:[],cloudExecuted:false};
const store=new Store(profile),service=new Service(store,()=>'',()=>{});let cid;
try{await service.workspace(path.join(output,'workspace'));cid=service.conversation(undefined,'模型菜单真实IPC验收');service.save();}finally{service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();}
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'){evidence.postRequests++;res.writeHead(405);res.end();return;}
 const id=decodeURIComponent(req.url.split('/').at(-1));evidence.metadata.push(id);const unknown=id==='native-0'||id==='changed-unknown',thinking=id!=='native-1';
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(unknown?{id}:{id,capabilities:{thinking:{types:{enabled:{supported:thinking},adaptive:{supported:false}}},effort:Object.fromEntries(['low','medium','high','xhigh','max'].map(level=>[level,{supported:thinking&&['low','high'].includes(level)}]))}}));
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const result=await page.evaluate(input=>window.pm.request(input),request);assert(result.ok,result.error);return result.data;};
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;delete env.VITE_DEV_SERVER_URL;delete env.ELECTRON_RENDERER_URL;
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
 const models=[];for(let index=0;index<20;index++)models.push(await call({type:'modelUpsert',model:{provider:'供应商-'+Math.floor(index/5),name:'模型 '+String(index+1).padStart(2,'0'),baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'native-'+index,protocol:'openai-completions'},key:'LOCAL-ONLY-FIXTURE-KEY'}));
 assert.equal(evidence.metadata.length,20);const capability=await call({type:'modelThinkingCapability',modelEntryId:models[19].id});assert.equal(capability.source,'provider-model-metadata');assert.deepEqual(capability.levels,['low','high']);assert.equal((await call({type:'modelThinkingCapability',modelEntryId:models[0].id})).status,'unknown');assert.equal((await call({type:'modelThinkingCapability',modelEntryId:models[1].id})).status,'unsupported');assert.equal(evidence.metadata.length,20);check('20个modelUpsert各自自动GET元数据，读取缓存无额外请求，无付费推理');
 await call({type:'modelDefault',id:models[19].id});await page.locator('.sidebar').getByRole('button',{name:'模型菜单真实IPC验收',exact:true}).click();await page.getByRole('button',{name:'思考强度',exact:true}).waitFor();
 for(const [width,height] of [[1366,900],[1100,760]]){await app.evaluate(({BrowserWindow},[width,height])=>BrowserWindow.getAllWindows()[0].setSize(width,height),[width,height]);await page.getByRole('button',{name:'选择模型',exact:true}).click();const popup=page.getByRole('dialog',{name:'选择模型',exact:true});await popup.waitFor();assert.equal(await popup.getByRole('option').count(),22);const rect=await popup.boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert(rect&&rect.y>=0&&rect.y+rect.height<=viewport.height+1);await page.screenshot({path:path.join(output,`models-${width}.png`)});await popup.getByRole('option',{name:/^模型 20/}).click();await popup.waitFor({state:'hidden'});await page.getByRole('button',{name:'思考强度',exact:true}).waitFor();}check('真正桌面菜单展示全部21个保存模型，1366/1100窗口列表可达且选完关闭');
 await page.getByRole('button',{name:'思考强度',exact:true}).click();assert.equal(await page.getByRole('slider',{name:'思考强度'}).getAttribute('max'),'1');await page.screenshot({path:path.join(output,'thinking-supported.png')});await page.keyboard.press('Escape');
 for(const model of models.slice(0,2)){await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('dialog',{name:'选择模型',exact:true}).getByRole('option',{name:new RegExp('^'+model.name)}).click();await page.getByRole('button',{name:'思考强度',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'思考强度',exact:true}).count(),0);}check('真实选中unknown/unsupported均隐藏思考按钮，已识别模型显示两档位');
 await call({type:'modelUpsert',model:{...models[19],modelId:'changed-unknown'}});const changed=await call({type:'modelThinkingCapability',modelEntryId:models[19].id});assert.equal(changed.status,'unknown');assert.deepEqual(changed.levels,[]);assert.equal(evidence.metadata.at(-1),'changed-unknown');check('同条目更换模型ID后重新识别，不沿用原模型档位');
 assert.equal(evidence.postRequests,0);assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}finally{await app?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,error:evidence.error}));}

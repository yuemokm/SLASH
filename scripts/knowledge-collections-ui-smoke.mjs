import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {KnowledgeBaseDomain} from '../dist/main/knowledge-base.js';
import {projectIdentity} from '../dist/main/project-tree.js';

// Run after the owner performs the single unified build. All data is isolated.
// The historical index is a fixture; no embedding provider or cloud is contacted.
const root=process.cwd(),output=path.resolve('.test-data',`knowledge-retirement-ui-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'project');
await fs.mkdir(output,{recursive:true});
const report={status:'running',output,checks:[],screenshots:[],pageErrors:[],externalCalls:0};
let store,service,app,page,baseId,sourcePath,resource;
const sourceText='定位地址只读，不允许修改。';
const hash=value=>createHash('sha256').update(value).digest('hex');
const check=value=>{report.checks.push(value);console.log('PASS '+value);};
const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});report.screenshots.push(name+'.png');};
try{
 store=new Store(profile);service=new Service(store,()=>{throw Error('NO_MODEL');},()=>{});await service.workspace(workspace);
 for(const capability of ['workspace_read','artifact_write'])service.setPermission(capability,'allow');
 service.setPermission('external_action','deny');resource=service.state.mounts.find(m=>m.name==='资源');assert(resource);
 const source={mountId:resource.id,path:'参考资料/历史资料.md',displayName:'历史资料.md'};sourcePath=path.join(resource.path,source.path);await fs.writeFile(sourcePath,sourceText);
 const domain=new KnowledgeBaseDomain({store,projectId:()=>projectIdentity(workspace),assertAccess:()=>{},assertSourceAccess:()=>{},readSource:async()=>({text:sourceText,originalHash:hash(sourceText),versionId:hash(sourceText),parserVersion:'fixture-text-v1',coverage:{status:'complete',limitations:[]}}),embedding:{fingerprint:{provider:'fixture',model:'historical-fixture',revision:'v1',dimensions:3},async embed(items){return{fingerprint:this.fingerprint,vectors:items.map(()=>[1,0,0])};}}});
 const base=await domain.create({title:'保留的历史集合',sources:[source]});baseId=base.id;const built=await domain.build(base.id);await domain.activateLocalIndex(base.id,built.lastBuild.id);
 service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);service=undefined;store.close();store=undefined;
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 await app.evaluate(({BrowserWindow})=>{globalThis.__retirementCalls=0;globalThis.fetch=async()=>{globalThis.__retirementCalls++;throw Error('NO_NETWORK_IN_RETIREMENT_TEST');};const win=BrowserWindow.getAllWindows()[0];win.unmaximize();win.setSize(1440,1050);});
 const retiredRequests=[
  {type:'knowledgeBuild',id:baseId},
  {type:'knowledgeCancelBuild',id:baseId},
  {type:'knowledgeSearch',id:baseId,question:'定位地址'},
  {type:'knowledgeExport',id:baseId},
  {type:'knowledgeActivateLocal',id:baseId,buildId:randomUUID()},
  {type:'knowledgeEmbeddingGet'},
  {type:'knowledgeEmbeddingSave',connection:{endpoint:'https://embedding.example.test/v1/embeddings',model:'fixture',revision:'v1',dimensions:3},apiKey:'fixture-key'},
  {type:'knowledgeCloudGet',id:baseId},
  {type:'knowledgeCloudSave',config:{supabaseUrl:'https://cloud.example.test',webUrl:'https://knowledge.example.test',memberIds:['teammate@example.test']},apiKey:'fixture-key'},
  {type:'knowledgeCloudPreflight',id:baseId,action:'publish'},
  {type:'knowledgeCloudPreflight',id:baseId,action:'revoke'},
  {type:'knowledgeCloudCommit',id:baseId,token:randomUUID(),confirmed:true},
  {type:'knowledgeCloudReconcile',id:baseId,operationId:randomUUID()},
 ];
 for(const request of retiredRequests){const result=await page.evaluate(payload=>window.pm.request(payload),request);assert.equal(result.ok,false,request.type+(request.action||''));}
 assert.equal(await app.evaluate(()=>globalThis.__retirementCalls),0);check('all 13 retired cloud/vector request variants reject through real preload and IPC without network calls');
 const rail=page.locator('.sidebar-rail');assert.equal(await rail.getByRole('button',{name:'知识库',exact:true}).count(),0);await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();const ui=page.getByRole('region',{name:'资料集合',exact:true});await ui.waitFor();assert.match(await page.locator('.header-title').innerText(),/资料集合/);assert.equal(await rail.getByRole('button',{name:'资源',exact:true}).getAttribute('class'),'rail-item active');
 await ui.getByRole('navigation',{name:'集合列表'}).getByRole('button').filter({hasText:'保留的历史集合'}).click();
 for(const name of ['配置向量服务','构建本机索引','恢复上次构建','查找依据','导出待发布版本','配置发布目标'])assert.equal(await ui.getByRole('button',{name,exact:true}).count(),0);
 assert.equal(await ui.getByRole('region',{name:'云端分享'}).count(),0);check('resource-only collection navigation exposes no cloud or vector workflow');
 await ui.getByRole('button',{name:'查看历史本机索引',exact:true}).click();await ui.locator('.knowledge-snapshot').waitFor();assert((await ui.locator('.knowledge-snapshot').innerText()).includes('historical-fixture'));assert.equal(await fs.readFile(sourcePath,'utf8'),sourceText);await shot('historical-collection-retained');check('historical source and index remain readable with external permission denied');
 const changedText=sourceText+'\n原件已变化。';await fs.writeFile(sourcePath,changedText);
 const staleInspect=await page.evaluate(id=>window.pm.request({type:'knowledgeInspectLocal',id}),baseId);assert.equal(staleInspect.ok,false);
 const staleCollection=await page.evaluate(id=>window.pm.request({type:'knowledgeGet',id}),baseId);assert.equal(staleCollection.ok,true);assert.equal(staleCollection.data.sources.length,1);assert.equal(staleCollection.data.sources[0].path,'参考资料/历史资料.md');assert(staleCollection.data.currentIndexId);assert.equal(await fs.readFile(sourcePath,'utf8'),changedText);
 await fs.writeFile(sourcePath,sourceText);check('changed source rejects historical inspection while retaining original file, collection references, and index identity');
 await ui.getByRole('button',{name:'新建集合',exact:true}).click();await ui.getByLabel('集合名称',{exact:true}).fill('新建本机资料清单');await ui.getByLabel('资料目录',{exact:true}).selectOption(resource.id);await ui.getByRole('button',{name:'参考资料 /',exact:true}).click();await ui.locator('.knowledge-picker-file').filter({hasText:'历史资料.md'}).getByRole('checkbox').check();await ui.getByRole('button',{name:'保存集合',exact:true}).click();await ui.getByRole('heading',{name:'新建本机资料清单',exact:true}).waitFor();check('collection selection and creation require no vector configuration');
 await ui.getByRole('button',{name:'移出集合',exact:true}).click();await ui.getByRole('button',{name:'保存资料清单',exact:true}).click();await ui.getByText('已选择 0 份资料',{exact:true}).waitFor();assert.equal(await fs.readFile(sourcePath,'utf8'),sourceText);check('editing collection references preserves original files');
 await ui.getByRole('button',{name:'移除集合',exact:true}).click();await ui.getByRole('button',{name:'确认移除集合',exact:true}).click();await ui.getByText('选择或新建一个资料集合。',{exact:true}).waitFor();assert.equal(await fs.readFile(sourcePath,'utf8'),sourceText);check('explicit removal preserves source files');
 const retained=await page.evaluate(id=>window.pm.request({type:'knowledgeGet',id}),baseId);assert.equal(retained.ok,true);assert(retained.data.currentIndexId);report.externalCalls=await app.evaluate(()=>globalThis.__retirementCalls);assert.equal(report.externalCalls,0);assert.deepEqual(report.pageErrors,[]);await shot('collection-management');report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{if(service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}if(store)store.close();if(app){await app.close();report.spawnedAppClosed=true;}await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,output,error:report.error}));}

// Actual desktop/IPC regression; synthetic pending Plan only, no model requests.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.test-data','project-refresh-ui-'+Date.now()),profile=path.join(output,'profile');
await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
const aRoot=path.join(output,'项目甲'),bRoot=path.join(output,'项目乙');
await service.workspace(aRoot);const aId=service.listProjects().currentProjectId;service.conversation(undefined,'项目甲已有会话');
await service.workspace(bRoot);const bId=service.listProjects().currentProjectId,cid=service.conversation(undefined,'项目乙待确认方案');
const now=new Date().toISOString(),runId='synthetic-refresh-plan';
service.state.runs.push({id:runId,conversationId:cid,mode:'plan',status:'awaiting_plan',phase:'waiting_plan',startedAt:now,finishedAt:now,proposal:{status:'pending',summary:'纯合成重载测试方案',options:[{id:'first',title:'编写PRD',steps:['读取合成资料']}],selectedOptionIds:['first'],customText:'',createdAt:now}});
service.state.conversations.find(c=>c.id===cid).messages.push({role:'user',text:'纯合成项目恢复测试，不发送模型请求',time:now,runId},{role:'assistant',text:'方案待确认。',time:now,runId});
const beforeMounts=service.state.mounts.map(m=>m.id).sort();service.save();service.dispose();store.close();
const result={status:'running',output,profile,checks:[],pageErrors:[],cloudExecuted:false,notice:'Synthetic state tests actual renderer/workspace behavior only; not a model-success fixture.'};
let app,page;const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
const check=name=>{result.checks.push(name);console.log('PASS '+name);};
async function assertB(){const s=await call({type:'state'});assert.equal(s.root,bRoot);assert.ok(s.conversations.some(c=>c.id===cid));assert.equal(s.runs.find(r=>r.id===runId)?.status,'awaiting_plan');assert.deepEqual(s.mounts.map(m=>m.id).sort(),beforeMounts);}
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({cwd:root,args:['.'],env});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>result.pageErrors.push(error.message));
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));
 await page.locator('.project-group.current .project-name').filter({hasText:'项目乙'}).waitFor();await assertB();check('宿主当前项目乙及真实待确认状态可见');
 await page.evaluate(id=>localStorage.setItem('slash:current-project',id),aId);await page.reload();await page.locator('.brand').waitFor();
 await page.locator('.project-group.current .project-name').filter({hasText:'项目乙'}).waitFor();
 for(let i=0;i<12;i++){await assertB();await new Promise(resolve=>setTimeout(resolve,250));}
 await page.locator('.sidebar').getByRole('button',{name:'项目乙待确认方案',exact:true}).click();await page.getByText('方案待确认。',{exact:true}).waitFor();
 check('旧localStorage指向甲，页面重载后仍保持宿主乙及同会话/Plan/引用目录');await shot('stale-local-project-keeps-host');
 await call({type:'conversation',id:cid,title:'项目乙方案刷新后'});
 for(let i=0;i<8;i++){await call({type:'projects'});await assertB();await new Promise(resolve=>setTimeout(resolve,250));}
 check('状态与项目元信息刷新不触发项目切换');await shot('metadata-refresh-keeps-host');
 await page.locator('.project-row').filter({has:page.getByText('项目甲',{exact:true})}).click();
 await page.locator('.project-group.current .project-name').filter({hasText:'项目甲'}).waitFor();assert.equal((await call({type:'state'})).root,aRoot);
 await page.locator('.project-row').filter({has:page.getByText('项目乙',{exact:true})}).click();
 await page.locator('.project-group.current .project-name').filter({hasText:'项目乙'}).waitFor();await assertB();
 check('用户显式切甲再切乙仍有效，乙待确认Plan保留');await shot('explicit-project-switch');
 assert.deepEqual(result.pageErrors,[]);result.status='passed';
}catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{await app?.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('Evidence: '+path.join(output,'result.json'));}

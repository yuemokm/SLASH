import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {Document,Packer,Paragraph} from 'docx';
import ExcelJS from 'exceljs';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {composerTrigger,composerPopup,chooseComposerPermission} from './composer-smoke-helpers.mjs';

// The build owner builds first. This script uses a fresh profile, synthetic
// Office documents and a loopback HTTP fixture through the real Pi runtime.
// It verifies the UI/tool/ChangeSet integration, not cloud-model answer quality.
const root=process.cwd(),packaged=process.argv.includes('--packaged'),executableIndex=process.argv.indexOf('--executable');
const executablePath=executableIndex>=0?path.resolve(process.argv[executableIndex+1]):path.join(root,'release','win-unpacked','slash.exe');
const output=path.join(root,'.test-data',`office-processing-ui-${packaged?'packaged':'development'}-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'synthetic-project');
await fs.mkdir(output,{recursive:true});
const wordZip=new AdmZip(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('UI-OFFICE-WORD：审批负责人必须复核。')]}]})));
wordZip.addFile('word/media/synthetic-padding.bin',randomBytes(2_300_000));const wordBytes=wordZip.toBuffer();assert.ok(wordBytes.length>2_000_000);
const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('审批场景');sheet.addRow(['规则','负责人']);sheet.addRow(['人工复核','UI-OFFICE-OWNER']);const excelBytes=Buffer.from(await workbook.xlsx.writeBuffer());
const store=new Store(profile),service=new Service(store,()=>'',()=>{});await service.workspace(workspace);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
const resources=service.state.mounts.find(mount=>mount.name==='资源'),conversationId=service.conversation(undefined,'Office资料专项验证');
const sources=[{name:'大Word原件.docx',bytes:wordBytes},{name:'审批数据原件.xlsx',bytes:excelBytes}];
for(const source of sources)await fs.writeFile(path.join(resources.path,'参考资料',source.name),source.bytes);
service.save();service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={status:'running',output,profile,workspace,packaged,checks:[],screenshots:[],requests:[],pageErrors:[],copies:[],runs:[],limitations:['Synthetic Office files and a loopback HTTP Pi fixture verify real extraction, UI and pending ChangeSets; cloud model quality is not tested.','The script expects an owner-built dist or explicitly selected packaged executable; it never builds or packages.']};
const sockets=new Set();let activeExcelCopyId;
const server=createServer(async(req,res)=>{
 try{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'office-ui-fixture'}]}));return;}
  let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);evidence.requests.push(data);
  const build=data.tools?.some(tool=>tool.function?.name==='process_processing_copy'),toolResponse=data.messages.findLast(message=>message.role==='tool');
  const base={id:'chatcmpl-'+randomUUID(),object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:data.model};res.writeHead(200,{'content-type':'text/event-stream'});
  const emit=(delta,finish=null)=>res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
  if(build&&!toolResponse){
   assert.ok(activeExcelCopyId,'The real UI must create and identify an Excel copy before the fixture invokes extraction');
   emit({role:'assistant',tool_calls:[{index:0,id:'office-extract-'+randomUUID(),type:'function',function:{name:'process_processing_copy',arguments:JSON.stringify({id:activeExcelCopyId,operation:'extract_text'})}}]});emit({},'tool_calls');
  }else{
   if(build){assert.ok(toolResponse,'The fixture must receive the actual tool response');assert.doesNotMatch(JSON.stringify(toolResponse),/PERMISSION_DENIED|OFFICE_.*FAILED|PROCESSING_COPY_NOT_FOUND/);}
   emit({role:'assistant',content:build?'UI-OFFICE-BUILD-DONE：真实内置提取已返回结果，草稿待应用。':'方案 1：先核对授权Office副本\n步骤：Build使用内置extract_text，按提取结果核对审批负责人。\n依据：本轮只核验副本元数据，尚未阅读正文。'});emit({},'stop');
  }
  res.end('data: [DONE]\n\n');
 }catch(error){if(!res.headersSent)res.writeHead(500);res.end(String(error));}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let app,page;
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
async function waitValue(read,predicate,timeout=45000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,75));}assert.fail('Timed out waiting for Office UI fixture state');}
async function screenshot(name){const file=name+'.png';await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);}
async function copyThroughUI(source){
 await page.locator('.rail-item').filter({has:page.getByText('资源',{exact:true})}).click();await page.getByRole('tablist',{name:'资源分类',exact:true}).getByRole('tab',{name:'参考资料',exact:true}).click();await page.getByRole('button',{name:'刷新',exact:true}).click();
 const row=page.locator('.file-row').filter({hasText:source.name});await row.waitFor();assert.match(await row.innerText(),/参考只读/);const beforeKeys=new Set((await call({type:'files'})).map(file=>file.mountId+'::'+file.path));
 await row.click({button:'right'});const menu=page.getByRole('menu');assert.equal(await menu.getByRole('menuitem',{name:/重命名|删除/}).count(),0);await screenshot(source.name.endsWith('docx')?'word-reference-copy-menu':'excel-reference-copy-menu');await menu.getByRole('menuitem',{name:'创建处理副本',exact:true}).click();
 const input=await waitValue(()=>page.getByLabel('描述你的任务').inputValue(),value=>value.includes('copyId='));const id=input.match(/copyId=([a-f0-9-]+)/)?.[1];assert.ok(id);const files=(await call({type:'files'})).filter(file=>!beforeKeys.has(file.mountId+'::'+file.path));assert.equal(files.length,1);const copy=files[0];assert.match(copy.path,/_处理副本_/);assert.ok(input.includes(copy.path));await page.getByRole('button',{name:`移除引用资料 ${copy.path}`,exact:true}).waitFor();if(source.name.endsWith('.docx')){await page.locator('.document-reader').waitFor();await waitValue(()=>page.locator('.document-reader').innerText(),value=>value.includes('UI-OFFICE-WORD'));await page.getByText('已创建处理副本并加入会话；参考原件保留。',{exact:true}).waitFor();}else{await page.getByText('副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。',{exact:true}).waitFor();assert.equal(await page.locator('.preview').count(),0);}
 const state=await call({type:'state'}),mount=state.mounts.find(item=>item.id===copy.mountId);assert.equal(digest(await fs.readFile(path.join(mount.path,copy.path))),digest(source.bytes));assert.equal((await call({type:'fileProtection',mountId:copy.mountId,path:copy.path})).writable,true);
 const receipt={id,copy:{mountId:copy.mountId,path:copy.path},size:copy.size,sourceHash:digest(source.bytes)};evidence.copies.push(receipt);await screenshot(source.name.endsWith('docx')?'word-copy-in-composer':'excel-copy-in-composer');return receipt;
}
async function sendUI(copy,marker,mode){
 await composerTrigger(page,'模式').click();await composerPopup(page,'模式').getByRole('radio').filter({hasText:mode==='plan'?'Plan':'Build'}).click();const priorIds=new Set((await call({type:'state'})).runs.map(run=>run.id));
 await page.getByLabel('描述你的任务').fill(`/research ${marker}\n处理copyId=${copy.id}；只核对当前选择的副本。`);await page.getByRole('button',{name:'发送',exact:true}).click();const started=await waitValue(()=>call({type:'state'}),state=>state.runs.some(run=>!priorIds.has(run.id))),runId=started.runs.find(run=>!priorIds.has(run.id)).id;
 const finished=await waitValue(()=>call({type:'state'}),state=>['succeeded','awaiting_plan','failed','interrupted','cancelled'].includes(state.runs.find(run=>run.id===runId)?.status));const run=finished.runs.find(item=>item.id===runId);assert.equal(run.status,mode==='plan'?'awaiting_plan':'succeeded',run.error);assert.equal(run.workflow.kind,'research');const receipt=run.workflow.receipts[0];assert.equal(receipt.contentStatus,'metadata_only');assert.equal(receipt.processingCopyId,copy.id);assert.equal(receipt.contentHash,copy.sourceHash);assert.equal(receipt.characters,0);assert.equal(receipt.includedCharacters,0);assert.equal(receipt.size,copy.size);evidence.runs.push(run);return{run,state:finished};
}
try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));await page.locator('.sidebar').getByRole('button',{name:'Office资料专项验证',exact:true}).click();
 await call({type:'modelUpsert',model:{provider:'loopback',name:'Office本地Pi专项fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'office-ui-fixture',protocol:'openai-completions'},key:'isolated-office-ui-key'});const models=await call({type:'models'}),model=models.groups.flatMap(group=>group.models).find(item=>item.modelId==='office-ui-fixture');await call({type:'modelDefault',id:model.id});await chooseComposerPermission(page,'自动接受');
 const wordCopy=await copyThroughUI(sources[0]);const plan=await sendUI(wordCopy,'UI-OFFICE-PLAN-WORD','plan');assert.equal(plan.state.changes.length,0);const planExecution=page.locator('.run-execution-details');assert.match(await planExecution.locator('summary').innerText(),/来源输入：正文 0 份 · 仅文件信息 1 份/);await planExecution.locator('summary').click();assert.match(await planExecution.getByRole('list',{name:'实际执行记录'}).innerText(),/仅核验 1 份副本信息，任务开始时未预载正文/);assert.doesNotMatch(await planExecution.innerText(),/已读取 1 份来源/);const actualReceipt=page.locator('.workflow-receipt');assert.match(await actualReceipt.locator('summary').innerText(),/整理资料 · 来源输入：正文 0 份 · 仅文件信息 1 份/);assert.doesNotMatch(await actualReceipt.locator('summary').innerText(),/已读取/);await actualReceipt.locator('summary').click();assert.match(await actualReceipt.innerText(),/任务开始时仅核验文件信息，未预载正文（0 字符）/);assert.ok((await actualReceipt.innerText()).includes(wordCopy.id));assert.ok((await actualReceipt.innerText()).includes(wordCopy.sourceHash.slice(0,12)));assert.doesNotMatch(await actualReceipt.innerText(),/已送入模型|已读取 1 份来源/);await screenshot('word-plan-metadata-receipt');check('实际WorkflowReceipt及执行记录均区分正文0份与仅文件信息1份，metadata详情带副本id/hash且未冒充正文');check('大于2 MB Word通过真实右键创建独立副本并加入输入/引用；research Plan到达真实Pi，正文0字符且无草稿');
 const excelCopy=await copyThroughUI(sources[1]);activeExcelCopyId=excelCopy.id;const build=await sendUI(excelCopy,'UI-OFFICE-BUILD-XLSX','build');const changes=build.state.changes.filter(change=>change.runId===build.run.id);assert.equal(changes.length,1);const change=changes[0];assert.equal(change.status,'pending');assert.match(change.path,/_提取文本_.*\.txt$/);assert.match(change.content,/工作表: "审批场景"/);assert.match(change.content,/A2.*人工复核/);assert.match(change.content,/B2.*UI-OFFICE-OWNER/);const mount=build.state.mounts.find(item=>item.id===change.mountId);assert.equal(await fs.stat(path.join(mount.path,change.path)).catch(()=>null),null);
 const card=page.locator('.change').filter({hasText:path.basename(change.path)});await card.getByText('待应用草稿',{exact:true}).waitFor();await screenshot('excel-extraction-pending-draft');await page.getByText('副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。',{exact:true}).waitFor();await card.getByRole('button',{name:'查看',exact:true}).click();await page.locator('.preview-head').getByText('变更草稿',{exact:true}).waitFor();await page.locator('.document-reader').getByText('UI-OFFICE-OWNER',{exact:false}).waitFor();await page.getByText('副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。',{exact:true}).waitFor({state:'hidden'});check('成功打开提取正文清理旧预览失败提示；pending成果仍标记变更草稿');await card.getByRole('button',{name:'应用修改',exact:true}).click();await waitValue(()=>call({type:'state'}),state=>state.changes.find(item=>item.id===change.id)?.status==='applied');await card.getByText('已保存版本',{exact:true}).waitFor();assert.equal(await fs.readFile(path.join(mount.path,change.path),'utf8'),change.content);
 await card.getByRole('button',{name:'查看',exact:true}).click();const reader=page.locator('.document-reader');await reader.waitFor();await page.locator('.preview-head').getByText('已保存版本',{exact:true}).waitFor();assert.equal(await page.locator('.preview-head').getByText('变更草稿',{exact:true}).count(),0);assert.equal(await page.getByText('副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。',{exact:true}).count(),0);check('已应用成果预览标记已保存版本，不再误标草稿且无滞留失败notice');assert.match(await reader.innerText(),/审批场景/);assert.match(await reader.innerText(),/A2.*人工复核/);assert.match(await reader.innerText(),/B2.*UI-OFFICE-OWNER/);await screenshot('excel-extraction-applied-preview');check('小Excel通过右键创建副本、research Build真实执行process_processing_copy内置提取；pending草稿应用并预览sheet/cell');
 for(const source of sources)assert.equal(digest(await fs.readFile(path.join(resources.path,'参考资料',source.name))),digest(source.bytes));check('两份参考原件最终字节hash不变；副本保留，输出只经ChangeSet提交');
 assert.ok(evidence.requests.length>=3);const planRequest=evidence.requests.find(request=>JSON.stringify(request.messages).includes('UI-OFFICE-PLAN-WORD'));assert.ok(planRequest);assert.equal(planRequest.tools.some(tool=>tool.function?.name==='process_processing_copy'),false);const toolRequest=evidence.requests.find(request=>request.messages.some(message=>message.role==='tool'&&String(message.content).includes('changeId')));assert.ok(toolRequest,'真实Pi必须把process_processing_copy执行回执发回fixture');assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}

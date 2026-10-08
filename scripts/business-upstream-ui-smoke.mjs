import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';

// Owner builds first. This fixture creates its own XLSX, registered processing
// copy and real extracted text under .test-data; no existing project is read.
const root=process.cwd(),packaged=process.argv.includes('--packaged');
const executableIndex=process.argv.indexOf('--executable');
if(executableIndex>=0&&(!process.argv[executableIndex+1]||process.argv[executableIndex+1].startsWith('--')))throw Error('--executable requires a file path');
const executablePath=executableIndex>=0?path.resolve(process.argv[executableIndex+1]):path.join(root,'release','win-unpacked','slash.exe');
const runtime=packaged?'packaged':'development',testDataRoot=path.resolve(root,'.test-data');
const output=path.join(testDataRoot,`business-upstream-ui-${runtime}-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'synthetic-project');
for(const target of [output,profile,workspace]){const relative=path.relative(testDataRoot,path.resolve(target));assert.ok(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Test files must remain under .test-data');}
await fs.mkdir(output,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={status:'running',runtime,packaged,executable:packaged?executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),actualExecutable:null,appVersion:null,output,profile,workspace,checks:[],screenshots:[],pageErrors:[],snapshots:[],limitations:['Synthetic XLSX and real registered extraction verify upstream version/authorization states through Service and read-only IPC; business meaning remains a candidate for human review.','An isolated receipt is deliberately stripped of new version fields to exercise legacy compatibility. No existing user originals or profiles are accessed.']};
async function xlsxBytes(required){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('审批字段');sheet.addRow(['字段','是否必填','是否仅用于正式落库','创建时可见','变更时可改']);sheet.addRow(['审批备注',required,'是','是','否']);return Buffer.from(await book.xlsx.writeBuffer());}
async function closeFixture(store,service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();}
const originalBytes=await xlsxBytes('否'),updatedBytes=await xlsxBytes('是');
let conversationId,requirementId,directRequirementId,sourceMount,processMount,processingCopy,processed,extracted,copyHash,textHash;
const sourceFile='合成审批字段.xlsx',plainFile='普通业务来源.md',plainQuote='审批备注字段：是否必填为否，候选含义需人工核对。';
{
 const store=new Store(profile),service=new Service(store,()=>'',()=>{});
 try{
  await service.workspace(workspace);await ensureLegacyFixtureMounts(service);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
  sourceMount=service.state.mounts.find(mount=>mount.name==='参考资料');processMount=service.state.mounts.find(mount=>mount.name==='过程文件');conversationId=service.conversation(undefined,'提取来源版本专项验证');
  await fs.writeFile(path.join(sourceMount.path,sourceFile),originalBytes);await fs.writeFile(path.join(sourceMount.path,plainFile),plainQuote);
  processingCopy=await service.copyForProcessing({mountId:sourceMount.id,path:sourceFile});processed=await service.processProcessingCopy(processingCopy.id,'extract_text');await service.apply(processed.changeId);
  extracted=await service.files.read(processed.output.mountId,processed.output.path);copyHash=digest(await fs.readFile(path.join(processMount.path,processingCopy.copy.path)));textHash=digest(Buffer.from(extracted));
  const base={status:'draft',assumptions:[],pendingQuestions:[],confirmedFacts:[]};
  requirementId=(await service.recordRequirement(conversationId,{...base,title:'提取文本里的审批备注',summary:'由合成XLSX副本真实提取，解释保持候选。',sources:[{id:'source-extracted',mountId:processed.output.mountId,relativePath:processed.output.path}]})).id;
  directRequirementId=(await service.recordRequirement(conversationId,{...base,title:'普通Markdown来源',summary:'无需处理回执的直接文本。',sources:[{id:'source-direct',mountId:sourceMount.id,relativePath:plainFile}]})).id;
  await service.recordBusinessConstraints(conversationId,{requirementId,constraints:[{id:'extracted-required',fieldKey:'审批备注',dimension:'required',rawValue:'否',interpretation:'候选：审批备注非必填。',stage:'正式落库',status:'candidate',sourceRefIds:['source-extracted'],sourceEvidence:[{sourceRefId:'source-extracted',locator:'审批字段 · B2',startLine:1,endLine:extracted.replace(/\r\n|\r/g,'\n').split('\n').length,quote:extracted}]}]});
  await service.recordBusinessConstraints(conversationId,{requirementId:directRequirementId,constraints:[{id:'direct-required',fieldKey:'审批备注',dimension:'required',rawValue:'否',interpretation:'候选：审批备注非必填。',stage:'正式落库',status:'candidate',sourceRefIds:['source-direct'],sourceEvidence:[{sourceRefId:'source-direct',locator:'规则正文',startLine:1,endLine:1,quote:plainQuote}]}]});
  const prdMount=service.state.mounts.find(mount=>mount.name==='产出材料'),prdFile='来源核对PRD.md',prdQuote='审批备注是否必填待人工核对；当前提取文本记录为否。';await fs.writeFile(path.join(prdMount.path,prdFile),prdQuote);
  await service.bindBusinessImplementation(conversationId,{requirementId,bindings:[{constraintId:'extracted-required',mountId:prdMount.id,path:prdFile,locator:'审批备注',startLine:1,endLine:1,quote:prdQuote}]});
  service.save();
 }finally{await closeFixture(store,service);}
}
let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
async function snapshot(){const view=await call({type:'businessRuleCheck',requirementId});evidence.snapshots.push(view);return view.items[0].sourceChecks[0];}
async function screenshot(locator,name){const filename=name+'.png';await locator.screenshot({path:path.join(output,filename)});evidence.screenshots.push(filename);}
async function openTrace(work,id){const trace=work.locator(`[data-record-id="${id}"] .business-trace`);await trace.waitFor();if(!await trace.evaluate(el=>el.open))await trace.locator(':scope > summary').click();await trace.locator('.business-trace-field').waitFor();return trace;}
async function recheck(trace){await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('.business-trace-field').waitFor();}
async function assertIndependentOutputs(){assert.equal(digest(await fs.readFile(path.join(processMount.path,processingCopy.copy.path))),copyHash);assert.equal(digest(await fs.readFile(path.join(processMount.path,processed.output.path))),textHash);}
try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));evidence.actualExecutable=await app.evaluate(({app})=>app.getPath('exe'));evidence.appVersion=await app.evaluate(({app})=>app.getVersion());
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(1200,900);});await page.locator('.sidebar').getByRole('button',{name:'提取来源版本专项验证',exact:true}).click();
 const work=page.locator('.conversation').getByLabel('待确认与检查问题',{exact:true});await work.locator(':scope > details > summary').click();let trace=await openTrace(work,requirementId);await trace.getByText('已登记的来源版本一致',{exact:true}).waitFor();let source=await snapshot();assert.equal(source.status,'current');assert.equal(source.provenance.status,'current');assert.equal(source.provenance.stages.original.status,'current');assert.equal(source.provenance.stages.copy.status,'current');assert.equal(source.provenance.stages.output.status,'current');check('真实XLSX副本提取并应用后，原件/副本/txt注册版本链有效');
 const direct=await openTrace(work,directRequirementId);assert.equal(await direct.locator('.business-trace-processing').count(),0);check('普通Markdown不显示处理链说明或恢复按钮');
 await fs.writeFile(path.join(sourceMount.path,sourceFile),updatedBytes);await assertIndependentOutputs();await recheck(trace);await trace.getByText('原始资料已变化，需重新提取',{exact:true}).waitFor();source=await snapshot();assert.equal(source.status,'current');assert.equal(source.provenance.status,'stale');assert.equal(source.provenance.stages.original.status,'changed');assert.equal(source.provenance.stages.copy.status,'current');assert.equal(source.provenance.stages.output.status,'current');assert.equal(await trace.getByRole('button',{name:'阅读来源',exact:true}).count(),1);assert.ok(await trace.locator('blockquote').filter({hasText:'审批备注'}).count()>0);await screenshot(trace.locator('[data-dimension="required"]'),'original-changed');check('原始xlsx变化而副本与txt字节不变时显示需重新提取，独立txt仍可读');
 await trace.getByRole('button',{name:'回会话重新读取与提取',exact:true}).click();const prompt=await page.getByLabel('描述你的任务').inputValue();assert.match(prompt,/当前授权与真实版本/);assert.match(prompt,/新的独立处理副本/);assert.match(prompt,/保留原件、旧副本与旧提取成果/);assert.match(prompt,/新的候选记录/);assert.equal(digest(await fs.readFile(path.join(sourceMount.path,sourceFile))),digest(updatedBytes));await assertIndependentOutputs();check('回会话仅补充重新读取/新副本提取任务，不写原件或覆盖旧成果');
 await call({type:'mountAccess',id:sourceMount.id,write:false,enabled:false});trace=await openTrace(work,requirementId);await trace.getByText('原始资料暂不可核对',{exact:true}).waitFor();source=await snapshot();assert.equal(source.status,'current');assert.equal(source.provenance.status,'unavailable');assert.equal(source.provenance.stages.original.status,'unavailable');for(const key of ['mountId','path','expectedHash','actualHash'])assert.equal(source.provenance.stages.original[key],undefined);assert.equal(await trace.getByRole('button',{name:'阅读来源',exact:true}).count(),1);assert.equal(await trace.getByText(sourceFile,{exact:false}).count(),0);await screenshot(trace.locator('[data-dimension="required"]'),'original-unavailable');check('原件撤权单独标为不可核对且不暴露原件路径，txt摘录与阅读入口保留');
 await trace.getByRole('button',{name:'阅读来源',exact:true}).click();await page.locator('.document-reader').getByText('审批备注',{exact:false}).first().waitFor();check('上游撤权后仍能通过真实阅读入口打开已独立授权txt');
 await fs.writeFile(path.join(sourceMount.path,sourceFile),originalBytes);await call({type:'mountAccess',id:sourceMount.id,write:false,enabled:true});trace=await openTrace(work,requirementId);await trace.getByText('已登记的来源版本一致',{exact:true}).waitFor();
 const legacyStore=new Store(profile);try{const receipt=legacyStore.get(`processing-result:${processed.changeId}`,null);assert.ok(receipt);delete receipt.workspaceId;delete receipt.outputHash;legacyStore.set(`processing-result:${processed.changeId}`,receipt);}finally{legacyStore.close();}
 await recheck(trace);await trace.getByText('处理来源尚未完整核对',{exact:true}).waitFor();source=await snapshot();assert.equal(source.status,'current');assert.equal(source.provenance.status,'unverified');assert.equal(await trace.getByRole('button',{name:'阅读来源',exact:true}).count(),1);await screenshot(trace.locator('[data-dimension="required"]'),'legacy-receipt-unknown');check('旧回执缺少版本字段明确标上游未知，不误报有效或撤销独立txt授权');
 await assertIndependentOutputs();assert.equal(digest(await fs.readFile(path.join(sourceMount.path,sourceFile))),digest(originalBytes));assert.deepEqual(evidence.pageErrors,[]);check('测试原件最终还原，副本与旧提取输出保持字节不变，页面无错误');evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot(page,'failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();console.log(JSON.stringify({status:evidence.status,runtime,output,checks:evidence.checks.length,appVersion:evidence.appVersion,error:evidence.error}));}

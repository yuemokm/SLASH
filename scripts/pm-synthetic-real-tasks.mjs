// Real Electron/Pi tasks. Preparation is offline; cloud execution requires an explicit gate.
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import ExcelJS from 'exceljs';
import {_electron as electron} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const testRoot=path.join(root,'.test-data');
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=async file=>sha(await fs.readFile(file));
const canonical=value=>String(value).replaceAll('\\','/').split('/').filter(part=>part&&part!=='.').join('/').toLowerCase();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reason=error=>String(error?.message??'').match(/^[A-Z][A-Z0-9_]+(?=:|$)/)?.[0]??'TASK_HARNESS_FAILED';
const title='合成工单真实任务验证';
const seeds=[
 {code:'GD0001',title:'申请测试键盘',applicant:'合成用户甲',priority:'普通',status:'待审批'},
 {code:'GD0002',title:'申请测试显示器',applicant:'合成用户乙',priority:'紧急',status:'已通过'},
 {code:'GD0003',title:'申请测试耳机',applicant:'合成用户丙',priority:'普通',status:'已驳回'},
];
const requirements=`# 合成办公用品工单需求\n\n这是纯合成验证资料，不含真实员工或真实业务记录。\n\n## 新建字段\n- 工单标题：必填，最多40个字符；错误需明确提示且保留已输入内容，不能新增列表行。\n- 申请人：必填。\n- 优先级：普通、紧急，默认普通。\n- 新工单初始状态：待审批。\n\n## 列表与反馈\n- 读取工单样例.xlsx的工单样例工作表作为3条初始记录。\n- 状态筛选：全部、待审批、已通过、已驳回；切换后实际改变可见行，全部恢复所有行。\n- 合法提交给出创建成功反馈并新增真实列表行。\n- 本地演示即可，无真实后台、账号登录或外部发布。\n\n## 本轮边界\n只研究资料并输出简洁PRD和离线HTML，不需要流程引擎或后台实现。业务需求未指明去重规则，不能自行宣称已确认。\n`;

async function isolatedDirectory(value){
 const folder=await fs.realpath(path.resolve(value));
 const base=await fs.realpath(testRoot);
 if(path.dirname(folder)!==base||!path.basename(folder).startsWith('pm-synthetic-real-'))throw Error('ISOLATION_DIRECTORY_INVALID');
 return folder;
}
async function prepare(){
 const supplied=arg('--source-profile');if(!supplied)throw Error('SOURCE_PROFILE_REQUIRED');
 const source=await fs.realpath(path.resolve(supplied));
 let database;for(const name of ['pm-slash.sqlite','slash.sqlite']){const candidate=path.join(source,name);try{if((await fs.stat(candidate)).isFile()){database=candidate;break;}}catch{}}
 if(!database)throw Error('MODEL_DATABASE_MISSING');
 const localState=path.join(source,'Local State');
 const before={database:await hash(database),localState:await hash(localState)};
 const db=new DatabaseSync(database,{readOnly:true});let model,legacy,secret,cache;
 try{
  // Read only model configuration fields, never workspace/history portions of the state.
  const row=db.prepare("SELECT json_extract(value,'$.models') AS models,json_extract(value,'$.defaultModelId') AS selected,json_extract(value,'$.model') AS legacy FROM kv WHERE key='state'").get();
  const models=JSON.parse(row?.models??'[]');model=models.find(m=>m.id===row?.selected)??models[0];
  legacy=row?.legacy?JSON.parse(row.legacy):undefined;
  const get=key=>{const item=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return item?JSON.parse(item.value):undefined;};
  secret=model?get('model-secret:'+model.id):undefined;
  if(!secret){secret=get('key');model=undefined;}
  if(typeof secret!=='string'||!secret)throw Error('CONFIGURED_CREDENTIAL_MISSING');
  if(!model&&(!legacy||typeof legacy.baseUrl!=='string'||typeof legacy.id!=='string'))throw Error('LEGACY_MODEL_INVALID');
  if(model){const {thinkingFingerprint}=await import('../dist/main/model-thinking.js');const input={entryId:model.id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens};const key='model-thinking:v1:'+thinkingFingerprint(input);const value=get(key);if(value)cache={key,value};}
 }finally{db.close();}
 await fs.mkdir(testRoot,{recursive:true});
 const output=await fs.mkdtemp(path.join(testRoot,'pm-synthetic-real-'+new Date().toISOString().replaceAll(':','-')+'-'));
 const profile=path.join(output,'profile'),workspace=path.join(output,'workspace'),sources=path.join(output,'synthetic-sources');
 for(const folder of [profile,workspace,sources,path.join(output,'snapshots'),path.join(output,'screenshots')])await fs.mkdir(folder);
 const isolated=new DatabaseSync(path.join(profile,'slash.sqlite'));
 try{
  isolated.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const insert=isolated.prepare('INSERT INTO kv VALUES(?,?)');
  insert.run('state',JSON.stringify({root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:model?[model]:[],defaultModelId:model?.id,model:model?{baseUrl:model.baseUrl,id:model.modelId,hasKey:true}:legacy,permissions:{workspace_read:'allow',artifact_write:'allow',process_execute:'ask',web_read:'deny',connection_config:'deny',external_action:'deny'}}));
  insert.run(model?'model-secret:'+model.id:'key',JSON.stringify(secret));if(cache)insert.run(cache.key,JSON.stringify(cache.value));
 }finally{isolated.close();}
 model=model?{id:model.id,name:model.name,provider:model.provider,modelId:model.modelId,protocol:model.protocol}: {modelId:legacy.id,protocol:'openai-completions',legacyMigration:true};
 secret=undefined;legacy=undefined;cache=undefined;
 await fs.copyFile(localState,path.join(profile,'Local State'),constants.COPYFILE_EXCL);
 await fs.writeFile(path.join(sources,'需求说明.md'),requirements,{flag:'wx'});
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('工单样例');
 sheet.addRow(['工单编码','工单标题','申请人','优先级','状态']);for(const s of seeds)sheet.addRow([s.code,s.title,s.applicant,s.priority,s.status]);
 await workbook.xlsx.writeFile(path.join(sources,'工单样例.xlsx'));
 const sourceFiles=await Promise.all(['需求说明.md','工单样例.xlsx'].map(async name=>({name,path:path.join(sources,name),sha256:await hash(path.join(sources,name))})));
 const after={database:await hash(database),localState:await hash(localState)};
 if(before.database!==after.database||before.localState!==after.localState)throw Error('SOURCE_PROFILE_CHANGED_DURING_PREPARATION');
 const runtime={};for(const file of ['main.js','service.js','agent.js','settings.js','draft-edit.js'])runtime[file]=await hash(path.join(root,'dist/main',file));
 const manifest={schemaVersion:1,status:'prepared_no_cloud',createdAt:new Date().toISOString(),output,profile,workspace,sources,model,sourceFiles,seeds,runtime,version:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,sourceProfileReadOnly:true,sourceProfileUnchanged:true,sourceProfileHashes:{before,after},paths:{prd:'工单演示/PRD.md',html:'工单演示/index.html'},limits:{perRunTimeoutSeconds:600},notice:'Only synthetic inputs. Host receipts do not prove business correctness; independent actual DOM review is required. No raw thinking or credential is copied into result files.'};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:manifest.status,testDir:output,manifest:path.join(output,'manifest.json'),model,cloudExecuted:false}));
}

async function run(){
 if(!args.includes('--allow-cloud'))throw Error('EXPLICIT_CLOUD_GATE_REQUIRED');
 if(!arg('--test-dir'))throw Error('TEST_DIRECTORY_REQUIRED');
 const output=await isolatedDirectory(arg('--test-dir')),m=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
 if(m.output!==output||m.profile!==path.join(output,'profile')||m.workspace!==path.join(output,'workspace')||m.sources!==path.join(output,'synthetic-sources'))throw Error('ISOLATION_MANIFEST_INVALID');
 for(const folder of [m.profile,m.workspace,m.sources])if(await fs.realpath(folder)!==folder)throw Error('ISOLATION_SYMLINK_FORBIDDEN');
 for(const [name,expected]of Object.entries(m.runtime))if(await hash(path.join(root,'dist/main',name))!==expected)throw Error('RUNTIME_CHANGED_REPREPARE');
 const rendererEntryHash=await hash(path.join(root,'dist/renderer/index.html'));
 const seconds=Number(arg('--timeout-seconds')??m.limits.perRunTimeoutSeconds);
 if(!Number.isInteger(seconds)||seconds<30||seconds>900)throw Error('TIMEOUT_INVALID');
 const continuing=args.includes('--continue-from-plan');
 let prior;
 if(continuing){prior=JSON.parse(await fs.readFile(path.join(output,'result.json'),'utf8'));if(prior.status!=='failed'||prior.runs?.length!==1||prior.runs[0].mode!=='plan'||prior.runs[0].status!=='awaiting_plan'||prior.snapshots?.length||prior.runs[0].changes?.length)throw Error('CONTINUATION_NOT_SINGLE_COMPLETED_PLAN');await fs.copyFile(path.join(output,'result.json'),path.join(output,'result-before-continue.json'),constants.COPYFILE_EXCL);}
 const marker=await fs.open(path.join(output,continuing?'continue-from-plan.lock':'run-once.lock'),'wx');await marker.close();
 const result={status:'running',startedAt:new Date().toISOString(),runtime:'development',version:m.version,cloudExecuted:false,profile:m.profile,workspace:m.workspace,runs:[],snapshots:[],sourceChecks:[],pageErrors:[],uiEvidence:[],restart:{status:'not_run'}};
 result.rendererEntryHash=rendererEntryHash;
 if(continuing){result.runs=prior.runs;result.cloudExecuted=prior.cloudExecuted;result.continuation={fromRunId:prior.runs[0].id,priorResult:path.join(output,'result-before-continue.json'),priorReason:prior.reason,planResent:false};}
 let app,page,currentId,conversationId,outputMount,referenceMountId,initialOutputEntries;
 const save=()=>fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
 const progress=stage=>fs.writeFile(path.join(output,'progress.json'),JSON.stringify({stage,at:new Date().toISOString(),runId:currentId}));
 const call=async request=>{
  const traced=['workspace','mount','conversation','send','planConfirm','apply'].includes(request.type);
  if(traced){result.lastIPC={type:request.type,startedAt:new Date().toISOString(),status:'requesting'};await progress('ipc_'+request.type+'_requesting');await save();}
  const response=await page.evaluate(input=>window.pm.request(input),request);
  if(!response.ok){if(traced){result.lastIPC.status='rejected';result.lastIPC.reason=reason({message:response.error});await save();await progress('ipc_'+request.type+'_rejected');}throw Error(response.error??'IPC_FAILED');}
  if(traced){result.lastIPC.status='completed';result.lastIPC.finishedAt=new Date().toISOString();await save();await progress('ipc_'+request.type+'_completed');}
  return response.data;
 };
 const state=()=>call({type:'state'});
 async function launch(){
  const env={...process.env,PM_SLASH_DATA_DIR:m.profile};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({cwd:root,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(20000);
  page.on('pageerror',()=>result.pageErrors.push('RENDERER_PAGE_ERROR'));
  const userData=await app.evaluate(({app})=>app.getPath('userData'));if(userData!==m.profile)throw Error('USER_DATA_ISOLATION_MISMATCH');
  await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setSize(1440,960));
 }
 async function view(label){
  await page.reload();await page.locator('.brand').waitFor();
  await page.locator('.sidebar').getByRole('button',{name:title,exact:true}).click();
  await page.locator('.message').first().waitFor();await page.screenshot({path:path.join(output,'screenshots',label+'.png')});
  result.uiEvidence.push({label,path:path.join(output,'screenshots',label+'.png'),actualWindow:true});
 }
 function summarize(r,operations,label,started){
  return{label,id:r.id,conversationId:r.conversationId,status:r.status,phase:r.phase,mode:r.mode,permissionMode:r.permissionMode,startedAt:r.startedAt,finishedAt:r.finishedAt,elapsedMs:r.finishedAt?Date.parse(r.finishedAt)-Date.parse(r.startedAt):undefined,hostObservedElapsedMs:Date.now()-started,reason:r.error?reason({message:r.error}):r.interruptionReason,modelStopReason:r.modelStopReason,reasoning:r.reasoning?{requestedLevel:r.reasoning.requestedLevel,effectiveLevel:r.reasoning.effectiveLevel,status:r.reasoning.status}:undefined,tools:operations.filter(op=>op.runId===r.id).map(({id,tool,state,createdAt})=>({id,tool,status:state,at:createdAt})),changes:[]};
 }
 async function applyRegisteredProcessing(s,id){
  const pending=s.changes.filter(c=>c.runId===id&&c.status==='pending');
  const db=new DatabaseSync(path.join(m.profile,'slash.sqlite'),{readOnly:true});const registered=[];
  try{for(const c of pending){const row=db.prepare('SELECT value FROM kv WHERE key=?').get('processing-result:'+c.id);if(row)registered.push({change:c,receipt:JSON.parse(row.value)});}}finally{db.close();}
  for(const {change:c,receipt:r}of registered){
   const mount=s.mounts.find(item=>item.id===c.mountId),source=m.sourceFiles.find(item=>item.name==='工单样例.xlsx');
   const destination=mount&&path.resolve(mount.path,c.path),relative=destination&&path.relative(m.workspace,destination);
   if(r.changeId!==c.id||r.operation!=='extract_text'||r.source.mountId!==referenceMountId||canonical(r.source.path)!==canonical(source.name)||r.source.contentHash!==source.sha256||r.output.mountId!==c.mountId||canonical(r.output.path)!==canonical(c.path)||r.outputHash!==sha(Buffer.from(c.content,'utf8'))||!mount?.write||mount.name!=='过程文件'||!relative||path.isAbsolute(relative)||relative.startsWith('..')||!/_提取文本_[\w-]+\.txt$/i.test(c.path))throw Error('PROCESSING_DRAFT_SCOPE_INVALID');
   await call({type:'apply',id:c.id});if(await hash(destination)!==r.outputHash)throw Error('PROCESSING_APPLY_HASH_MISMATCH');
   result.processingOutputs??=[];result.processingOutputs.push({id:c.id,runId:id,path:c.path,mountId:c.mountId,sourceHash:r.source.contentHash,copyHash:r.copyHash,outputHash:r.outputHash,operation:r.operation,status:'applied_by_test_operator'});await save();
  }
 }
 async function wait(id,label){
  currentId=id;const started=Date.now(),deadline=started+seconds*1000;await progress(label+'_running');
  let timedOut=false,last;
  while(Date.now()<deadline){
   last=await state();const r=last.runs.find(r=>r.id===id);
   if(r?.mode==='build'){await applyRegisteredProcessing(last,id);last=await state();}
   if(['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(r?.status))break;
   const approvals=await call({type:'pendingApprovals',conversationId});
   // full_access should not ask for these tasks. Do not silently change permissions.
   if(approvals.some(a=>a.runId===id&&a.status==='pending')){result.unexpectedApproval=true;await call({type:'cancel',id});throw Error('UNEXPECTED_REAL_APPROVAL');}
   await sleep(1500);
  }
  if(!last||!['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(last.runs.find(r=>r.id===id)?.status)){
   timedOut=true;await call({type:'cancel',id});const end=Date.now()+30000;
   while(Date.now()<end){last=await state();if(['succeeded','failed','interrupted','cancelled'].includes(last.runs.find(r=>r.id===id)?.status))break;await sleep(500);}
  }
  const r=last.runs.find(r=>r.id===id);if(!r)throw Error('RUN_MISSING');
  const row=summarize(r,await call({type:'operations',limit:200}),label,started);row.timeout=timedOut;result.runs.push(row);await save();await view(label);await progress(label+'_'+r.status);
  if(timedOut)throw Error('RUN_TIMEOUT');return {run:r,row,state:last};
 }
 async function applyDrafts(outcome,expectedPath){
  if(outcome.run.status!=='succeeded')throw Error('REAL_RUN_NOT_SUCCEEDED');
  const pending=outcome.state.changes.filter(c=>c.runId===outcome.run.id&&c.status==='pending');
  if(!pending.length)throw Error('EXPECTED_REAL_DRAFT_MISSING');
  if(pending.some(c=>c.mountId!==outputMount.id||canonical(c.path)!==canonical(expectedPath)))throw Error('UNEXPECTED_ARTIFACT_DRAFT_SCOPE');
  if(pending.length!==1)throw Error('MULTIPLE_TARGET_DRAFTS_REVIEW_REQUIRED');
  const c=pending[0];const draftHash=sha(Buffer.from(c.content,'utf8'));await call({type:'apply',id:c.id});
  const s=await state();if(s.changes.find(item=>item.id===c.id)?.status!=='applied')throw Error('DRAFT_NOT_APPLIED');
  const destination=path.join(outputMount.path,...expectedPath.split('/'));
  if(await hash(destination)!==draftHash)throw Error('APPLIED_CONTENT_HASH_MISMATCH');
  outcome.row.changes.push({id:c.id,path:expectedPath,status:'applied',sha256:draftHash,bytes:Buffer.byteLength(c.content),versions:await call({type:'versions',mountId:outputMount.id,path:expectedPath})});
  await save();
 }
 async function snapshot(label,relative){
  const source=path.join(outputMount.path,...relative.split('/')),target=path.join(output,'snapshots',label+path.extname(relative));
  await fs.copyFile(source,target,constants.COPYFILE_EXCL);const entry={label,path:target,artifactPath:relative,sha256:await hash(target),bytes:(await fs.stat(target)).size};result.snapshots.push(entry);await save();return entry;
 }
 try{
  await progress('starting_real_desktop');await launch();
  let s=await state();
  const defaultRoot=path.join(m.profile,'默认项目');
  const seededEmpty=(s.root===''||(s.root===defaultRoot&&s.mounts.every(mount=>{const relative=path.relative(defaultRoot,mount.path);return relative&&!path.isAbsolute(relative)&&!relative.startsWith('..');})))&&s.runs.length===0&&s.changes.length===0&&s.connections.length===0&&s.conversations.every(c=>!c.messages?.length);
  if(!continuing&&!seededEmpty)throw Error('ISOLATION_SEED_NOT_EMPTY');
  if(continuing&&s.root!==defaultRoot&&s.root!==m.workspace)throw Error('CONTINUATION_WORKSPACE_INVALID');
  result.startup={defaultEmptyProjectAccepted:s.root===defaultRoot,runs:s.runs.length,messages:s.conversations.reduce((n,c)=>n+(c.messages?.length??0),0),connections:s.connections.length,continuing};
  const workspaceDeadline=Date.now()+45000;let workspaceReady=false;
  result.workspaceInitialization={busyRejections:0};
  while(Date.now()<workspaceDeadline){
   try{await call({type:'workspace',path:m.workspace});workspaceReady=true;break;}
   catch(error){if(reason(error)!=='WORKSPACE_BUSY')throw error;result.workspaceInitialization.busyRejections++;await save();await progress('waiting_workspace_initialization_after_busy_rejection');await sleep(1000);}
  }
  if(!workspaceReady)throw Error('WORKSPACE_STARTUP_TIMEOUT');
  s=await state();if(s.root!==m.workspace)throw Error('ISOLATED_WORKSPACE_NOT_CURRENT');
  const ref=s.mounts.find(mount=>mount.path===m.sources)??await call({type:'mount',path:m.sources,write:false});s=await state();
  outputMount=s.mounts.find(mount=>mount.name==='成果'&&mount.write&&mount.enabled);if(!outputMount)throw Error('OUTPUT_MOUNT_NOT_FOUND');
  const refMount=typeof ref==='object'?ref.id:ref;referenceMountId=refMount;
  if(!s.mounts.some(mount=>mount.id===refMount&&!mount.write&&mount.path===m.sources))throw Error('REFERENCE_MOUNT_NOT_READONLY');
  const model=s.models?.find(model=>model.id===s.defaultModelId);if(!model?.hasKey)throw Error('ISOLATED_MODEL_KEY_NOT_AVAILABLE');
  initialOutputEntries=(await fs.readdir(outputMount.path,{recursive:true})).sort();
  result.model={name:model.name,provider:model.provider,modelId:model.modelId,protocol:model.protocol};
  if(continuing){
   const old=s.runs.find(run=>run.id===prior.runs[0].id);
   if(s.runs.length!==1||s.changes.length||s.connections.length||!old||old.mode!=='plan'||old.status!=='awaiting_plan'||old.proposal?.status!=='pending'||!s.conversations.some(c=>c.id===old.conversationId&&c.title===title))throw Error('CONTINUATION_REAL_PLAN_NOT_PENDING');
   for(const source of m.sourceFiles)if(await hash(source.path)!==source.sha256)throw Error('CONTINUATION_SOURCE_CHANGED');
   conversationId=old.conversationId;
  }else conversationId=await call({type:'conversation',title});
  result.conversationId=conversationId;result.outputMount={id:outputMount.id,path:outputMount.path};
  const sources=`参考资料目录mountId=${refMount}：需求说明.md、工单样例.xlsx。成果目录mountId=${outputMount.id}。`;
  const send=(text,mode,taskType)=>{result.cloudExecuted=true;return call({type:'send',id:conversationId,text,mode,permissionMode:'full_access',modelEntryId:model.id,taskType});};
  let plan;
  if(continuing){plan={run:s.runs.find(run=>run.id===prior.runs[0].id),row:result.runs[0],state:s};currentId=plan.run.id;await progress('01-plan_restored_without_cloud_resend');await view('01-plan-restored');}
  else plan=await wait(await send(`请先读需求说明.md，研究合成办公用品工单需求，提出待我确认的简短执行计划。后续要读取Excel样例、编写简洁PRD和离线HTML；本次只Plan，不写成果、不创建处理副本。${sources}`,'plan','research'),'01-plan');
  result.planChecks={awaitingConfirmation:plan.run.status==='awaiting_plan',noDrafts:!plan.state.changes.some(c=>c.runId===plan.run.id),noOutputFiles:JSON.stringify((await fs.readdir(outputMount.path,{recursive:true})).sort())===JSON.stringify(initialOutputEntries)};await save();
  if(!result.planChecks.awaitingConfirmation||!result.planChecks.noDrafts||!result.planChecks.noOutputFiles)throw Error('PLAN_BOUNDARY_FAILED');
  const buildId=await call({type:'planConfirm',id:plan.run.id,selectedOptionIds:[],customText:`确认先执行PRD这一小步：读取需求和Excel三条样例（通过过程目录的处理副本提取，保留原件；登记提取文本草稿由测试操作员及时应用，可随后阅读），仅生成${m.paths.prd}，约700至1000字，写清字段、状态筛选和校验/创建反馈。先不要生成HTML或其它成果。${sources}`,permissionMode:'full_access',modelEntryId:model.id});
  const prd=await wait(buildId,'02-prd');await applyDrafts(prd,m.paths.prd);await snapshot('baseline-prd',m.paths.prd);
  const html=await wait(await send(`请基于已读取的合成需求与Excel三条样例生成简单离线HTML工单原型：列表、标题和申请人必填、标题最多40字、普通/紧急、创建成功真实新增待审批行、校验失败保留输入、全部/待审批/已通过/已驳回筛选。只写${m.paths.html}，简洁自包含页面即可，不接真实后台，不改PRD。${sources}`,'build','coding'),'03-html');
  await applyDrafts(html,m.paths.html);const baseline=await snapshot('baseline-html',m.paths.html);
  const repair=await wait(await send(`反馈：工单标题上限应从40改为30字，请只局部修订${m.paths.html}的输入约束、校验和提示，保留申请人/优先级/筛选/创建反馈行为。先读取当前稿并用增量草稿修改，避免整页重写；本轮不改PRD和资料，PRD同步留作下一步。${sources}`,'build','coding'),'04-repair');
  const names=repair.row.tools.map(tool=>tool.tool);result.incrementalChecks={readDraft:names.includes('read_draft'),editDraft:names.includes('edit_draft'),noFullRewrite:!names.includes('write_draft')};await save();
  if(!result.incrementalChecks.readDraft||!result.incrementalChecks.editDraft||!result.incrementalChecks.noFullRewrite)throw Error('INCREMENTAL_EDIT_NOT_DEMONSTRATED');
  await applyDrafts(repair,m.paths.html);const revised=await snapshot('revised-html',m.paths.html);result.incrementalChecks.hashChanged=baseline.sha256!==revised.sha256;
  const prdSnapshot=result.snapshots.find(item=>item.label==='baseline-prd');result.incrementalChecks.prdUnchanged=await hash(path.join(outputMount.path,...m.paths.prd.split('/')))===prdSnapshot.sha256;
  if(!result.incrementalChecks.hashChanged||!result.incrementalChecks.prdUnchanged)throw Error('REVISION_SCOPE_FAILED');
  await view('04-applied');
  const before=await state();await app.close();app=undefined;await progress('restarting_readonly');await launch();const restored=await state();
  const runIds=result.runs.map(r=>r.id),applied=result.runs.flatMap(r=>r.changes.map(c=>c.id));
  result.restart={status:'checked',runsRetained:runIds.every(id=>restored.runs.some(r=>r.id===id)),conversationRetained:restored.conversations.some(c=>c.id===conversationId),appliedRetained:applied.every(id=>restored.changes.some(c=>c.id===id&&c.status==='applied')),noNewRuns:before.runs.length===restored.runs.length,files:[]};
  for(const relative of [m.paths.prd,m.paths.html])result.restart.files.push({path:relative,sha256:await hash(path.join(outputMount.path,...relative.split('/'))),versions:await call({type:'versions',mountId:outputMount.id,path:relative})});
  if(!result.restart.runsRetained||!result.restart.conversationRetained||!result.restart.appliedRetained||!result.restart.noNewRuns||result.restart.files.some(item=>!item.versions.length))throw Error('RESTART_RESTORE_FAILED');
  await view('05-restart');result.status='completed_pending_independent_business_review';
 }catch(error){result.status='failed';result.reason=reason(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'screenshots','failure.png')}).catch(()=>{});process.exitCode=1;}
 finally{
  if(app){if(currentId)await call({type:'cancel',id:currentId}).catch(()=>{});await app.close().catch(()=>{});}
  for(const source of m.sourceFiles)result.sourceChecks.push({name:source.name,expectedHash:source.sha256,actualHash:await hash(source.path).catch(()=>null)});
  if(result.sourceChecks.some(s=>s.actualHash!==s.expectedHash)){result.status='failed';result.reason='SYNTHETIC_SOURCE_CHANGED';process.exitCode=1;}
  // Product-managed Pi sessions remain isolated. Summary reads only numeric usage/tool names;
  // no native messages, raw thinking, credentials or tool arguments are duplicated into evidence.
  try{
   const db=new DatabaseSync(path.join(m.profile,'slash.sqlite'),{readOnly:true});let sessionFile;
   try{const row=db.prepare('SELECT value FROM kv WHERE key=?').get('session:'+conversationId);if(row)sessionFile=JSON.parse(row.value);}finally{db.close();}
   if(sessionFile){const file=await fs.realpath(sessionFile),relative=path.relative(m.profile,file);if(path.isAbsolute(relative)||relative.startsWith('..')||(await fs.stat(file)).size>32*1024*1024)throw Error();
    result.usage=[];for(const line of (await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean)){const row=JSON.parse(line),message=row.type==='message'?row.message:undefined;if(message?.role==='assistant'&&message.usage){const usage={at:row.timestamp};for(const key of ['input','output','cacheRead','cacheWrite','totalTokens'])if(typeof message.usage[key]==='number')usage[key]=message.usage[key];result.usage.push(usage);}}
    result.usageNotice='Session-level numeric usage only; may include all four runs. No raw thinking retained in this receipt.';
   }else result.usageNotice='Native session numeric usage unavailable';
  }catch{result.usageNotice='Native session numeric usage unavailable';}
  result.finishedAt=new Date().toISOString();result.elapsedMs=Date.parse(result.finishedAt)-Date.parse(result.startedAt);await save();await progress(result.status);
  console.log(JSON.stringify({status:result.status,reason:result.reason,result:path.join(output,'result.json'),testDir:output,pageErrors:result.pageErrors}));
 }
}

// One explicitly scoped follow-up after independent browser feedback. No general retry loop.
async function feedback(){
 if(!args.includes('--run')||!args.includes('--allow-cloud')||!arg('--test-dir'))throw Error('EXPLICIT_FEEDBACK_CLOUD_GATE_REQUIRED');
 const output=await isolatedDirectory(arg('--test-dir')),m=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
 const prior=JSON.parse(await fs.readFile(path.join(output,'result.json'),'utf8'));
 if(m.output!==output||m.profile!==path.join(output,'profile')||m.workspace!==path.join(output,'workspace')||prior.status!=='completed_pending_independent_business_review'||prior.runs?.length!==4||!prior.outputMount?.id)throw Error('FEEDBACK_BASELINE_INVALID');
 for(const folder of [m.profile,m.workspace,m.sources])if(await fs.realpath(folder)!==folder)throw Error('ISOLATION_SYMLINK_FORBIDDEN');
 for(const [name,expected]of Object.entries(m.runtime))if(await hash(path.join(root,'dist/main',name))!==expected)throw Error('RUNTIME_CHANGED_REPREPARE');
 const rendererEntryHash=await hash(path.join(root,'dist/renderer/index.html'));
 const baseline=prior.snapshots.find(item=>item.label==='revised-html'),file=path.join(prior.outputMount.path,...m.paths.html.split('/'));
 const outputRelative=path.relative(m.workspace,prior.outputMount.path);if(!outputRelative||path.isAbsolute(outputRelative)||outputRelative.startsWith('..')||await fs.realpath(prior.outputMount.path)!==prior.outputMount.path)throw Error('FEEDBACK_OUTPUT_PATH_INVALID');
 if(!baseline||await hash(file)!==baseline.sha256)throw Error('FEEDBACK_HTML_BASELINE_CHANGED');
 for(const source of m.sourceFiles)if(await hash(source.path)!==source.sha256)throw Error('FEEDBACK_SOURCE_CHANGED');
 const prd=path.join(prior.outputMount.path,...m.paths.prd.split('/')),prdHash=await hash(prd);
 const marker=await fs.open(path.join(output,'feedback-once.lock'),'wx');await marker.close();
 await fs.copyFile(path.join(output,'result.json'),path.join(output,'result-four-runs.json'),constants.COPYFILE_EXCL);
 const result={status:'running',startedAt:new Date().toISOString(),runtime:'development',rendererEntryHash,profile:m.profile,cloudExecuted:false,baselineHash:baseline.sha256,feedback:['标题和申请人须按纯文本渲染，不能将标签当作HTML','明确新增UX要求：允许完整超长输入/粘贴，提交时超过30字明确报错并保留全部输入且不新增；避免maxlength静默截断'],pageErrors:[],sourceChecks:[],notice:'Real model feedback task. Original four-run result is preserved; independent actual DOM acceptance remains required.'};
 let app,page,runId;const save=()=>fs.writeFile(path.join(output,'feedback-result.json'),JSON.stringify(result,null,2));
 const stage=value=>fs.writeFile(path.join(output,'feedback-progress.json'),JSON.stringify({stage:value,runId,at:new Date().toISOString()}));
 const call=async input=>{const response=await page.evaluate(value=>window.pm.request(value),input);if(!response.ok)throw Error(response.error??'IPC_FAILED');return response.data;};
 const terminal=['succeeded','failed','interrupted','cancelled'];
 try{
  await stage('starting_real_desktop');const env={...process.env,PM_SLASH_DATA_DIR:m.profile};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({cwd:root,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',()=>result.pageErrors.push('RENDERER_PAGE_ERROR'));
  if(await app.evaluate(({app})=>app.getPath('userData'))!==m.profile)throw Error('USER_DATA_ISOLATION_MISMATCH');
  await page.locator('.brand').waitFor();
  const deadline=Date.now()+45000;let ready=false;await stage('opening_verified_workspace');
  while(Date.now()<deadline){try{await call({type:'workspace',path:m.workspace});ready=true;break;}catch(error){if(reason(error)!=='WORKSPACE_BUSY')throw error;await sleep(1000);}}
  if(!ready)throw Error('WORKSPACE_STARTUP_TIMEOUT');
  const s=await call({type:'state'}),mount=s.mounts.find(item=>item.id===prior.outputMount.id),c=s.conversations.find(item=>item.id===prior.conversationId),model=s.models?.find(item=>item.id===s.defaultModelId);
  if(s.root!==m.workspace||!mount?.write||mount.path!==prior.outputMount.path||!c||!model?.hasKey||s.runs.some(r=>['queued','running','waiting_user','cancelling'].includes(r.status))||s.changes.some(change=>change.status==='pending')||!prior.runs.every(old=>s.runs.some(r=>r.id===old.id)))throw Error('FEEDBACK_LIVE_STATE_INVALID');
  result.versionsBefore=await call({type:'versions',mountId:mount.id,path:m.paths.html});
  await save();await stage('sending_single_feedback');
  runId=await call({type:'send',id:c.id,mode:'build',permissionMode:'full_access',modelEntryId:model.id,taskType:'coding',text:`独立操作验收反馈，请只局部修订已应用的${m.paths.html}（mountId=${mount.id}），先读当前稿再用增量草稿修改：\n1. 标题和申请人按纯文本显示，输入<b>测试</b>也应原样显示，不能拼进HTML导致标签解析。\n2. 新增明确UX要求：标题允许输入或粘贴完整超过30字的文本，不静默截断；提交时超过30字给出清楚错误，保留完整原文和其它字段输入，不新增工单；30字仍允许。移除或调整导致静默截断的maxlength。\n保留现有必填、优先级、三条种子、状态筛选、成功创建及反馈。不改PRD或参考资料。本轮前四份草稿已由测试操作员实际应用，请以当前文件为准。不要完整重写页面。`});
  result.cloudExecuted=true;result.runId=runId;await save();await stage('feedback_running');
  let live;const end=Date.now()+600000;
  while(Date.now()<end){live=await call({type:'state'});if(terminal.includes(live.runs.find(r=>r.id===runId)?.status))break;const approvals=await call({type:'pendingApprovals',conversationId:c.id});if(approvals.some(a=>a.runId===runId&&a.status==='pending'))throw Error('UNEXPECTED_REAL_APPROVAL');await sleep(1500);}
  if(!terminal.includes(live?.runs.find(r=>r.id===runId)?.status)){await call({type:'cancel',id:runId});throw Error('FEEDBACK_RUN_TIMEOUT');}
  const run=live.runs.find(r=>r.id===runId),ops=(await call({type:'operations',limit:200})).filter(op=>op.runId===runId);
  result.run={id:runId,status:run.status,mode:run.mode,permissionMode:run.permissionMode,startedAt:run.startedAt,finishedAt:run.finishedAt,elapsedMs:run.finishedAt?Date.parse(run.finishedAt)-Date.parse(run.startedAt):undefined,reason:run.error?reason({message:run.error}):run.interruptionReason,tools:ops.map(({id,tool,state,createdAt})=>({id,tool,status:state,at:createdAt}))};await save();
  if(run.status!=='succeeded')throw Error('FEEDBACK_REAL_RUN_NOT_SUCCEEDED');
  const tools=result.run.tools.map(tool=>tool.tool);if(!tools.includes('read_draft')||!tools.includes('edit_draft')||tools.includes('write_draft'))throw Error('FEEDBACK_INCREMENTAL_EDIT_NOT_DEMONSTRATED');
  const changes=live.changes.filter(change=>change.runId===runId&&change.status==='pending');
  if(changes.length!==1||changes[0].mountId!==mount.id||canonical(changes[0].path)!==canonical(m.paths.html)||await hash(file)!==baseline.sha256)throw Error('FEEDBACK_DRAFT_SCOPE_INVALID');
  const change=changes[0],draftHash=sha(Buffer.from(change.content,'utf8'));await stage('applying_verified_html_feedback');await call({type:'apply',id:change.id});
  const applied=await call({type:'state'});if(applied.changes.find(item=>item.id===change.id)?.status!=='applied'||await hash(file)!==draftHash)throw Error('FEEDBACK_APPLY_FAILED');
  if(draftHash===baseline.sha256||await hash(prd)!==prdHash)throw Error('FEEDBACK_REVISION_SCOPE_FAILED');
  const snapshot=path.join(output,'snapshots','text-safe-html.html');await fs.copyFile(file,snapshot,constants.COPYFILE_EXCL);
  result.change={id:change.id,label:'text-safe-html',path:m.paths.html,status:'applied',sha256:draftHash,bytes:Buffer.byteLength(change.content),snapshot};result.versionsAfter=await call({type:'versions',mountId:mount.id,path:m.paths.html});
  result.prdUnchanged=true;await page.reload();await page.locator('.brand').waitFor();await page.locator('.sidebar').getByRole('button',{name:title,exact:true}).click();await page.locator('.message').first().waitFor();
  result.screenshot=path.join(output,'screenshots','06-feedback-applied.png');await page.screenshot({path:result.screenshot});
  result.status='completed_pending_independent_business_review';
 }catch(error){result.status='failed';result.reason=reason(error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'screenshots','feedback-failure.png')}).catch(()=>{});}
 finally{
  if(app){if(runId){await call({type:'cancel',id:runId}).catch(()=>{});if(!result.run){const end=Date.now()+30000;let r;while(Date.now()<end){try{r=(await call({type:'state'})).runs.find(item=>item.id===runId);}catch{break;}if(terminal.includes(r?.status))break;await sleep(500);}if(r)result.run={id:r.id,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,elapsedMs:r.finishedAt?Date.parse(r.finishedAt)-Date.parse(r.startedAt):undefined,reason:r.error?reason({message:r.error}):r.interruptionReason};}}await app.close().catch(()=>{});}
  for(const source of m.sourceFiles)result.sourceChecks.push({name:source.name,expectedHash:source.sha256,actualHash:await hash(source.path).catch(()=>null)});
  if(result.sourceChecks.some(source=>source.expectedHash!==source.actualHash)){result.status='failed';result.reason='FEEDBACK_SOURCE_CHANGED';process.exitCode=1;}
  try{
   const db=new DatabaseSync(path.join(m.profile,'slash.sqlite'),{readOnly:true});let sessionFile;try{const row=db.prepare('SELECT value FROM kv WHERE key=?').get('session:'+prior.conversationId);if(row)sessionFile=JSON.parse(row.value);}finally{db.close();}
   if(!sessionFile||!result.run?.startedAt)throw Error();const actual=await fs.realpath(sessionFile),relative=path.relative(m.profile,actual);if(path.isAbsolute(relative)||relative.startsWith('..')||(await fs.stat(actual)).size>32*1024*1024)throw Error();
   result.usage=[];for(const line of (await fs.readFile(actual,'utf8')).split(/\r?\n/).filter(Boolean)){const row=JSON.parse(line),message=row.type==='message'?row.message:undefined;if(message?.role!=='assistant'||!message.usage||Date.parse(row.timestamp)<Date.parse(result.run.startedAt))continue;const usage={at:row.timestamp};for(const key of ['input','output','cacheRead','cacheWrite','totalTokens'])if(typeof message.usage[key]==='number')usage[key]=message.usage[key];result.usage.push(usage);}
   result.usageNotice='Numeric assistant usage after this Run started; no messages, thinking or tool arguments copied.';
  }catch{result.usageNotice='Numeric native usage unavailable';}
  result.finishedAt=new Date().toISOString();await save();await stage(result.status);console.log(JSON.stringify({status:result.status,reason:result.reason,result:path.join(output,'feedback-result.json'),pageErrors:result.pageErrors}));
 }
}

try{
 if(args.includes('--help'))console.log('Offline: node scripts/pm-synthetic-real-tasks.mjs --prepare --source-profile "<explicit profile>"\nReal cloud/UI: node scripts/pm-synthetic-real-tasks.mjs --run --allow-cloud --test-dir "<prepared directory>" [--timeout-seconds 600]\nContinue one verified pending Plan after a harness/UI failure: add --continue-from-plan (Plan is not resent).\nOne scoped fifth feedback task: --run --allow-cloud --feedback-text-render --test-dir "<completed directory>".');
 else if(args.includes('--prepare')&&!args.includes('--run'))await prepare();
 else if(args.includes('--feedback-text-render')&&!args.includes('--prepare'))await feedback();
 else if(args.includes('--run')&&!args.includes('--prepare'))await run();
 else throw Error('SELECT_PREPARE_OR_RUN');
}catch(error){console.error(JSON.stringify({status:'failed',reason:reason(error),cloudGateRequired:true}));process.exitCode=1;}

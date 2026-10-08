// Independent benchmark expectations + official prototype acceptance IPC.
// This file neither launches an app/model nor edits generated artifacts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {prototypeStepSchema,prototypeAcceptanceDefinitionSchema} from '../shared/prototype-acceptance.ts';
import {inspectQualityPrototype,hashBytes} from './quality-prototype-inspect.mjs';

export const QUALITY_PROTOTYPE_RUNTIME_FILES=['main/prototype-browser.js','main/prototype-acceptance.js','main/global-skills.js','shared/prototype-acceptance.js'];
export async function prototypeRuntimeHashes(repo){const result={};for(const file of QUALITY_PROTOTYPE_RUNTIME_FILES)result[file]=hashBytes(await fs.readFile(path.join(repo,'dist',file)));return result;}
export async function assertPrototypeRuntime(repo,expected){if(JSON.stringify(await prototypeRuntimeHashes(repo))!==JSON.stringify(expected))throw Error('QUALITY_PROTOTYPE_RUNTIME_CHANGED');}
const selector=z.string().min(1).max(200),action=prototypeStepSchema.refine(s=>s.action!=='assert','Bindings contain native actions, never fabricated observations.'),actions=z.array(action).max(8).default([]);
const message=z.object({selector,text:z.string().min(1).max(200)}).strict();
export const qualityPrototypeBindingsSchema=z.object({
 schemaVersion:z.literal(1),artifactHash:z.string().regex(/^[a-f0-9]{64}$/),reviewed:z.literal(true),entrySteps:actions,
 code:z.object({selector,mode:z.enum(['readonly_input','disabled_input','display_text']),representation:z.enum(['unallocated_placeholder','allocated_demo']),generatedNote:message,allocationNote:message}).strict(),
 name:z.object({selector,hint:message,boundary:z.enum(['native_maxlength','submit_reject']),errorSelector:selector.optional()}).strict(),
 submit:selector,fillSteps:actions,
 scenarios:z.object({success:actions,duplicate:actions,failure:actions}).strict(),
 feedback:z.object({success:message,duplicate:message,failure:message}).strict(),
 names:z.object({success:z.string().min(1).max(50),duplicate:z.string().min(1).max(50),failure:z.string().min(1).max(50)}).strict(),
 preservedFields:z.array(z.union([z.object({selector,value:z.string().max(2000)}).strict(),z.object({selector,checked:z.boolean()}).strict()])).max(6).default([]),
 followUps:z.object({retry:z.object({steps:actions,feedback:message}).strict().optional(),duplicateView:z.object({steps:actions,feedback:message}).strict().optional()}).strict().optional(),
}).strict().superRefine((b,ctx)=>{
 if(b.name.boundary==='submit_reject'&&!b.name.errorSelector)ctx.addIssue({code:'custom',message:'51字符拒绝路径须定位实际校验反馈。'});
 if(!/50/.test(b.name.hint.text))ctx.addIssue({code:'custom',message:'名称长度期望固定为50，不能用绑定文件弱化。'});
 if(!/(系统.*生成|系统.*计算|自动.*生成|自动计算)/.test(b.code.generatedNote.text))ctx.addIssue({code:'custom',message:'编码须有独立的系统生成/计算说明期望。'});
 if(!/(模拟|演示|待|未|时机)/.test(b.code.allocationNote.text))ctx.addIssue({code:'custom',message:'须说明演示编码或未确认分配时机。'});
 for(const [kind,expression] of Object.entries({success:/成功|完成|已创建|已新增/,duplicate:/重复|疑似|已有/,failure:/失败|异常|错误|不可用/}))if(!expression.test(b.feedback[kind].text))ctx.addIssue({code:'custom',message:kind+'结果必须具有相应独立语义，不能用任意当前文案代替。'});
 for(const [kind,follow] of Object.entries(b.followUps??{})){if(!follow.steps.some(s=>s.action==='click'))ctx.addIssue({code:'custom',message:kind+'必须实际点击重试或查看控件。'});if(kind==='retry'&&!/成功|完成|已创建|已新增/.test(follow.feedback.text))ctx.addIssue({code:'custom',message:'重试必须实际达到成功反馈，不能以原失败文字冒充再次提交。'});}
});
const a=(assertion,selector,expected,match)=>({action:'assert',assertion,...(selector?{selector}:{}),...(expected===undefined?{}:{expected}),...(match?{match}:{})}),fill=(selector,value)=>({action:'fill',selector,value}),click=selector=>({action:'click',selector});
const text=m=>a('text',m.selector,m.text,'contains');
const visibleText=m=>[a('visible',m.selector,true),text(m)];
export function qualityPrototypeCases(input){
 const b=qualityPrototypeBindingsSchema.parse(input),entry=b.entrySteps;
 const code=[...entry,a('visible',b.code.selector,true),...(b.code.mode==='readonly_input'?[a('readonly',b.code.selector,true)]:b.code.mode==='disabled_input'?[a('enabled',b.code.selector,false)]:b.code.representation==='allocated_demo'?[a('text',b.code.selector,'JHWD','contains')]:[]),text(b.code.generatedNote),text(b.code.allocationNote)];
 if(b.code.representation==='allocated_demo'&&b.code.mode!=='display_text')code.push(a('value',b.code.selector,'JHWD','contains'));
 const name=[...entry,...(b.name.boundary==='submit_reject'?b.fillSteps:[]),fill(b.name.selector,'甲'.repeat(50)),a('value',b.name.selector,'甲'.repeat(50)),fill(b.name.selector,'甲'.repeat(51))];
 if(b.name.boundary==='native_maxlength')name.push(a('value',b.name.selector,'甲'.repeat(50)));else name.push(a('value',b.name.selector,'甲'.repeat(51)),click(b.submit),a('visible',b.name.errorSelector,true));name.push(text(b.name.hint));
 const preserved=new Map();for(const step of [...b.fillSteps,...b.scenarios.failure])if(['fill','select'].includes(step.action)&&step.selector!==b.name.selector)preserved.set(step.selector,{value:step.value});for(const field of b.preservedFields)if(field.selector!==b.name.selector)preserved.set(field.selector,field);
 const scenario=kind=>[...entry,...b.fillSteps,...b.scenarios[kind],fill(b.name.selector,b.names[kind]),click(b.submit),...visibleText(b.feedback[kind]),...(kind==='failure'?[a('value',b.name.selector,b.names.failure),...[...preserved].map(([selected,field])=>'checked'in field?a('checked',selected,field.checked):a('value',selected,field.value))]:[])];
 const cases=[{id:'benchmark:code-readonly',title:'来源规则：编码展示且无法手填，分配/模拟状态明确',steps:code},{id:'benchmark:name-50-51',title:'来源50字符规则及测试50/51中文字符边界',steps:name},...['success','duplicate','failure'].map(kind=>({id:'benchmark:submit-'+kind,title:'测试模拟提交：'+kind,steps:scenario(kind)})),...[[390,844],[1280,800],[1440,900]].map(([width,height])=>({id:'benchmark:viewport-'+width,title:'测试CSS视口 '+width+'×'+height,viewport:{width,height},steps:[...entry,a('no-horizontal-overflow',undefined,undefined),a('visible',b.name.selector,true),fill(b.name.selector,'视口验收门店'),a('value',b.name.selector,'视口验收门店'),a('visible',b.submit,true),a('enabled',b.submit,true),click(b.submit),a('no-horizontal-overflow',undefined,undefined)]}))];
 for(const [kind,follow] of Object.entries(b.followUps??{})){const initial=kind==='retry'?'failure':'duplicate';cases.push({id:'benchmark:'+kind,title:kind==='retry'?'明确任务要求：失败后实际重试成功':'明确任务要求：实际查看重复结果',steps:[...entry,...b.fillSteps,...b.scenarios[initial],fill(b.name.selector,b.names[initial]),click(b.submit),...visibleText(b.feedback[initial]),...follow.steps,...visibleText(follow.feedback)]});}
 // Existing case/step/file/time limits remain in force.
 return prototypeAcceptanceDefinitionSchema.parse({mountId:'benchmark',path:'index.html',title:'真实资料独立浏览器基准',cases}).cases;
}

async function fileHash(file){return hashBytes(await fs.readFile(file));}
export async function importQualityGlobalSkillFolder({app,call,source}){
 if(!app||typeof app.evaluate!=='function')throw Error('QUALITY_GLOBAL_SKILL_ISOLATED_APP_REQUIRED');
 const token='qualityGlobalSkillDialog_'+randomUUID().replaceAll('-','');
 await app.evaluate(({dialog},{token,source})=>{
  const original=dialog.showOpenDialog,state={original,selections:0};globalThis[token]=state;
  dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);if(options?.title==='选择全局技能目录'&&options.properties?.includes('openDirectory')){state.selections++;return{canceled:false,filePaths:[source]};}return original.apply(dialog,args);};
 },{token,source});
 try{
  const selected=await call({type:'globalSkillsChooseFolder'});
  if(typeof selected!=='string'||path.resolve(selected)!==path.resolve(source))throw Error('QUALITY_GLOBAL_SKILL_FOLDER_SELECTION_MISMATCH');
  const selections=await app.evaluate((_electron,token)=>globalThis[token]?.selections,token);if(selections!==1)throw Error('QUALITY_GLOBAL_SKILL_NATIVE_PICKER_NOT_USED');
  return await call({type:'globalSkills',action:'importFolder',path:source});
 }finally{
  await app.evaluate(({dialog},token)=>{const state=globalThis[token];if(state){dialog.showOpenDialog=state.original;delete globalThis[token];}},token);
 }
}
export async function installQualityGlobalSkill({app,call,sourcePath}){
 const source=await fs.realpath(sourcePath),before=await globalSkillSourceFiles(source);let provenance;
 const packageDirectory=path.dirname(source),registryDirectory=path.resolve(packageDirectory,'../..');
 if(path.basename(source)==='tree'&&path.basename(path.dirname(packageDirectory))==='packages'){
  const registryFile=path.join(registryDirectory,'registry.json'),registry=JSON.parse(await fs.readFile(registryFile,'utf8')),pkg=registry.packages.find(p=>p.id===path.basename(packageDirectory));
  if(!pkg||pkg.source.kind!=='github'||!pkg.files.length||pkg.files.length!==before.length||pkg.files.some(f=>!before.some(n=>n.path===f.path&&n.hash===f.sha256&&n.bytes===f.bytes)))throw Error('QUALITY_GLOBAL_SKILL_PROVENANCE_INVALID');
  provenance={registryFile,registryHash:await fileHash(registryFile),sourcePackageId:pkg.id,source:pkg.source,filesHash:hashBytes(Buffer.from(JSON.stringify(before)))};
 }
 const receipt=await importQualityGlobalSkillFolder({app,call,source}),skill=receipt.view.skills.find(s=>s.name==='frontend-design'&&s.scope==='global'&&s.enabled);
 if(!skill)throw Error('QUALITY_GLOBAL_FRONTEND_DESIGN_MISSING');
 const sourceSkill=before.find(f=>f.path===skill.relativePath);if(!sourceSkill||sourceSkill.hash!==skill.contentHash)throw Error('QUALITY_GLOBAL_SKILL_CONTENT_MISMATCH');
 if(JSON.stringify(await globalSkillSourceFiles(source))!==JSON.stringify(before))throw Error('QUALITY_GLOBAL_SKILL_SOURCE_CHANGED');
 return{sourcePath:source,sourceFiles:before,folderAuthorization:{method:'globalSkillsChooseFolder',selection:'isolated_native_dialog_test_fixture',selectedPath:source},provenance:provenance??{source:{kind:'local',path:source},notice:'No GitHub provenance is claimed for this source.'},installedPackageId:receipt.packageId,registryRevision:receipt.revision,skill:{id:skill.id,name:skill.name,scope:skill.scope,contentHash:skill.contentHash},notice:'Installed through native folder selection authorization and real global registry IPC; the target registry source is local, linked to the separately verified original GitHub package when present.'};
}
async function globalSkillSourceFiles(root){const result=[];let bytes=0;const walk=async(folder,depth)=>{if(depth>12)throw Error('QUALITY_GLOBAL_SKILL_DEPTH_LIMIT');for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.isSymbolicLink())throw Error('QUALITY_GLOBAL_SKILL_LINK_DENIED');const absolute=path.join(folder,entry.name);if(entry.isDirectory())await walk(absolute,depth+1);else if(entry.isFile()){const stat=await fs.stat(absolute);if(result.length>=4096||stat.size>20*1024*1024||bytes+stat.size>80*1024*1024)throw Error('QUALITY_GLOBAL_SKILL_BYTE_LIMIT');bytes+=stat.size;result.push({path:path.relative(root,absolute).replaceAll('\\','/'),hash:await fileHash(absolute),bytes:stat.size});}else throw Error('QUALITY_GLOBAL_SKILL_SPECIAL_FILE');}};await walk(root,0);return result;}
export async function assertQualityGlobalSkillSource(installation){if(JSON.stringify(await globalSkillSourceFiles(installation.sourcePath))!==JSON.stringify(installation.sourceFiles))throw Error('QUALITY_GLOBAL_SKILL_SOURCE_CHANGED');}
export function assertQualityGlobalSkillLoaded(run,installation){const receipt=run.skillLoads?.find(r=>r.name===installation.skill.name&&r.scope==='global'&&r.contentHash===installation.skill.contentHash);if(!receipt)throw Error('QUALITY_GLOBAL_SKILL_NOT_ACTUALLY_LOADED');return{...receipt,installationPackageId:installation.installedPackageId};}

export function qualityCodeProtectionStatus(mode,observation){if(!observation||observation.count!==1)return'unknown';if(mode==='display_text'){if(typeof observation.contentEditable!=='boolean')return'unknown';return observation.contentEditable||['input','textarea','select'].includes(observation.tag)?'failed':'passed';}return'not_applicable';}
export function qualityInteractionRequirements(prompts){const text=prompts.join('\n');return{retry:/失败[^。\n]{0,50}(可再提交|再提交|重试)/.test(text),duplicateView:/重复[^。\n]{0,50}查看/.test(text)};}

async function bindingFile(file){try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>128000)throw Error('QUALITY_PROTOTYPE_BINDING_FILE_INVALID');return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return undefined;throw error;}}
export async function runQualityPrototypeRound({repo,page,call,target,artifactPath,artifactHash,caseDir,round,caseId,sourceRefs=[],runtimeHashes,interactionRequirements={},onState=async()=>{},signal}){
 const output=path.join(caseDir,'prototype',String(round));await fs.mkdir(output,{recursive:true});await assertPrototypeRuntime(repo,runtimeHashes);
 if(await fileHash(artifactPath)!==artifactHash)throw Error('QUALITY_PROTOTYPE_ARTIFACT_CHANGED');
 const view=await call({type:'prototypeAcceptanceGet',...target}),frozen=view.spec?.required?view.spec:undefined,reusable=view.spec?.title==='真实资料独立浏览器基准 '+caseId?view.spec:undefined,bindingsPath=path.join(caseDir,'prototype-bindings.json');let bindings,inspection;
 if(!frozen&&!reusable){
  inspection=await inspectQualityPrototype({page,call,target,artifactHash});await fs.writeFile(path.join(output,'inspection.json'),JSON.stringify(inspection,null,2));
  const template={schemaVersion:1,artifactHash,reviewed:false,entrySteps:[],code:{selector:inspection.candidates.code??'',mode:'readonly_input',representation:'unallocated_placeholder',generatedNote:{selector:'',text:'系统生成'},allocationNote:{selector:'',text:'生成时机待确认'}},name:{selector:inspection.candidates.name??'',hint:{selector:'',text:'50'},boundary:'native_maxlength'},submit:inspection.candidates.submit??'',fillSteps:[],scenarios:{success:[],duplicate:[],failure:[]},feedback:{success:{selector:'',text:'成功'},duplicate:{selector:'',text:'重复'},failure:{selector:'',text:'失败'}},names:{success:'独立验收新建门店',duplicate:'独立验收重复门店',failure:'独立验收失败门店'},preservedFields:[]};
  await fs.writeFile(path.join(output,'bindings-template.json'),JSON.stringify(template,null,2));
  let announced=false,lastProbe='';
  for(;;){
   if(signal?.aborted)throw Error('QUALITY_PROTOTYPE_BINDINGS_CANCELLED');await assertPrototypeRuntime(repo,runtimeHashes);if(await fileHash(artifactPath)!==artifactHash)throw Error('QUALITY_PROTOTYPE_ARTIFACT_CHANGED');
   const proposed=await bindingFile(bindingsPath);if(proposed?.cancel===true)throw Error('QUALITY_PROTOTYPE_BINDINGS_CANCELLED');if(proposed?.artifactHash&&proposed.artifactHash!==artifactHash)throw Error('QUALITY_PROTOTYPE_BINDING_ARTIFACT_MISMATCH');
   const probe=actions.safeParse(proposed?.entrySteps);if(probe.success&&probe.data.length){const probeHash=hashBytes(Buffer.from(JSON.stringify(probe.data)));if(probeHash!==lastProbe){lastProbe=probeHash;const stage=await inspectQualityPrototype({page,call,target,artifactHash,entrySteps:probe.data});await fs.writeFile(path.join(output,'inspection-stage.json'),JSON.stringify(stage,null,2));await onState({status:'awaiting_bindings',artifactHash,bindingsPath,inspection:path.join(output,'inspection-stage.json'),entrySteps:probe.data,notice:'Reviewed local entry steps were performed in a fresh sandboxed preview; actual wizard-stage DOM is recorded. Model files and model task were not changed.'});}}
   const parsed=qualityPrototypeBindingsSchema.safeParse(proposed);if(parsed.success){try{qualityPrototypeCases(parsed.data);bindings=parsed.data;break;}catch{if(!announced)await onState({status:'awaiting_bindings',artifactHash,bindingsPath,inspection:path.join(output,'inspection.json'),reason:'QUALITY_PROTOTYPE_BINDING_CASE_BUDGET',notice:'Bindings exceed the existing 10 cases / 20 steps per case / 100 total steps contract. No browser budget or expectation was weakened.'});announced=true;}}
   if(!announced){await onState({status:'awaiting_bindings',artifactHash,inspection:path.join(output,'inspection.json'),template:path.join(output,'bindings-template.json'),bindingsPath,errors:parsed.error.issues.map(e=>({path:e.path,message:e.message})),notice:'The existing Electron handle remains open; no new model send or automatic restart occurs. Fill the local binding file from actual DOM and independently review expected behavior.'});announced=true;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  // Reinspect the actual wizard stage using reviewed native entry steps.
  inspection=await inspectQualityPrototype({page,call,target,artifactHash,entrySteps:bindings.entrySteps,selectors:[bindings.code.selector,bindings.name.selector,bindings.submit]});await fs.writeFile(path.join(output,'inspection-bound.json'),JSON.stringify(inspection,null,2));
  const cases=qualityPrototypeCases(bindings);await call({type:'prototypeAcceptanceSave',...target,mode:'build',title:'真实资料独立浏览器基准 '+caseId,cases,sourceRefs});
 }
 const ready=await call({type:'prototypeAcceptanceGet',...target}),spec=ready.spec;if(!spec)throw Error('QUALITY_PROTOTYPE_SPEC_MISSING');
 const codeCase=spec.cases.find(c=>c.id==='benchmark:code-readonly'),codeSelector=codeCase?.steps.find(s=>s.action==='assert'&&s.assertion==='visible')?.selector,allocatedDemo=codeCase?.steps.some(s=>s.action==='assert'&&['value','text'].includes(s.assertion)&&s.selector===codeSelector&&s.expected==='JHWD');
 if(!inspection&&codeCase){const entrySteps=[];for(const step of codeCase.steps){if(step.action==='assert')break;entrySteps.push(step);}inspection=await inspectQualityPrototype({page,call,target,artifactHash,entrySteps,selectors:codeSelector?[codeSelector]:[]});await fs.writeFile(path.join(output,'inspection-bound.json'),JSON.stringify(inspection,null,2));}
 const codeObservation=inspection?.selectorObservations.find(s=>s.selector===codeSelector),codeFormatStatus=!allocatedDemo?'not_applicable':codeObservation?.count!==1?'unknown':codeObservation.valueFormat==='JHWD_10_digits'?'passed':'failed',codeMode=codeCase?.steps.some(s=>s.action==='assert'&&s.assertion==='readonly')?'readonly_input':codeCase?.steps.some(s=>s.action==='assert'&&s.assertion==='enabled')?'disabled_input':'display_text',codeProtectionStatus=qualityCodeProtectionStatus(codeMode,codeObservation);
 const missingInteractions=Object.entries(interactionRequirements).filter(([kind,required])=>required&&!spec.cases.some(c=>c.id==='benchmark:'+kind)).map(([kind])=>kind);
 const failureCase=spec.cases.find(c=>c.id==='benchmark:submit-failure'),preservedSelectors=new Set(failureCase?.steps.filter(s=>s.action==='assert'&&['value','checked'].includes(s.assertion)).map(s=>s.selector)),missingPreservation=(inspection?.controls??[]).filter(c=>c.visible&&!c.disabled&&!c.readonly&&['input','textarea','select'].includes(c.tag)&&!['hidden','button','submit'].includes(c.type)&&!preservedSelectors.has(c.selector)).map(c=>({selector:c.selector,label:c.label,type:c.type}));
 await onState({status:'running_prototype_checks',artifactHash,specHash:spec.specHash,bindingsPath,frozenBaseline:Boolean(frozen)});
 const execution=await call({type:'prototypeAcceptanceRun',...target,mode:'build',expectedRevision:spec.revision});const deadline=Date.now()+75000;let latest;
 while(Date.now()<deadline){const current=await call({type:'prototypeAcceptanceGet',...target});if(!current.activeRun&&current.latestReport?.evidence.executionId===execution.executionId){latest=current.latestReport;break;}await new Promise(resolve=>setTimeout(resolve,250));}
 if(!latest){await call({type:'prototypeAcceptanceCancel',executionId:execution.executionId}).catch(()=>{});throw Error('QUALITY_PROTOTYPE_BROWSER_TIMEOUT');}
 const status=latest.evidence.status==='failed'||codeFormatStatus==='failed'||codeProtectionStatus==='failed'?'failed':latest.versionState!=='current'||latest.evidence.status!=='passed'||codeFormatStatus==='unknown'||codeProtectionStatus==='unknown'||missingPreservation.length||missingInteractions.length?'unknown':'passed';
 if(!frozen&&status==='passed')await call({type:'prototypeAcceptanceRequired',...target,mode:'build',required:true,expectedRevision:spec.revision,expectedSpecHash:spec.specHash});
 const screenshots=[];for(const image of latest.evidence.screenshots){const raw=await call({type:'prototypeAcceptanceScreenshot',reportId:latest.reportId,screenshotId:image.id}),bytes=Buffer.from(raw.dataUrl.split(',')[1],'base64');if(hashBytes(bytes)!==image.contentHash)throw Error('QUALITY_PROTOTYPE_SCREENSHOT_HASH_MISMATCH');const filename=path.join(output,image.caseId.replace(/[^a-z0-9_-]/gi,'_')+'.png');await fs.writeFile(filename,bytes);screenshots.push({...image,path:filename,sha256:hashBytes(bytes)});}
 const record={schemaVersion:1,caseId,round,status,target,artifactHash,inspection:inspection?path.join(output,'inspection-bound.json'):undefined,bindingsPath,bindingsHash:bindings?hashBytes(Buffer.from(JSON.stringify(bindings))):undefined,specHash:spec.specHash,baselineAuthority:'isolated_host_benchmark_not_user_business_confirmation',frozenBaseline:Boolean(frozen),reusedReviewedCases:Boolean(reusable),confirmedForNextRound:!frozen&&status==='passed',additionalObservations:[{id:'allocated-demo-JHWD-10-digit-format',status:codeFormatStatus,selector:codeSelector,observedFormat:codeObservation?.valueFormat,basis:'verified_source',locator:'03 机会门店主数据 K2',notice:'Exact format checked against the actual preview control value; placeholder allocation timing is not presented as a generated MDM code.'},{id:'display-code-noneditable',status:codeProtectionStatus,selector:codeSelector,contentEditable:codeObservation?.contentEditable},{id:'explicit-follow-up-interactions',status:missingInteractions.length?'unknown':'covered',required:interactionRequirements,missing:missingInteractions,notice:'Missing reviewed retry/view bindings are unknown. Existing frozen cases are never removed or recomputed.'},{id:'failure-input-preservation-coverage',status:missingPreservation.length?'unknown':'covered',missing:missingPreservation,notice:'Real failure assertions must cover every visible editable input; missing controls are unknown, never assumed preserved.'}],report:latest,screenshots,sourceBasis:[{basis:'verified_source',sourceId:'fields',locator:'03 机会门店主数据 D2/F2/I2/K2/O2/P2；D3/F3/G3/K3',rules:'系统计算编码、新增展示/不可手填；名称手工录入和50字符'}, {basis:'test_requirement',rules:'50/51中文边界、模拟成功/重复/失败保留输入、390×844/1280×800/1440×900实际浏览器与截图'}],notice:'Real browser observations of actual saved model output. Viewport cases cover layout and native control access, not complete form submission or feedback in every viewport. No model artifact was modified. Simulation is a requirement for the prototype; no backend service or MDM allocation is claimed.'};
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(record,null,2));await assertPrototypeRuntime(repo,runtimeHashes);if(await fileHash(artifactPath)!==artifactHash)throw Error('QUALITY_PROTOTYPE_ARTIFACT_CHANGED');return record;
}

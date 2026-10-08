import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {qualityPrototypeBindingsSchema,qualityPrototypeCases,qualityCodeProtectionStatus,qualityInteractionRequirements,assertQualityGlobalSkillLoaded,assertQualityGlobalSkillSource,importQualityGlobalSkillFolder} from '../scripts/quality-prototype-checks.mjs';

const binding=()=>({schemaVersion:1,artifactHash:'a'.repeat(64),reviewed:true,entrySteps:[],code:{selector:'#actual-code',mode:'readonly_input',representation:'allocated_demo',generatedNote:{selector:'#actual-code-note',text:'系统自动生成'},allocationNote:{selector:'#actual-demo-note',text:'模拟编码'}},name:{selector:'#actual-name',hint:{selector:'#actual-limit',text:'最多50字符'},boundary:'native_maxlength'},submit:'#actual-submit',fillSteps:[{action:'fill',selector:'#actual-address',value:'隔离验收地址'}],scenarios:{success:[{action:'select',selector:'#actual-scenario',value:'success'}],duplicate:[{action:'select',selector:'#actual-scenario',value:'duplicate'}],failure:[{action:'select',selector:'#actual-scenario',value:'failure'}]},feedback:{success:{selector:'#actual-success',text:'创建成功'},duplicate:{selector:'#actual-duplicate',text:'疑似重复'},failure:{selector:'#actual-failure',text:'模拟服务失败'}},names:{success:'隔离正常门店',duplicate:'隔离重复门店',failure:'隔离失败门店'},preservedFields:[]});

test('独立浏览器基准固定来源规则及50/51输入；保留全部显式填入值，并沿用原预算（不执行browser）',()=>{
 const original=binding(),before=structuredClone(original),cases=qualityPrototypeCases(original);assert.deepEqual(original,before);assert.equal(cases.length,8);assert.ok(cases.reduce((n,c)=>n+c.steps.length,0)<=100);assert.ok(cases.every(c=>c.steps.length<=20));
 const code=cases.find(c=>c.id==='benchmark:code-readonly')!;assert.ok(code.steps.some(s=>s.action==='assert'&&s.assertion==='readonly'&&s.selector==='#actual-code'&&s.expected===true));
 const name=cases.find(c=>c.id==='benchmark:name-50-51')!;assert.ok(name.steps.some(s=>s.action==='fill'&&s.value==='甲'.repeat(50)));assert.ok(name.steps.some(s=>s.action==='fill'&&s.value==='甲'.repeat(51)));assert.ok(name.steps.some(s=>s.action==='assert'&&s.assertion==='value'&&s.expected==='甲'.repeat(50)));
 const failure=cases.find(c=>c.id==='benchmark:submit-failure')!;for(const [selector,expected] of [['#actual-address','隔离验收地址'],['#actual-scenario','failure'],['#actual-name','隔离失败门店']])assert.ok(failure.steps.some(s=>s.action==='assert'&&s.assertion==='value'&&s.selector===selector&&s.expected===expected));
 for(const kind of ['success','duplicate','failure']){const steps=cases.find(c=>c.id==='benchmark:submit-'+kind)!.steps,index=steps.findIndex(s=>s.action==='assert'&&s.assertion==='text');assert.ok(index>0);assert.deepEqual(steps[index-1],{action:'assert',assertion:'visible',selector:steps[index].selector,expected:true});}
 assert.deepEqual(cases.filter(c=>c.viewport).map(c=>c.viewport),[{width:390,height:844},{width:1280,height:800},{width:1440,height:900}]);assert.ok(cases.filter(c=>c.viewport).every(c=>c.steps.some(s=>s.action==='click'&&s.selector==='#actual-submit')));
});

test('新增明确要求可预声明重试/查看真实操作；保留八项基线与总预算，可编辑编码展示拒绝',()=>{
 const original=binding(),extended={...original,followUps:{retry:{steps:[{action:'select',selector:'#actual-scenario',value:'success'},{action:'click',selector:'#actual-retry'}],feedback:{selector:'#actual-success',text:'创建成功'}},duplicateView:{steps:[{action:'click',selector:'#actual-view'}],feedback:{selector:'#actual-detail',text:'重复门店详情'}}}};
 const cases=qualityPrototypeCases(extended);assert.equal(cases.length,10);assert.deepEqual(cases.slice(0,8),qualityPrototypeCases(original));assert.ok(cases.reduce((n,c)=>n+c.steps.length,0)<=100);assert.ok(cases.every(c=>c.steps.length<=20));
 const invalid=structuredClone(extended);invalid.followUps.retry.steps=[];assert.throws(()=>qualityPrototypeCases(invalid));const over=structuredClone(extended);over.entrySteps=Array.from({length:8},()=>({action:'click',selector:'#actual-entry'})) as any;assert.throws(()=>qualityPrototypeCases(over));
 assert.deepEqual(qualityInteractionRequirements(['失败保留输入可再提交。','增强重复结果的查看反馈。']),{retry:true,duplicateView:true});assert.deepEqual(qualityInteractionRequirements(['失败保留输入；重复结果可见。']),{retry:false,duplicateView:false});
 assert.equal(qualityCodeProtectionStatus('display_text',{count:1,tag:'div',contentEditable:true}),'failed');assert.equal(qualityCodeProtectionStatus('display_text',{count:1,tag:'input',contentEditable:false}),'failed');assert.equal(qualityCodeProtectionStatus('display_text',{count:1,tag:'span',contentEditable:false}),'passed');assert.equal(qualityCodeProtectionStatus('display_text',{count:0}),'unknown');
});

test('绑定文件不能自报passed、注入代码、弱化50限制或用无结果文案替代成功/失败；超预算拒绝',()=>{
 assert.equal(qualityPrototypeBindingsSchema.safeParse({...binding(),status:'passed'}).success,false);assert.equal(qualityPrototypeBindingsSchema.safeParse({...binding(),reviewed:false}).success,false);
 const weaker=binding();weaker.name.hint.text='最多49字符';assert.equal(qualityPrototypeBindingsSchema.safeParse(weaker).success,false);
 const fake=binding();fake.feedback.success.text='提交按钮';assert.equal(qualityPrototypeBindingsSchema.safeParse(fake).success,false);
 const execution=binding();execution.entrySteps=[{action:'eval',script:'return true'}] as any;assert.equal(qualityPrototypeBindingsSchema.safeParse(execution).success,false);
 const excessive=binding();excessive.entrySteps=Array.from({length:8},(_,i)=>({action:'fill',selector:'#field-'+i,value:'example'})) as any;excessive.fillSteps=Array.from({length:8},(_,i)=>({action:'fill',selector:'#required-'+i,value:'example'}));assert.throws(()=>qualityPrototypeCases(excessive));
});

test('51字符提交拒绝路径必须实际提交并看到字段错误；项目同名或不同正文receipt不能冒称全局设计加载',()=>{
 const b=binding();b.name.boundary='submit_reject';assert.equal(qualityPrototypeBindingsSchema.safeParse(b).success,false);(b.name as any).errorSelector='#actual-name-error';const cases=qualityPrototypeCases(b),name=cases.find(c=>c.id==='benchmark:name-50-51')!;assert.ok(name.steps.some(s=>s.action==='assert'&&s.assertion==='value'&&s.expected==='甲'.repeat(51)));assert.ok(name.steps.some(s=>s.action==='click'&&s.selector===b.submit));assert.ok(name.steps.some(s=>s.action==='assert'&&s.assertion==='visible'&&s.selector==='#actual-name-error'));
 const installation={installedPackageId:'package',skill:{name:'frontend-design',scope:'global',contentHash:'b'.repeat(64)}};assert.throws(()=>assertQualityGlobalSkillLoaded({skillLoads:[{name:'frontend-design',scope:'project',contentHash:'b'.repeat(64)}]},installation),/NOT_ACTUALLY_LOADED/);assert.throws(()=>assertQualityGlobalSkillLoaded({skillLoads:[{name:'frontend-design',scope:'global',contentHash:'c'.repeat(64)}]},installation),/NOT_ACTUALLY_LOADED/);assert.equal(assertQualityGlobalSkillLoaded({skillLoads:[{name:'frontend-design',scope:'global',contentHash:'b'.repeat(64)}]},installation).installationPackageId,'package');
});

test('全局源包版本保护核对真实文件：修改、增加文件或链接均拒绝，不读取用户profile',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'quality-prototype-package-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const content='fixture skill',hash=createHash('sha256').update(content).digest('hex');await fs.writeFile(path.join(dir,'SKILL.md'),content);const installation={sourcePath:dir,sourceFiles:[{path:'SKILL.md',hash,bytes:Buffer.byteLength(content)}]};await assertQualityGlobalSkillSource(installation);await fs.appendFile(path.join(dir,'SKILL.md'),' changed');await assert.rejects(assertQualityGlobalSkillSource(installation),/SOURCE_CHANGED/);await fs.writeFile(path.join(dir,'SKILL.md'),content);await fs.writeFile(path.join(dir,'extra.txt'),'extra');await assert.rejects(assertQualityGlobalSkillSource(installation),/SOURCE_CHANGED/);await fs.unlink(path.join(dir,'extra.txt'));await fs.symlink(dir,path.join(dir,'link'),'junction');await assert.rejects(assertQualityGlobalSkillSource(installation),/LINK_DENIED/);
});

test('导入脚本先调用正式选择目录IPC，真实调用dialog测试入口后导入，并恢复原方法（不启动Electron）',async()=>{
 const source=path.resolve('isolated-explicit-skill'),calls:string[]=[],original=async()=>({canceled:true,filePaths:[] as string[]}),dialog={showOpenDialog:original};
 const app={evaluate:async(fn:Function,input:unknown)=>fn({dialog},input)};
 const receipt={revision:1,view:{skills:[]}};let selected:string|undefined;
 const call=async(input:any)=>{calls.push(input.type==='globalSkills'?input.action:input.type);if(input.type==='globalSkillsChooseFolder'){assert.deepEqual(await dialog.showOpenDialog(),{canceled:true,filePaths:[]});const result=await (dialog.showOpenDialog as any)({}, {title:'选择全局技能目录',properties:['openDirectory']});selected=result.filePaths[0];return selected;}assert.equal(selected,source);assert.equal(input.path,source);return receipt;};
 assert.equal(await importQualityGlobalSkillFolder({app,call,source}),receipt);assert.deepEqual(calls,['globalSkillsChooseFolder','importFolder']);assert.equal(dialog.showOpenDialog,original);
});

test('选择取消、未经过native picker或导入失败均阻止越过授权流程且恢复dialog（不启动Electron）',async()=>{
 const source=path.resolve('isolated-explicit-skill');
 for(const failure of ['cancel','bypass','import']){
  const original=async()=>({canceled:true,filePaths:[] as string[]}),dialog={showOpenDialog:original},calls:string[]=[];
  const app={evaluate:async(fn:Function,input:unknown)=>fn({dialog},input)};
  const call=async(input:any)=>{calls.push(input.type==='globalSkills'?input.action:input.type);if(input.type==='globalSkillsChooseFolder'){if(failure==='cancel')return undefined;if(failure==='bypass')return source;return (await (dialog.showOpenDialog as any)({}, {title:'选择全局技能目录',properties:['openDirectory']})).filePaths[0];}throw Error('fixture_import_failed');};
  await assert.rejects(importQualityGlobalSkillFolder({app,call,source}),failure==='cancel'?/SELECTION_MISMATCH/:failure==='bypass'?/NATIVE_PICKER_NOT_USED/:/fixture_import_failed/);assert.equal(dialog.showOpenDialog,original);assert.deepEqual(calls,failure==='import'?['globalSkillsChooseFolder','importFolder']:['globalSkillsChooseFolder']);
 }
});

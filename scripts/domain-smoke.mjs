import {_electron as electron} from 'playwright';
import {projectResourceLocation} from './composer-smoke-helpers.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args=process.argv.slice(2);
const value=(name,fallback)=>{const index=args.indexOf(name);if(index<0)return fallback;const result=args[index+1];if(!result||result.startsWith('--'))throw Error(`${name} 需要参数`);return result;};
const root=process.cwd();
const sourceProfile=path.resolve(value('--source-profile',path.join(root,'.test-data','app')));
const outputDir=path.resolve(value('--output-dir',path.join(root,'.test-data','domain-smoke')));
const profile=path.join(outputDir,'profile');
const workspace=path.join(outputDir,'workspace');
const expectedModel='DeepSeek-V4-Flash-0731';
const databaseName='slash.sqlite';

const testDataRoot=path.resolve(root,'.test-data');await fs.mkdir(testDataRoot,{recursive:true});const realRoot=await fs.realpath(root),realTestData=await fs.realpath(testDataRoot);
const testDataRelative=path.relative(realRoot,realTestData);if(!testDataRelative||path.isAbsolute(testDataRelative)||testDataRelative==='..'||testDataRelative.startsWith('..'+path.sep))throw Error('工程 .test-data 必须是工程内真实目录');
const outputRelative=path.relative(testDataRoot,outputDir);if(!outputRelative||outputRelative.includes(path.sep)||path.isAbsolute(outputRelative)||outputRelative==='..'||outputRelative.startsWith('..'+path.sep))throw Error('输出目录必须是工程 .test-data 下的独立直接子目录');
try{const stat=await fs.lstat(outputDir);if(stat.isSymbolicLink())throw Error('输出目录不能是符号链接或 junction');const realOutput=await fs.realpath(outputDir);const relative=path.relative(realTestData,realOutput);if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('输出目录真实路径必须位于工程 .test-data 内');}catch(error){if(error.code!=='ENOENT')throw error;}
const realSourceProfile=await fs.realpath(sourceProfile);const sourceToOutput=path.relative(realSourceProfile,outputDir),outputToSource=path.relative(outputDir,realSourceProfile);
const isInside=(relative)=>relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);
if(isInside(sourceToOutput)||isInside(outputToSource))throw Error('输出目录不能与凭据源 profile 相同或互相包含');
await fs.access(path.join(sourceProfile,databaseName));
await fs.rm(outputDir,{recursive:true,force:true});
await fs.mkdir(profile,{recursive:true});
await fs.mkdir(workspace,{recursive:true});
// 仅复制 safeStorage 密文数据库及其 Chromium os_crypt 元数据，不读取或输出密钥明文。
for(const suffix of ['','-wal','-shm'])try{await fs.copyFile(path.join(sourceProfile,databaseName+suffix),path.join(profile,databaseName+suffix));}catch(error){if((error).code!=='ENOENT')throw error;}
await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(profile,'Local State'));

const app=await electron.launch({args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile}});
let page;
const request=async payload=>{const result=await page.evaluate(value=>window.pm.request(value),payload);if(!result.ok)throw Error(result.error);return result.data;};
try{
 page=await app.firstWindow();await page.waitForSelector('.brand',{timeout:30_000});
 await request({type:'workspace',path:workspace});const state=await request({type:'state'});
 if(state.model.id!==expectedModel||!state.model.hasKey)throw Error(`隔离 profile 未恢复 ${expectedModel} 加密配置`);
 const reference=projectResourceLocation(await request({type:'projectTreeGet'}));
 const fixture='domain-smoke.drawio';const xml=`<?xml version="1.0" encoding="UTF-8"?><mxfile host="slash"><diagram id="smoke" name="Smoke"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="start" value="开始" style="shape=ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="20" y="30" width="100" height="50" as="geometry"/></mxCell><mxCell id="end" value="结束" style="shape=ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="180" y="30" width="100" height="50" as="geometry"/></mxCell><mxCell id="edge" style="strokeColor=#000000;" edge="1" parent="1" source="start" target="end"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
 await fs.writeFile(path.join(reference.directory,fixture),xml,'utf8');
 const conversationId=await request({type:'conversation',title:'Domain smoke'});
 const runId=await request({type:'send',id:conversationId,text:`请只完成这个小任务：调用 check_flow 检查 mountId=${reference.mountId} 的 ${reference.file(fixture)}，使用内置默认规范；把报告草稿写到过程文件目录 domain-smoke/report.json，把 SVG 预览草稿写到过程文件目录 domain-smoke/previews。不要生成其他成果，不要输出代码，完成后一句话说明草稿待应用。`});
 const deadline=Date.now()+180_000;let latest;
 while(Date.now()<deadline){await page.waitForTimeout(1000);latest=await request({type:'state'});const run=latest.runs.find(item=>item.id===runId);if(['succeeded','failed','cancelled','interrupted'].includes(run?.status))break;}
 const run=latest?.runs.find(item=>item.id===runId);if(run?.status!=='succeeded')throw Error(`真实 Agent 运行失败：${run?.status||'timeout'} ${run?.error||''}`);
 const operations=await request({type:'operations',limit:100});const call=operations.find(item=>item.runId===runId&&item.tool==='check_flow');if(call?.state!=='succeeded')throw Error('真实 Agent 未成功调用 check_flow');
 const changes=latest.changes.filter(item=>item.runId===runId);const report=changes.find(item=>item.path.replaceAll('\\','/').endsWith('domain-smoke/report.json'));const preview=changes.find(item=>item.path.replaceAll('\\','/').includes('domain-smoke/previews/')&&item.path.endsWith('.svg'));if(!report||!preview)throw Error('check_flow 未生成报告与 SVG 预览草稿');
 const result={status:'passed',model:expectedModel,runId,tool:'check_flow',toolState:call.state,drafts:[report.path,preview.path]};await fs.writeFile(path.join(outputDir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await app.close();}

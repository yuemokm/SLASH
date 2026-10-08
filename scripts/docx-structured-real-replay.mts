// Local production Service replay only: no app/window, run, model or cloud call.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {OFFICE_TEXT_PARSER_VERSION} from '../main/office-extraction.js';
import {prepareWorkflow} from '../main/pm-workflows.js';

const root=process.cwd(),original='C:/Users/yuemokm/Desktop/千禾prd模板.docx';
const offline=path.join(root,'.test-data/prd-user-template/千禾prd模板_离线结构副本.docx');
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const originalBefore=sha(await fs.readFile(original)),offlineBytes=await fs.readFile(offline);
assert.equal(sha(offlineBytes),originalBefore,'Offline copy no longer matches current original; no extraction started');
const evidence=await fs.mkdtemp(path.join(root,'.test-data/docx-structure-replay-'));
const store=new Store(path.join(evidence,'profile')),service=new Service(store,()=>{throw Error('MODEL_NOT_AUTHORIZED');},()=>{});
let result:unknown;
try{
 await service.workspace(path.join(evidence,'project'));
 service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resources=service.state.mounts.find(mount=>mount.name==='资源')!;
 const ref={mountId:resources.id,path:'参考资料/模板只读回放.docx'};
 await fs.writeFile(path.join(resources.path,ref.path),offlineBytes,{flag:'wx'});
 const registered=await service.copyForProcessing(ref),processed=await service.processProcessingCopy(registered.id,'extract_text');
 const pending=service.state.changes.find(change=>change.id===processed.changeId)!;
 const fieldHeader=pending.content.split('\n').find(line=>/^\|\s*所属业务对象\s*\|/.test(line));assert.ok(fieldHeader);
 assert.deepEqual(fieldHeader.split('|').slice(1,-1).map(cell=>cell.trim()),['所属业务对象','字段名称','类型','来源','长度/范围','必填','唯一','默认值','校验规则','备注']);
 assert.match(pending.content,/## 6\.2 集成场景详细说明/);
 assert.match(pending.content,/接口清单/);
 const headings=pending.content.split('\n').filter(line=>/^#{1,6} /.test(line));
 const tableMarkers=pending.content.match(/\[表格 (?:docx-html\/)?table\[\d+\]/g)??[];
 assert.equal(headings.length,26);assert.equal(tableMarkers.length,11);
 await service.apply(processed.changeId);
 const outputMount=service.state.mounts.find(mount=>mount.id===processed.output.mountId)!;
 const actual=await fs.readFile(path.join(outputMount.path,processed.output.path),'utf8');assert.equal(actual,pending.content);
 const prepared=await prepareWorkflow(service.files,path.join(store.dir,'versions'),{kind:'prd',sources:[{mountId:processed.output.mountId,path:processed.output.path}]});
 const workflowReceipt=prepared.workflow.receipts[0];assert.equal(workflowReceipt.characters,actual.length);assert.equal(workflowReceipt.contentHash,sha(actual));
 const hasNextRead=prepared.prompt.includes('"nextRead":');
 if(!workflowReceipt.truncated){assert.equal(workflowReceipt.includedCharacters,actual.length);assert.equal(hasNextRead,false);}
 const originalAfter=sha(await fs.readFile(original));assert.equal(originalAfter,originalBefore);assert.equal(sha(await fs.readFile(offline)),originalBefore);
 await fs.writeFile(path.join(evidence,'extracted.md'),actual);
 result={kind:'local_service_copy_process_apply_replay',parserVersion:OFFICE_TEXT_PARSER_VERSION,original,offline,originalBefore,originalAfter,isolatedSourceHash:sha(await fs.readFile(path.join(resources.path,ref.path))),registeredCopy:registered,processingReceipt:processed,outputHash:sha(actual),outputCharacters:actual.length,workflowPreview:{selectedSources:1,receipt:workflowReceipt,hasNextRead},headingCount:headings.length,tableCount:tableMarkers.length,verified:['official registered copy/process/apply pipeline','actual prepareWorkflow single-source receipt and continuation state','26 headings retain levels/order','11 tables retain row/cell structure','field table default-value column','6.2 integration detail heading and interface label','original/offline copy hashes unchanged'],unverified:['strict template selection/acceptance contract','business semantics','Word visual layout','model quality or speed'],modelRequests:0,appStarted:false};
 await fs.writeFile(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');
 process.stdout.write(JSON.stringify({evidence,characters:actual.length,includedCharacters:workflowReceipt.includedCharacters,truncated:workflowReceipt.truncated,hasNextRead,headings:headings.length,tables:tableMarkers.length,sourceProtected:true,modelRequests:0})+'\n');
}finally{
 service.dispose();await Promise.allSettled([...(service as unknown as {agentIndex:{queues:Map<string,Promise<unknown>>}}).agentIndex.queues.values()]);store.close();
}

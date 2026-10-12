import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import ExcelJS from 'exceljs';
import {createRuntime} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {parseTestCaseSuite} from '../shared/test-cases.js';
import {testCaseSourceId} from '../main/test-cases.js';
import {proposal} from './test-case-fixture.js';
import {reviewFixtureDelivery} from './task-delivery-review-fixture.js';

function reply(res:ServerResponse,model:string,tool?:{id:string;name:string;args:unknown}){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const event=(delta:unknown,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'manual-cases-local',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 event({role:'assistant'},null);if(tool){event({tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.args)}}]},null);event({},'tool_calls');}else{event({content:'已生成供人工审阅的用例草稿，尚未执行；本次为本地固定回放。'},null);event({},'stop');}res.end('data: [DONE]\n\n');
}
test('formal Service → actual Pi → localhost serializes manual schema, loads next-turn tool, creates pending and exports real XLSX',{timeout:30000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-manual-cases-pi-')),store=new Store(path.join(dir,'profile')),packets:any[]=[],errors:unknown[]=[];let service!:Service,outputId='';
 const server=createServer(async(req,res)=>{try{
  assert.equal(req.url,'/v1/chat/completions');const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const packet=JSON.parse(Buffer.concat(chunks).toString());packets.push(packet);
  const tools=new Map(packet.tools.map((tool:any)=>[tool.function.name,tool.function.parameters]));
  if(packets.length===1){assert(tools.has('load_tool_group'));assert(!tools.has('draft_test_cases'));const read=service.state.runs.at(-1)!.sourceReads![0];assert(JSON.stringify(packet.messages).includes(testCaseSourceId(read)));reply(res,packet.model,{id:'load-manual',name:'load_tool_group',args:{group:'test_cases'}});}
  else if(packets.length===2){assert(tools.has('draft_test_cases'));assert(!JSON.stringify(tools.get('draft_test_cases')).includes('executionStatus'));const read=service.state.runs.at(-1)!.sourceReads![0];reply(res,packet.model,{id:'draft-manual',name:'draft_test_cases',args:{...proposal(testCaseSourceId(read)),mountId:outputId}});}
  else{assert.equal(packets.length,3);const result=packet.messages.find((m:any)=>m.role==='tool'&&m.tool_call_id==='draft-manual');assert(result);const value=JSON.parse(result.content);assert.equal(value.executionStatus,'not_run');assert.equal(value.businessStatus,'unverified');assert.equal(value.status,'pending');reply(res,packet.model);}
 }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('local fixture failure');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 service=new Service(store,()=> 'local-only-placeholder',()=>{},o=>createRuntime({...o,model:{...o.model,id:'manual-cases-fixture',baseUrl:`http://127.0.0.1:${address.port}/v1`,protocol:'openai-completions',supportsVision:false,contextWindow:65536,maxTokens:12000}}),{fetchModelMetadata:async()=>new Response(JSON.stringify({data:[]}))});
 t.after(async()=>{service.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await Promise.allSettled([...(service as any).agentIndex.queues.values()]);await new Promise(r=>setTimeout(r,20));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resource=service.state.mounts.find(m=>m.name==='资源')!,output=service.state.mounts.find(m=>m.name==='成果')!;outputId=output.id;const source={mountId:resource.id,path:'参考资料/退回规则.md'};await fs.writeFile(path.join(resource.path,source.path),'# 退回规则\n\n主管退回必须填写原因。');
 const id=await service.send(service.conversation(),'根据引用PRD生成审批测试用例','build','standard',undefined,undefined,undefined,'writing',undefined,{kind:'test_cases',sources:[source]});
 for(let i=0;i<1000&&!service.state.runs.find(r=>r.id===id)!.finishedAt;i++)await new Promise(r=>setTimeout(r,10));
 const run=service.state.runs.find(r=>r.id===id)!;assert(run.finishedAt);assert.equal(run.status,'succeeded',run.error);assert.deepEqual(errors,[]);assert.equal(packets.length,3);
 const change=service.state.changes[0],suite=parseTestCaseSuite(change.content);assert.equal(suite.executionStatus,'not_run');assert.equal(suite.businessStatus,'unverified');await assert.rejects(fs.stat(path.join(output.path,change.path)),/ENOENT/);
 await assert.rejects(service.exportTestCases({mountId:change.mountId,path:change.path,changeId:change.id},{mountId:output.id,path:'未核对不能导出.xlsx'},'test_cases_xlsx'),/TASK_DELIVERY_BLOCKED/);await assert.rejects(fs.stat(path.join(output.path,'未核对不能导出.xlsx')),/ENOENT/);
 await reviewFixtureDelivery(service,id);
 await service.exportTestCases({mountId:change.mountId,path:change.path,changeId:change.id},{mountId:output.id,path:'Pi本地回放用例.xlsx'},'test_cases_xlsx');const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(output.path,'Pi本地回放用例.xlsx'));assert.equal(book.worksheets[0].getCell('I2').value,'1. 阻止退回并提示填写原因');
 const report=(await service.getTaskAcceptance(id))!.latestReport!;assert.notEqual(report.businessCoverage.status,'confirmed');assert.equal(suite.executionStatus,'not_run');
 t.diagnostic(JSON.stringify({identity:'formal_Service_actual_Pi_localhost_manual_cases',cloudCalls:0,requests:packets.length,changeStatus:change.status,executionStatus:suite.executionStatus,businessStatus:suite.businessStatus,automaticStatus:report.automaticStatus,taskStatus:report.status,xlsxRows:book.worksheets[0].rowCount,notice:'本地固定模型响应，仅证明真实工具/来源/草稿/导出链路，不认证云模型用例质量'}));
});

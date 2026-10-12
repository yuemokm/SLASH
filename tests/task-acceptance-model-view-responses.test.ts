import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import {createRuntime,assertRuntimeSucceeded,type RuntimeOptions} from '../main/agent.js';
import {toolInputSchema} from '../main/tool-input-schema.js';
import {taskModelViewRequestSchema,type TaskModelViewRequest} from '../shared/task-acceptance-model-view.js';

function reply(res:ServerResponse,n:number,args?:Record<string,unknown>){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const item=args?{type:'function_call',id:`fc_view_${n}`,call_id:`view_${n}`,name:'get_task_acceptance',arguments:JSON.stringify(args),status:'completed'}:{type:'message',id:'msg_done',role:'assistant',status:'completed',content:[{type:'output_text',text:'LOCAL DONE',annotations:[]}]};
 const events=[{type:'response.output_item.added',output_index:0,item:args?{...item,arguments:''}:{...item,content:[]}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:`response_${n}`,status:'completed',model:'local-astra-schema',output:[item],usage:{input_tokens:3,output_tokens:2,total_tokens:5}}}];
 for(const event of events)res.write('data: '+JSON.stringify(event)+'\n\n');res.end();
}

test('真实Pi Responses wire保留optional和最小调用说明，宿主拒绝不适用字段与空ID',{timeout:30000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-task-view-responses-')),errors:unknown[]=[],received:TaskModelViewRequest[]=[];let requests=0,logged=0;
 const server=createServer(async(req,res)=>{try{
  assert.equal(req.url,'/v1/responses');const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());requests++;
  const tool=body.tools.find((item:any)=>item.name==='get_task_acceptance');assert(tool);assert.deepEqual(tool.parameters,JSON.parse(JSON.stringify(toolInputSchema(taskModelViewRequestSchema))));
  assert.equal(tool.strict,false);assert.deepEqual(tool.parameters.required??[],[]);assert.equal(tool.parameters.additionalProperties,false);assert.equal(Object.keys(tool.parameters.properties).length,8);
  assert.match(tool.description,/调用\{\}/);assert.match(tool.description,/当前Run省略runId/);assert.match(tool.description,/summary省略sourceId\/readId\/reportId\/itemId/);assert.match(tool.parameters.properties.runId.description,/省略查看当前Run/);
  if(requests===1)reply(res,requests,{});
  else if(requests===2)reply(res,requests,{section:'summary',sourceId:'real-source',readId:'real-read',reportId:'real-report',itemId:'real-item'});
  else if(requests===3)reply(res,requests,{runId:''});
  else{
   assert.equal(requests,4);const outputs=body.input.filter((item:any)=>item.type==='function_call_output');assert.equal(outputs.length,3);
   assert.match(outputs.find((item:any)=>item.call_id==='view_1').output,/local-current-run/);
   assert.match(outputs.find((item:any)=>item.call_id==='view_2').output,/sourceId只用于sources\/reads/);
   assert.match(outputs.find((item:any)=>item.call_id==='view_3').output,/Validation|at least|minimum|minLength/);
   reply(res,requests);
  }
 }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('LOCAL_FIXTURE_FAILED');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 let runtime:Awaited<ReturnType<typeof createRuntime>>|undefined;
 t.after(async()=>{if(runtime){await runtime.abort();runtime.dispose();}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 runtime=await createRuntime({dir:path.join(dir,'agent'),workspaceRoot:dir,files:{} as RuntimeOptions['files'],mounts:[],model:{id:'local-astra-schema',provider:'local',baseUrl:`http://127.0.0.1:${address.port}/v1`,protocol:'openai-responses',supportsVision:false,contextWindow:65536,maxTokens:12000},connections:[],key:'LOCAL-NOT-SECRET',runId:'local-current-run',mode:'plan',listConnections:()=>[],delta:()=>{},redact:String,log:async(_name,_args,fn)=>{logged++;return fn();},getTaskAcceptanceForModel:async input=>{received.push(input);return{schemaVersion:1,runId:'local-current-run',section:'summary',state:'available',version:'a'.repeat(64),items:[],coverage:{partial:false,totalItems:0,omittedItems:0,fragmentedItems:0},notice:'synthetic local reply'};}} as RuntimeOptions);
 await runtime.prompt('LOCAL ONLY: execute fixture tool checks.');assertRuntimeSucceeded(runtime);
 assert.deepEqual(errors,[]);assert.equal(requests,4);assert.equal(logged,1);assert.deepEqual(received,[{section:'summary',limit:10}]);
 const toolResults=runtime.messages.filter((message:any)=>message.role==='toolResult') as Array<{isError:boolean}>;assert.deepEqual(toolResults.map(message=>message.isError),[false,true,true]);
});

// Isolated, nonofficial targeted MCP transport. Not production-registered.
import fs from 'node:fs/promises';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {openStaticPhase} from '../main/netlify-static-phase.ts';
import {staticPhaseArgumentsSchema,staticUploadArgumentsSchema} from '../shared/prototype-publish-operation.ts';
const configuration=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const phase=openStaticPhase(configuration),server=new Server({name:'slash-isolated-static-phase',version:'1'},{capabilities:{tools:{}}});
const names=configuration.configuration.version==='netlify-static-recovery-v1'?['static_status']:['static_create','static_upload','static_status'];
await fs.writeFile(configuration.evidencePath,JSON.stringify({pid:process.pid,hostPid:configuration.hostPid,hasStore:false,names,restored:Boolean(configuration.restoredDeployId),scope:'local_fixture_not_cloud'}));
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:names.map(name=>({name,description:'Private host-only isolated phase; not available to generation model',inputSchema:z.toJSONSchema(name==='static_upload'?staticUploadArgumentsSchema:staticPhaseArgumentsSchema,{target:'draft-7'}),annotations:{readOnlyHint:name==='static_status',idempotentHint:name==='static_status',openWorldHint:false}}))}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
 try{if(!names.includes(request.params.name))throw Error('UNBOUND_STATUS');const method=request.params.name==='static_create'?phase.create:request.params.name==='static_upload'?phase.upload:request.params.name==='static_status'?phase.status:undefined;if(!method)throw Error('INVALID_RESPONSE');const value=await method(request.params.arguments,extra.signal);return{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};}
 catch(error){return{isError:true,content:[{type:'text',text:['IDENTITY_MISMATCH','HTTP_REJECTED','UNBOUND_STATUS','UNBOUND_UPLOAD','CREATE_ALREADY_CLAIMED'].includes(error.message)?error.message:'INVALID_RESPONSE'}]};}
});
await server.connect(new StdioServerTransport());

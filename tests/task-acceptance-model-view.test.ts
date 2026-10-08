import test from 'node:test';
import assert from 'node:assert/strict';
import {taskModelPage,taskModelReadIndex,taskModelSourceIndex,taskModelSourceId,modelViewHash} from '../main/task-acceptance-model-view.js';
import {taskModelViewRequestSchema,taskModelViewResponseSchema} from '../shared/task-acceptance-model-view.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';
const version='a'.repeat(64),guard=()=>{},request=(value:unknown)=>taskModelViewRequestSchema.parse(value);
test('whole JSON pagination accounts escapes/wrappers and never skips oversized first/middle item',async()=>{
 const original=[{id:'large',text:('"\\\n😀').repeat(14000)},{id:'tail',text:'最后原文'}],entries=original.map(item=>({id:item.id,load:()=>item})),assembled=new Map<string,string>();let cursor:ReturnType<typeof request>['cursor'];const ids:string[]=[];
 for(let page=0;page<100;page++){const result=await taskModelPage({request:request({section:'requests',limit:20,cursor}),runId:'run',version,entries,guard});taskModelViewResponseSchema.parse(result);assert(JSON.stringify(result).length<=12000);for(const item of result.items){ids.push(item.id);if('encoding'in item){assert.equal(item.textOffset,(assembled.get(item.id)??'').length);assert.equal(item.itemHash,modelViewHash(JSON.stringify(original.find(o=>o.id===item.id))));assert.equal(item.complete,false);assembled.set(item.id,(assembled.get(item.id)??'')+item.text);assert(!/[\ud800-\udbff]$/.test(item.text));}else assembled.set(item.id,JSON.stringify(item.data));}if(!result.nextCursor)break;assert.notDeepEqual(result.nextCursor,cursor);cursor=result.nextCursor;}
 assert.deepEqual(JSON.parse(assembled.get('large')!),original[0]);assert.deepEqual(JSON.parse(assembled.get('tail')!),original[1]);assert.equal(ids.at(-1),'tail');
});
test('large item after fitting whole item is deferred without position advance; tail continuation retains exact identity',async()=>{
 const entries=[{id:'small',load:()=>({text:'小'})},{id:'large',load:()=>({text:'x'.repeat(30000)})}];const first=await taskModelPage({request:request({section:'criteria'}),runId:'run',version,entries,guard});assert.equal(first.items.length,1);assert.equal(first.nextCursor!.position,1);assert.equal(first.nextCursor!.textOffset,0);
 const second=await taskModelPage({request:request({section:'criteria',cursor:first.nextCursor}),runId:'run',version,entries,guard});assert.equal(second.items[0].id,'large');assert('encoding'in second.items[0]);assert(second.nextCursor!.textOffset>0);
});
test('cursor version/offset and strict filters cannot silently start another list or split a surrogate',async()=>{
 assert.throws(()=>request({section:'criteria',sourceId:'source'}));assert.throws(()=>request({section:'sources',reportId:'report'}));assert.throws(()=>request({section:'summary',unknown:true}));
 await assert.rejects(taskModelPage({request:request({cursor:{position:0,textOffset:0,version:'b'.repeat(64)}}),runId:'run',version,entries:[],guard}),/VIEW_CHANGED/);
 const data={text:'😀tail'},json=JSON.stringify(data),middle=json.indexOf('😀')+1;await assert.rejects(taskModelPage({request:request({cursor:{position:0,textOffset:middle,version}}),runId:'run',version,entries:[{id:'item',load:()=>data}],guard}),/CURSOR_INVALID/);
 const largeCursor={position:100001,textOffset:10000001,version};assert.deepEqual(request({cursor:largeCursor}).cursor,largeCursor);
 const dto={schemaVersion:1,runId:'run',section:'reads',state:'available',version,items:[],coverage:{partial:true,totalItems:100002,omittedItems:1,fragmentedItems:1},nextCursor:largeCursor,notice:'合成游标'};assert.deepEqual(request({cursor:taskModelViewResponseSchema.parse(dto).nextCursor}).cursor,largeCursor);
});
test('separate file-version source IDs and exact per-read IDs preserve original max8 proof boundaries',()=>{
 const base:WorkflowSourceReceipt={mountId:'m',path:'same.txt',versionId:'read:'+version,contentHash:version,readAt:'2026-10-08T00:00:00.000Z',characters:100,includedCharacters:0,truncated:true,contentStatus:'spreadsheet_catalog'};
 const reads=taskModelReadIndex('run',[base,{...base,locator:'lines 1-4',includedCharacters:30,contentStatus:undefined},{...base,locator:'lines 3-7',includedCharacters:30,contentStatus:undefined},{...base,contentHash:'b'.repeat(64)}]);assert.equal(reads.length,4);assert.equal(taskModelSourceIndex(reads).length,2);assert.equal(new Set(reads.map(r=>r.id)).size,4);assert.equal(reads[0].sourceId,reads[2].sourceId);assert.equal(taskModelSourceId(base),reads[0].sourceId);assert.notEqual(taskModelReadIndex('other',[base])[0].id,reads[0].id);assert.equal(reads[0].receipt.includedCharacters,0);
});
test('guard revocation after awaited loader prevents returning even already serialized data',async()=>{
 let revoked=false;await assert.rejects(taskModelPage({request:request({section:'reads'}),runId:'run',version,entries:[{id:'secret',load:async()=>{revoked=true;return{quote:'不应返回'};}}],guard:()=>{if(revoked)throw Error('PERMISSION_DENIED');}}),/PERMISSION_DENIED/);
});

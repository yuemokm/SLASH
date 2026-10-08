import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AttachmentRepository} from '../main/image-attachments.js';
import {VisionBridge} from '../main/vision.js';

function tinyPng(){
 const data=Buffer.alloc(45);
 Buffer.from([137,80,78,71,13,10,26,10]).copy(data,0);
 data.writeUInt32BE(13,8);Buffer.from('IHDR').copy(data,12);data.writeUInt32BE(1,16);data.writeUInt32BE(1,20);data[24]=8;data[25]=6;
 Buffer.from('IEND').copy(data,37);
 return data;
}
const evidence=JSON.stringify({summary:'一张产品页面截图',ocr:{fullText:'提交',items:[{text:'提交',confidence:.99}]},layout:{regions:[{type:'button',label:'提交'}]},semantics:{scene:'表单页面',objects:['按钮'],interactions:['点击提交']},visual:{notes:['浅色背景']},uncertainty:[]});

test('图片附件是工作空间隔离的不可变快照',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-vision-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const workspace=path.join(root,'workspace');await fs.mkdir(workspace);const source=path.join(root,'screen.png');await fs.writeFile(source,tinyPng());
 const repo=new AttachmentRepository(path.join(root,'data'));const ref=await repo.importPath(source,workspace);assert.equal(ref.mimeType,'image/png');assert.equal(ref.size,45);const loaded=await repo.load(ref.id,workspace);assert.equal(Buffer.from(loaded.data).length,45);await assert.rejects(repo.get(ref.id,path.join(root,'other')),/IMAGE_ATTACHMENT_NOT_FOUND/);
});

test('视觉桥接原生直传，文本模型按严格证据回退并缓存',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-vision-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const workspace=path.join(root,'workspace');await fs.mkdir(workspace);const source=path.join(root,'screen.png');await fs.writeFile(source,tinyPng());
 const repo=new AttachmentRepository(path.join(root,'data'));const ref=await repo.importPath(source,workspace);let calls=0;
 const bridge=new VisionBridge({repository:repo,workspaceRoot:workspace,requestVision:async()=>{calls++;return evidence;}});
 const models=[{id:'vision',modelId:'vision-1',provider:'test',supportsVision:true},{id:'text',modelId:'text-1',provider:'test',supportsVision:false}];
 const native=await bridge.prepare({attachments:[ref],selectedModel:models[0],models});assert.equal(native.images?.length,1);assert.equal(calls,0);
 const fallback=await bridge.prepare({attachments:[ref],selectedModel:models[1],models,prompt:'请识别按钮'});assert.equal(fallback.evidence?.summary,'一张产品页面截图');assert.equal(calls,1);
 const cached=await bridge.prepare({attachments:[ref],selectedModel:models[1],models,prompt:'请识别按钮'});assert.equal(cached.cached,true);assert.equal(calls,1);
 await assert.rejects(bridge.prepare({attachments:[ref],selectedModel:models[1],models,prompt:'x',preferences:{visionAutoFallback:false}}),/VISION_MODEL_NOT_CAPABLE/);
});

test('视觉证据不合规时不写入缓存，并保留不确定性',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-vision-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const workspace=path.join(root,'workspace');await fs.mkdir(workspace);const source=path.join(root,'screen.png');await fs.writeFile(source,tinyPng());
 const repo=new AttachmentRepository(path.join(root,'data'));const ref=await repo.importPath(source,workspace);let calls=0;const bridge=new VisionBridge({repository:repo,workspaceRoot:workspace,requestVision:async()=>{calls++;return 'not-json';}});const model={id:'vision',modelId:'vision-1',provider:'test',supportsVision:true};
 const first=await bridge.prepare({attachments:[ref],selectedModel:{...model,supportsVision:false},models:[model],prompt:'x'});assert.equal(first.evidence,undefined);assert.match(first.uncertainty?.[0]??'',/schema/);
 await bridge.prepare({attachments:[ref],selectedModel:{...model,supportsVision:false},models:[model],prompt:'x'});assert.equal(calls,2);
});

test('视觉回退跳过无密钥候选并选择后续可用模型',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-vision-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const workspace=path.join(root,'workspace');await fs.mkdir(workspace);const source=path.join(root,'screen.png');await fs.writeFile(source,tinyPng());
 const repo=new AttachmentRepository(path.join(root,'data'));const ref=await repo.importPath(source,workspace);let selected:string|undefined;
 const bridge=new VisionBridge({repository:repo,workspaceRoot:workspace,requestVision:async({model})=>{selected=model.id;return evidence;}});
 const models=[
  {id:'vision-no-key',modelId:'vision-1',provider:'test',supportsVision:true,hasKey:false},
  {id:'vision-ready',modelId:'vision-2',provider:'test',supportsVision:true,hasKey:true},
 ];
 const result=await bridge.prepare({attachments:[ref],selectedModel:{id:'text',modelId:'text-1',provider:'test',supportsVision:false},models,prompt:'请识别按钮'});
 assert.equal(result.model?.id,'vision-ready');assert.equal(selected,'vision-ready');assert.equal(result.evidence?.summary,'一张产品页面截图');
});

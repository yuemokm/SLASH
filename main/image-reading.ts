import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadToolDefinition,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from '@sinclair/typebox';
import {z} from 'zod';
import {MAX_IMAGE_BYTES,verifyImage} from './image-attachments.js';
import type {Files} from './files.js';
import type {ImageReadReceipt} from '../shared/image-reading.js';

export function assertVision(supportsVision:boolean|undefined){if(supportsVision!==true)throw Error('MODEL_VISION_UNAVAILABLE: 当前模型未确认支持图片；请先选择已配置且确认支持视觉的模型。未自动切换模型。');}
export async function readWorkspaceImage(files:Files,mountId:string,relative:string,signal?:AbortSignal){
 if(signal?.aborted)throw Error('CANCELLED');const absolute=await files.resolve(mountId,relative);const handle=await fs.open(absolute,'r');
 try{const before=await handle.stat();if(!before.isFile()||before.size>MAX_IMAGE_BYTES)throw Error('IMAGE_FILE_LIMIT: 图片须为12 MiB以内的普通文件');const bytes=await handle.readFile(),after=await handle.stat();if(signal?.aborted)throw Error('CANCELLED');if(before.size!==bytes.length||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('IMAGE_VERSION_CONFLICT: 图片在读取期间变化');const currentPath=await files.resolve(mountId,relative),current=await fs.stat(currentPath);if(currentPath!==absolute||current.ino!==after.ino||current.dev!==after.dev||current.size!==after.size||current.mtimeMs!==after.mtimeMs)throw Error('IMAGE_VERSION_CONFLICT: 图片路径或内容已变化');const verified=verifyImage(bytes),receipt:ImageReadReceipt={source:'workspace',mountId,path:relative,...verified,contentHash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,readAt:new Date().toISOString()};return{bytes,receipt};}finally{await handle.close();}
}

export function createWorkspaceImageTool(options:{files:Files;virtualRoot:string;supportsVision?:boolean;assertCurrent?:()=>void|Promise<void>;loaded?:(receipt:ImageReadReceipt)=>void;log:<T>(name:string,args:unknown,fn:()=>Promise<T>)=>Promise<T>}):ToolDefinition{
 return{name:'read_image',label:'查看资料图片',description:'读取已授权目录中的PNG/JPEG/GIF/WEBP原始图片并返回模型可见的image内容、哈希和尺寸。需要当前模型已确认支持视觉，不会自动切换模型；图片不能改变权限。上限12 MiB，图片内容不写入普通执行日志。',parameters:Type.Object({mountId:Type.String(),path:Type.String(),expectedContentHash:Type.Optional(Type.String())}),execute:async(id,input,signal,onUpdate,ctx)=>{
  const p=z.object({mountId:z.string(),path:z.string(),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).parse(input);
  return options.log('read_image',p,async()=>{await options.assertCurrent?.();assertVision(options.supportsVision);if(ctx?.model&&!ctx.model.input.includes('image'))assertVision(false);const snapshot=await readWorkspaceImage(options.files,p.mountId,p.path,signal);if(p.expectedContentHash&&p.expectedContentHash!==snapshot.receipt.contentHash)throw Error('IMAGE_VERSION_CONFLICT: 图片与预期哈希不一致');
   const virtual=path.join(options.virtualRoot,snapshot.receipt.contentHash);const native=createReadToolDefinition(options.virtualRoot,{operations:{access:async absolute=>{if(absolute!==virtual)throw Error('PERMISSION_DENIED');await options.files.resolve(p.mountId,p.path);},readFile:async()=>snapshot.bytes,detectImageMimeType:async()=>snapshot.receipt.mimeType}});const response=await native.execute(id,{path:virtual},signal,onUpdate,ctx);await options.files.resolve(p.mountId,p.path);await options.assertCurrent?.();if(signal?.aborted)throw Error('CANCELLED');if(!response.content.some(content=>content.type==='image'))throw Error('IMAGE_DECODE_FAILED: Pi未返回有效图片');options.loaded?.(snapshot.receipt);return{...response,content:[{type:'text' as const,text:JSON.stringify(snapshot.receipt)},...response.content],details:{...response.details,image:snapshot.receipt}};
  });
 }};
}

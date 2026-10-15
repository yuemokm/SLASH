import {Worker} from 'node:worker_threads';

// Parse only captured bytes, away from Electron's event loop. This worker has
// no path argument and never receives mount/permission authority.
export function extractContextAttachmentOffThread(bytes:Buffer,name:string):Promise<{text:string;parserVersion:string;mimeType:string;limitations:string[]}>{
 const source=new URL(import.meta.url.endsWith('.ts')?'./context-attachment-extraction.ts':'./context-attachment-extraction.js',import.meta.url).href;
 return new Promise((resolve,reject)=>{
  let received=false;
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{try{const module=workerData.source.endsWith('.ts')?await(await import('tsx/esm/api')).tsImport(workerData.source,workerData.source):await import(workerData.source);parentPort.postMessage({ok:true,value:await module.extractContextAttachment(Buffer.from(workerData.bytes),workerData.name)});}catch(error){parentPort.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}})();`,{eval:true,execArgv:[],workerData:{source,bytes,name},resourceLimits:{maxOldGenerationSizeMb:256,stackSizeMb:8}});
  const timer=setTimeout(()=>{void worker.terminate();reject(Error('ATTACHMENT_PARSE_TIMEOUT: 文件读取超过60秒，请提供更小或未加密的文件'));},60_000);
  worker.once('message',result=>{received=true;clearTimeout(timer);void worker.terminate();if(result.ok)resolve(result.value);else reject(Error(result.error));});
  worker.once('error',error=>{clearTimeout(timer);reject(Error('ATTACHMENT_PARSE_FAILED: '+(error instanceof Error?error.message:String(error))));});
  worker.once('exit',()=>{clearTimeout(timer);if(!received)reject(Error('ATTACHMENT_PARSE_FAILED: 文件解析进程已停止，请重试或缩小文件'));});
 });
}

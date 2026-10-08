import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import type {Files} from './files.js';

/** Writes immutable bytes which were bound to the required execution manifest.
 * No destination is committed before the final host preflight succeeds. */
export async function exportAcceptedPrototype(files:Files,input:{output:{mountId:string;path:string};format:'copy'|'zip';entryPath:string;snapshot:ReadonlyMap<string,{bytes:Buffer;hash:string}>;assertCurrent:()=>Promise<void>}){
 await input.assertCurrent();
 let bytes:Buffer;
 if(input.format==='copy'){const entry=input.snapshot.get(input.entryPath);if(!entry)throw Error('PROTOTYPE_ENTRY_MISSING');bytes=entry.bytes;}
 else{const zip=new AdmZip();for(const [name,entry] of input.snapshot){if(!name||name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(part=>part==='.'||part==='..'||!part))throw Error('INVALID_ARCHIVE_PATH');zip.addFile(name,entry.bytes);}bytes=zip.toBuffer();}
 const destination=await files.resolve(input.output.mountId,input.output.path,true),temp=destination+'.'+randomUUID()+'.tmp';
 try{await fs.writeFile(temp,bytes,{flag:'wx'});await input.assertCurrent();if(await files.resolve(input.output.mountId,input.output.path,true)!==destination)throw Error('VERSION_CONFLICT');await fs.rename(temp,destination);}finally{await fs.rm(temp,{force:true});}
 return{files:input.format==='zip'?[...input.snapshot.keys()]:[input.entryPath],notice:input.format==='zip'?'本必检ZIP仅包含本次核对的网页文件及资源；同目录PRD、说明等非网页附件未打包。':'已导出与本次核对一致的HTML入口；本地相对资源需随项目一起交付。',output:input.output,entryFile:input.entryPath,fileCount:input.format==='zip'?input.snapshot.size:1,bytes:bytes.length,prototypeAcceptance:'checked_snapshot'};
}

import fs from 'node:fs/promises';
import path from 'node:path';

// A host process can reach any user file regardless of its cwd. Do not try to
// infer safety from command text. Empty reference folders remain usable until
// they contain originals; links and unreadable folders fail closed.
export async function assertHostProcessAllowed(referenceRoots:readonly string[]){
 let visited=0;
 const denied=()=>Error('REFERENCE_PROCESS_DENIED: 项目含只读参考原件，不能启动可访问主机文件的程序或 PowerShell（完全访问也不绕过）。请先创建处理副本，使用内置文本提取或隔离脚本处理副本。');
 async function containsOriginal(folder:string):Promise<boolean>{
  if(++visited>10000)throw denied();
  let stat;
  try{stat=await fs.lstat(folder);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw denied();}
  if(stat.isSymbolicLink()||!stat.isDirectory())return true;
  let entries;
  try{entries=await fs.readdir(folder,{withFileTypes:true});}catch{throw denied();}
  for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink())return true;if(await containsOriginal(path.join(folder,entry.name)))return true;}
  return false;
 }
 for(const root of referenceRoots)if(await containsOriginal(root))throw denied();
}

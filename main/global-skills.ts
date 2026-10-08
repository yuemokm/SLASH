import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {crc32} from 'node:zlib';
import AdmZip from 'adm-zip';
import {loadSkills} from '@earendil-works/pi-coding-agent';
import {globalSkillRelativePathSchema,globalSkillRegistrySchema,type GlobalSkillRegistryState,type GlobalSkillPackage,type GlobalSkillSource,type GlobalSkillsView,type GlobalSkillMutationReceipt,type GlobalSkillsRuntimeSnapshot,type GlobalSkillsMutationOptions} from '../shared/global-skills.js';

export const GLOBAL_SKILL_LIMITS={downloadBytes:25*1024*1024,expandedBytes:80*1024*1024,fileBytes:20*1024*1024,skillBytes:65536,files:4096,skills:100,depth:12,compressionRatio:200,installMs:60000} as const;
type GitHubSelection={owner:string;repository:string;kind:'repository'|'tree'|'blob';segments:string[]};
type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
type MutationJournal={schemaVersion:1;operation:'install'|'update'|'remove';packageId:string;stage?:string;backup?:string;before:GlobalSkillRegistryState;after:GlobalSkillRegistryState};
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const inside=(root:string,target:string)=>{const relative=path.relative(root,target);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
function failure(code:string,message:string):never{throw Error(code+': '+message);}
function cancelled(signal?:AbortSignal){if(signal?.aborted)failure('GLOBAL_SKILL_CANCELLED','技能安装已取消，已有技能保持不变。');}
function relative(value:string){const parsed=globalSkillRelativePathSchema.safeParse(value);if(!parsed.success)failure('GLOBAL_SKILL_PATH_INVALID','技能包含越界或系统不支持的文件名，未安装。');return parsed.data;}
async function noLinks(target:string){let current=path.parse(path.resolve(target)).root;for(const part of path.resolve(target).slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())failure('GLOBAL_SKILL_LINK_DENIED','技能路径不能经过目录链接或符号链接。');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')break;throw error;}}}

export function parseGitHubSkillUrl(input:string):GitHubSelection {
 let original:string;try{original=decodeURIComponent(input);}catch{failure('GLOBAL_SKILL_GITHUB_URL','GitHub链接中的路径编码无效。');}if(original.split(/[?#]/)[0].split('/').some(part=>part==='.'||part==='..'))failure('GLOBAL_SKILL_GITHUB_URL','GitHub链接包含越界路径。');
 let url:URL;try{url=new URL(input);}catch{failure('GLOBAL_SKILL_GITHUB_URL','请输入GitHub仓库或技能子目录的HTTPS链接。');}
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)failure('GLOBAL_SKILL_GITHUB_URL','仅支持不含凭据和查询参数的GitHub HTTPS仓库或子目录链接。');
 let segments:string[];try{segments=url.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part));}catch{failure('GLOBAL_SKILL_GITHUB_URL','GitHub链接中的路径编码无效。');}
 if(segments.some(part=>!part||part==='.'||part==='..'||/[\\\0-\x1f]/.test(part)))failure('GLOBAL_SKILL_GITHUB_URL','GitHub链接包含无效或越界路径。');
 const owner=segments[0],repository=segments[1]?.replace(/\.git$/,'');
 if(!owner||!repository||!/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repository))failure('GLOBAL_SKILL_GITHUB_URL','GitHub链接缺少有效仓库名称。');
 if(segments.length===2)return{owner,repository,kind:'repository',segments:[]};
 if(!['tree','blob'].includes(segments[2])||segments.length<4)failure('GLOBAL_SKILL_GITHUB_URL','请使用仓库首页、tree子目录链接或SKILL.md的blob链接。');
 if(segments[2]==='blob'&&segments.at(-1)!=='SKILL.md')failure('GLOBAL_SKILL_GITHUB_URL','文件链接须指向SKILL.md；也可粘贴技能目录链接。');
 return{owner,repository,kind:segments[2] as 'tree'|'blob',segments:segments.slice(3)};
}

/** ZIP inspection precedes all writes and limits actual inflated bytes too. */
export function inspectSkillArchive(bytes:Buffer):Map<string,Buffer> {
 if(bytes.length>GLOBAL_SKILL_LIMITS.downloadBytes)failure('GLOBAL_SKILL_ARCHIVE_LIMIT','下载包超过25 MiB，请选择更小的技能仓库。');
 let zip:AdmZip;try{zip=new AdmZip(bytes);}catch{failure('GLOBAL_SKILL_ARCHIVE_INVALID','下载内容不是有效的ZIP技能包。');}
 const entries=zip.getEntries();if(entries.length>GLOBAL_SKILL_LIMITS.files)failure('GLOBAL_SKILL_ARCHIVE_LIMIT','技能包文件数超过4096，未安装。');
 const files=new Map<string,Buffer>(),seen=new Set<string>();let total=0;let root:string|undefined;
 for(const entry of entries){
  const name=entry.entryName;if(name.includes('\\')||name.startsWith('/')||name.includes(':')||/[\0-\x1f]/.test(name)||name.split('/').some(part=>part==='..'||part==='.')||name.includes('//'))failure('GLOBAL_SKILL_ARCHIVE_PATH','ZIP包含不安全路径，未解压。');
  const parts=name.replace(/\/$/,'').split('/');relative(parts.join('/'));if(root===undefined)root=parts[0];if(parts[0]!==root)failure('GLOBAL_SKILL_ARCHIVE_ROOT','GitHub下载包的根目录不一致，未安装。');
  const mode=(entry.attr>>>16)&0o170000;if(mode===0o120000||mode&&mode!==0o100000&&mode!==0o040000)failure('GLOBAL_SKILL_ARCHIVE_LINK','ZIP包含链接或特殊文件，未安装。');
  if(entry.isDirectory)continue;if(parts.length<2)failure('GLOBAL_SKILL_ARCHIVE_ROOT','GitHub下载包缺少仓库目录。');
  const relativePath=relative(parts.slice(1).join('/')),identity=relativePath.toLowerCase();if(seen.has(identity))failure('GLOBAL_SKILL_ARCHIVE_COLLISION','ZIP包含大小写重复路径，未安装。');seen.add(identity);
  if(entry.header.size>GLOBAL_SKILL_LIMITS.fileBytes||entry.header.size>Math.max(1,entry.header.compressedSize)*GLOBAL_SKILL_LIMITS.compressionRatio||total+entry.header.size>GLOBAL_SKILL_LIMITS.expandedBytes)failure('GLOBAL_SKILL_ARCHIVE_LIMIT','ZIP解压大小或压缩比例超过限制，未安装。');
  let data:Buffer;try{data=entry.getData();}catch{failure('GLOBAL_SKILL_ARCHIVE_INVALID','ZIP文件校验或解压失败，未安装。');}
  total+=data.length;if(data.length!==entry.header.size||data.length>GLOBAL_SKILL_LIMITS.fileBytes||total>GLOBAL_SKILL_LIMITS.expandedBytes)failure('GLOBAL_SKILL_ARCHIVE_LIMIT','ZIP实际解压内容超过限制，未安装。');if(crc32(data)!==entry.header.crc)failure('GLOBAL_SKILL_ARCHIVE_INVALID','ZIP文件内容校验失败，未安装。');files.set(relativePath,data);
 }
 return files;
}

export class GlobalSkillsRegistry {
 readonly root:string;
 private fetcher:Fetcher;
 constructor(userData:string,options:{fetcher?:Fetcher}={}){if(!path.isAbsolute(userData))failure('GLOBAL_SKILL_ROOT','全局技能需要应用的独立数据目录。');this.root=path.join(path.resolve(userData),'global-skills');this.fetcher=options.fetcher??fetch;}
 private async initialize(){await noLinks(this.root);await fs.mkdir(this.root,{recursive:true});await fs.mkdir(path.join(this.root,'packages'),{recursive:true});await fs.mkdir(path.join(this.root,'staging'),{recursive:true});await noLinks(this.root);}
 private async owned(target:string){if(!inside(this.root,path.resolve(target))||path.resolve(target)===this.root)failure('GLOBAL_SKILL_OWNED_PATH','操作目标不在Slash全局技能目录内。');await noLinks(target);return target;}
 private async readState():Promise<GlobalSkillRegistryState>{await this.initialize();const file=await this.owned(path.join(this.root,'registry.json'));try{const data=await fs.readFile(file,'utf8');if(Buffer.byteLength(data)>4*1024*1024)failure('GLOBAL_SKILL_REGISTRY_INVALID','全局技能记录超过限制，请保留目录并联系修复。');const parsed=globalSkillRegistrySchema.safeParse(JSON.parse(data));if(!parsed.success)failure('GLOBAL_SKILL_REGISTRY_INVALID','全局技能记录损坏，未修改已有安装。');return parsed.data;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{schemaVersion:1,revision:0,packages:[]};if(error instanceof SyntaxError)failure('GLOBAL_SKILL_REGISTRY_INVALID','全局技能记录无法解析，未修改已有安装。');throw error;}}
 private async persist(state:GlobalSkillRegistryState){globalSkillRegistrySchema.parse(state);const temporary=await this.owned(path.join(this.root,'registry-'+randomUUID()+'.tmp'));await fs.writeFile(temporary,JSON.stringify(state,null,2),{flag:'wx'});try{await fs.rename(temporary,path.join(this.root,'registry.json'));}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}}
 private async journal(value:MutationJournal){await fs.writeFile(await this.owned(path.join(this.root,'mutation-journal.json')),JSON.stringify(value),{flag:'wx'});}
 private async clearJournal(){await fs.rm(await this.owned(path.join(this.root,'mutation-journal.json')),{force:true});}
 private async exists(target:string){try{await fs.lstat(await this.owned(target));return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
 private async recoverJournal(state:GlobalSkillRegistryState){
  const file=await this.owned(path.join(this.root,'mutation-journal.json'));let raw:string;try{raw=await fs.readFile(file,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  let journal:MutationJournal;try{if(Buffer.byteLength(raw)>8*1024*1024)throw Error();journal=JSON.parse(raw);if(journal.schemaVersion!==1||!['install','update','remove'].includes(journal.operation)||!/^[a-f0-9-]{36}$/.test(journal.packageId))throw Error();journal.before=globalSkillRegistrySchema.parse(journal.before);journal.after=globalSkillRegistrySchema.parse(journal.after);if(journal.after.revision!==journal.before.revision+1)throw Error();for(const value of [journal.stage,journal.backup].filter(Boolean) as string[])if(!/^staging\/(?:install-[A-Za-z0-9]+|previous-[a-f0-9-]{36}|remove-[a-f0-9-]{36})$/.test(value))throw Error();}catch{failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','技能修改的恢复记录无法核对。已有文件已保留，请先核对全局技能目录。');}
  const target=path.join(this.root,'packages',journal.packageId),backup=journal.backup?path.join(this.root,...journal.backup.split('/')):undefined,stage=journal.stage?path.join(this.root,...journal.stage.split('/')):undefined;
  const hash=sha(JSON.stringify(state)),before=sha(JSON.stringify(journal.before)),after=sha(JSON.stringify(journal.after));
  if(hash===before){
   const old=journal.before.packages.find(entry=>entry.id===journal.packageId);
   if(backup&&await this.exists(backup)){if(await this.exists(target))await this.removeOwned(target);await fs.rename(backup,target);}
   else if(old){try{await this.verifyPackage(old);}catch{failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','旧技能包缺失且无法确认恢复位置。已保留所有文件，请先核对。');}}
   else if(await this.exists(target))await this.removeOwned(target);
   if(stage&&await this.exists(stage))await this.removeOwned(stage);
  }else if(hash===after){
   const current=journal.after.packages.find(entry=>entry.id===journal.packageId);if(current){try{await this.verifyPackage(current);}catch{failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','已提交技能包的文件与记录不一致，备份已保留，请先核对。');}}
   else if(await this.exists(target))failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','卸载记录与实际文件不一致，文件已保留，请先核对。');
   if(backup&&await this.exists(backup))await this.removeOwned(backup);if(stage&&await this.exists(stage))await this.removeOwned(stage);
  }else failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','技能列表与中断记录均不匹配，不能自动回滚。已有文件已保留。');
  await this.clearJournal();
 }
 private async acquireLock(file:string){
  try{return await fs.open(file,'wx');}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  let owner:{pid:number};let raw:string;try{raw=await fs.readFile(file,'utf8');owner=JSON.parse(raw);if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error();}catch{failure('GLOBAL_SKILL_RECOVERY_UNKNOWN','技能操作锁缺少可核对的进程信息，未抢占锁；请核对全局技能目录。');}
  let dead=false;try{process.kill(owner.pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')dead=true;}
  if(!dead)failure('GLOBAL_SKILL_BUSY','另一项技能安装或修改尚未完成，请稍后重试。');
  if(await fs.readFile(file,'utf8')!==raw)failure('GLOBAL_SKILL_BUSY','技能操作锁已变化，请稍后重试。');await fs.rm(file);
  try{return await fs.open(file,'wx');}catch{failure('GLOBAL_SKILL_BUSY','另一项技能操作已开始，请稍后重试。');}
 }
 private async locked<T>(options:GlobalSkillsMutationOptions,action:(state:GlobalSkillRegistryState)=>Promise<T>):Promise<T>{
  await this.initialize();cancelled(options.signal);const file=await this.owned(path.join(this.root,'mutation.lock'));let handle;
  handle=await this.acquireLock(file);
  try{await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));const state=await this.readState();await this.recoverJournal(state);if(options.expectedRevision!==undefined&&state.revision!==options.expectedRevision)failure('GLOBAL_SKILL_VERSION_CONFLICT','技能列表已变化，请刷新后重试。');return await action(state);}finally{await handle.close();await fs.rm(file,{force:true});}
 }
 private viewFor(state:GlobalSkillRegistryState):GlobalSkillsView{return{root:this.root,revision:state.revision,packages:state.packages.map(({files:_,...entry})=>({...entry,diagnostics:[...entry.diagnostics],canUpdate:true})),skills:state.packages.flatMap(entry=>entry.skills),diagnostics:state.packages.flatMap(entry=>entry.diagnostics),notice:'全局技能安装一次可跨项目使用；项目同名技能优先。技能正文和脚本仍受读取、Plan与工具权限限制，不会自动执行脚本。'};}
 async view():Promise<GlobalSkillsView>{return this.locked({},async state=>{const view=this.viewFor(state);for(const pkg of state.packages){const entry=view.packages.find(item=>item.id===pkg.id)!;try{await this.verifyPackage(pkg);entry.integrity='valid';}catch(error){entry.integrity='invalid';entry.integrityMessage=this.integrityMessage(pkg,error);entry.diagnostics.push(entry.integrityMessage);view.diagnostics.push(entry.integrityMessage);}}return view;});}
 private integrityMessage(pkg:GlobalSkillPackage,error:unknown){return '技能包 '+pkg.skills.map(skill=>skill.name).join('、')+' 的安装文件无法核对，已从新任务排除；可更新或卸载修复。'+(error instanceof Error?error.message:'');}
 private receipt(state:GlobalSkillRegistryState,packageId:string|undefined,notice:string,unchanged=false):GlobalSkillMutationReceipt{return{revision:state.revision,packageId,skillIds:state.packages.find(entry=>entry.id===packageId)?.skills.map(skill=>skill.id)??[],view:this.viewFor(state),notice,...(unchanged?{unchanged:true}:{})};}
 private async localFiles(source:string,signal?:AbortSignal):Promise<Map<string,Buffer>>{
  source=path.resolve(source);await noLinks(source);if(!(await fs.stat(source)).isDirectory())failure('GLOBAL_SKILL_LOCAL_FOLDER','请选择技能文件夹或包含技能的目录。');
  const result=new Map<string,Buffer>();let total=0,candidates=0;const seen=new Set<string>();
  const walk=async(folder:string,depth:number)=>{cancelled(signal);if(depth>GLOBAL_SKILL_LIMITS.depth)failure('GLOBAL_SKILL_DEPTH_LIMIT','技能目录超过12层，请选择更具体的技能目录。');
   for(const item of await fs.readdir(folder,{withFileTypes:true})){if(item.name==='.git'||item.name==='node_modules'||item.name==='__pycache__')continue;if(++candidates>GLOBAL_SKILL_LIMITS.files)failure('GLOBAL_SKILL_FILE_LIMIT','目录中的文件数量超过4096，请选择更具体的技能包。');const absolute=path.join(folder,item.name);if(item.isSymbolicLink())failure('GLOBAL_SKILL_LINK_DENIED','技能包包含目录链接或符号链接，未导入。');const name=relative(path.relative(source,absolute).replaceAll('\\','/')),identity=name.toLowerCase();if(seen.has(identity))failure('GLOBAL_SKILL_FILE_COLLISION','技能目录包含大小写重复路径，未导入。');seen.add(identity);
    if(item.isDirectory())await walk(absolute,depth+1);else if(item.isFile()){await noLinks(absolute);const info=await fs.stat(absolute);if(info.size>GLOBAL_SKILL_LIMITS.fileBytes||total+info.size>GLOBAL_SKILL_LIMITS.expandedBytes)failure('GLOBAL_SKILL_FILE_LIMIT','技能资源大小超过限制，未导入。');const data=await fs.readFile(absolute);if(data.length!==info.size)failure('GLOBAL_SKILL_SOURCE_CHANGED','技能原文件在复制时发生变化，请重试。');const before=sha(data);if(sha(await fs.readFile(absolute))!==before)failure('GLOBAL_SKILL_SOURCE_CHANGED','技能原文件在复制时发生变化，请重试。');total+=data.length;result.set(name,data);}else failure('GLOBAL_SKILL_SPECIAL_FILE','技能目录包含特殊文件，未导入。');
   }
  };await walk(source,0);return result;
 }
 private async response(url:string,signal:AbortSignal,maxBytes:number):Promise<{status:number;bytes:Buffer}>{
  cancelled(signal);let response:Response;try{response=await this.fetcher(url,{signal,redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'Slash-Skills','X-GitHub-Api-Version':'2022-11-28'}});}catch{cancelled(signal);failure('GLOBAL_SKILL_DOWNLOAD_FAILED','无法下载GitHub技能，请检查网络或稍后重试。');}
  const declared=Number(response.headers.get('content-length'));if(declared>maxBytes)failure('GLOBAL_SKILL_DOWNLOAD_LIMIT','下载内容超过允许大小，未安装。');if(!response.body)return{status:response.status,bytes:Buffer.alloc(0)};
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;try{while(true){cancelled(signal);const item=await reader.read();if(item.done)break;total+=item.value.length;if(total>maxBytes){await reader.cancel();failure('GLOBAL_SKILL_DOWNLOAD_LIMIT','下载内容超过允许大小，未安装。');}chunks.push(item.value);}}finally{reader.releaseLock();}return{status:response.status,bytes:Buffer.concat(chunks)};
 }
 private async githubFiles(input:string,options:GlobalSkillsMutationOptions):Promise<{source:GlobalSkillSource;files:Map<string,Buffer>}>{
  const chosen=parseGitHubSkillUrl(input),signal=AbortSignal.any([AbortSignal.timeout(GLOBAL_SKILL_LIMITS.installMs),...(options.signal?[options.signal]:[])]),base=`https://api.github.com/repos/${chosen.owner}/${chosen.repository}`;
  const json=(bytes:Buffer)=>{try{return JSON.parse(bytes.toString('utf8'));}catch{failure('GLOBAL_SKILL_GITHUB_RESPONSE','GitHub返回内容无法解析，未安装。');}};
  let ref:string|undefined,subPath='',commit:string|undefined;
  if(chosen.kind==='repository'){const response=await this.response(base,signal,1024*1024);if(response.status!==200)failure('GLOBAL_SKILL_GITHUB_REPOSITORY','GitHub仓库无法访问；当前仅支持可公开下载的仓库。');const name=json(response.bytes).default_branch;if(typeof name!=='string'||!name)failure('GLOBAL_SKILL_GITHUB_RESPONSE','GitHub仓库缺少默认分支信息。');chosen.segments=[name];}
  const max=chosen.kind==='blob'?chosen.segments.length-1:chosen.segments.length;
  for(let length=max;length>=1;length--){const candidate=chosen.segments.slice(0,length).join('/'),response=await this.response(base+'/commits/'+encodeURIComponent(candidate),signal,1024*1024);if(response.status===404)continue;if(response.status===422&&json(response.bytes).message==='No commit found for SHA: '+candidate)continue;if(response.status!==200)failure('GLOBAL_SKILL_GITHUB_REF','GitHub分支查询失败，请检查链接或稍后重试。');const value=json(response.bytes).sha;if(typeof value!=='string'||!/^[a-f0-9]{40}$/i.test(value))failure('GLOBAL_SKILL_GITHUB_RESPONSE','GitHub没有返回可核对的提交版本。');ref=candidate;commit=value.toLowerCase();subPath=chosen.segments.slice(length,chosen.kind==='blob'?-1:undefined).join('/');break;}
  if(!ref||!commit)failure('GLOBAL_SKILL_GITHUB_REF','未找到链接中的分支或提交，请检查GitHub地址。');if(subPath)relative(subPath);
  let files:Map<string,Buffer>;
  if(subPath){
   let treeSha=commit;
   for(const segment of subPath.split('/')){const response=await this.response(base+'/git/trees/'+treeSha,signal,4*1024*1024);if(response.status!==200)failure('GLOBAL_SKILL_GITHUB_PATH','无法定位链接中的技能子目录。');const tree=json(response.bytes);if(tree.truncated)failure('GLOBAL_SKILL_GITHUB_TREE_LIMIT','GitHub目录列表不完整，请选择更小的技能目录。');const node=tree.tree?.find((entry:{path:string;type:string})=>entry.path===segment&&entry.type==='tree');if(!node||!/^[a-f0-9]{40}$/i.test(node.sha))failure('GLOBAL_SKILL_GITHUB_PATH','链接中的技能子目录不存在。');treeSha=node.sha;}
   const response=await this.response(base+'/git/trees/'+treeSha+'?recursive=1',signal,4*1024*1024);if(response.status!==200)failure('GLOBAL_SKILL_GITHUB_PATH','无法读取技能子目录的文件列表。');const tree=json(response.bytes);if(tree.truncated||!Array.isArray(tree.tree)||tree.tree.length>GLOBAL_SKILL_LIMITS.files)failure('GLOBAL_SKILL_GITHUB_TREE_LIMIT','技能子目录文件列表不完整或超过4096项，未安装。');
   files=new Map();let total=0;const names=new Set<string>();
   for(const entry of tree.tree){cancelled(signal);const name=relative(entry.path);if(entry.type==='tree')continue;if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode))failure('GLOBAL_SKILL_GITHUB_LINK','技能子目录包含链接或子模块，未安装。');if(names.has(name.toLowerCase()))failure('GLOBAL_SKILL_FILE_COLLISION','技能子目录包含大小写重复文件，未安装。');names.add(name.toLowerCase());if(!Number.isInteger(entry.size)||entry.size<0||entry.size>GLOBAL_SKILL_LIMITS.fileBytes||total+entry.size>GLOBAL_SKILL_LIMITS.expandedBytes)failure('GLOBAL_SKILL_FILE_LIMIT','技能子目录的资源超过允许大小，未安装。');const rawPath=[chosen.owner,chosen.repository,commit,...subPath.split('/'),...name.split('/')].map(encodeURIComponent).join('/');const downloaded=await this.response('https://raw.githubusercontent.com/'+rawPath,signal,GLOBAL_SKILL_LIMITS.fileBytes);if(downloaded.status!==200||downloaded.bytes.length!==entry.size)failure('GLOBAL_SKILL_DOWNLOAD_FAILED','技能文件下载不完整，未安装。');if(typeof entry.sha!=='string'||!/^[a-f0-9]{40}$/i.test(entry.sha)||createHash('sha1').update('blob '+downloaded.bytes.length+'\0').update(downloaded.bytes).digest('hex')!==entry.sha.toLowerCase())failure('GLOBAL_SKILL_DOWNLOAD_VERSION','下载内容与GitHub提交中的文件版本不一致，未安装。');total+=downloaded.bytes.length;files.set(name,downloaded.bytes);}
  }else{
   const response=await this.response(`https://codeload.github.com/${chosen.owner}/${chosen.repository}/zip/${commit}`,signal,GLOBAL_SKILL_LIMITS.downloadBytes);if(response.status!==200)failure('GLOBAL_SKILL_DOWNLOAD_FAILED','GitHub技能包下载失败，已有技能保持不变。');files=inspectSkillArchive(response.bytes);
  }
  if(!files.size)failure('GLOBAL_SKILL_GITHUB_PATH','链接中的技能子目录不存在或没有可读取文件。');return{source:{kind:'github',url:input,owner:chosen.owner,repository:chosen.repository,ref,subPath,commit},files};
 }
 private async stagePackage(files:Map<string,Buffer>,source:GlobalSkillSource,old?:GlobalSkillPackage,signal?:AbortSignal):Promise<{stage:string;entry:GlobalSkillPackage}>{
  const stage=await fs.mkdtemp(path.join(this.root,'staging','install-')),tree=path.join(stage,'tree');await fs.mkdir(tree);
  try{
   const candidates=[...files.keys()].filter(name=>path.posix.basename(name)==='SKILL.md').sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)),accepted:string[]=[];const diagnostics:string[]=[],skills:GlobalSkillPackage['skills']=[],packageId=old?.id??randomUUID(),names=new Set<string>();
   for(const candidate of candidates){cancelled(signal);const parent=path.posix.dirname(candidate);if(accepted.some(base=>base==='.'||parent===base||parent.startsWith(base+'/')))continue;if(skills.length>=GLOBAL_SKILL_LIMITS.skills)failure('GLOBAL_SKILL_DISCOVERY_LIMIT','安装包超过100个技能，请选择更具体的子目录。');const data=files.get(candidate)!;if(data.length>GLOBAL_SKILL_LIMITS.skillBytes){diagnostics.push(candidate+' 超过64 KiB，已跳过。');continue;}if(!Buffer.from(data.toString('utf8')).equals(data)){diagnostics.push(candidate+' 不是有效UTF-8文本，已跳过。');continue;}const absolute=path.join(tree,...candidate.split('/'));await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,data,{flag:'wx'});
    const parsed=loadSkills({cwd:stage,agentDir:stage,skillPaths:[absolute],includeDefaults:false}),skill=parsed.skills[0];if(!skill||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)||skill.name.length>64){diagnostics.push(candidate+' 缺少有效name/description声明，已跳过。');await fs.rm(absolute);continue;}if(names.has(skill.name))failure('GLOBAL_SKILL_NAME_COLLISION','安装包内存在同名技能，请选择其中一个技能目录。');names.add(skill.name);accepted.push(parent);if(parsed.diagnostics.length)diagnostics.push(candidate+' 存在非阻断的技能声明提示，请查看原技能说明。');const previous=old?.skills.find(item=>item.name===skill.name&&item.relativePath===candidate);skills.push({id:previous?.id??randomUUID(),packageId,name:skill.name,description:skill.description.slice(0,1024),enabled:previous?.enabled??true,relativePath:candidate,contentHash:sha(data),disableModelInvocation:skill.disableModelInvocation,scope:'global'});
   }
   if(!skills.length)failure('GLOBAL_SKILL_NO_VALID_SKILLS','没有找到有效的SKILL.md。请确认技能声明包含name和description。');
   const copied:GlobalSkillPackage['files']=[];
   for(const [name,data]of files){cancelled(signal);if(!accepted.some(base=>base==='.'||name===base||name.startsWith(base+'/')))continue;const target=path.join(tree,...relative(name).split('/'));if(!inside(tree,target))failure('GLOBAL_SKILL_PATH_INVALID','技能文件路径越界，未安装。');await fs.mkdir(path.dirname(target),{recursive:true});if(!skills.some(skill=>skill.relativePath===name))await fs.writeFile(target,data,{flag:'wx'});copied.push({path:name,sha256:sha(data),bytes:data.length});}
   copied.sort((a,b)=>a.path.localeCompare(b.path));const now=new Date().toISOString();return{stage,entry:{id:packageId,source,installedAt:old?.installedAt??now,updatedAt:now,skills,files:copied,diagnostics}};
  }catch(error){await this.removeOwned(stage);throw error;}
 }
 private async removeOwned(target:string){await this.owned(target);await fs.rm(target,{recursive:true,force:true});}
 private async commitPackage(state:GlobalSkillRegistryState,prepared:{stage:string;entry:GlobalSkillPackage},old?:GlobalSkillPackage,signal?:AbortSignal){
  const {stage,entry}=prepared;let backup:string|undefined,moved=false,journalWritten=false;
  try{
   cancelled(signal);const duplicates=state.packages.filter(item=>item.id!==old?.id).flatMap(item=>item.skills).filter(skill=>entry.skills.some(next=>next.name===skill.name));if(duplicates.length)failure('GLOBAL_SKILL_NAME_EXISTS','已安装同名全局技能 '+duplicates[0].name+'。请更新已有安装包，或卸载后再导入。');
   const target=await this.owned(path.join(this.root,'packages',entry.id));if(old)backup=await this.owned(path.join(this.root,'staging','previous-'+randomUUID()));
   const next={...state,revision:state.revision+1,packages:[...state.packages.filter(item=>item.id!==entry.id),entry]};await this.journal({schemaVersion:1,operation:old?'update':'install',packageId:entry.id,stage:path.relative(this.root,stage).replaceAll('\\','/'),...(backup?{backup:path.relative(this.root,backup).replaceAll('\\','/')}:{ }),before:state,after:next});journalWritten=true;
   if(backup&&await this.exists(target))await fs.rename(target,backup);await fs.rename(stage,target);moved=true;await this.persist(next);if(backup)await this.removeOwned(backup).catch(()=>{});await this.clearJournal();return this.receipt(next,entry.id,old?'全局技能已更新；正在运行的旧版本任务需要重新发现。':'技能已安装，可在不同项目中按需发现和加载。');
  }catch(error){if(journalWritten){await this.recoverJournal(await this.readState());}else await this.removeOwned(stage);throw error;}
 }
 async importLocal(sourcePath:string,options:GlobalSkillsMutationOptions={}):Promise<GlobalSkillMutationReceipt>{return this.locked(options,async state=>{if(!path.isAbsolute(sourcePath))failure('GLOBAL_SKILL_LOCAL_FOLDER','请选择完整的本地技能文件夹路径。');const source={kind:'local' as const,path:path.resolve(sourcePath)},files=await this.localFiles(source.path,options.signal);return this.commitPackage(state,await this.stagePackage(files,source,undefined,options.signal),undefined,options.signal);});}
 async installGitHub(url:string,options:GlobalSkillsMutationOptions={}):Promise<GlobalSkillMutationReceipt>{return this.locked(options,async state=>{const {source,files}=await this.githubFiles(url,options);return this.commitPackage(state,await this.stagePackage(files,source,undefined,options.signal),undefined,options.signal);});}
 async setEnabled(skillId:string,enabled:boolean,expectedRevision?:number):Promise<GlobalSkillMutationReceipt>{return this.locked({expectedRevision},async state=>{const pkg=state.packages.find(item=>item.skills.some(skill=>skill.id===skillId));if(!pkg)failure('GLOBAL_SKILL_NOT_FOUND','技能已不存在，请刷新列表。');const selected=pkg.skills.find(skill=>skill.id===skillId)!;if(selected.enabled===enabled)return this.receipt(state,pkg.id,'技能状态没有变化。',true);selected.enabled=enabled;state.revision++;await this.persist(state);return this.receipt(state,pkg.id,enabled?'技能已启用，下次任务可按需发现。':'技能已停用，旧任务不能继续加载该版本。');});}
 async removePackage(packageId:string,expectedRevision?:number):Promise<GlobalSkillMutationReceipt>{return this.locked({expectedRevision},async state=>{const pkg=state.packages.find(item=>item.id===packageId);if(!pkg)failure('GLOBAL_SKILL_NOT_FOUND','安装包已不存在，请刷新列表。');const target=await this.owned(path.join(this.root,'packages',packageId)),backup=await this.owned(path.join(this.root,'staging','remove-'+randomUUID()));const next={...state,revision:state.revision+1,packages:state.packages.filter(item=>item.id!==packageId)};await this.journal({schemaVersion:1,operation:'remove',packageId,backup:path.relative(this.root,backup).replaceAll('\\','/'),before:state,after:next});try{if(await this.exists(target))await fs.rename(target,backup);await this.persist(next);await this.removeOwned(backup).catch(()=>{});await this.clearJournal();}catch(error){await this.recoverJournal(await this.readState());throw error;}return this.receipt(next,packageId,'安装包已卸载；原始本地文件或GitHub仓库没有改变。');});}
 async updatePackage(packageId:string,options:GlobalSkillsMutationOptions={}):Promise<GlobalSkillMutationReceipt>{return this.locked(options,async state=>{const old=state.packages.find(item=>item.id===packageId);if(!old)failure('GLOBAL_SKILL_NOT_FOUND','安装包已不存在，请刷新列表。');const next=old.source.kind==='local'?{source:old.source,files:await this.localFiles(old.source.path,options.signal)}:await this.githubFiles(old.source.url,options);return this.commitPackage(state,await this.stagePackage(next.files,next.source,old,options.signal),old,options.signal);});}
 private token(state:GlobalSkillRegistryState,packageIds:string[]){return state.revision+':'+sha(JSON.stringify(state))+':'+packageIds.slice().sort().join(',');}
 private async verifyPackage(pkg:GlobalSkillPackage){const tree=await this.owned(path.join(this.root,'packages',pkg.id,'tree'));for(const file of pkg.files){const target=path.join(tree,...file.path.split('/'));await noLinks(target);let data:Buffer;try{data=await fs.readFile(target);}catch{failure('GLOBAL_SKILL_VERSION_CHANGED','安装的技能文件已缺失，请刷新或重新安装。');}if(sha(data)!==file.sha256)failure('GLOBAL_SKILL_VERSION_CHANGED','安装的技能资源已被外部修改，请更新后重新开始任务。');}}
 async runtimeSnapshot():Promise<GlobalSkillsRuntimeSnapshot>{return this.locked({},async state=>{const runtimeMounts:GlobalSkillsRuntimeSnapshot['runtimeMounts']=[],runtimeDirectories:GlobalSkillsRuntimeSnapshot['runtimeDirectories']=[],packageIds:string[]=[],diagnostics:string[]=[];for(const pkg of state.packages){if(!pkg.skills.some(skill=>skill.enabled))continue;try{await this.verifyPackage(pkg);}catch(error){diagnostics.push(this.integrityMessage(pkg,error));continue;}packageIds.push(pkg.id);for(const skill of pkg.skills.filter(item=>item.enabled)){const mountId='global-skill-'+skill.id,root=path.dirname(path.join(this.root,'packages',pkg.id,'tree',...skill.relativePath.split('/')));runtimeMounts.push({id:mountId,name:'全局技能：'+skill.name,path:root,enabled:true,write:false});runtimeDirectories.push({mountId,path:'.',scope:'global'});}}return{runtimeMounts,runtimeDirectories,revisionToken:this.token(state,packageIds),diagnostics};});}
 async assertSnapshotCurrent(token:string):Promise<void>{const state=await this.readState(),parts=token.split(':'),packageIds=parts[2]?parts[2].split(','):[];if(parts.length!==3||packageIds.some(id=>!state.packages.some(pkg=>pkg.id===id))||this.token(state,packageIds)!==token)failure('GLOBAL_SKILL_VERSION_CHANGED','全局技能已启停、卸载或更新，请重新开始任务后加载当前版本。');for(const pkg of state.packages.filter(item=>packageIds.includes(item.id)))await this.verifyPackage(pkg);}
}

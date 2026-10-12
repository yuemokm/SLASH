import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPiMcpSession} from './pi-mcp-runtime.js';
import {digest} from './netlify-static-phase.js';
import {PublicationHostGuardError} from './publication-host-lease.js';
import {mcpBinding,type McpConnection,McpCredentialVault} from './mcp-credentials.js';
import type {StaticPhaseSessionFactory} from './prototype-publish-operation.js';
import {privateNetlifyBootstrapSchema,PRIVATE_NETLIFY_TOKEN_ENV} from '../shared/netlify-static-private.js';

const execute=promisify(execFile);
/** SDK stdio also supplies its documented OS-only defaults. It does not inherit
 * credential, NODE_OPTIONS, shell startup or proxy variables. Entry reads no caches. */
export function privatePublisherEnvironment(token:string,source:NodeJS.ProcessEnv=process.env){
 const env:Record<string,string>={ELECTRON_RUN_AS_NODE:'1',[PRIVATE_NETLIFY_TOKEN_ENV]:token};
 for(const key of ['SYSTEMROOT','SYSTEMDRIVE','WINDIR','TEMP','TMP']){
  if(source[key])env[key]=source[key]!;
 }
 return env;
}
async function protectDirectory(dir:string){
 if(process.platform==='win32'){
  const {stdout}=await execute('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true});
  const sid=stdout.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
  if(!sid)throw Error('PRIVATE_DIRECTORY_UNAVAILABLE');
  await execute('icacls.exe',[dir,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true});
 }else{
  await fs.chmod(dir,0o700);
 }
}
export class PrivateNetlifySessions{
 private active=new Map<string,Set<()=>Promise<void>>>();
 constructor(private options:{
  dir:string;
  vault:McpCredentialVault;
  current:(id:string)=>McpConnection|undefined;
  entry?:string;
  startSession?:typeof createPiMcpSession;
 }){}
 factory(connection:McpConnection):StaticPhaseSessionFactory{
  const binding=mcpBinding(connection);
  const generation=this.options.vault.generation(connection.id);
  const site=connection.mcpPublisher?.siteId;
  if(!site)throw Error('PUBLISHER_TARGET_MISSING');
  const guard=()=>{
   const current=this.options.current(connection.id);
   if(!current?.enabled||current.kind!=='mcp'||mcpBinding(current)!==binding||
      current.mcpPublisher?.siteId!==site||this.options.vault.generation(connection.id)!==generation){
    throw new PublicationHostGuardError(Error('PUBLISHER_AUTHORIZATION_CHANGED'));
   }
   return current;
  };
  return async input=>{
   if(input.restoredDeployId&&(input.configuration.version!=='netlify-static-recovery-v1'||
      input.restoredDeployId!==input.configuration.deployId)){
    throw new PublicationHostGuardError(Error('PRIVATE_RECOVERY_IDENTITY'));
   }
   const current=guard();
   await input.beforeDispatch();
   if(input.configuration.siteId!==site)throw new PublicationHostGuardError(Error('PUBLISHER_TARGET_CHANGED'));
   const token=this.options.vault.publisherToken(current);
   const bootstrap=privateNetlifyBootstrapSchema.parse({version:'netlify-private-stdio-v1',configuration:input.configuration});
   const parent=path.resolve(this.options.dir,'private-publication');
   await fs.mkdir(parent,{recursive:true});
   if((await fs.lstat(parent)).isSymbolicLink())throw Error('PRIVATE_DIRECTORY_UNAVAILABLE');
   await protectDirectory(parent);
   const dir=await fs.mkdtemp(path.join(parent,'snapshot-'));
   let handle:Awaited<ReturnType<typeof createPiMcpSession>>|undefined;
   let closed=false;
   let closePromise:Promise<void>|undefined;
   const cleanup=async()=>{
    closed=true;
    // A handle can arrive after invalidation. Close it once, then retry cleanup
    // after its cwd is released; a previous directory-removal failure is not final.
    if(handle&&!closePromise)closePromise=handle.close();
    try{
     await closePromise;
    }finally{
     const stat=await fs.lstat(dir).catch(()=>undefined);
     if(stat?.isSymbolicLink())throw Error('PRIVATE_DIRECTORY_CHANGED');
     if(stat&&path.dirname(dir)===parent)await fs.rm(dir,{recursive:true,force:true});
     this.active.get(connection.id)?.delete(cleanup);
    }
   };
   const active=this.active.get(connection.id)??new Set<()=>Promise<void>>();
   this.active.set(connection.id,active);
   active.add(cleanup);
   try{
    await protectDirectory(dir);
    guard();
    const bytes=Buffer.from(JSON.stringify(bootstrap));
    const file=path.join(dir,'snapshot.json');
    await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});
    const entry=this.options.entry??fileURLToPath(new URL('./netlify-static-stdio.js',import.meta.url));
    if(!entry.endsWith('.js'))throw Error('PRIVATE_COMPILED_ENTRY_REQUIRED');
    handle=await(this.options.startSession??createPiMcpSession)({
     command:process.execPath,args:[entry,file,digest(bytes)],cwd:dir,
     env:privatePublisherEnvironment(token),
     tools:bootstrap.configuration.version==='netlify-static-recovery-v1'?['static_status']:['static_create','static_upload','static_status'],
     beforeDispatch:async()=>{
      guard();
      await input.beforeDispatch();
      guard();
     },
    });
    if(closed){
     await cleanup();
     throw new PublicationHostGuardError(Error('PUBLISHER_AUTHORIZATION_CHANGED'));
    }
    guard();
    return{
     call:async(name,args,signal)=>{
      guard();
      const result=await handle!.call(name,args,signal);
      guard();
      return result as Record<string,unknown>;
     },
     close:cleanup,
    };
   }catch(error){
    await cleanup();
    throw error;
   }
  };
 }
 async invalidate(id:string){
  const active=[...this.active.get(id)??[]];
  await Promise.allSettled(active.map(close=>close()));
 }
 async close(){
  await Promise.allSettled([...this.active.keys()].map(id=>this.invalidate(id)));
 }
}

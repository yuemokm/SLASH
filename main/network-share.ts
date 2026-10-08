import {spawn} from 'node:child_process';
import {TextDecoder} from 'node:util';
import {z} from 'zod';
import fs from 'node:fs/promises';
import {sharePrincipalLookupScript} from './windows-share-principal.js';
import {shareDisconnectSchema,shareReconnectSchema,sharePermissionInspectSchema,sharePermissionUpdateSchema,shareStopSchema,type ShareDisconnect,type ShareReconnect,type SharePermissionView,type ShareManagementResult,type SharePermissionUpdate,type ShareStop} from '../shared/network-share-management.js';

export const NETWORK_SHARE_INVITE_PREFIX='slash-share:v1:';
export const NETWORK_SHARE_INVITE_VERSION=1 as const;
const MAX_PROCESS_OUTPUT=1_000_000;

function validHost(value:string){
 if(value.length>253||value.endsWith('.')||value.includes('..'))return false;
 const ipv4=value.split('.');if(ipv4.length===4&&ipv4.every(part=>/^\d{1,3}$/.test(part)))return ipv4.every(part=>Number(part)<=255&&String(Number(part))===part);
 return value.split('.').every(label=>label.length>=1&&label.length<=63&&/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

function validShareName(value:string){return value.length<=80&&value!=='.'&&value!=='..'&&!/["\\/\[\]:|<>+=;,?*\u0000-\u001f]/.test(value)&&!/[ .]$/.test(value)&&!/^(?:ADMIN|IPC|[A-Z])\$$/i.test(value);}
const driveSchema=z.string().transform(value=>value.toUpperCase()).pipe(z.string().regex(/^[A-Z]:$/,'盘符必须是单个字母和冒号')),hostSchema=z.string().min(1).refine(validHost,'主机必须是有效的主机名、FQDN 或 IPv4 地址'),shareNameSchema=z.string().min(1).refine(validShareName,'共享名包含非法字符、保留名称或无效结尾'),displayNameSchema=z.string().trim().min(1).max(100).refine(value=>!/[\u0000-\u001f]/.test(value),'显示名称包含控制字符');

export const networkShareInvitationSchema=z.object({
 version:z.literal(NETWORK_SHARE_INVITE_VERSION),provider:z.literal('windows-smb'),
 resourceId:z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
 host:hostSchema,
 shareName:shareNameSchema,
 displayName:displayNameSchema.optional(),
 suggestedDrive:driveSchema,
}).strict().transform(value=>({...value,displayName:value.displayName??value.shareName}));
export type NetworkShareInvitation=z.infer<typeof networkShareInvitationSchema>;
export type NetworkShareInvitationInput=z.input<typeof networkShareInvitationSchema>;

export function parseNetworkShareInvitation(input:string):NetworkShareInvitation{
 const text=input.trim();if(!text.startsWith(NETWORK_SHARE_INVITE_PREFIX))throw Error('INVALID_SHARE_INVITATION_PREFIX');const payload=text.slice(NETWORK_SHARE_INVITE_PREFIX.length);if(!payload||payload.length>4096||!/^[A-Za-z0-9_-]+$/.test(payload))throw Error('INVALID_SHARE_INVITATION_ENCODING');
 let decoded:string;try{const bytes=Buffer.from(payload,'base64url');if(bytes.toString('base64url')!==payload)throw Error();decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('INVALID_SHARE_INVITATION_ENCODING');}
 let value:unknown;try{value=JSON.parse(decoded);}catch{throw Error('INVALID_SHARE_INVITATION_JSON');}const result=networkShareInvitationSchema.safeParse(value);if(!result.success)throw Error(`INVALID_SHARE_INVITATION_SCHEMA: ${result.error.issues.map(issue=>`${issue.path.join('.')||'root'} ${issue.message}`).join('; ')}`);return result.data;
}

export function createNetworkShareInvitation(value:NetworkShareInvitationInput){const invitation=networkShareInvitationSchema.parse(value);return NETWORK_SHARE_INVITE_PREFIX+Buffer.from(JSON.stringify(invitation),'utf8').toString('base64url');}
export function buildSmbUncPath(target:{host:string;shareName:string}){const host=hostSchema.parse(target.host),shareName=shareNameSchema.parse(target.shareName);return`\\\\${host}\\${shareName}`;}

export type PowerShellRunRequest={executable:'powershell.exe';args:readonly string[];sensitiveStdin?:string;timeoutMs:number;windowsHide:true};
export type PowerShellRunResult={exitCode:number|null;stdout:string;stderr:string;timedOut?:boolean;spawnError?:string};
export type NetworkShareRunner=(request:PowerShellRunRequest)=>Promise<PowerShellRunResult>;

export const runHiddenPowerShell:NetworkShareRunner=request=>new Promise(resolve=>{
 const child=spawn(request.executable,[...request.args],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false,timedOut=false;const finish=(result:PowerShellRunResult)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};const append=(current:string,chunk:Buffer)=>{if(current.length>=MAX_PROCESS_OUTPUT)return current;return(current+chunk.toString('utf8')).slice(0,MAX_PROCESS_OUTPUT);};child.stdout.on('data',(chunk:Buffer)=>{stdout=append(stdout,chunk);});child.stderr.on('data',(chunk:Buffer)=>{stderr=append(stderr,chunk);});child.on('error',error=>finish({exitCode:null,stdout,stderr,spawnError:error.message}));child.on('close',code=>finish({exitCode:code,stdout,stderr,timedOut}));child.stdin.on('error',()=>{});child.stdin.end(request.sensitiveStdin??'');const timer=setTimeout(()=>{timedOut=true;child.kill();},request.timeoutMs);timer.unref();
});

function quotePowerShell(value:string){return`'${value.replaceAll("'","''")}'`;}
export function encodedPowerShell(script:string){const utf8Prelude="[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n";return['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(utf8Prelude+script,'utf16le').toString('base64')] as const;}
const mappingOutputSchema=z.object({ok:z.boolean(),state:z.enum(['available','connected','reused','conflict','failed']),localPath:z.string(),remotePath:z.string().nullable(),mappingStatus:z.string().nullable(),source:z.enum(['none','smb','filesystem']).optional(),hresult:z.number().int().nullable().optional(),errorId:z.string().nullable().optional(),message:z.string().nullable().optional()}).strict();
type MappingOutput=z.infer<typeof mappingOutputSchema>;

function parseRunnerOutput(result:PowerShellRunResult):MappingOutput|undefined{if(result.timedOut||result.spawnError)return undefined;const text=result.stdout.replace(/^\uFEFF/,'').trim();if(!text)return undefined;try{return mappingOutputSchema.parse(JSON.parse(text));}catch{return undefined;}}
function cleanMessage(value:string|undefined|null){return value?.replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,500)||undefined;}
function windowsCode(hresult:number|undefined|null){if(hresult===undefined||hresult===null)return undefined;return hresult&0xffff;}

export type MappingDiagnosticCode='AVAILABLE'|'CONNECTED'|'REUSED'|'OFFLINE'|'DRIVE_CONFLICT'|'CREDENTIAL_REQUIRED'|'CREDENTIAL_CONFLICT'|'PERMISSION_DENIED'|'TARGET_UNREACHABLE'|'COMMAND_UNAVAILABLE'|'TIMEOUT'|'OUTCOME_UNKNOWN'|'UNEXPECTED_OUTPUT'|'MAPPING_FAILED';
export type DriveMappingDiagnostic={code:MappingDiagnosticCode;message:string;retryWithCredentials:boolean};
export type DriveMappingStatus='available'|'connected'|'reused'|'offline'|'conflict'|'auth_required'|'permission_denied'|'target_unreachable'|'outcome_unknown'|'failed';
export type DriveMappingResult={status:DriveMappingStatus;drive:string;unc:string;mappingStatus?:string;diagnostic:DriveMappingDiagnostic};

function diagnoseFailure(result:PowerShellRunResult,output?:MappingOutput,outcomeMayBeUnknown=false):DriveMappingDiagnostic{
 if(result.timedOut)return{code:outcomeMayBeUnknown?'OUTCOME_UNKNOWN':'TIMEOUT',message:outcomeMayBeUnknown?'SMB 映射操作超时，结果未知；请先重新检查盘符状态，不要直接重试':'SMB 映射检查超时',retryWithCredentials:false};if(result.spawnError)return{code:'COMMAND_UNAVAILABLE',message:'无法启动 Windows PowerShell SMB 映射命令',retryWithCredentials:false};if(!output)return{code:'UNEXPECTED_OUTPUT',message:'Windows SMB 映射命令未返回可识别结果',retryWithCredentials:false};const code=windowsCode(output.hresult),errorId=(output.errorId??'').toLowerCase();
 if(code===86||code===1326||code===1330||code===1907||errorId.includes('logonfailure')||errorId.includes('invalidcredential'))return{code:'CREDENTIAL_REQUIRED',message:'当前凭据未被共享主机接受，需要输入共享方认可的账号和密码',retryWithCredentials:true};
 if(code===1219)return{code:'CREDENTIAL_CONFLICT',message:'Windows 已使用另一组凭据连接到同一主机；请先在系统中处理现有连接',retryWithCredentials:false};if(errorId.includes('commandnotfound'))return{code:'COMMAND_UNAVAILABLE',message:'当前 Windows 环境没有可用的 SMB 映射命令',retryWithCredentials:false};
 if(code===5||errorId.includes('accessdenied'))return{code:'PERMISSION_DENIED',message:'账号已识别，但没有访问该共享的权限',retryWithCredentials:false};
 if([53,64,67,1231].includes(code??-1))return{code:'TARGET_UNREACHABLE',message:'无法访问共享主机或共享名称',retryWithCredentials:false};
 return{code:'MAPPING_FAILED',message:cleanMessage(output.message)??'Windows 未能创建 SMB 映射',retryWithCredentials:false};
}

const targetSchema=z.object({drive:driveSchema,host:hostSchema,shareName:shareNameSchema}).strict();
export type NetworkShareTarget=z.input<typeof targetSchema>;
function normalizedTarget(input:NetworkShareTarget){const target=targetSchema.parse(input);return{...target,unc:buildSmbUncPath(target)};}

export async function inspectNetworkShareTarget(input:NetworkShareTarget,runner:NetworkShareRunner=runHiddenPowerShell):Promise<DriveMappingResult>{
 const target=normalizedTarget(input),letter=target.drive[0];const script=`$ErrorActionPreference='Stop'\n$local=${quotePowerShell(target.drive)}\n$remote=${quotePowerShell(target.unc)}\ntry{$mapping=Get-SmbMapping -LocalPath $local -ErrorAction SilentlyContinue | Select-Object -First 1\nif($null -ne $mapping){$same=[StringComparer]::OrdinalIgnoreCase.Equals([string]$mapping.RemotePath,$remote);[ordered]@{ok=$same;state=$(if($same){'reused'}else{'conflict'});localPath=$local;remotePath=[string]$mapping.RemotePath;mappingStatus=[string]$mapping.Status;source='smb'}|ConvertTo-Json -Compress}else{$drive=Get-PSDrive -Name ${quotePowerShell(letter)} -ErrorAction SilentlyContinue;if($null -ne $drive){[ordered]@{ok=$false;state='conflict';localPath=$local;remotePath=$null;mappingStatus=$null;source='filesystem'}|ConvertTo-Json -Compress}else{[ordered]@{ok=$true;state='available';localPath=$local;remotePath=$null;mappingStatus=$null;source='none'}|ConvertTo-Json -Compress}}}catch{[ordered]@{ok=$false;state='failed';localPath=$local;remotePath=$remote;mappingStatus=$null;hresult=[int64]$_.Exception.HResult;errorId=[string]$_.FullyQualifiedErrorId;message=[string]$_.Exception.Message}|ConvertTo-Json -Compress;exit 20}`;
 const result=await runner({executable:'powershell.exe',args:encodedPowerShell(script),timeoutMs:15_000,windowsHide:true}),output=parseRunnerOutput(result);if(!output||output.state==='failed')return{status:'failed',drive:target.drive,unc:target.unc,diagnostic:diagnoseFailure(result,output)};if(output.state==='conflict')return{status:'conflict',drive:target.drive,unc:target.unc,mappingStatus:output.mappingStatus??undefined,diagnostic:{code:'DRIVE_CONFLICT',message:output.source==='smb'?`盘符 ${target.drive} 已映射到另一个 SMB 目标`:`盘符 ${target.drive} 已被本地或其他驱动器占用`,retryWithCredentials:false}};if(output.state==='reused'){const online=/^(?:OK|Connected)$/i.test(output.mappingStatus??'');return{status:online?'reused':'offline',drive:target.drive,unc:target.unc,mappingStatus:output.mappingStatus??undefined,diagnostic:{code:online?'REUSED':'OFFLINE',message:online?'盘符已映射到同一 SMB 目标':'相同目标的映射仍保留，但当前不可用；请检查网络、主机和凭据',retryWithCredentials:false}};}if(output.state!=='available')return{status:'failed',drive:target.drive,unc:target.unc,diagnostic:{code:'UNEXPECTED_OUTPUT',message:'Windows SMB 检查返回了不符合预期的状态',retryWithCredentials:false}};return{status:'available',drive:target.drive,unc:target.unc,diagnostic:{code:'AVAILABLE',message:'盘符可用于此 SMB 目标',retryWithCredentials:false}};
}

const authenticationSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('current-user')}).strict(),
 z.object({mode:z.literal('username-password'),username:z.string().trim().min(1).max(256).refine(value=>!/[\u0000-\u001f]/.test(value),'用户名包含控制字符'),password:z.string().min(1).max(1024),saveCredentials:z.boolean().default(false)}).strict(),
]);
export type NetworkShareAuthentication=z.input<typeof authenticationSchema>;
export type ConnectNetworkShareRequest=NetworkShareTarget&{authentication:NetworkShareAuthentication;persistent?:boolean;requireIntegrity?:boolean;requirePrivacy?:boolean};

export async function connectNetworkShare(input:ConnectNetworkShareRequest,runner:NetworkShareRunner=runHiddenPowerShell):Promise<DriveMappingResult>{
 const target=normalizedTarget({drive:input.drive,host:input.host,shareName:input.shareName}),authentication=authenticationSchema.parse(input.authentication),persistent=input.persistent??true,requireIntegrity=input.requireIntegrity??true,requirePrivacy=input.requirePrivacy??false,letter=target.drive[0];const credentialSetup=authentication.mode==='username-password'?`$plain=[Console]::In.ReadToEnd()\nif([string]::IsNullOrEmpty($plain)){throw [System.ComponentModel.Win32Exception]::new(1326,'Credential input missing')}\n$secure=ConvertTo-SecureString $plain -AsPlainText -Force\n$credential=[pscredential]::new(${quotePowerShell(authentication.username)},$secure)\n$plain=$null\n`:'';const credentialArgument=authentication.mode==='username-password'?' -Credential $credential'+(authentication.saveCredentials?' -SaveCredentials':''):'';
 const script=`$ErrorActionPreference='Stop'\n$local=${quotePowerShell(target.drive)}\n$remote=${quotePowerShell(target.unc)}\ntry{\n$existing=Get-SmbMapping -LocalPath $local -ErrorAction SilentlyContinue | Select-Object -First 1\nif($null -ne $existing){if([StringComparer]::OrdinalIgnoreCase.Equals([string]$existing.RemotePath,$remote)){[ordered]@{ok=$true;state='reused';localPath=$local;remotePath=[string]$existing.RemotePath;mappingStatus=[string]$existing.Status}|ConvertTo-Json -Compress;exit 0}else{[ordered]@{ok=$false;state='conflict';localPath=$local;remotePath=[string]$existing.RemotePath;mappingStatus=[string]$existing.Status;message='Drive letter already mapped'}|ConvertTo-Json -Compress;exit 10}}\nif($null -ne (Get-PSDrive -Name ${quotePowerShell(letter)} -ErrorAction SilentlyContinue)){[ordered]@{ok=$false;state='conflict';localPath=$local;remotePath=$null;mappingStatus=$null;message='Drive letter already occupied'}|ConvertTo-Json -Compress;exit 10}\n${credentialSetup}$mapping=New-SmbMapping -LocalPath $local -RemotePath $remote -Persistent $${persistent?'true':'false'} -RequireIntegrity $${requireIntegrity?'true':'false'} -RequirePrivacy $${requirePrivacy?'true':'false'}${credentialArgument} -ErrorAction Stop\n[ordered]@{ok=$true;state='connected';localPath=[string]$mapping.LocalPath;remotePath=[string]$mapping.RemotePath;mappingStatus=[string]$mapping.Status}|ConvertTo-Json -Compress\n}catch{[ordered]@{ok=$false;state='failed';localPath=$local;remotePath=$remote;mappingStatus=$null;hresult=[int64]$_.Exception.HResult;errorId=[string]$_.FullyQualifiedErrorId;message=[string]$_.Exception.Message}|ConvertTo-Json -Compress;exit 20}finally{if($null -ne $secure){$secure.Dispose()};$plain=$null;$credential=$null}`;
 const sensitiveStdin=authentication.mode==='username-password'?authentication.password:undefined;const result=await runner({executable:'powershell.exe',args:encodedPowerShell(script),sensitiveStdin,timeoutMs:60_000,windowsHide:true}),output=parseRunnerOutput(result);if(output?.state==='conflict')return{status:'conflict',drive:target.drive,unc:target.unc,mappingStatus:output.mappingStatus??undefined,diagnostic:{code:'DRIVE_CONFLICT',message:`盘符 ${target.drive} 已被占用，未覆盖现有驱动器`,retryWithCredentials:false}};if(output?.ok&&output.state==='reused'){const online=/^(?:OK|Connected)$/i.test(output.mappingStatus??'');return{status:online?'reused':'offline',drive:target.drive,unc:target.unc,mappingStatus:output.mappingStatus??undefined,diagnostic:{code:online?'REUSED':'OFFLINE',message:online?'已存在相同目标的 SMB 映射':'相同目标的映射仍保留，但当前不可用；请先检查状态，不会覆盖或重建',retryWithCredentials:false}};}if(output?.ok&&output.state==='connected')return{status:'connected',drive:target.drive,unc:target.unc,mappingStatus:output.mappingStatus??undefined,diagnostic:{code:'CONNECTED',message:'SMB 网络盘已映射',retryWithCredentials:false}};const diagnostic=diagnoseFailure(result,output,true);const status:DriveMappingStatus=diagnostic.code==='OUTCOME_UNKNOWN'?'outcome_unknown':diagnostic.code==='CREDENTIAL_REQUIRED'?'auth_required':diagnostic.code==='CREDENTIAL_CONFLICT'?'conflict':diagnostic.code==='PERMISSION_DENIED'?'permission_denied':diagnostic.code==='TARGET_UNREACHABLE'?'target_unreachable':'failed';return{status,drive:target.drive,unc:target.unc,diagnostic};
}

/** Management never changes a Windows account password. Passwords remain stdin-only. */
export function mappingTargetFromUnc(drive:string,remotePath:string):NetworkShareTarget{
 const match=/^\\\\([^\\]+)\\([^\\]+)\\?$/.exec(remotePath);
 if(!match)throw Error('仅能管理指向标准 SMB 共享根目录的映射');
 return targetSchema.parse({drive,host:match[1],shareName:match[2]});
}
const managementOutputSchema=z.object({status:z.enum(['succeeded','failed','conflict','partial']),mappingRemoved:z.boolean().optional(),credentialsCleared:z.boolean().optional(),diagnostic:z.string().optional()}).strict();
function parseManagement(result:PowerShellRunResult):ShareManagementResult{
 if(result.timedOut||result.spawnError)return{status:'outcome_unknown',diagnostic:'共享管理未返回可核对结果；请刷新系统状态，不要直接重复操作'};
 try{const parsed=managementOutputSchema.parse(JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim()));return{...parsed,diagnostic:parsed.status==='succeeded'?'所选映射已断开，远端文件未删除':parsed.status==='conflict'?'盘符的当前目标已变化，未断开任何映射':parsed.status==='partial'?'所选映射已断开，但保存凭据未能清除；请在 Windows 凭据管理器核对':'未能断开所选映射；请刷新状态后核对'};}catch{return{status:'outcome_unknown',diagnostic:'Windows 未返回可识别的管理结果；请刷新状态后核对'};}
}
export async function disconnectNetworkShare(input:ShareDisconnect,runner:NetworkShareRunner=runHiddenPowerShell):Promise<ShareManagementResult>{
 const request=shareDisconnectSchema.parse(input),target=normalizedTarget(mappingTargetFromUnc(request.drive,request.expectedRemotePath));
 const script=`$ErrorActionPreference='Stop'
$local=${quotePowerShell(target.drive)}; $remote=${quotePowerShell(target.unc)}
$removed=$false; $cleared=$false
try{
 $mapping=Get-SmbMapping -LocalPath $local -ErrorAction SilentlyContinue | Select-Object -First 1
 if($null -ne $mapping -and ![StringComparer]::OrdinalIgnoreCase.Equals([string]$mapping.RemotePath,$remote)){[ordered]@{status='conflict';mappingRemoved=$false}|ConvertTo-Json -Compress;exit 10}
 if($null -eq $mapping){throw 'Mapping no longer exists'}
 Remove-SmbMapping -InputObject $mapping -UpdateProfile -Force -ErrorAction Stop
 if($null -ne (Get-SmbMapping -LocalPath $local -ErrorAction SilentlyContinue)){throw 'Mapping removal not verified'}
 $removed=$true
 ${request.clearCredentials?`& cmdkey.exe ${quotePowerShell('/delete:'+target.host)} | Out-Null
 if($LASTEXITCODE -ne 0){[ordered]@{status='partial';mappingRemoved=$true;credentialsCleared=$false}|ConvertTo-Json -Compress;exit 20};$cleared=$true`:''}
 [ordered]@{status='succeeded';mappingRemoved=$removed;credentialsCleared=$cleared}|ConvertTo-Json -Compress
}catch{[ordered]@{status='failed';mappingRemoved=$removed;credentialsCleared=$cleared}|ConvertTo-Json -Compress;exit 20}`;
 return parseManagement(await runner({executable:'powershell.exe',args:encodedPowerShell(script),timeoutMs:30_000,windowsHide:true}));
}
export async function reconnectNetworkShare(input:ShareReconnect,runner:NetworkShareRunner=runHiddenPowerShell):Promise<ShareManagementResult>{
 const request=shareReconnectSchema.parse(input),target=mappingTargetFromUnc(request.drive,request.expectedRemotePath);
 const disconnected=await disconnectNetworkShare({type:'shareDisconnect',drive:request.drive,expectedRemotePath:request.expectedRemotePath,clearCredentials:request.clearCredentials},runner);
 if(disconnected.status!=='succeeded')return disconnected;
 const result=await connectNetworkShare({...target,authentication:request.authentication},runner);
 // Do not expose process error text containing a credential, even in a hostile runner result.
 const diagnostic=result.diagnostic.message.replaceAll(request.authentication.password,'[凭据已隐藏]');
 if(result.status!=='connected'&&result.status!=='reused')return{status:result.status==='outcome_unknown'?'outcome_unknown':'partial',mappingRemoved:true,credentialsCleared:disconnected.credentialsCleared,diagnostic:'原映射已断开，使用新连接凭据重连未完成：'+diagnostic,diagnosticCode:result.diagnostic.code};
 const inspected=await inspectNetworkShareTarget(target,runner);
 if(inspected.status!=='reused')return{status:'outcome_unknown',mappingRemoved:true,credentialsCleared:disconnected.credentialsCleared,diagnostic:'重连命令已返回，但目标状态未核对成功；请刷新后核对'};
 return{status:'succeeded',mappingRemoved:true,credentialsCleared:disconnected.credentialsCleared,diagnostic:'已使用新的连接账号和凭据重连；未修改 Windows 账号密码或共享方授权'};
}

const permissionPrelude=`function Resolve-Sid([string]$principal){return ([System.Security.Principal.NTAccount]::new($principal)).Translate([System.Security.Principal.SecurityIdentifier]).Value}
function Access-Fingerprint($aces){
 $canonical=ConvertTo-Json -InputObject @($aces | Sort-Object AccountName,AccessControlType,AccessRight | ForEach-Object{[ordered]@{account=[string]$_.AccountName;type=[string]$_.AccessControlType;access=[string]$_.AccessRight}}) -Compress
 $sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
function Checked-Share([string]$name,[string]$wanted){
 $s=Get-SmbShare -Name $name -ErrorAction Stop
 if([bool]$s.Special -or ![StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath([string]$s.Path).TrimEnd('\\'),[IO.Path]::GetFullPath($wanted).TrimEnd('\\'))){throw 'Share target changed or is special'}
 return $s
}`;
export async function inspectSharePermissions(input:{shareName:string;expectedPath:string},runner:NetworkShareRunner=runHiddenPowerShell):Promise<SharePermissionView>{
 const request=sharePermissionInspectSchema.parse({type:'sharePermissionInspect',...input});shareNameSchema.parse(request.shareName);
const script=`$ErrorActionPreference='Stop'
${permissionPrelude}
${sharePrincipalLookupScript}
$s=Checked-Share ${quotePowerShell(request.shareName)} ${quotePowerShell(request.expectedPath)}
$aces=@(Get-SmbShareAccess -Name ${quotePowerShell(request.shareName)} -ErrorAction Stop)
[ordered]@{shareName=[string]$s.Name;path=[string]$s.Path;fingerprint=(Access-Fingerprint $aces);accounts=@($aces | ForEach-Object{$principal=Resolve-SharePrincipal ([string]$_.AccountName);[ordered]@{account=[string]$_.AccountName;type=[string]$_.AccessControlType;access=[string]$_.AccessRight;sid=$principal.sid;canonicalName=$principal.canonicalName;principalKind=$principal.kind}})}|ConvertTo-Json -Depth 5 -Compress`;
 const result=await runner({executable:'powershell.exe',args:encodedPowerShell(script),timeoutMs:20_000,windowsHide:true});
 if(result.timedOut||result.spawnError||result.exitCode!==0)throw Error('无法核对本机共享授权；请刷新或检查 Windows 权限');
 const parsed=z.object({shareName:z.string(),path:z.string(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),accounts:z.array(z.object({account:z.string(),type:z.enum(['Allow','Deny']),access:z.enum(['Read','Change','Full']),sid:z.string().nullable().optional().transform(value=>value??undefined),canonicalName:z.string().optional(),principalKind:z.enum(['user','group','unknown']).optional()}).strict())}).strict().parse(JSON.parse(result.stdout.replace(/^\uFEFF/,'')));
 if(parsed.shareName.toLowerCase()!==request.shareName.toLowerCase()||parsed.path.toLowerCase().replace(/\\$/,'')!==request.expectedPath.toLowerCase().replace(/\\$/,''))throw Error('共享目标已变化，请刷新后重新选择');
 return{...parsed,notice:'此处管理显式 SMB 账号授权；目录已有权限与其它账号保留，组成员及继承权限仍需在 Windows 核对。'};
}
/** Only this fixed-purpose script is elevated; no arbitrary shell input accepted. */
export function buildShareManagementScript(input:SharePermissionUpdate|ShareStop,receiptPath:string){
 const request=input.type==='shareStop'?shareStopSchema.parse(input):sharePermissionUpdateSchema.parse(input);shareNameSchema.parse(request.shareName);
 const setup=`$ErrorActionPreference='Stop'
${permissionPrelude}
$name=${quotePowerShell(request.shareName)}; $p=${quotePowerShell(request.expectedPath)}
$result=[ordered]@{status='failed';diagnostic='共享管理未完成';rollbackSucceeded=$true}
$changed=$false; $oldSddl=$null; $oldAccess=@(); $affected=@()
try{
 $existing=Checked-Share $name $p
`;
 const operation=request.type==='shareStop'?`
 Remove-SmbShare -InputObject $existing -Force -Confirm:$false -ErrorAction Stop
 $changed=$true
 if($null -ne (Get-SmbShare -Name $name -ErrorAction SilentlyContinue)){throw 'Share removal not verified'}
 $result.status='succeeded';$result.diagnostic='已停止对外共享，本地目录和文件未删除。正在使用该共享的连接可能中断。'
`: `
 $account=${quotePowerShell(request.account)}; $previous=${quotePowerShell(request.previousAccount??request.account)}
 $sid=Resolve-Sid $account; $oldSid=Resolve-Sid $previous
 if(@('S-1-1-0','S-1-5-7','S-1-5-32-546') -contains $sid -or @('S-1-1-0','S-1-5-7','S-1-5-32-546') -contains $oldSid){throw 'Broad accounts cannot be managed'}
 $oldAccess=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
 if((Access-Fingerprint $oldAccess) -ne ${quotePowerShell(request.expectedFingerprint)}){$result.status='conflict';throw 'Share permissions changed'}
 $affected=@($oldAccess | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -in @($sid,$oldSid)})
 if(@($affected | Where-Object {$_.AccessControlType -eq 'Deny'}).Count -gt 0){throw 'Explicit deny must be reviewed in Windows'}
 if(${request.previousAccount?'$true':'$false'} -and @($affected | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -eq $oldSid -and $_.AccessControlType -eq 'Allow'}).Count -eq 0){throw 'Selected prior account is no longer granted'}
 $acl=Get-Acl -LiteralPath $p -ErrorAction Stop; $oldSddl=$acl.Sddl
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($account,${quotePowerShell(request.access==='read_write'?'Modify':'ReadAndExecute')},'ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule);$changed=$true;Set-Acl -LiteralPath $p -AclObject $acl -ErrorAction Stop
 foreach($entry in $affected){Revoke-SmbShareAccess -Name $name -AccountName $entry.AccountName -Force -ErrorAction Stop | Out-Null}
 Grant-SmbShareAccess -Name $name -AccountName $account -AccessRight ${request.access==='read_write'?'Change':'Read'} -Force -ErrorAction Stop | Out-Null
 $check=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
 if(@($check | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -eq $sid -and $_.AccessControlType -eq 'Allow' -and $_.AccessRight -eq '${request.access==='read_write'?'Change':'Read'}'}).Count -eq 0){throw 'Share grant not verified'}
 if($oldSid -ne $sid -and @($check | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -eq $oldSid -and $_.AccessControlType -eq 'Allow'}).Count -gt 0){throw 'Prior explicit grant still present'}
 $verifiedShare=Checked-Share $name $p
 $effectiveAcl=Get-Acl -LiteralPath $p -ErrorAction Stop
 $needed=[System.Security.AccessControl.FileSystemRights]::${request.access==='read_write'?'Modify':'ReadAndExecute'}
 $ntfsAllow=@($effectiveAcl.Access | Where-Object {(Resolve-Sid ([string]$_.IdentityReference)) -eq $sid -and $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band $needed) -eq $needed}).Count -gt 0
 $ntfsDeny=@($effectiveAcl.Access | Where-Object {(Resolve-Sid ([string]$_.IdentityReference)) -eq $sid -and $_.AccessControlType -eq 'Deny' -and ($_.FileSystemRights -band $needed) -ne 0}).Count -gt 0
 if(!$ntfsAllow -or $ntfsDeny){throw 'Explicit directory rights not verified'}
 $result.status='succeeded';$result.diagnostic='已更新所选显式共享账号授权；目录既有权限与其它账号保留。组或继承带来的额外访问需另行核对。'
`;
 const rollback=request.type==='shareStop'?`if($changed){$result.status='outcome_unknown';$result.diagnostic='停止共享后的状态无法核对；请刷新系统共享，不要直接重复操作'}`:`if($changed){try{
 foreach($principal in @($account,$previous)|Select-Object -Unique){Revoke-SmbShareAccess -Name $name -AccountName $principal -Force -ErrorAction SilentlyContinue | Out-Null}
 foreach($entry in $affected){Grant-SmbShareAccess -Name $name -AccountName $entry.AccountName -AccessRight $entry.AccessRight -Force -ErrorAction Stop | Out-Null}
 $restore=Get-Acl -LiteralPath $p -ErrorAction Stop;$restore.SetSecurityDescriptorSddlForm($oldSddl);Set-Acl -LiteralPath $p -AclObject $restore -ErrorAction Stop
 $result.diagnostic='授权更新失败，已恢复本次修改前的显式共享与目录权限'
 }catch{$result.rollbackSucceeded=$false;$result.status='outcome_unknown';$result.diagnostic='授权更新失败且回滚未能核对，请检查 Windows 共享和目录权限'}}`;
 return setup+operation+`\n}catch{${rollback}}finally{$result|ConvertTo-Json -Compress|Set-Content -LiteralPath ${quotePowerShell(receiptPath)} -Encoding UTF8}\n`;
}
export async function manageLocalShare(input:SharePermissionUpdate|ShareStop,receiptPath:string,runner:NetworkShareRunner=runHiddenPowerShell,readReceipt:(file:string)=>Promise<string>=file=>fs.readFile(file,'utf8')):Promise<ShareManagementResult>{
 const script=buildShareManagementScript(input,receiptPath),encoded=Buffer.from(script,'utf16le').toString('base64');
 const launch=`$ErrorActionPreference='Stop';$p=Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',${quotePowerShell(encoded)}) -PassThru -Wait;exit $p.ExitCode`;
 const result=await runner({executable:'powershell.exe',args:encodedPowerShell(launch),timeoutMs:180_000,windowsHide:true});
 if(result.timedOut)return{status:'outcome_unknown',diagnostic:'管理员操作超时，结果未知；请刷新系统共享和权限，不要直接重复操作'};
 if(result.spawnError)return{status:'failed',diagnostic:'无法启动共享管理，请检查 Windows PowerShell'};
 try{return z.object({status:z.enum(['succeeded','failed','conflict','outcome_unknown']),diagnostic:z.string().max(1000),rollbackSucceeded:z.boolean()}).strict().parse(JSON.parse((await readReceipt(receiptPath)).replace(/^\uFEFF/,'')));}catch{return{status:'outcome_unknown',diagnostic:'管理员操作未返回可核对结果（可能取消了授权）；请刷新状态后核对'};}
}

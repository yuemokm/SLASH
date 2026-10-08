import {createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import type {ShareFolderSelection,ShareSetupInfo} from '../shared/types.js';
import {runHiddenPowerShell,encodedPowerShell,type NetworkShareRunner} from './network-share.js';
import {sharePrincipalLookupScript} from './windows-share-principal.js';

const setupSchema=z.object({
 host:z.string(),userName:z.string(),qualifiedName:z.string(),currentSid:z.string().nullable().optional(),identityStatus:z.enum(['verified','unavailable']).optional(),
 shares:z.array(z.object({name:z.string(),path:z.string(),description:z.string().nullable().optional(),special:z.boolean()})),
 localUsers:z.array(z.object({name:z.string(),enabled:z.boolean(),sid:z.string().nullable().optional(),qualifiedName:z.string().optional(),displayName:z.string().optional(),principalSource:z.string().optional()})),
 mappings:z.array(z.object({localPath:z.string(),remotePath:z.string(),status:z.string()})),
 drives:z.array(z.string()),diagnostic:z.string().nullable().optional(),
}).strict();

function cleanDiagnostic(value:string|undefined|null){return value?.replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,1000)||undefined;}
function quotePowerShell(value:string){return "'"+value.replaceAll("'","''")+"'";}

/** Runs elevated. The receipt is checked again by the caller before reporting success. */
export function buildWritableShareScript(input:{path:string;shareName:string;account:string;receiptPath:string}){
 const p=quotePowerShell(input.path),name=quotePowerShell(input.shareName),account=quotePowerShell(input.account),receipt=quotePowerShell(input.receiptPath);
 return `$ErrorActionPreference='Stop'
$result=[ordered]@{status='failed';shareCreated=$false;shareUpgraded=$false;aclChanged=$false;aclRestored=$false;smbRestored=$false;verified=$false;message=''}
$p=${p}; $name=${name}; $account=${account}
$oldSddl=$null; $oldAccess=@(); $oldBroad=@(); $existing=$null; $smbTouched=$false
function Resolve-Sid([string]$principal){
 try{return ([System.Security.Principal.NTAccount]::new($principal)).Translate([System.Security.Principal.SecurityIdentifier]).Value}catch{return $null}
}
try {
 $sid=Resolve-Sid $account
 if(!$sid){throw '指定账号无法解析为 Windows 身份'}
 if(@('S-1-1-0','S-1-5-7','S-1-5-32-546') -contains $sid){throw '不能将 Everyone、匿名或 Guests 设为共享写入账号'}
 $existing=Get-SmbShare -Name $name -ErrorAction SilentlyContinue
 if($null -ne $existing){
  if([bool]$existing.Special){throw '不能修改 Windows 管理共享'}
  $actual=[IO.Path]::GetFullPath([string]$existing.Path).TrimEnd('\\')
  $wanted=[IO.Path]::GetFullPath($p).TrimEnd('\\')
  if(![StringComparer]::OrdinalIgnoreCase.Equals($actual,$wanted)){throw '共享名已被其他目录使用'}
  $originalAces=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
  $oldAccess=@($originalAces | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -eq $sid})
  $oldBroad=@($originalAces | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -in @('S-1-1-0','S-1-5-7') -and $_.AccessControlType -eq 'Allow'})
  if(@($oldAccess | Where-Object {$_.AccessControlType -eq 'Deny'}).Count -gt 0){throw '指定账号存在 SMB 拒绝权限，无法安全升级'}
 }
 $acl=Get-Acl -LiteralPath $p -ErrorAction Stop
 $oldSddl=$acl.Sddl
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($account,'Modify','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
 Set-Acl -LiteralPath $p -AclObject $acl -ErrorAction Stop
 $result.aclChanged=$true
 if($null -eq $existing){
  New-SmbShare -Name $name -Path $p -ChangeAccess $account -ErrorAction Stop | Out-Null
  $result.shareCreated=$true
 }else{
  $alreadyWritable=@($oldAccess | Where-Object {$_.AccessControlType -eq 'Allow' -and $_.AccessRight -in @('Change','Full')}).Count -gt 0
  if(!$alreadyWritable){
   $smbTouched=$true
   Grant-SmbShareAccess -Name $name -AccountName $account -AccessRight Change -Force -ErrorAction Stop | Out-Null
   $result.shareUpgraded=$true
  }
 }
 $broadToRemove=@(Get-SmbShareAccess -Name $name -ErrorAction Stop | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -in @('S-1-1-0','S-1-5-7') -and $_.AccessControlType -eq 'Allow'})
 foreach($entry in $broadToRemove){
  $smbTouched=$true
  Revoke-SmbShareAccess -Name $name -AccountName $entry.AccountName -Force -ErrorAction Stop | Out-Null
 }
 $check=Get-SmbShare -Name $name -ErrorAction Stop
 if(![StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath([string]$check.Path).TrimEnd('\\'),[IO.Path]::GetFullPath($p).TrimEnd('\\'))){throw '共享目标核对失败'}
 $aces=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
 $writable=@($aces | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -eq $sid -and $_.AccessControlType -eq 'Allow' -and $_.AccessRight -in @('Change','Full')}).Count -gt 0
 $broad=@($aces | Where-Object {(Resolve-Sid ([string]$_.AccountName)) -in @('S-1-1-0','S-1-5-7') -and $_.AccessControlType -eq 'Allow'}).Count -gt 0
 $effectiveAcl=Get-Acl -LiteralPath $p -ErrorAction Stop
 $modify=[System.Security.AccessControl.FileSystemRights]::Modify
 $ntfs=@($effectiveAcl.Access | Where-Object {
  (Resolve-Sid ([string]$_.IdentityReference)) -eq $sid -and $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band $modify) -eq $modify
 }).Count -gt 0
 $ntfsDeny=@($effectiveAcl.Access | Where-Object {
  (Resolve-Sid ([string]$_.IdentityReference)) -eq $sid -and $_.AccessControlType -eq 'Deny' -and ($_.FileSystemRights -band $modify) -ne 0
 }).Count -gt 0
 if(!$writable -or !$ntfs -or $ntfsDeny -or $broad){throw '共享或目录读写权限核对失败；可能存在拒绝或过宽的权限'}
 $result.verified=$true; $result.status='succeeded'
}catch{
 $result.message=$_.Exception.Message
 if($result.shareCreated){try{Remove-SmbShare -Name $name -Force -ErrorAction Stop; $result.smbRestored=$true}catch{$result.message+='；共享回滚失败：'+$_.Exception.Message}}
 elseif($smbTouched){
  try{
   Revoke-SmbShareAccess -Name $name -AccountName $account -Force -ErrorAction Stop | Out-Null
   foreach($entry in $oldAccess){
    if($entry.AccessControlType -eq 'Allow'){Grant-SmbShareAccess -Name $name -AccountName $entry.AccountName -AccessRight $entry.AccessRight -Force -ErrorAction Stop | Out-Null}
    elseif($entry.AccessControlType -eq 'Deny'){Block-SmbShareAccess -Name $name -AccountName $entry.AccountName -Force -ErrorAction Stop | Out-Null}
   }
   foreach($entry in $oldBroad){
    if($entry.AccessControlType -eq 'Allow'){Grant-SmbShareAccess -Name $name -AccountName $entry.AccountName -AccessRight $entry.AccessRight -Force -ErrorAction Stop | Out-Null}
   }
   $result.smbRestored=$true
  }catch{$result.message+='；共享权限回滚失败：'+$_.Exception.Message}
 }
 if($result.aclChanged -and $null -ne $oldSddl){
  try{$restore=Get-Acl -LiteralPath $p -ErrorAction Stop; $restore.SetSecurityDescriptorSddlForm($oldSddl); Set-Acl -LiteralPath $p -AclObject $restore -ErrorAction Stop; $result.aclRestored=$true}catch{$result.message+='；目录 ACL 回滚失败：'+$_.Exception.Message}
 }
}finally{
 $result|ConvertTo-Json -Compress|Set-Content -LiteralPath ${receipt} -Encoding UTF8
 if($result.status -eq 'succeeded'){exit 0}else{exit 1}
}`;
}

export async function inspectSharingSetup(runner:NetworkShareRunner=runHiddenPowerShell):Promise<ShareSetupInfo>{
 const script=`$ErrorActionPreference='Stop'
${sharePrincipalLookupScript}
$diag=@()
$shares=@()
$mappings=@()
$localUsers=@()
try{$shares=@(Get-SmbShare -ErrorAction Stop|ForEach-Object{[ordered]@{name=[string]$_.Name;path=[string]$_.Path;description=[string]$_.Description;special=[bool]$_.Special}})}catch{$diag+=('无法读取现有共享：'+$_.Exception.Message)}
try{$mappings=@(Get-SmbMapping -ErrorAction Stop|ForEach-Object{[ordered]@{localPath=[string]$_.LocalPath;remotePath=[string]$_.RemotePath;status=[string]$_.Status}})}catch{$diag+=('无法读取网络盘映射：'+$_.Exception.Message)}
try{$localUsers=@(Get-LocalUser -ErrorAction Stop|ForEach-Object{$principal=Resolve-SharePrincipal '' ([string]$_.SID);[ordered]@{name=[string]$_.Name;enabled=[bool]$_.Enabled;sid=[string]$_.SID;qualifiedName=$principal.canonicalName;displayName=[string]$_.FullName;principalSource=[string]$_.PrincipalSource}})}catch{
 try{$localUsers=@(Get-CimInstance Win32_UserAccount -Filter 'LocalAccount=True' -ErrorAction Stop|ForEach-Object{$principal=Resolve-SharePrincipal '' ([string]$_.SID);[ordered]@{name=[string]$_.Name;enabled=![bool]$_.Disabled;sid=[string]$_.SID;qualifiedName=$principal.canonicalName;displayName=[string]$_.FullName;principalSource='Local'}})}catch{$diag+=('本地账号列表暂不可读取；可以使用已核对的当前身份，或手动输入其他 Windows 账号')}
}
$drives=@(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue|ForEach-Object{([string]$_.Name).ToUpper()+':'})
$currentSid=$null;$qualifiedName='';$userName='';$identityStatus='unavailable';$identity=$null
try{$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent();$currentSid=$identity.User.Value;$current=Resolve-SharePrincipal '' $currentSid
 if($current.resolved -and $current.kind -eq 'user'){$qualifiedName=$current.canonicalName;$userName=$qualifiedName.Split('\\')[-1];$identityStatus='verified'}
}catch{}finally{if($null -ne $identity){$identity.Dispose()}}
if($identityStatus -ne 'verified'){$diag+='当前 Windows 身份未能按 SID 解析，不能自动选择账号；请手动输入并核对 Windows 账号'}
[ordered]@{host=[Environment]::MachineName;userName=$userName;qualifiedName=$qualifiedName;currentSid=$currentSid;identityStatus=$identityStatus;shares=$shares;localUsers=$localUsers;mappings=$mappings;drives=$drives;diagnostic=($diag -join '；')}|ConvertTo-Json -Depth 5 -Compress`;
 const result=await runner({executable:'powershell.exe',args:encodedPowerShell(script),timeoutMs:20_000,windowsHide:true});
 if(result.timedOut)throw Error('共享环境检查超时');
 if(result.spawnError)throw Error('无法启动 Windows 共享环境检查');
 if(result.exitCode!==0)throw Error('Windows 共享环境检查未完成，账号身份尚未核对');
 let value:unknown;try{value=JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());}catch{throw Error('Windows 共享环境检查未返回可识别结果');}
 const parsed=setupSchema.parse(value);
 const used=new Set([...parsed.drives,...parsed.mappings.map(item=>item.localPath)].map(item=>item.toUpperCase()));
 const availableDrives=[] as string[];for(let code='D'.charCodeAt(0);code<='Z'.charCodeAt(0);code++){const drive=String.fromCharCode(code)+':';if(!used.has(drive))availableDrives.push(drive);}
 const verified=parsed.identityStatus==='verified'&&!!parsed.currentSid&&!!parsed.qualifiedName;
 const localCurrent=parsed.localUsers.find(item=>item.sid===parsed.currentSid);
 const accounts:ShareSetupInfo['accounts']=verified?[{name:localCurrent?.name||parsed.userName,qualifiedName:parsed.qualifiedName,current:true,sid:parsed.currentSid!,displayName:localCurrent?.displayName,principalSource:localCurrent?.principalSource}]:[];
 for(const user of parsed.localUsers)if(user.enabled&&user.sid&&user.qualifiedName&&!accounts.some(item=>item.sid===user.sid))accounts.push({name:user.name,qualifiedName:user.qualifiedName,current:false,sid:user.sid,displayName:user.displayName,principalSource:user.principalSource});
 return{supported:process.platform==='win32',host:parsed.host,currentUser:{name:verified?(localCurrent?.name||parsed.userName):'未能识别',qualifiedName:verified?parsed.qualifiedName:'',sid:parsed.currentSid??undefined,status:verified?'verified':'unavailable',principalSource:localCurrent?.principalSource,description:verified?'当前 Windows 身份已按 SID 核对；显示名称不作为登录账号。接收者仍需使用获授权的 Windows 账号和密码，Windows Hello PIN 不是 SMB 密码。':'当前 Windows 身份暂不可核对；请手动输入并核对账号，不能使用显示名称或环境变量代替登录身份。'},accounts,existingShares:parsed.shares.map(item=>({...item,description:item.description??undefined})),availableDrives,mappings:parsed.mappings.map(item=>({drive:item.localPath,remotePath:item.remotePath,status:item.status})),diagnostic:cleanDiagnostic([parsed.diagnostic,!verified?'当前账号未按 SID 核对，需手动指定':undefined].filter(Boolean).join('；'))};
}

function samePath(a:string,b:string){return path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
export function suggestShareName(folder:string,existingNames:readonly string[]){
 const raw=path.basename(path.resolve(folder)).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
 const base=(raw||'PMShare').slice(0,42),used=new Set(existingNames.map(item=>item.toLowerCase()));
 if(!used.has(base.toLowerCase())&&!/^(?:ADMIN|IPC|[A-Z])\$$/i.test(base))return base;
 const hash=createHash('sha256').update(path.resolve(folder)).digest('hex').slice(0,8);
 for(let attempt=0;attempt<1000;attempt++){const suffix=attempt?`${hash}-${attempt}`:hash;const candidate=`${base.slice(0,49-suffix.length)}-${suffix}`;if(!used.has(candidate.toLowerCase()))return candidate;}
 throw Error('无法生成不冲突的安全共享名称');
}
export function describeShareFolder(folder:string,setup:ShareSetupInfo):ShareFolderSelection{
 const resolved=path.resolve(folder),existing=setup.existingShares.find(item=>!item.special&&!/^(?:ADMIN|IPC|[A-Z])\$$/i.test(item.name)&&samePath(item.path,resolved));
 return{path:resolved,folderName:path.basename(resolved)||resolved,suggestedShareName:existing?.name??suggestShareName(resolved,setup.existingShares.map(item=>item.name)),existingShare:existing?{name:existing.name,path:existing.path}:undefined};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disconnectNetworkShare,reconnectNetworkShare,inspectSharePermissions,manageLocalShare,buildShareManagementScript,mappingTargetFromUnc,type NetworkShareRunner,type PowerShellRunRequest} from '../main/network-share.js';
import {requestSchema} from '../shared/types.js';
const target={drive:'P:',expectedRemotePath:'\\\\DEMO-HOST\\Demo'};
const output=(data:unknown)=>({exitCode:0,stdout:JSON.stringify(data),stderr:''});
const script=(r:PowerShellRunRequest)=>Buffer.from(r.args[r.args.indexOf('-EncodedCommand')+1],'base64').toString('utf16le');
const update={type:'sharePermissionUpdate' as const,shareName:'Demo',expectedPath:'C:\\Synthetic',expectedFingerprint:'a'.repeat(64),previousAccount:'DEMO-HOST\\alice',account:'DEMO-HOST\\bob',access:'read_only' as const};

test('management schema rejects legacy drive-only disconnect and unsafe targets',()=>{
 assert.throws(()=>requestSchema.parse({type:'shareDisconnect',drive:'P:'}));
 assert.throws(()=>mappingTargetFromUnc('P:','\\\\host\\share\\subfolder'));
 assert.throws(()=>buildShareManagementScript({...update,shareName:'C$'},'receipt.json'));
 assert.throws(()=>requestSchema.parse({...update,expectedFingerprint:'old'}));
});
test('disconnect checks exact mapping and removes only selected object, credentials opt-in',async()=>{
 const runner:NetworkShareRunner=async r=>{const s=script(r);assert.match(s,/OrdinalIgnoreCase.Equals/);assert.match(s,/Remove-SmbMapping -InputObject \$mapping -UpdateProfile -Force/);assert.doesNotMatch(s,/Remove-SmbShare|Set-Acl|cmdkey|net use|\* /);assert.equal(r.sensitiveStdin,undefined);return output({status:'succeeded',mappingRemoved:true,credentialsCleared:false});};
 const r=await disconnectNetworkShare({type:'shareDisconnect',...target},runner);assert.equal(r.status,'succeeded');assert.equal(r.mappingRemoved,true);
});
test('changed drive does not remove mapping, timeout remains unknown',async()=>{
 const conflict=await disconnectNetworkShare({type:'shareDisconnect',...target},async()=>output({status:'conflict',mappingRemoved:false}));assert.equal(conflict.status,'conflict');assert.equal(conflict.mappingRemoved,false);
 const timeout=await disconnectNetworkShare({type:'shareDisconnect',...target},async()=>({exitCode:null,stdout:'',stderr:'',timedOut:true}));assert.equal(timeout.status,'outcome_unknown');
});
test('credential deletion is bounded to host and partial failure is honest',async()=>{
 const r=await disconnectNetworkShare({type:'shareDisconnect',...target,clearCredentials:true},async request=>{assert.match(script(request),/cmdkey.exe '\/delete:DEMO-HOST'/);assert.doesNotMatch(script(request),/\/delete:\*|Remove-SmbMapping -RemotePath/);return output({status:'partial',mappingRemoved:true,credentialsCleared:false});});assert.equal(r.status,'partial');assert.equal(r.mappingRemoved,true);
});
test('reconnect uses ordered native operations, stdin password, real follow-up inspection',async()=>{
 let n=0;const password='only-in-stdin-中文';const runner:NetworkShareRunner=async r=>{n++;const s=script(r);assert(!r.args.join(' ').includes(password));assert(!s.includes(password));if(n===1){assert.match(s,/Remove-SmbMapping/);return output({status:'succeeded',mappingRemoved:true,credentialsCleared:false});}if(n===2){assert.match(s,/New-SmbMapping/);assert.equal(r.sensitiveStdin,password);assert.match(s,/-SaveCredentials/);return output({ok:true,state:'connected',localPath:'P:',remotePath:target.expectedRemotePath,mappingStatus:'OK'});}assert.match(s,/Get-SmbMapping/);return output({ok:true,state:'reused',localPath:'P:',remotePath:target.expectedRemotePath,mappingStatus:'OK',source:'smb'});};
 const result=await reconnectNetworkShare({type:'shareReconnect',...target,authentication:{mode:'username-password',username:'DEMO-HOST\\bob',password,saveCredentials:true}},runner);assert.equal(result.status,'succeeded');assert.equal(n,3);assert.match(result.diagnostic,/未修改 Windows 账号密码/);
});
test('reconnect does not proceed after conflict and reports failed authentication after removal',async()=>{
 let calls=0;const input={type:'shareReconnect' as const,...target,authentication:{mode:'username-password' as const,username:'bob',password:'secret'}};
 const conflicted=await reconnectNetworkShare(input,async()=>{calls++;return output({status:'conflict',mappingRemoved:false});});assert.equal(conflicted.status,'conflict');assert.equal(calls,1);
 calls=0;const r=await reconnectNetworkShare(input,async()=>++calls===1?output({status:'succeeded',mappingRemoved:true}):output({ok:false,state:'failed',localPath:'P:',remotePath:target.expectedRemotePath,mappingStatus:null,hresult:1326}));assert.equal(r.status,'partial');assert.equal(r.mappingRemoved,true);assert.equal(calls,2);assert.match(r.diagnostic,/原映射已断开/);
});
test('malicious command diagnostic cannot echo connection password',async()=>{
 let calls=0;const r=await reconnectNetworkShare({type:'shareReconnect',...target,authentication:{mode:'username-password',username:'bob',password:'secret-123'}},async()=>++calls===1?output({status:'succeeded',mappingRemoved:true}):output({ok:false,state:'failed',localPath:'P:',remotePath:target.expectedRemotePath,mappingStatus:null,message:'bad secret-123'}));assert(!r.diagnostic.includes('secret-123'));
});
test('permission inspection validates expected local target and exposes explicit grants',async()=>{
 const runner:NetworkShareRunner=async r=>{assert.match(script(r),/Checked-Share/);assert.doesNotMatch(script(r),/Set-Acl|Grant-SmbShareAccess/);return output({shareName:'Demo',path:'C:\\Synthetic',fingerprint:'a'.repeat(64),accounts:[{account:'DEMO-HOST\\alice',type:'Allow',access:'Change'}]});};const p=await inspectSharePermissions({shareName:'Demo',expectedPath:'C:\\Synthetic'},runner);assert.equal(p.accounts[0].access,'Change');assert.match(p.notice,/继承/);await assert.rejects(()=>inspectSharePermissions({shareName:'Demo',expectedPath:'C:\\Other'},runner),/目标已变化/);
});
test('authorization change preserves other grants/ACL, supports read downgrade and rollback',()=>{
 const s=buildShareManagementScript(update,'C:\\test\\receipt.json');assert.match(s,/Access-Fingerprint \$oldAccess/);assert.match(s,/if\(\$oldSid -ne \$sid/);assert.match(s,/-AccessRight Read/);assert.match(s,/ReadAndExecute/);assert.match(s,/\$ntfsDeny/);assert.match(s,/SetSecurityDescriptorSddlForm/);assert.match(s,/foreach\(\$entry in \$affected\)/);assert.doesNotMatch(s,/Set-LocalUser|net user|Remove-Item|New-SmbShare/);
 const write=buildShareManagementScript({...update,access:'read_write'},'receipt.json');assert.match(write,/-AccessRight Change/);assert.match(write,/::Modify/);
});
test('stop share checks path/special status and does not delete directory or revoke ACL',()=>{
 const s=buildShareManagementScript({type:'shareStop',shareName:'Demo',expectedPath:'C:\\Synthetic'},'receipt.json');assert.match(s,/Checked-Share/);assert.match(s,/Remove-SmbShare -InputObject \$existing/);assert.doesNotMatch(s,/Remove-Item|Set-Acl|Revoke-SmbShareAccess/);
});
test('elevated lifecycle checks receipts; timeout/absent receipt is unknown, rollback failure retained',async()=>{
 let seen=false;const runner:NetworkShareRunner=async r=>{seen=true;const launcher=script(r);assert.match(launcher,/RunAs -WindowStyle Hidden/);assert.equal(r.sensitiveStdin,undefined);return output({});};
 const good=await manageLocalShare(update,'receipt.json',runner,async()=>JSON.stringify({status:'succeeded',diagnostic:'updated',rollbackSucceeded:true}));assert.equal(good.status,'succeeded');assert(seen);
 const missing=await manageLocalShare(update,'receipt.json',runner,async()=>{throw Error('missing');});assert.equal(missing.status,'outcome_unknown');
 const timeout=await manageLocalShare(update,'receipt.json',async()=>({exitCode:null,stdout:'',stderr:'',timedOut:true}),async()=>{throw Error('must not read stale receipt');});assert.equal(timeout.status,'outcome_unknown');
 const rollback=await manageLocalShare(update,'receipt.json',runner,async()=>JSON.stringify({status:'outcome_unknown',diagnostic:'rollback failed',rollbackSucceeded:false}));assert.equal(rollback.status,'outcome_unknown');
});

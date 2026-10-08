import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSharingSetup} from '../main/sharing-setup.js';
import {shareAuthorizationSelection,type SharePermissionView} from '../shared/network-share-management.js';
const sid='S-1-5-21-1-2-3-1001';
const identity={qualifiedName:'DEMO\\真实账号',sid,status:'verified' as const};
const ace=(account:string,principalKind:'user'|'group'|'unknown',sidValue?:string,type:'Allow'|'Deny'='Allow',access:'Read'|'Change'|'Full'='Full')=>({account,principalKind,sid:sidValue,type,access});
const view=(accounts:SharePermissionView['accounts']):SharePermissionView=>({shareName:'Demo',path:'C:\\Demo',fingerprint:'a'.repeat(64),accounts,notice:''});
test('group-first ACL selects only actual current SID regardless of order or alias',()=>{
 const v=view([ace('BUILTIN\\Administrators','group','S-1-5-32-544'),ace('DEMO\\old-name','user',sid,'Allow','Read')]);
 const s=shareAuthorizationSelection(identity,v);assert.equal(s.previousAccount,'DEMO\\old-name');assert.equal(s.account,identity.qualifiedName);assert.equal(s.access,'read_only');assert(s.currentGranted);
});
test('no individual grant adds current identity without implicitly replacing group',()=>{
 const v=view([ace('BUILTIN\\Administrators','group','S-1-5-32-544'),ace('Everyone','group','S-1-1-0')]);const before=JSON.stringify(v);
 const s=shareAuthorizationSelection(identity,v);assert.equal(s.previousAccount,'');assert.equal(s.account,identity.qualifiedName);assert.equal(s.access,'read_write');assert(!s.currentGranted);assert.equal(JSON.stringify(v),before);
});
test('display-name equality never substitutes SID; unresolved identity does not fabricate account',()=>{
 assert.equal(shareAuthorizationSelection(identity,view([ace(identity.qualifiedName,'user','S-1-5-21-1-2-3-1002')])).previousAccount,'');
 const s=shareAuthorizationSelection({qualifiedName:'DEMO\\display-only',status:'unavailable'},view([ace('DEMO\\display-only','user')]));assert.equal(s.account,'');assert(!s.identityVerified);assert.equal(s.previousAccount,'');
});
test('explicit deny does not default writable or replace existing account, group stays group',()=>{
 const s=shareAuthorizationSelection(identity,view([ace(identity.qualifiedName,'user',sid,'Deny'),ace(identity.qualifiedName,'user',sid,'Allow')]));assert(s.currentDenied);assert(!s.currentGranted);assert.equal(s.previousAccount,'');assert.equal(s.access,'read_only');
 assert(!shareAuthorizationSelection(identity,view([ace('group','group',sid)])).currentGranted);
});
const payload={host:'DEMO',userName:'untrusted-env',qualifiedName:'DEMO\\真实账号',currentSid:sid,identityStatus:'verified',shares:[],localUsers:[{name:'真实账号',enabled:true,sid,qualifiedName:'DEMO\\真实账号',displayName:'友好显示名',principalSource:'MicrosoftAccount'},{name:'别名',enabled:true,sid,qualifiedName:'MicrosoftAccount\\alias@example.invalid',principalSource:'MicrosoftAccount'},{name:'域用户',enabled:true,sid:'S-1-5-21-8-9-10-1010',qualifiedName:'DOMAIN\\域用户',principalSource:'ActiveDirectory'}],mappings:[],drives:[]};
test('setup uses SID deduplication, canonical account and source rather than environment/display name',async()=>{
 const result=await inspectSharingSetup(async r=>{const script=Buffer.from(r.args[r.args.indexOf('-EncodedCommand')+1],'base64').toString('utf16le');assert.match(script,/InputEncoding=.*UTF8Encoding/);assert.match(script,/OutputEncoding=.*UTF8Encoding/);assert.match(script,/WindowsIdentity.*GetCurrent/);assert.match(script,/Get-CimInstance Win32_UserAccount -Filter 'LocalAccount=True'/);assert.doesNotMatch(script,/\[Environment\]::UserName/);return{exitCode:0,stdout:JSON.stringify(payload),stderr:''};});
 assert.equal(result.accounts.length,2);assert.equal(result.currentUser.name,'真实账号');assert.equal(result.currentUser.qualifiedName,'DEMO\\真实账号');assert.equal(result.currentUser.sid,sid);assert.equal(result.accounts[0].displayName,'友好显示名');assert.equal(result.accounts[0].principalSource,'MicrosoftAccount');assert.equal(result.accounts[1].qualifiedName,'DOMAIN\\域用户');
});
test('local enumeration unavailable preserves verified domain token, missing SID is truthful',async()=>{
 const run=(value:unknown)=>inspectSharingSetup(async()=>({exitCode:0,stdout:JSON.stringify(value),stderr:''}));
 const domain=await run({...payload,userName:'domain-user',qualifiedName:'DOMAIN\\domain-user',localUsers:[]});assert.equal(domain.currentUser.status,'verified');assert.equal(domain.accounts[0].qualifiedName,'DOMAIN\\domain-user');
 const missing=await run({...payload,currentSid:null,identityStatus:'unavailable',qualifiedName:'display-name',localUsers:[{name:'伪显示名',enabled:true}]});assert.equal(missing.currentUser.status,'unavailable');assert.equal(missing.currentUser.qualifiedName,'');assert.equal(missing.accounts.length,0);assert.match(missing.diagnostic!,/SID/);
});

test('nonzero setup command cannot promote partial identity stdout to verified',async()=>{
 await assert.rejects(()=>inspectSharingSetup(async()=>({exitCode:1,stdout:JSON.stringify(payload),stderr:''})),/检查未完成/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {buildWritableShareScript,describeShareFolder,inspectSharingSetup,suggestShareName} from '../main/sharing-setup.js';

test('共享创建脚本授予指定账号 SMB Change 与 NTFS Modify 并可回滚',()=>{
 const script=buildWritableShareScript({path:'C:\\Work\\Docs',shareName:'ProductDocs',account:'PM-PC\\alice',receiptPath:'C:\\Temp\\receipt.json'});
 assert.match(script,/-ChangeAccess \$account/);
 assert.match(script,/Grant-SmbShareAccess/);
 assert.match(script,/AccessRight Change/);
 assert.match(script,/FileSystemAccessRule\(\$account,'Modify'/);
 assert.match(script,/AccessControlType -eq 'Deny'/);
 assert.match(script,/可能存在拒绝或过宽的权限/);
 assert.match(script,/SetSecurityDescriptorSddlForm\(\$oldSddl\)/);
 assert.match(script,/Remove-SmbShare/);
 assert.match(script,/Revoke-SmbShareAccess/);
});

test('共享环境检查返回当前账号、普通共享和未占用盘符',async()=>{
 const result=await inspectSharingSetup(async request=>{
  assert.equal(request.sensitiveStdin,undefined);assert.equal(request.windowsHide,true);
  return{exitCode:0,stdout:JSON.stringify({host:'PM-PC',userName:'alice',qualifiedName:'PM-PC\\alice',currentSid:'S-1-5-21-1-2-3-1001',identityStatus:'verified',shares:[{name:'C$',path:'C:\\',description:'admin',special:true},{name:'Docs',path:'C:\\Work\\Docs',description:null,special:false}],localUsers:[{name:'alice',enabled:true,sid:'S-1-5-21-1-2-3-1001',qualifiedName:'PM-PC\\alice'},{name:'bob',enabled:true,sid:'S-1-5-21-1-2-3-1002',qualifiedName:'PM-PC\\bob'},{name:'disabled',enabled:false}],mappings:[{localPath:'P:',remotePath:'\\\\server\\share',status:'OK'}],drives:['C:','D:'],diagnostic:null}),stderr:''};
 });
 assert.equal(result.host,'PM-PC');assert.equal(result.currentUser.qualifiedName,'PM-PC\\alice');assert.match(result.currentUser.description,/PIN/);assert.ok(result.accounts.some(item=>item.qualifiedName==='PM-PC\\bob'));
 assert.equal(result.availableDrives.includes('P:'),false);assert.equal(result.availableDrives[0],'E:');
});

test('共享文件夹建议不会复用管理共享且名称冲突时稳定避让',()=>{
 const setup={supported:true,host:'PM-PC',currentUser:{name:'alice',qualifiedName:'PM-PC\\alice',description:''},accounts:[],existingShares:[{name:'C$',path:'C:\\',special:true},{name:'Docs',path:'C:\\Other',special:false}],availableDrives:['P:'],mappings:[]};
 const selected=describeShareFolder('C:\\',setup);assert.equal(selected.existingShare,undefined);assert.notEqual(selected.suggestedShareName,'C$');
 const suggested=suggestShareName('C:\\Work\\Docs',['Docs']);assert.match(suggested,/^Docs-[a-f0-9]+$/);assert.notEqual(suggested.toLowerCase(),'docs');
});

test('已有普通共享指向同一目录时向导可安全复用名称',()=>{
 const setup={supported:true,host:'PM-PC',currentUser:{name:'alice',qualifiedName:'PM-PC\\alice',description:''},accounts:[],existingShares:[{name:'ProductDocs',path:'C:\\Work\\Docs',special:false}],availableDrives:['P:'],mappings:[]};
 const selected=describeShareFolder('C:\\Work\\Docs',setup);assert.equal(selected.existingShare?.name,'ProductDocs');assert.equal(selected.suggestedShareName,'ProductDocs');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {isHiddenTestProfile} from '../main/test-profile.js';
test('hidden window opt-in requires a strict real test descendant; junction escapes rejected',async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'slash-hidden-')),root=path.join(temporary,'.test-data'),profile=path.join(root,'case','profile'),outside=path.join(temporary,'.test-data-other');
 try{
  await fs.mkdir(profile,{recursive:true});await fs.mkdir(outside);
  assert.equal(await isHiddenTestProfile(profile,root,'1'),true);
  for(const [dir,flag] of [[profile,undefined],[profile,'true'],[root,'1'],[outside,'1'],['relative','1']] as const)assert.equal(await isHiddenTestProfile(dir,root,flag),false);
  const link=path.join(root,'escape');await fs.symlink(outside,link,process.platform==='win32'?'junction':'dir');assert.equal(await isHiddenTestProfile(link,root,'1'),false);
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
});

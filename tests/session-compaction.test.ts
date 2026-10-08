import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SettingsManager} from '@earendil-works/pi-coding-agent';
import {configureSessionCompaction} from '../main/session-compaction.js';
const model={provider:'baishan',id:'fixture',contextWindow:65536};
test('small-window session default uses native model override without persisting or changing reserve/capacity',()=>{
 const settings=SettingsManager.inMemory();configureSessionCompaction(settings,model);
 assert.deepEqual(settings.getCompactionSettings(model),{enabled:true,reserveTokens:16384,keepRecentTokens:8192});assert.equal(model.contextWindow,65536);assert.equal(settings.getGlobalSettings().compaction,undefined);assert.equal(settings.getProjectSettings().compaction,undefined);assert.equal(settings.getCompactionKeepRecentTokens({provider:'other',id:'model'}),20000);
});
test('explicit ordinary and per-model keep values, including zero and reserve overrides, retain precedence',()=>{
 for(const compaction of [{keepRecentTokens:14000,reserveTokens:17000},{modelOverrides:{'baishan/fixture':{keepRecentTokens:12345}}},{keepRecentTokens:0},{keepRecentTokens:100,modelOverrides:{'baishan/fixture':{keepRecentTokens:222}}}]){
  const settings=SettingsManager.inMemory({compaction}),before=settings.getCompactionSettings(model);configureSessionCompaction(settings,model);assert.deepEqual(settings.getCompactionSettings(model),before);
 }
});
test('200k window keeps Pi native 20k',()=>{
 const settings=SettingsManager.inMemory();configureSessionCompaction(settings,{...model,contextWindow:200000});assert.equal(settings.getCompactionKeepRecentTokens(model),20000);
});
test('real global/project explicit keep settings are preserved byte-for-byte, reserve-only model override remains',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-compaction-settings-')),globalDir=path.join(dir,'agent'),projectDir=path.join(dir,'project');t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.mkdir(globalDir);await fs.mkdir(path.join(projectDir,'.pi'),{recursive:true});
 const globalFile=path.join(globalDir,'settings.json'),projectFile=path.join(projectDir,'.pi/settings.json'),globalText=JSON.stringify({compaction:{keepRecentTokens:15000}}),projectText=JSON.stringify({compaction:{modelOverrides:{'baishan/fixture':{keepRecentTokens:11000}}}});
 await fs.writeFile(globalFile,globalText);await fs.writeFile(projectFile,projectText);
 const settings=SettingsManager.create(projectDir,globalDir);configureSessionCompaction(settings,model);assert.equal(settings.getCompactionKeepRecentTokens(model),11000);assert.equal(await fs.readFile(globalFile,'utf8'),globalText);assert.equal(await fs.readFile(projectFile,'utf8'),projectText);
 const reserve=SettingsManager.inMemory({compaction:{modelOverrides:{'baishan/fixture':{reserveTokens:17000}}}});configureSessionCompaction(reserve,model);assert.deepEqual(reserve.getCompactionSettings(model),{enabled:true,reserveTokens:17000,keepRecentTokens:8192});
});

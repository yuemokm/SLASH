import test from 'node:test';
import assert from 'node:assert/strict';
import {applySlashCommand,matchingSlashCommands} from '../src/slash-commands.js';
import {resolveComposerIntent} from '../src/composer-intent.js';
import {searchSettings,settingsDestination} from '../src/settings-navigation.js';

test('slash skill names remain distinct from builtins; name/description filtering includes explicit-only skills',()=>{
 const skill={name:'review',description:'手动核对资料',scope:'global' as const,mountId:'g',path:'SKILL.md',contentHash:'hash',disableModelInvocation:true};
 const all=matchingSlashCommands('/',[skill]);assert.equal(all[0].command,'/skill:review');assert.ok(all.some(item=>item.command==='/review'));assert.ok(all.some(item=>item.command==='/skill:review'));
 assert.deepEqual(matchingSlashCommands('/手动',[skill]).map(item=>item.command),['/skill:review']);assert.equal(matchingSlashCommands('/nothing',[skill]).length,0);
 assert.equal(applySlashCommand('/','/skill:review'),'/skill:review ');assert.equal(applySlashCommand(' /rev 保留任务\n与资料','/skill:review'),'/skill:review 保留任务\n与资料');
 assert.equal(resolveComposerIntent({draft:'/skill:review 核对',workflowKind:'meeting',view:'会话'}).kind,undefined);
});
test('quality search and legacy policies destination open general; old skill keyword finds renamed skills',()=>{
 assert.equal(searchSettings('质量')[0].tab,'general');assert.equal(settingsDestination('policies'),'general');assert.equal(searchSettings('全局技能')[0].label,'skills');
});

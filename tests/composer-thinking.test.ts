import assert from 'node:assert/strict';
import test from 'node:test';
import {planThinkingOverride} from '../src/composer-thinking.js';

test('重启后的未操作Plan确认继承原档位，手动默认与明确档位可区分',()=>{
 assert.equal(planThinkingOverride(undefined,false),undefined);
 assert.equal(planThinkingOverride('high',false),undefined);
 assert.equal(planThinkingOverride(undefined,true),null);
 assert.equal(planThinkingOverride('high',true),'high');
 assert.equal(planThinkingOverride('off',true),'off');
});

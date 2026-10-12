import assert from 'node:assert/strict';
import test from 'node:test';
import {planThinkingOverride,adjustableThinking,availableThinkingLevel} from '../src/composer-thinking.js';
import type {ModelThinkingCapability} from '../shared/types.js';

test('重启后的未操作Plan确认继承原档位，手动默认与明确档位可区分',()=>{
 assert.equal(planThinkingOverride(undefined,false),undefined);
 assert.equal(planThinkingOverride('high',false),undefined);
 assert.equal(planThinkingOverride(undefined,true),null);
 assert.equal(planThinkingOverride('high',true),'high');
 assert.equal(planThinkingOverride('off',true),'off');
});

test('未知、固定和加载中没有强度入口，隐藏的旧档位不进入新请求',()=>{
 const supported:ModelThinkingCapability={modelId:'a',fingerprint:'a',status:'supported',levels:['low','high'],source:'fixture',reason:'fixture'};
 assert.equal(adjustableThinking(supported,false),true);
 assert.equal(availableThinkingLevel(supported,false,'high'),'high');
 for(const capability of [undefined,{...supported,status:'unknown' as const},{...supported,status:'unsupported' as const},{...supported,levels:['high' as const]}]){assert.equal(adjustableThinking(capability,false),false);assert.equal(availableThinkingLevel(capability,false,'high'),undefined);}
 assert.equal(availableThinkingLevel(supported,true,'high'),undefined);
 assert.equal(availableThinkingLevel(supported,false,'medium'),undefined);
});

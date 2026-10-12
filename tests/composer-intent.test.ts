import assert from 'node:assert/strict';
import test from 'node:test';
import {appendComposerPreset,resolveComposerIntent} from '../src/composer-intent.js';

test('真实工作流继续分类，已移除的PM斜杠预设没有隐藏路由',()=>{
 assert.equal(resolveComposerIntent({draft:'生成审批原型',workflowKind:'prototype',view:'会话'}).taskType,'coding');
 for(const command of ['/prototype','/prd','/research','/review'])assert.deepEqual(resolveComposerIntent({draft:`${command} 保留原文`,view:'会话'}),{command,kind:undefined,taskType:'general'});
 assert.equal(resolveComposerIntent({draft:'/review 检查审批流程',view:'成果'}).taskType,'writing');
 for(const workflowKind of ['prd','meeting','prototype_to_prd','change_summary'] as const)assert.equal(resolveComposerIntent({draft:'处理来源资料',workflowKind,view:'会话'}).taskType,'writing');
});

test('Plan继承所选工作流分类；普通输入保留页面默认，不把相似文本当命令',()=>{
 assert.equal(resolveComposerIntent({draft:'/plan 先给方向',workflowKind:'prototype',view:'会话'}).taskType,'coding');
 assert.equal(resolveComposerIntent({draft:'/plan 先给方向',workflowKind:'research',view:'会话'}).taskType,'research');
 assert.equal(resolveComposerIntent({draft:'说明 /review 的用法',view:'会话'}).taskType,'general');
 assert.equal(resolveComposerIntent({draft:'/reviewer 检查',view:'会话'}).taskType,'general');
 assert.equal(resolveComposerIntent({draft:'普通请求',view:'资源'}).taskType,'research');
 assert.equal(resolveComposerIntent({draft:'普通请求',view:'成果'}).taskType,'writing');
 assert.equal(resolveComposerIntent({draft:'普通请求',view:'会话'}).taskType,'general');
 assert.equal(resolveComposerIntent({draft:'/prd 整理资料',workflowKind:'research',view:'会话'}).taskType,'research');
 assert.equal(resolveComposerIntent({draft:'/help',workflowKind:'meeting',view:'会话'}).kind,undefined);
});

test('快捷提示词保留用户草稿且重复选择不再插入同一段',()=>{
 assert.equal(appendComposerPreset('请保留我已写的规则。','读取资料，区分已确认与待确认。'),'请保留我已写的规则。\n\n读取资料，区分已确认与待确认。');
 const inserted=appendComposerPreset('','读取实际来源');assert.equal(inserted,'读取实际来源');
 assert.equal(appendComposerPreset(inserted,'读取实际来源'),inserted);
 assert.equal(appendComposerPreset('用户输入',''), '用户输入');
});

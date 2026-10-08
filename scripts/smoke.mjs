import {_electron as electron} from 'playwright';
import {projectResourceLocation} from './composer-smoke-helpers.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const root=process.cwd();const data=path.join(root,'.test-data');await fs.mkdir(data,{recursive:true});
const app=await electron.launch({args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:path.join(data,'app')}});
try{const page=await app.firstWindow();await page.waitForSelector('.brand');const errors=[];page.on('pageerror',e=>errors.push(e.message));
const call=async r=>{const result=await page.evaluate(r=>window.pm.request(r),r);if(!result.ok)throw Error(result.error);return result.data;};
await call({type:'workspace',path:path.join(data,'workspace')});const state=await call({type:'state'});const tree=await call({type:'projectTreeGet'});for(const role of ['resource','output','process'])if(!tree.appliedNodes.some(node=>node.role===role&&state.mounts.some(mount=>mount.id===node.mountId)))throw Error('Workspace role mount missing: '+role);
await page.locator('.rail-item[aria-label="设置"]').click();await page.screenshot({path:path.join(data,'settings.png')});await page.getByRole('button',{name:'关闭设置',exact:true}).click();
if(process.argv.includes('--live')){
 const credPath=process.env.PM_CREDENTIAL_FILE||path.join(os.homedir(),'Desktop','认证.txt');const raw=await fs.readFile(credPath,'utf8');const offset=raw.toLowerCase().indexOf('baishan');if(offset<0)throw Error('Baishan section missing');const section=raw.slice(offset);const url=section.match(/https:\/\/[^\s]+/u)?.[0];const apiKey=section.match(/sk-[A-Za-z0-9_-]+/)?.[0];const model=section.match(/DeepSeek-[A-Za-z0-9.-]+/)?.[0];if(!url||!apiKey||!model)throw Error('Cannot parse Baishan credentials; no credentials printed');
 await call({type:'model',baseUrl:url,id:model,key:apiKey});const probe=await call({type:'testModel'});console.log('Model probe',JSON.stringify(probe));
 const reference=projectResourceLocation(tree);await fs.writeFile(path.join(reference.directory,'客户准入调研.md'),'客户准入：销售提交申请，主管审批；企业信用代码不得重复；退回必须填写原因。高风险客户需风控复核。');
 const id=await call({type:'conversation',title:'验收：客户准入'});await call({type:'send',id,text:`请阅读mountId=${reference.mountId}的${reference.file('客户准入调研.md')}，生成可交互的单文件HTML原型和配套PRD，分别放成果的原型与PRD文件夹。必须调用工具写草稿，不要仅回复代码。原型需要新增客户表单、列表、审批和退回交互，含模拟数据。测试用紧凑版本，HTML 不超过200行，PRD 不超过100行。`});
 const deadline=Date.now()+600000;let result;while(Date.now()<deadline){await page.waitForTimeout(1500);result=await call({type:'state'});const run=result.runs.find(r=>r.conversationId===id);if(['succeeded','failed','cancelled'].includes(run?.status)){console.log('Run',run.status,run.error||'');break;}}
 const run=result.runs.find(r=>r.conversationId===id);if(run.status!=='succeeded')throw Error('Agent run did not succeed');const changes=result.changes.filter(c=>c.runId===run.id);if(changes.length<2)throw Error('Expected prototype and PRD drafts');for(const c of changes)await call({type:'apply',id:c.id});console.log('Artifacts',changes.map(c=>c.path).join(', '));
 await fs.writeFile(path.join(data,'live-result.json'),JSON.stringify({model,probe,runId:run.id,status:run.status,artifacts:changes.map(c=>({path:c.path,status:'applied'}))},null,2));
}
await page.getByRole('button',{name:'◌会话',exact:true}).click().catch(()=>{});await page.screenshot({path:path.join(data,'workspace.png')});if(errors.length)throw Error(errors.join('\n'));console.log('Electron smoke passed');
}finally{await app.close();}

import {_electron as electron} from 'playwright';
import {projectResourceLocation} from './composer-smoke-helpers.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const value=(name,fallback)=>{
 const index=args.indexOf(name);if(index<0)return fallback;
 const result=args[index+1];if(!result||result.startsWith('--'))throw Error(`${name} 需要参数`);return result;
};
const root=process.cwd();
const executable=path.resolve(value('--executable',value('--exe',path.join(root,'release','win-unpacked','slash.exe'))));
const outputDir=path.resolve(value('--output-dir',path.join(root,'.test-data','packaged-smoke')));
const smokeDataDir=path.resolve(value('--data-dir',path.join(root,'.test-data','app')));
const workspace=path.resolve(value('--workspace',path.join(root,'.test-data','packaged-workspace')));
const configureUser=flag('--configure-user');
const skipModel=flag('--skip-model');
const expectedModel='DeepSeek-V4-Flash-0731';
await fs.access(executable);
await fs.mkdir(outputDir,{recursive:true});
await fs.mkdir(smokeDataDir,{recursive:true});
await fs.mkdir(workspace,{recursive:true});

function parseBaishanCredentials(raw){
 const lines=raw.split(/\r?\n/);const marker=lines.findIndex(line=>/baishan/i.test(line));if(marker<0)throw Error('认证文件缺少 Baishan 区段');
 const headingOffset=lines.slice(marker+1,marker+25).findIndex(line=>/^\s*(?:#{1,6}\s+|\[[^\]]+\]\s*$)/u.test(line)&&!/baishan/i.test(line));
 const sectionEnd=headingOffset<0?Math.min(lines.length,marker+20):marker+1+headingOffset;
 const section=lines.slice(marker,sectionEnd).join('\n');
 const baseUrl=section.match(/https:\/\/[^\s"'<>]+/u)?.[0]?.replace(/[),.;]+$/u,'').replace(/\/$/u,'');
 const model=section.match(/\bDeepSeek-V4-Flash-0731\b/u)?.[0];
 const skKey=section.match(/\bsk-[A-Za-z0-9_-]+\b/u)?.[0];
 const labelled=section.match(/(?:api[ _-]?key|密钥|key)\s*[:：=]\s*["']?([^\s"']+)/iu)?.[1];
 const apiKey=skKey||labelled;
 if(!baseUrl||!apiKey||model!==expectedModel)throw Error('无法从 Baishan 区段解析 URL、密钥和精确模型 ID；未输出凭据');
 return{baseUrl,apiKey,model};
}
async function launch(dataDir){
 const env={...process.env};if(dataDir)env.PM_SLASH_DATA_DIR=dataDir;else delete env.PM_SLASH_DATA_DIR;
 const app=await electron.launch({executablePath:executable,args:[],env});
 const page=await app.firstWindow();await page.waitForSelector('.brand',{timeout:30000});return{app,page};
}
const request=async(page,payload)=>{
 const result=await page.evaluate(value=>window.pm.request(value),payload);
 if(!result.ok)throw Error(result.error);return result.data;
};
async function saveModel(page,credentials){
 await request(page,{type:'model',baseUrl:credentials.baseUrl,id:credentials.model,key:credentials.apiKey});
 const state=await request(page,{type:'state'});if(!state.model.hasKey||state.model.id!==expectedModel)throw Error('模型配置未保存');
}

let credentials;
if(configureUser){
 const credentialFile=path.resolve(value('--credential-file',process.env.PM_CREDENTIAL_FILE||path.join(os.homedir(),'Desktop','认证.txt')));
 credentials=parseBaishanCredentials(await fs.readFile(credentialFile,'utf8'));
 if(!process.env.APPDATA)throw Error('APPDATA 不可用，无法定位用户默认 profile');
 // 不传 PM_SLASH_DATA_DIR，覆盖 main.ts 实际默认的 appData/slash profile。
 const configured=await launch();
 try{await saveModel(configured.page,credentials);if(!skipModel){const probe=await request(configured.page,{type:'testModel'});if(probe?.model!==expectedModel||typeof probe?.reply!=='string'||!probe.reply.trim())throw Error('用户默认 profile 模型测试未返回有效结果');}}
 finally{await configured.app.close();}
}

const first=await launch(smokeDataDir);const pageErrors=[];first.page.on('pageerror',error=>pageErrors.push(error.message));
let conversationId;
try{
 if(credentials)await saveModel(first.page,credentials);
 await request(first.page,{type:'workspace',path:workspace});
 const state=await request(first.page,{type:'state'}),tree=await request(first.page,{type:'projectTreeGet'});
 for(const role of ['resource','output','process'])if(!tree.appliedNodes.some(node=>node.role===role&&state.mounts.some(mount=>mount.id===node.mountId&&mount.enabled)))throw Error('工作空间真实分类挂载不完整：'+role);
 const reference=projectResourceLocation(tree),output=state.mounts.find(mount=>mount.id===tree.appliedNodes.find(node=>node.role==='output').mountId);if(!output?.write)throw Error('成果目录默认写入权限不正确');
 const fixture='packaged-smoke-reference.md';await fs.writeFile(path.join(reference.directory,fixture),'打包程序权限验证：此文件仅供读取。','utf8');
 await request(first.page,{type:'mountAccess',id:reference.mountId,write:false,enabled:true});
 const content=await request(first.page,{type:'read',mountId:reference.mountId,path:reference.file(fixture)});if(!content.includes('权限验证'))throw Error('授权目录读取失败');
 const traversal=await first.page.evaluate(value=>window.pm.request(value),{type:'read',mountId:reference.mountId,path:'../AGENTS.md'});if(traversal.ok)throw Error('路径越界读取未被拒绝');
 await request(first.page,{type:'mountAccess',id:reference.mountId,write:false,enabled:false});
 const disabled=await first.page.evaluate(value=>window.pm.request(value),{type:'read',mountId:reference.mountId,path:reference.file(fixture)});if(disabled.ok)throw Error('撤销挂载后仍可读取');
 await request(first.page,{type:'mountAccess',id:reference.mountId,write:false,enabled:true});
 conversationId=await request(first.page,{type:'conversation',title:'打包程序 Smoke'});
 if(!skipModel){const probe=await request(first.page,{type:'testModel'});if(probe?.model!==expectedModel||typeof probe?.reply!=='string'||!probe.reply.trim())throw Error('模型测试未返回有效结果');}
 await first.page.getByRole('button',{name:'设置',exact:true}).first().click();await first.page.screenshot({path:path.join(outputDir,'settings.png'),fullPage:true});
 await first.page.locator('.modal-close').click();await first.page.screenshot({path:path.join(outputDir,'conversation.png'),fullPage:true});
 if(pageErrors.length)throw Error(pageErrors.join('\n'));
}finally{await first.app.close();}
await new Promise(resolve=>setTimeout(resolve,1000));

const restarted=await launch(smokeDataDir);
try{
 const state=await request(restarted.page,{type:'state'});if(path.resolve(state.root).toLowerCase()!==path.resolve(workspace).toLowerCase())throw Error(`重启后工作空间未恢复：${state.root} != ${workspace}`);if(!state.conversations.some(item=>item.id===conversationId))throw Error('重启后会话未恢复');if(!skipModel&&(state.model.id!==expectedModel||!state.model.hasKey))throw Error('重启后模型配置未恢复');
 await restarted.page.screenshot({path:path.join(outputDir,'restart.png'),fullPage:true});
 await fs.writeFile(path.join(outputDir,'result.json'),JSON.stringify({status:'passed',executable:path.basename(executable),...(skipModel?{modelTest:'skipped'}:{model:expectedModel,modelTest:'passed'}),workspaceRestored:true,conversationRestored:true,permissions:{read:true,traversalDenied:true,revocationEffective:true},configuredUserProfile:configureUser},null,2));
}finally{await restarted.app.close();}
console.log('Packaged Electron smoke passed');

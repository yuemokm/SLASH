import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Build/pack belongs to the root agent. This harness only uses a fresh profile
// beneath .test-data and never reads or opens the user's slash test workspace.
const root=process.cwd(),packaged=process.argv.includes('--packaged'),exeIndex=process.argv.indexOf('--executable');
const output=path.resolve('.test-data',`project-catalog-ui-${packaged?'packaged':'development'}-${Date.now()}`),profile=path.join(output,'profile');
await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
const aRoot=path.join(output,'项目甲'),bRoot=path.join(output,'项目乙');
await service.workspace(aRoot);const aId=service.listProjects().currentProjectId;
await fs.mkdir(path.join(aRoot,'资源','skills','prd-skill','references'),{recursive:true});
await fs.mkdir(path.join(aRoot,'资源','skills','空技能包'),{recursive:true});
await fs.writeFile(path.join(aRoot,'资源','skills','prd-skill','SKILL.md'),'# PM Skill\n用户自己添加的技能。');
await fs.writeFile(path.join(aRoot,'资源','skills','prd-skill','README.md'),'# PM README');
await fs.writeFile(path.join(aRoot,'资源','skills','prd-skill','references','子层规则.md'),'# 子层规则');
await fs.writeFile(path.join(aRoot,'资源','参考资料','同名文件.md'),'# 项目甲正文\n真实归属甲。');
await fs.writeFile(path.join(aRoot,'成果','PRD','同名成果.md'),'# 项目甲成果');
await service.workspace(bRoot);const bId=service.listProjects().currentProjectId;
await fs.writeFile(path.join(bRoot,'资源','参考资料','同名文件.md'),'# 项目乙正文\n真实归属乙。');
await fs.writeFile(path.join(bRoot,'成果','PRD','同名成果.md'),'# 项目乙成果');
const conversationId=service.conversation(undefined,'保持项目乙会话');service.save();store.close();
const evidence={status:'running',output,checks:[],screenshots:[],pageErrors:[],limitations:['Uses real Electron IPC with isolated local files. Cloud model quality and OS native drag transport are not evaluated.']};
let app,page;const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const result=await page.evaluate(value=>window.pm.request(value),request);assert.ok(result.ok,result.error);return result.data;};
const view=async name=>{await page.locator('.rail-item').filter({has:page.getByText(name,{exact:true})}).click();await page.locator('.project-resource-browser').waitFor();await page.locator('.project-folder-card').filter({has:page.getByText('项目甲',{exact:true})}).waitFor();};
const project=async name=>{await page.locator('.project-folder-card').filter({has:page.getByText(name,{exact:true})}).click();};
const category=async name=>{await page.getByRole('tablist').getByRole('tab',{name,exact:true}).click();};
const screenshot=async name=>{const filename=name+'.png';await page.screenshot({path:path.join(output,filename)});evidence.screenshots.push(filename);};
try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};
 app=await electron.launch(packaged?{...common,executablePath:exeIndex>=0?path.resolve(process.argv[exeIndex+1]):path.resolve('release/win-unpacked/slash.exe')}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));
 await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));
 await page.locator('.sidebar').getByRole('button',{name:'保持项目乙会话',exact:true}).click();
 await page.getByLabel('描述你的任务').fill('尚未发送的项目乙任务');
 await view('资源');assert.equal(await page.locator('.project-folder-card').count(),2);assert.equal(await page.locator('.file-row').count(),0);assert.equal(await page.locator('.folder-card').filter({has:page.getByText('skills',{exact:true})}).count(),0);
 assert.equal((await call({type:'state'})).root,bRoot);check('全局资源项目目录首屏只列项目文件夹，保持当前会话与项目');await screenshot('全局资源项目入口');
 await category('skills');await project('项目甲');await page.locator('.folder-card').filter({has:page.getByText('prd-skill',{exact:true})}).waitFor();assert.equal(await page.locator('.file-row').count(),0);await page.locator('.folder-card').filter({has:page.getByText('空技能包',{exact:true})}).waitFor();check('skills首层按技能包展示，空包保留，README及references不平铺');await screenshot('skills包列表');
 await page.locator('.folder-card').filter({has:page.getByText('prd-skill',{exact:true})}).click();await page.locator('.file-row').filter({has:page.getByText('SKILL.md',{exact:true})}).waitFor();assert.equal(await page.locator('.file-row').count(),2);await page.locator('.folder-card').filter({has:page.getByText('references',{exact:true})}).click();await page.locator('.file-row').filter({has:page.getByText('子层规则.md',{exact:true})}).waitFor();check('进入技能包后分层展示正文与子目录');
 await category('参考资料');const aFile=page.locator('.file-row').filter({has:page.getByText('同名文件.md',{exact:true})});await aFile.waitFor();assert.match(await aFile.innerText(),/项目甲/);await aFile.getByRole('button',{name:'阅读',exact:true}).click();await page.getByLabel('跨项目文档预览').getByRole('heading',{name:'项目甲正文',exact:true}).waitFor();assert.equal((await call({type:'state'})).root,bRoot);assert.equal((await call({type:'state'})).conversations[0].id,conversationId);check('跨项目同名资料显示归属，预览实际正文且不切换当前会话');await screenshot('跨项目资料预览');
 await page.locator('.rail-item').filter({has:page.getByText('会话',{exact:true})}).click();assert.equal(await page.getByLabel('描述你的任务').inputValue(),'尚未发送的项目乙任务');check('浏览其他项目保留当前会话未发送内容');
 await view('成果');await project('项目甲');await category('PRD');const aOutput=page.locator('.file-row').filter({has:page.getByText('同名成果.md',{exact:true})});await aOutput.waitFor();assert.match(await aOutput.innerText(),/项目甲/);check('全局成果按项目进入，文件显示所属项目');await screenshot('项目成果归属');
 await view('资源');await project('项目乙');await category('参考资料');const bFile=page.locator('.file-row').filter({has:page.getByText('同名文件.md',{exact:true})});await bFile.waitFor();assert.match(await bFile.innerText(),/项目乙/);await bFile.getByRole('button',{name:'阅读',exact:true}).click();await page.locator('.preview').getByRole('heading',{name:'项目乙正文',exact:true}).waitFor();await page.getByRole('button',{name:'关闭预览',exact:true}).click();await bFile.click({button:'right'});await page.getByRole('menu').getByRole('menuitem',{name:'创建处理副本',exact:true}).waitFor();await page.keyboard.press('Escape');check('当前项目同名文件预览与参考资料右键处理入口保留');
 await page.locator('.project-tools').getByRole('button',{name:/^资源/}).click();await page.locator('.project-resource-browser .eyebrow').filter({hasText:'项目 · 项目乙'}).waitFor();assert.equal(await page.locator('.project-folder-card').count(),0);await category('参考资料');await bFile.getByRole('button',{name:'引用',exact:true}).click();assert.match(await page.getByLabel('描述你的任务').inputValue(),/参考资料\/同名文件.md/);assert.equal((await call({type:'state'})).root,bRoot);check('项目内资源快捷入口直达所属项目，当前项目引用继续原会话');
 await view('资源');await project('项目甲');await category('参考资料');await aFile.getByRole('button',{name:'在此项目会话引用',exact:true}).click();await page.getByLabel('描述你的任务').waitFor();assert.match(await page.getByLabel('描述你的任务').inputValue(),/参考资料\/同名文件.md/);assert.equal((await call({type:'state'})).root,aRoot);assert.notEqual((await call({type:'state'})).conversations.find(item=>item.title.startsWith('引用'))?.id,conversationId);check('跨项目引用由显式按钮转入所属项目新会话');
 await view('资源');await category('skills');await project('项目甲');await page.locator('.folder-card').filter({has:page.getByText('空技能包',{exact:true})}).click();await page.getByText('此目录没有匹配的文件或文件夹。',{exact:true}).waitFor();assert.equal(await page.locator('.file-row').count(),0);check('空技能包进入后显示空目录状态');await screenshot('空技能包');
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error.stack||error);if(page)await screenshot('失败状态').catch(()=>{});throw error;}finally{if(app)await app.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log('Evidence: '+path.join(output,'result.json'));}

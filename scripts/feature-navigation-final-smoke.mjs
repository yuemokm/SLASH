import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';

// Finish a prior isolated fixture without repeating its 8 navigation groups.
const root=process.cwd(),source=path.resolve(process.argv[2]||''),testRoot=path.resolve('.test-data');
assert(source.startsWith(testRoot+path.sep)&&path.basename(source).startsWith('test-cases-ui-'),'Use an isolated test-cases-ui fixture only');
const output=path.join(testRoot,`feature-navigation-final-${Date.now()}`),profile=path.join(output,'profile');await fs.mkdir(output,{recursive:true});
const report={status:'running',output,source,checks:[],pageErrors:[],cloudCalls:0,screenshots:[],limitations:['Navigation uses synthetic persisted project data and actual IPC. No cloud model, embedding or publication calls. Original failed report is preserved.']};
let app,page;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});report.screenshots.push(name+'.png');};
try{
 const db=new DatabaseSync(path.join(source,'profile','slash.sqlite'),{readOnly:true});
 const state=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='state'").get().value),change=state.changes.find(item=>item.path==='审批.testcases.json'),invalid=state.changes.find(item=>item.path==='无效.testcases.json'),mount=state.mounts.find(item=>item.id===change.mountId);
 report.exportReceipts=db.prepare("SELECT result FROM operations WHERE run_id='manual-test-case-export' AND state='succeeded'").all().map(row=>JSON.parse(row.result));db.close();
 assert.equal(report.exportReceipts.length,2);for(const receipt of report.exportReceipts){assert.equal(receipt.input.changeId,change.id);assert.equal(receipt.input.expectedContentHash,hash(change.content));assert.equal(receipt.sourceHash,hash(change.content));}
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(mount.path,'桌面用例.xlsx'));assert.equal(book.worksheets[0].getCell('I2').value,'1. 阻止退回并提示填写原因');assert.equal(book.worksheets[0].getCell('M2').value,'未执行');assert.match(await fs.readFile(path.join(mount.path,'桌面用例.md'),'utf8'),/阻止退回并提示填写原因/);await assert.rejects(fs.stat(path.join(mount.path,change.path)),{code:'ENOENT'});check('prior genuine Excel/Markdown files and both exact draft/hash receipts verified after SQLite writer closed');
 await fs.cp(path.join(source,'profile'),profile,{recursive:true});
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 await app.evaluate(({BrowserWindow})=>{globalThis.__finalNavBlocked=0;globalThis.fetch=async()=>{globalThis.__finalNavBlocked++;throw Error('NO_EXTERNAL_REQUESTS_IN_NAVIGATION_SMOKE');};const win=BrowserWindow.getAllWindows()[0];win.unmaximize();win.setSize(1440,1000);});
 const rail=page.locator('.sidebar-rail');await rail.getByRole('button',{name:'测试用例',exact:true}).click();const cases=page.getByRole('region',{name:'项目测试用例',exact:true});await cases.getByRole('button',{name:'阅读用例',exact:true}).waitFor();assert.equal(await cases.locator('.file-row').count(),4);await shot('test-cases-final');
 await cases.getByRole('button',{name:'创建测试用例',exact:true}).click();await page.getByRole('dialog',{name:'选择引用资料',exact:true}).waitFor();await page.getByRole('button',{name:'关闭引用资料选择器',exact:true}).click();await page.getByText('提示词已加入输入区；可直接编辑，或移除任务上下文。',{exact:true}).waitFor();
 assert.equal(await rail.getByRole('button',{name:'知识库',exact:true}).count(),0);await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();await page.getByRole('region',{name:'资料集合',exact:true}).waitFor();assert.equal(await page.getByText('提示词已加入输入区；可直接编辑，或移除任务上下文。',{exact:true}).count(),0);await page.getByRole('navigation',{name:'集合列表'}).getByRole('button').filter({hasText:'审批知识库'}).click();await shot('knowledge-final');check('final renderer retains feature list and clears chat-only notice on resource collection navigation');
 await rail.getByRole('button',{name:'测试用例',exact:true}).click();await cases.getByRole('button',{name:'阅读用例',exact:true}).waitFor();await cases.locator('.file-row').filter({hasText:'无效.testcases.json'}).getByRole('button',{name:'查看草稿',exact:true}).click();await page.getByRole('alert').filter({hasText:'TEST_CASE_INVALID'}).waitFor();
 const priorMarkdown=await fs.readFile(path.join(mount.path,'桌面用例.md'),'utf8');
 for(const input of [{type:'apply',id:invalid.id,source:'ui'},{type:'export',mountId:invalid.mountId,path:invalid.path,changeId:invalid.id,expectedContentHash:hash(invalid.content),format:'test_cases_markdown'}]){const result=await page.evaluate(async input=>{let timer;try{return await Promise.race([window.pm.request(input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('INVALID_DRAFT_IPC_TIMEOUT')),10000);})]);}finally{clearTimeout(timer);}},input);assert.equal(result.ok,false);assert.match(result.error,/TEST_CASE_INVALID/);}
 assert.equal(await fs.readFile(path.join(mount.path,'桌面用例.md'),'utf8'),priorMarkdown);await assert.rejects(fs.stat(path.join(mount.path,invalid.path)),{code:'ENOENT'});await shot('invalid-draft-final');check('remaining invalid JSON UI/save/export rejection verified without changing existing files');
 report.cloudCalls=await app.evaluate(()=>globalThis.__finalNavBlocked);assert.equal(report.cloudCalls,0);assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await app?.close();report.isolatedAppClosed=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,output,error:report.error}));}

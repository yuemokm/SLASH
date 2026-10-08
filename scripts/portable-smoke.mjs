import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args=process.argv.slice(2);
const value=(name,fallback)=>{const index=args.indexOf(name);if(index<0)return fallback;const result=args[index+1];if(!result||result.startsWith('--'))throw Error(`${name} 需要参数`);return result;};
const root=process.cwd();
const packageVersion=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const executable=path.resolve(value('--executable',path.join(root,'release',`slash-${packageVersion}-portable.exe`)));
const sourceProfile=path.resolve(value('--source-profile',path.join(root,'.test-data','app')));
const outputDir=path.resolve(value('--output-dir',path.join(root,'.test-data','portable-direct')));
const profile=path.join(outputDir,'profile');
const expectedModel=value('--expected-model','DeepSeek-V4-Flash-0731');
const startupTimeout=Number(value('--startup-timeout','90000'));
const shutdownTimeout=Number(value('--shutdown-timeout','30000'));
if(!Number.isFinite(startupTimeout)||startupTimeout<10_000||startupTimeout>300_000)throw Error('启动时限必须为 10000–300000 毫秒');
if(!Number.isFinite(shutdownTimeout)||shutdownTimeout<5_000||shutdownTimeout>120_000)throw Error('退出时限必须为 5000–120000 毫秒');

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const withTimeout=(promise,milliseconds,message)=>{let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);});return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));};
const isInside=relative=>relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);

await fs.access(executable);
const testDataRoot=path.resolve(root,'.test-data');await fs.mkdir(testDataRoot,{recursive:true});
const realRoot=await fs.realpath(root),realTestData=await fs.realpath(testDataRoot);const testDataRelative=path.relative(realRoot,realTestData);
if(!testDataRelative||!isInside(testDataRelative))throw Error('工程 .test-data 必须是工程内真实目录');
const outputRelative=path.relative(testDataRoot,outputDir);
if(!outputRelative||outputRelative.includes(path.sep)||!isInside(outputRelative))throw Error('输出目录必须是工程 .test-data 下的独立直接子目录');
try{const stat=await fs.lstat(outputDir);if(stat.isSymbolicLink())throw Error('输出目录不能是符号链接或 junction');const realOutput=await fs.realpath(outputDir);if(!isInside(path.relative(realTestData,realOutput)))throw Error('输出目录真实路径必须位于工程 .test-data 内');}catch(error){if(error.code!=='ENOENT')throw error;}
const realSourceProfile=await fs.realpath(sourceProfile);if(isInside(path.relative(realSourceProfile,outputDir))||isInside(path.relative(outputDir,realSourceProfile)))throw Error('输出目录不能与凭据源 profile 相同或互相包含');

let sourceDatabase=path.join(realSourceProfile,'slash.sqlite');
try{const stat=await fs.stat(sourceDatabase);if(!stat.size)throw Error('empty');}catch{sourceDatabase=path.join(realSourceProfile,'pm-slash.sqlite');}
await fs.access(sourceDatabase);
await fs.access(path.join(realSourceProfile,'Local State'));
await fs.rm(outputDir,{recursive:true,force:true});await fs.mkdir(profile,{recursive:true});
// 复制 safeStorage 密文和 Chromium os_crypt 元数据；脚本不读取或输出密钥明文。
for(const suffix of ['','-wal','-shm'])try{await fs.copyFile(sourceDatabase+suffix,path.join(profile,'slash.sqlite'+suffix));}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.copyFile(path.join(realSourceProfile,'Local State'),path.join(profile,'Local State'));

const wrapper=spawn(executable,['--remote-debugging-port=0'],{env:{...process.env,PM_SLASH_DATA_DIR:profile},stdio:'ignore',windowsHide:true});
let wrapperExitResult=null;const wrapperExit=new Promise(resolve=>wrapper.once('exit',(code,signal)=>{wrapperExitResult={code,signal};resolve(wrapperExitResult);}));
const wrapperError=new Promise((_,reject)=>wrapper.once('error',error=>{wrapperExitResult={error:error.message};reject(error);}));
const terminateWrapperTree=async()=>{if(wrapperExitResult!==null)return;if(process.platform==='win32'&&wrapper.pid){await new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(wrapper.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.once('exit',resolve);killer.once('error',resolve);});}else wrapper.kill();};
let browser;
try{
 const activePortFile=path.join(profile,'DevToolsActivePort');
 const endpoint=await withTimeout(Promise.race([(async()=>{while(true){try{const lines=(await fs.readFile(activePortFile,'utf8')).trim().split(/\r?\n/);const port=Number(lines[0]);if(Number.isInteger(port)&&port>0&&port<65536)return`http://127.0.0.1:${port}`;}catch(error){if(error.code!=='ENOENT')throw error;}await sleep(200);}})(),wrapperError]),startupTimeout,'便携程序启动超时：未生成 DevToolsActivePort');
 browser=await withTimeout(chromium.connectOverCDP(endpoint),15_000,'连接便携程序 CDP 超时');
 const page=await withTimeout((async()=>{while(true){for(const context of browser.contexts())for(const candidate of context.pages())if(await candidate.locator('.brand').count())return candidate;await sleep(100);}})(),30_000,'便携程序窗口未显示 .brand');
 await page.locator('.brand').waitFor({state:'visible',timeout:10_000});
 const response=await page.evaluate(()=>window.pm.request({type:'state'}));if(!response.ok)throw Error(response.error);const state=response.data;
 if(state.model?.id!==expectedModel||state.model?.hasKey!==true)throw Error(`便携程序未恢复 ${expectedModel} 加密模型状态`);
 await page.screenshot({path:path.join(outputDir,'portable.png'),fullPage:true});
 const disconnected=new Promise(resolve=>browser.once('disconnected',resolve));
 await page.evaluate(()=>{window.close();});
 await withTimeout(disconnected,shutdownTimeout,'窗口关闭后 Electron 未在时限内退出');
 if(wrapperExitResult===null)await withTimeout(wrapperExit,shutdownTimeout,'Electron 已退出但 portable wrapper 未在时限内退出');
 if(wrapperExitResult?.error)throw Error(`portable wrapper 启动失败：${wrapperExitResult.error}`);
 if(wrapperExitResult?.code!==null&&wrapperExitResult?.code!==0)throw Error(`portable wrapper 退出码 ${wrapperExitResult.code}`);
 const result={status:'passed',executable:path.basename(executable),model:expectedModel,hasKey:true,brandVisible:true,ipcState:true,wrapperExit:wrapperExitResult};await fs.writeFile(path.join(outputDir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 if(browser?.isConnected())await browser.close().catch(()=>{});
 await terminateWrapperTree();
}

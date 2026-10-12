import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';

// Run after the build owner builds dist. All four modelTest requests use the
// official Settings button/preload/IPC/Pi path and an isolated loopback fixture.
const root=process.cwd(),output=path.join(root,'.test-data',`model-text-ui-${Date.now()}`),profile=path.join(output,'profile');
await fs.mkdir(profile,{recursive:true});
const evidence={status:'running',output,cloudExecuted:false,built:false,requests:[],cases:[],pageErrors:[],hashes:{},limitations:['Fixed loopback responses verify compiled official IPC/Pi and UI behavior, not cloud model or tool/image capabilities.']};
let app,page,scenario,releaseResponse;
const server=createServer(async(req,res)=>{
 try{
  assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());
  const current=scenario;assert.ok(current);assert.equal(req.headers.authorization,'Bearer local-fixture-key');
  evidence.requests.push({scenario:current.name,model:body.model,maxCompletionTokens:body.max_completion_tokens,thinkingType:body.thinking?.type,messageCount:body.messages?.length,toolsPresent:body.tools!==undefined});
  assert.equal(body.model,'DeepSeek-V4-Flash-0731');assert.equal(body.max_completion_tokens,256);assert.equal(body.thinking?.type,'disabled');assert.equal(body.messages.length,1);assert.equal(body.tools,undefined);
  await new Promise(resolve=>{releaseResponse=resolve;});
  res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'local-model-ui',object:'chat.completion.chunk',created:1,model:body.model};
  const delta={role:'assistant',...(current.thinking?{reasoning_content:'LOCAL_FIXTURE_THINKING'}:{}),...(current.text?{content:current.text}:{})};
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
  res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:current.stop}],usage:{prompt_tokens:5,completion_tokens:current.stop==='length'?256:4,total_tokens:current.stop==='length'?261:9}})+'\n\ndata: [DONE]\n\n');
 }catch(error){evidence.serverError=error.stack||String(error);res.writeHead(500);res.end('LOCAL_FIXTURE_FAILURE');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const wait=async(predicate,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Timed out waiting for local UI fixture');};
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const hash=async file=>createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
const fixedFiles=['main/main.ts','main/model-connection-test.ts','src/SettingsModal.tsx','src/model-test-result.ts','dist/main/main.js','dist/main/model-connection-test.js'];
try{
 const rendererHtml=await fs.readFile(path.join(root,'dist/renderer/index.html'),'utf8'),asset=rendererHtml.match(/src="\.\/([^\"]+\.js)"/)?.[1];assert.ok(asset);fixedFiles.push(`dist/renderer/${asset}`);
 for(const file of fixedFiles)evidence.hashes[file]=await hash(file);
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.ok(page.url().startsWith('file:'));evidence.pageUrl=page.url();
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await call({type:'modelUpsert',model:{provider:'loopback',name:'本地文字测试模型',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'DeepSeek-V4-Flash-0731',protocol:'openai-completions',contextWindow:65536,maxTokens:12000},key:'local-fixture-key'});
 const beforeModels=await call({type:'models'}),entry=beforeModels.groups.flatMap(group=>group.models).find(model=>model.name==='本地文字测试模型');assert.ok(entry);const beforeState=await call({type:'state'});
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'模型',exact:true}).click();
 const row=settings.locator('.model-row').filter({hasText:'本地文字测试模型'}),button=row.getByRole('button',{name:'测试',exact:true}),result=row.locator('.row-result');
 const scenarios=[
  {name:'normal-stop',stop:'stop',text:'连接成功',pattern:/文字连接测试通过.*仅验证本次文字回复.*模型回复：连接成功/},
  {name:'length-thinking-only',stop:'length',thinking:true,text:'',pattern:/文字测试未通过：.*输出上限.*无文字正文.*请求声明关闭思考.*尚未核实/},
  {name:'normal-stop-again',stop:'stop',text:'连接成功',pattern:/文字连接测试通过.*模型回复：连接成功/},
  {name:'length-partial-text',stop:'length',text:'部分文字',pattern:/文字测试未通过：.*输出上限.*已有部分文字/},
 ];
 for(const current of scenarios){
  scenario=current;releaseResponse=undefined;const before=evidence.requests.length,previous=await result.count()?await result.innerText():'';
  await button.click();await wait(()=>Boolean(releaseResponse));assert.equal(evidence.requests.length,before+1);assert.equal(await result.count(),0,'test start must clear old verdict');assert.equal(await button.isDisabled(),true);
  releaseResponse();await button.waitFor({state:'visible'});await wait(async()=>!await button.isDisabled());await result.waitFor();const text=await result.innerText();assert.match(text,current.pattern);assert.doesNotMatch(text,/"modelId"|"reply"|"notice"|\{\s*"/);
  if(current.stop==='length'){assert.match(previous,/文字连接测试通过/);assert.doesNotMatch(text,/文字连接测试通过/);assert.match(await settings.locator('.modal-feedback.error').innerText(),/文字测试未通过/);}
  assert.equal(evidence.requests.length,before+1);const screenshot=current.name+'.png';await page.screenshot({path:path.join(output,screenshot)});evidence.cases.push({name:current.name,status:'passed',requestCount:1,clearedPrevious:true,text,screenshot});console.log('PASS '+current.name);
 }
 assert.deepEqual(await call({type:'models'}),beforeModels);const afterState=await call({type:'state'});assert.equal(afterState.runs.length,beforeState.runs.length);assert.equal(afterState.changes.length,beforeState.changes.length);assert.equal(afterState.conversations.length,beforeState.conversations.length);assert.equal(evidence.requests.length,4);assert.equal(evidence.serverError,undefined);assert.deepEqual(evidence.pageErrors,[]);
 evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.stack||String(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
 releaseResponse?.();if(app){await app.close();evidence.spawnedAppClosed=true;}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 for(const file of fixedFiles)assert.equal(await hash(file),evidence.hashes[file],`Source/dist changed during fixture: ${file}`);
 evidence.sourceAndDistUnchanged=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,cases:evidence.cases.length,requests:evidence.requests.length,error:evidence.error}));
}

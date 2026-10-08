// Read-only, source-backed acceptance assistance. No model request or scoring.
// node scripts/pm-business-evidence-review.mjs [--artifact-dir generated-folder]
// Artifact lexical matches are navigation hints, never business pass/fail.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('ARGUMENT_MISSING');return value;};
const corpus=path.resolve(arg('--corpus',path.join(root,'.test-data','office-corpus-2026-10-04T22-57-25-731Z')));
const output=path.resolve(arg('--output-dir',path.join(root,'.test-data','pm-business-source-review-'+new Date().toISOString().replace(/[:.]/g,'-'))));
const artifactDirectory=arg('--artifact-dir',undefined);
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const wanted=['新增终端流程v2.0.docx','门店运营管理制度-V4.docx','05 网点主数据.xlsx'];
const report={schemaVersion:1,status:'running',modelExecuted:false,businessReview:'pending_human_review',sources:[],sourceAssertions:[],fixedExpectations:[],artifactHints:[],limitations:['Office text does not preserve Word table columns/merged layout; ambiguous mappings require the original document.','Lexical artifact matches cannot prove correct rules, active validation, simulated behavior, or working interactions.','This is local source verification and review assistance; no cloud baseline or model-quality result is claimed.']};

const check=(id,condition,locator)=>{report.sourceAssertions.push({id,passed:Boolean(condition),locator});if(!condition)throw Error('SOURCE_ASSERTION_FAILED: '+id);};
const expectation=(id,expected,sourceLocators,interaction)=>report.fixedExpectations.push({id,expected,sourceLocators,interaction,prdPosition:null,prototypePosition:null,humanResult:'unreviewed'});

try{
 const parserReport=JSON.parse(await fs.readFile(path.join(corpus,'report.json'),'utf8'));
 const texts=new Map();
 for(const name of wanted){
  const record=parserReport.records.find(item=>path.basename(item.relativePath)===name);
  check('verified-parser-'+name,record?.status==='passed'&&record?.originalUnchanged,'parser report');
  const originalHash=await hash(record.sourcePath),copyHash=await hash(record.copyPath);
  check('immutable-original-'+name,originalHash===record.sourceSha256Before&&copyHash===originalHash,'original and verified processing copy');
  const text=await fs.readFile(record.outputPath,'utf8');texts.set(name,text);
  report.sources.push({name,sourcePath:record.sourcePath,sourceSha256:originalHash,processingCopySha256:copyHash,extractedTextPath:record.outputPath,extractedTextSha256:await hash(record.outputPath),characters:text.length,lines:text.split(/\r?\n/).length});
 }
 const workbook=texts.get(wanted[2]),lines=workbook.split(/\r?\n/),sheets=new Map();let sheet;
 lines.forEach((line,i)=>{
  if(line.startsWith('工作表: ')){sheet=JSON.parse(line.slice(5));sheets.set(sheet,new Map());return;}
  const match=line.match(/^([A-Z]+[1-9]\d*): ("(?:\\.|[^"\\])*")/);
  if(match&&sheet)sheets.get(sheet).set(match[1],{value:JSON.parse(match[2]),extractedLine:i+1});
 });
 const opportunityName='03 机会门店主数据',opportunity=sheets.get(opportunityName);
 check('opportunity-sheet-present',Boolean(opportunity),'05 网点主数据.xlsx / '+opportunityName);
 const loc=coordinate=>({file:wanted[2],sheet:opportunityName,coordinate,extractedLine:opportunity.get(coordinate)?.extractedLine,value:opportunity.get(coordinate)?.value});
 const expectedCells={A1:'文本: 是否仅用于正式落库',H1:'文本: 必填',O1:'文本: 新增页面展示',P1:'文本: 是否允许前端发起变更修改',D2:'文本: 网点编码',F2:'文本: 自动计算',H2:'文本: 是',I2:'文本: 是',O2:'文本: 是',P2:'文本: 否',D3:'文本: 网点名称',F3:'文本: 手动录入',G3:'文本: 50',O3:'文本: 是',P3:'文本: 否'};
 for(const [coordinate,expected] of Object.entries(expectedCells))check('opportunity-'+coordinate,opportunity.get(coordinate)?.value===expected,loc(coordinate));
 check('opportunity-code-rule',opportunity.get('K2')?.value.includes('{JHWD}{10位顺序码}'),loc('K2'));
 check('opportunity-name-rule',opportunity.get('K3')?.value.includes('连锁网点')&&opportunity.get('K3')?.value.includes('个体经营网点'),loc('K3'));
 const terminal=[...sheets.entries()].find(([name])=>name.includes('01')&&name.includes('终端网点'));
 check('different-business-object-code',terminal?.[1].get('K4')?.value.includes('{ZDWD}{10位顺序码}'),{file:wanted[2],sheet:terminal?.[0],coordinate:'K4',value:terminal?.[1].get('K4')?.value});
 const institution=texts.get(wanted[1]),flow=texts.get(wanted[0]);
 const textLocator=(name,text,fragment)=>({file:name,extractedLine:text.slice(0,text.indexOf(fragment)).split(/\r?\n/).length,fragment});
 const stageFragment='进入系统，未完成正式建档必录字段';
 check('opportunity-stage',institution.includes(stageFragment),textLocator(wanted[1],institution,stageFragment));
 const policyFragment='机会门店仅上线初期批量导入，后续新增门店只能在 SFA 端口手动录入';
 const flowFragment='业务员到店后直接新建或者从后台导入终端信息达到新增终端门店的目标';
 check('policy-import-stage',institution.includes(policyFragment),textLocator(wanted[1],institution,policyFragment));
 check('flow-import-branch',flow.includes(flowFragment),textLocator(wanted[0],flow,flowFragment));
 const duplicateFragment='系统和AI校验终端信息是否和库里重复';
 check('flow-duplicate-validation',flow.includes(duplicateFragment),textLocator(wanted[0],flow,duplicateFragment));
 expectation('stage-required','区分必填/正式落库/新增展示/变更权限；不能把正式建档必填全部提升为机会新建必填。',[loc('A1'),loc('H1'),textLocator(wanted[1],institution,stageFragment)],'填写机会门店所需信息，观察是否被无依据的正式建档字段阻断。');
 expectation('code-generation','机会编码为JHWD+10位顺序码、系统自动计算且唯一，新增展示但不能手工录入；分配时机资料未明确须待确认。',[loc('F2'),loc('I2'),loc('K2'),loc('O2'),loc('P2')],'新建页观察编码展示/占位状态；尝试编辑编码；提交成功结果必须明确模拟。');
 expectation('name-create-versus-update','机会名称新增手工录入、长度50、引用命名规则；后续前端变更为否。',[loc('F3'),loc('G3'),loc('K3'),loc('O3'),loc('P3')],'创建输入名称，测试超过50字符；进入后续修改，验证名称变更权限与新增不同。');
 expectation('import-policy-conflict','后台导入与仅上线初期批量导入/后续SFA手工之间的阶段和版本范围须待确认，不能静默采用任一规则。',[textLocator(wanted[1],institution,policyFragment),textLocator(wanted[0],flow,flowFragment)],'检查来源分支是否展示依据和待确认，未确认分支不得冒充已获业务授权。');
 expectation('duplicate-and-failures','存在系统和AI判重步骤；判重字段、接口和失败处理未给完整规则，原型成功/重复/失败须明确模拟。',[textLocator(wanted[0],flow,duplicateFragment)],'分别操作模拟成功、重复、失败，记录界面结果并检查没有实际后端调用宣称。');
 expectation('conflicting-change','请求编码手填或后续可改时，引用机会表F2/P2与具体冲突，区分旧资料、新要求与影响；按明确新要求修改时标明该场景的新决定，不冒称旧资料支持。适用范围不明时提具体问题，原件始终保留。',[loc('F2'),loc('P2')],'查看后续Run、回复、ChangeSet和真实差异；核对新决定与旧依据是否清楚区分，不将必须再次确认当绝对成功标准。');
 if(artifactDirectory){
  const files=[];
  const collect=async directory=>{for(const entry of await fs.readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('ARTIFACT_LINK_REFUSED');if(entry.isDirectory())await collect(target);else if(entry.isFile()&&/\.(md|html?)$/i.test(entry.name))files.push(target);}};
  await collect(path.resolve(artifactDirectory));
  for(const file of files){
   const text=await fs.readFile(file,'utf8'),fileLines=text.split(/\r?\n/);
   const keywords=['03 机会门店主数据','JHWD','ZDWD','网点编码','网点名称','正式落库','模拟','待确认','导入'];
   const hints=keywords.map(keyword=>({keyword,lines:fileLines.flatMap((line,i)=>line.includes(keyword)?[i+1]:[])}));
   const controls=/\.html?$/i.test(file)?[...text.matchAll(/<(?:input|textarea|select|button)\b[^>]*>/gi)].map(match=>({line:text.slice(0,match.index).split(/\r?\n/).length,tag:match[0].slice(0,1000)})):undefined;
   report.artifactHints.push({file,sha256:await hash(file),hints,controls,businessResult:'not_determined_by_lexical_scan'});
  }
 }
 report.status='source_assertions_passed_pending_artifact_business_review';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
finally{
 const testRoot=await fs.realpath(path.join(root,'.test-data')),relative=path.relative(testRoot,output);
 if(!relative||path.dirname(output)!==testRoot||relative.startsWith('..')||path.isAbsolute(relative))throw Error('OUTPUT_MUST_BE_NEW_DIRECT_TEST_CHILD');
 await fs.mkdir(output);
 await fs.writeFile(path.join(output,'source-business-assertions.json'),JSON.stringify(report,null,2),{flag:'wx'});
 await fs.writeFile(path.join(output,'human-review.md'),'# 机会门店新建人工核对\n\n来源确定性断言见source-business-assertions.json；未执行真实模型业务验收。词语匹配只帮助定位，不能证明正确性。\n\n| 断言 | 固定预期 | 人工实际操作/PRD位置 | 满足/违背/未知 |\n| --- | --- | --- | --- |\n'+report.fixedExpectations.map(item=>'| '+item.id+' | '+item.expected+' | '+item.interaction+' | 未审核 |').join('\n')+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:report.status,output,sourceAssertions:report.sourceAssertions.length,sourceAssertionsPassed:report.sourceAssertions.filter(item=>item.passed).length,artifactsInspected:report.artifactHints.length,modelExecuted:false,businessReview:report.businessReview}));
}

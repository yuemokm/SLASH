// Offline by default. --allow-cloud --prepared-dir <dir> runs exactly once.
// Copies only verified inputs/artifacts and the configured model credential.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import electronPath from 'electron';
import {hostPrototypeCases} from './pm-business-prototype-cases.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=path.join(repo,'.test-data','pm-business-real-2026-10-05T06-28-41-722Z');
const requiredPaths=['机会门店新建/PRD.md','机会门店新建/index.html','机会门店新建/约束对照.md'];
const args=process.argv.slice(2),allowCloud=args.includes('--allow-cloud'),verifyLocal=args.includes('--verify-local'),htmlOnly=args.includes('--html-only'),prdOnly=args.includes('--prd-only'),constraintsOnly=args.includes('--constraints-only'),prdFieldsOnly=args.includes('--prd-fields-only');
const arg=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('ARGUMENT_MISSING');return args[i+1];};
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};

const prompt=`请修订当前隔离项目中的“机会门店新建”已有成果。它们来自此前实际模型生成；本次是新的修订任务，不要重建完整模块或重写已正确部分。先逐份读取已提供的三份真实来源和已有 PRD.md、index.html、约束对照.md，再修改。优先使用 read_draft / edit_draft 的受控增量编辑，逐文件读后以匹配旧文本的小改动产生草稿；不要一次重新发送整份约 25KB HTML。如果运行时没有增量工具，说明限制，并分文件通过现有草稿工具保留修改。成果必须写入产品草稿，不能仅在回复中贴代码，不能修改参考资料。

业务修订要求：
1. 05 网点主数据.xlsx 必须使用“03 机会门店主数据”工作表。PRD 分别解释 A（是否仅用于正式落库）、H（必填）、O（新增页面展示）、P（是否允许前端发起变更修改）四个维度，不把它们合并。机会阶段与正式落库阶段分开；空白值或阶段不明保留待确认，不自行补成“否”。
2. 编码 F2 自动计算、K2 为 {JHWD}{10位顺序码}、O2 是，新增可展示只读模拟系统值，不能手填；P2 否。名称 F3 新增手动录入、G3 长度 50、O3 是；P3 否是后续不允许前端发起变更，不等于新建时不能录入。不要将“01终端网点主数据”的 ZDWD 或隐藏规则用于机会门店。
3. F7“手动录入-sfa采集，不允许调整”与 F8“手动录入-sfa采集，允许调整”分别解释：定位地址由采集获得、用户不能手填修改；详细地址可录入修改。PRD §6.3需要纠正，HTML已有正确地址边界应保留。约束对照目前将“不允许调整”误归K列，并直接判与P矛盾；请回到真实 F5/F6/F7 和 P5/P6/P7核对，分别记录创建采集/调整与后续前端变更，不能混为同维度冲突。具体业务机制仍未知时列具体问题。保留已有定位模拟并明确标注，不把浏览器模拟当真实 SFA 定位。
4. 管理制度限定上线初期批量导入、后续 SFA 手工，而新增流程 v2 步骤20含后台导入；保留阶段/版本冲突与待确认问题。编码分配时机、真实判重/接口/错误码均未被资料完整确定，继续保留待确认。
5. 同步约束对照，逐项写明来源文件、工作表和坐标、资料原意、适用阶段、PRD位置、HTML行为与未确认项。不使用模型自评作为通过证据。
6. “03 机会门店主数据”第4行数据来源字段 B4 标“商机客户”，O4/P4没有提取值。旧PRD字段表约第132行写“新增展示=是”，不能从N4=是推导O4。请回到来源核对对象和列头，未提取到的取值保留未知，不补成资料事实；若原型保留来源控件，应明确它是演示安排，新增展示和后续前端变更适用性待确认。

原型修订要求：补充清楚标注“本地模拟服务失败，未调用后台”的失败场景，并可返回修改后重试。正常成功、疑似重复以及定位演示继续保留。字段输入被修正时清除旧校验错误和旧服务错误，不能持续展示与当前输入不符的错误。失败演示开关、错误提示、重试按钮必须可操作，重试必须依据当前输入重新判断。
为便于固定宿主实际验收，保留已有 [data-src="manual"]、#nextBtn、#f_name、#f_loc、#f_detail、#locBtn、#submitBtn、#topTitle、#againBtn、#dialog 的交互入口；新增 #simulateFailure（checkbox，明确模拟失败开关）、#serviceError（可见时包含“模拟服务失败”，修正输入或关闭开关后隐藏）、#retryBtn（失败后可返回修改并按当前输入重试，清除旧错误后仍可重试）。这些是本次明确的演示需求，不冒充旧资料已规定真实后台失败策略。

本轮先精确修订三个文件，不必另行定义或运行原型验收。本次宿主会在任务停止并通过范围检查后应用最新草稿，再用真实隔离 Electron 执行固定用例；不要提供假的通过报告。若你确实使用原型验收工具，必须读取实际结果：它核对的是磁盘已应用版本，尚未应用的草稿不能视为新成果已通过。一次任务尽量完成，输出受限时保留中断和已生成草稿，不自动循环重试。最终说明实际修改、旧依据、新需求、仍未知的问题。`;

const htmlPrompt=`本次只修订已有“机会门店新建/index.html”，这是串行修订的第一步。PRD、约束对照和三份旧来源此步不需要读取，也不允许修改；后续另行核对。下面是用户明确新增的本地演示需求，不声称旧资料规定了这些后台规则。
请先 read_draft 阅读HTML相关部分，按 nextOffset 继续取得需要修改的位置。找到一个明确的小改动后立即使用 edit_draft 保存受控草稿，不要先阅读全文以外的资料，也不要长篇解释全模块。把 read_draft.contentHash 填入 expectedContentHash；pending时传返回的changeId，后续修改先读最新稿。使用精确oldText/newText，或相互不重叠、相对同一原内容的少量edits。不重发整份HTML。所有写入仅限该文件。
保留已有名称maxlength50、定位地址只读、详细地址可编辑、正常成功和重复警告入口与演示说明。新增明确标注“本地模拟服务失败，未调用后台”的 #simulateFailure checkbox；开启后提交显示包含“模拟服务失败”的 #serviceError，并保留已填名称、定位及详细地址，可返回修改再通过 #retryBtn 重试。输入修正时立即清除旧校验和服务错误；关闭模拟失败开关后重试，应按当前输入成功或显示真实当前校验。清错后保留重试按钮可操作。不调用后台，不新增资料事实。
保留 [data-src="manual"]、#nextBtn、#f_name、#f_loc、#f_detail、#locBtn、#submitBtn、#topTitle、#againBtn、#dialog，编码仍只读。只通过增量草稿保存，不在回复里贴全文，不定义额外原型验收；宿主会应用范围内最新草稿后实际运行固定Electron用例。完成后简短说明实际改动，不能编造通过结果。`;

const prdPrompt=`本次是同一隔离项目串行修订第二步，仅修改“机会门店新建/PRD.md”。HTML已经由独立Run修订并应用，此步HTML与约束对照均不读不改；对照留到第三步。不声称三个步骤是同一个Run，也不编造业务通过。
三份真实来源正文已由本轮prd工作流直接附到用户上下文：无需再逐份全文read_file；只在缺失或要精确定位的地方按范围核对。先read_draft读取PRD相关段，遇明确问题立即edit_draft保存小范围草稿，之后再读最新稿继续。不要先做全量成果审计。使用contentHash作为expectedContentHash；pending时传读出的changeId。oldText/newText或少量不重叠edits均相对同一原稿，不重写整篇。
完成以下同一原业务范围内的PRD纠正，并保持真实来源、演示安排、未知分开：
1. 只用05网点主数据.xlsx的“03 机会门店主数据”工作表。分别表述A是否仅用于正式落库、H必填、O新增页面展示、P是否允许前端发起变更修改；不要合并或把空白补成否，区分机会与正式落库阶段。
2. 编码F2自动计算、K2 {JHWD}{10位顺序码}、O2是/P2否：新增可展示系统只读值，不能手填，后续不允许前端修改；系统分配的准确时机资料不足保留待确认。名称F3新增手录、G3长度50、O3是/P3否：新建可录入，后续不得发起修改。不得套用01终端网点的ZDWD或隐藏规则。
3. 修正§6.3：F7定位地址“手动录入-sfa采集，不允许调整”，用户不能手填调整；F8详细地址“手动录入-sfa采集，允许调整”，可录入修改。已有HTML正确边界保留，定位是明确模拟。F5/F6/F7的采集/调整与P5/P6/P7后续前端变更是两个维度，不能把“不允许调整”误归K列或直接判同维度冲突；具体机制仍未知时提具体问题。
4. 制度限定上线初期批量导入、后续SFA手工，流程v2步骤20仍含后台导入，保留阶段/版本冲突待确认，修正本文出现的无条件后台导入叙述。真实判重、接口、错误码仍未知；本地演示不等于后台规则。
5. PRD各纠正写清来源文件、工作表/坐标、适用阶段与具体待确认问题；对照文件由下个独立Run同步，此步不改。HTML新增失败和修改重试是用户明确的本地模拟需求，可在PRD演示范围说明，但不能冒充旧资料事实或声称正式服务已实现。
6. 第4行数据来源B4标“商机客户”，O4/P4无提取值；N4=是不能推出新增展示O4=是。修正字段表旧“新增展示=是”及相关叙述，对象/列头适用性保留未知。HTML来源控件是演示安排，不能在PRD补成来源事实。
只保存产品增量草稿，不贴全文；宿主会在停止后核对精确范围再应用。此步无需定义/运行浏览器验收，PRD业务内容由独立人工复核。最终简短说明实际修订与尚未知。`;

const constraintsPrompt=`本次是同隔离项目的新会话/独立Run，仅修订“机会门店新建/约束对照.md”。已有HTML已实际交互修订，PRD已在上一独立Run修订；两者均不能改，本轮不要读HTML全文。不得把多个Run声称为一个Run或编造通过。
本轮没有prd资料工作流正文注入，新会话并未继承来源正文，三份来源仍只读挂载。必须实际按范围读取相关真实提取文本（尤其Excel的列头、A/H/O/P、F5/F6/F7与P5/P6/P7、B4/O4/P4），以及导入相关制度和流程段落，不能只把上一版PRD当来源真相或照抄下述核对事项。无需逐份全文读取，不处理原件。先read_draft读当前对照的相关段，按范围读取最新PRD中对应业务条款，遇明确错误立即edit_draft保存小补丁。对真实来源仅定位需要核对的字段/段落，不长篇重读。使用contentHash→expectedContentHash；pending传changeId，继续编辑先读最新草稿；精确oldText/newText或少量不重叠edits，不重写全文。
同步并纠正同一原业务范围：
1. 来源工作表必须“03 机会门店主数据”，分别对应A是否仅正式落库、H必填、O新增展示、P后续是否前端发起修改，记录阶段与坐标；不把空值补成否。
2. 编码F2自动计算/K2 {JHWD}{10位顺序码}/O2是/P2否，名称F3新建手录/G3 50/O3是/P3否；新增可录或只读展示与后续不可改分开，编码分配时机待确认，不套01终端规则。
3. 旧对照把“不允许调整”误归K列并与P直接当冲突，须回到F5/F6/F7创建采集/调整与P5/P6/P7后续前端变更分别核对，不混成同一维度；F7定位不可手调、F8详细地址可调，具体机制未知保留问题。
4. 制度初期批量导入/后续SFA手工与流程v2步骤20后台导入保留阶段/版本冲突；真实判重接口、错误码与编码时机不冒充确定。
5. 数据来源第4行B4标商机客户，O4/P4无提取值，N4是不能推出O4是；字段对象/展示/后续变更适用性保留未知。原型来源控件仅演示安排，不补为资料事实。
6. 每项给来源文件/工作表/坐标或段落、资料原意、适用阶段、最新PRD位置、HTML已知演示行为与未确认项。本轮用户新增失败/修正清错/当前输入重试属于本地模拟需求，不声称旧资料规定真实后台策略。若没有读取最新HTML，此列只引用已有宿主真实报告/前轮信息并标范围，不声称重新验收；无需调用浏览器。
只通过产品受控增量草稿保存对照，不能在回复贴全文或写其他成果，不定义/更新原型验收。宿主终态后核对精确范围再应用，业务内容由独立人工复核。最终简短说明实际同步和未知。`;

const prdAddressNamePrompt=`本轮只对“机会门店新建/PRD.md”做两点局部纠正：§6.3定位地址与详细地址的创建采集/调整边界；§6.6说明网点名称后续前端变更限制。不要改§7字段表、导入来源、其他章节，也不能写HTML或约束对照。它们留给后续独立步骤，不重做原六项大任务。本轮未注入任何来源全文。
必须先通过read_file实际读取宿主给出的已核验“03 机会门店主数据”提取文本片段（列头、行3、行7/8），核对F3/P3与F7/F8以及对应P列。不能只相信本提示或旧PRD；来源列与阶段不同不能混为同一含义，缺失机制仍保留待确认。随后read_draft只读宿主给出的§6.3至§6.6范围，立即对确切旧文本提交小edit_draft，不先审计整个模块或长篇规划。
把§6.3目前混写定位/详细地址可编辑的句子按实际来源分开纠正；在§6.6现有他人查看修改说明旁补名称后续前端变更的来源限制，区分新建录入与后续修改，具体权限/阶段关系不明确仍待确认。每处简短写真实工作表/坐标依据即可，不扩写整章。
传read_draft.contentHash为expectedContentHash，pending时传changeId；精确oldText/newText或最多3条不重叠edits，相对同一旧稿。只保存受控草稿，不输出全文，不定义/运行浏览器，不改变权限或来源。宿主会停止后检查精确文件再应用；最终简短说明这两处实际修改与未知，不能假称整个PRD修订完成。`;
const prdDimensionsPrompt=`本次仅完成PRD剩余这一步的小范围纠正：§7列说明和编码/名称/数据来源三行，以及§2.2/§5/§6.1/§8中无条件后台导入叙述。上一Run修好的§6.3和§6.6不动，HTML及约束对照不能写。没有来源全文工作流，不做整篇审计或重写。
先实际read_file读取宿主给出的来源必要片段：05表的“03 机会门店主数据”列头和行2/3/4，以及管理制度导入规则与新增流程步骤20。源坐标取值必须来自工具返回，不仅相信本提示或旧PRD。只需给定范围，不全文读三文件。随后read_draft按给定目标段读取，遇明确问题立即提交小edit_draft，再读最新稿继续。
§7分别解释A是否仅正式落库/H必填/O新增展示/P后续前端变更，四维不能合并；编码新建自动计算、展示只读、后续限制和分配时机未知按实际来源表述；名称新建录入与后续变更分开。数据来源行核对业务对象与O/P缺值：没有提取值就保留未知，不能从N推O。可以在§7增加关键三字段的小矩阵而非重写全部字段表；其余未核对行不要声称已验证。
导入叙述按真实读取的制度和流程区分阶段/版本，修正无条件后台导入，在相关段明确两源差异与待确认问题，不把任一版本默认当最终业务授权。
编辑限定上列段落，保留地址/名称已修处。使用read_draft.contentHash作expectedContentHash，pending传changeId；精确旧文本替换，最多8条不重叠小edits（同一原稿），不要提交全文。只保存产品草稿，不浏览器、不更新原型验收，不编造整体PRD或业务通过。最终简短说明本步更改及未知，对照留下一独立Run同步。`;


const prdStructurePrompt=`仅修复当前“机会门店新建/PRD.md”§7的表格结构和相应解释。上一Run有真实回归：新表头第5/6列被换成业务对象/新增展示，但后续旧行仍旧列含义；新矩阵/说明插在第三行后，打断原表。不要同步对照、不要改HTML、§6.3/§6.6和导入条款，也不能改未核对行的值。不要重写整文。
先实际read_file读取宿主给出的03机会门店主数据列头/行2/3/4片段，核对F2/O2/P2、A/H阶段与B4/O4/P4，不只信提示。read_draft只读完整§7范围（必须取得旧表尾），然后立即提交小增量edit_draft，必要时再读最新稿继续。
最小修法：恢复原表连续、同一套七列含义：分类/字段名/类型长度/来源/新增展示/新增必填或填写方式/校验规则。编码、名称、来源三行也必须按这套列位摆值，B4商机客户只能放旁边说明或独立矩阵，不占旧表第五列。其余旧行不重映射、不更改值。保留数据来源新增展示为未提取/未知，不能补成是。
将现有关键三字段四维矩阵与说明从原表第三行后移到整个原表结束之后（不插入原表行之间），有独立表头和分隔行，完整原表不被段落打断。声明仅关键三字段本轮已核对，其他旧行保留待复核，不能说整张表都已验证。
四维事实保留，同时明确A仅正式落库与H必填在机会新建阶段的适用关系仍待业务确认，不能仅列值而暗示全部新建强制手填。当前编码只读依据F2自动计算，当前新增展示依据O2；P2只约束后续前端变更，不以P推当前只读。B4商机客户和O4/P4无提取值仍独立说明，不从N推O；编码分配时机未知、名称P3与导入冲突保留。
使用contentHash作expectedContentHash，pending传changeId；用精确旧文本的小替换完成移动/表头/三行修正，不发完整文档，不定义/运行浏览器，不编造通过。宿主停止后核对文件范围再应用，独立审计随后复核。最终短说明结构修复，不能遮掩上一Run的回归。`;

async function repairHarness(app,safeStorage,cfg){
 app.setPath('userData',cfg.manifest.profile);app.setPath('sessionData',cfg.manifest.profile);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),{createHash}=await import('node:crypto');
 const m=cfg.manifest,hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
 let service,store,settings,runId,conversationId,outputMount;
 const result={status:'starting',cloudExecuted:false,automaticRetries:0,startedAt:new Date().toISOString(),businessReview:'pending_human_review',priorIndependentReview:m.priorIndependentReview,experiment:{phase:m.prdFieldsOnly?'prd_fields_'+m.prdFieldsPhase+'_serial_step':m.constraintsOnly?'constraints_only_serial_step':m.prdOnly?'prd_only_serial_step':m.htmlOnly?'html_only_serial_step':'full_three_artifacts',totalBusinessScopeComplete:false,workflowSourceInjectionRequested:!m.htmlOnly&&!m.constraintsOnly&&!m.prdFieldsOnly,changeScope:cfg.allowedChangePaths,comparison:'Different request scope/assembly from previous full-scope runs; no performance saving claim.'},runs:[],changes:[],artifacts:[],sourceChecks:[],baselineChecks:[],prototypeChecks:[]};
 const save=async()=>fs.writeFile(path.join(m.output,cfg.allowCloud?'repair-result.json':'repair-local-verification.json'),settings?settings.redact(JSON.stringify(result,null,2)):JSON.stringify(result,null,2));
 const stage=async value=>{const row=JSON.stringify({stage:value,updatedAt:new Date().toISOString()});await fs.writeFile(path.join(m.output,'harness-progress.json'),row);await fs.appendFile(path.join(m.output,'harness-stages.jsonl'),row+'\n');};
 const settle=async()=>{const end=Date.now()+30000;while((service.active.size||service.starting.size)&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,250));return !service.active.size&&!service.starting.size;};
 const canonical=value=>path.posix.normalize(value.replaceAll('\\','/')).toLowerCase();
 try{
  await stage('waiting_electron_ready');await app.whenReady();await stage('electron_ready');
  await stage('importing_store');const {Store}=await import(cfg.modules.store);await stage('importing_service');const {Service}=await import(cfg.modules.service);await stage('importing_settings');const {ModelSettings}=await import(cfg.modules.settings);await stage('importing_browser');const browser=await import(cfg.modules['prototype-browser']);await stage('constructing_store_service');
  store=new Store(m.profile);
  service=new Service(store,()=>settings?.defaultCredential()??'',()=>{},undefined,{redact:value=>settings?.redact(value)??value,runPrototypeAcceptance:browser.runPrototypeAcceptance},id=>settings?.credential(id));
  if(service.state.root&&service.state.root!==m.workspace||(!m.appendProject&&(service.state.runs.length||service.state.conversations.length))||service.state.connections.length||service.state.runs.some(r=>['queued','running','waiting_user','cancelling'].includes(r.status)))throw Error('ISOLATION_SEED_INVALID');
  const preserve=()=>{for(const [key,ids] of Object.entries(m.priorRecords??{}))if(ids.some(id=>!service.state[key].some(row=>row.id===id)))throw Error('PRIOR_RECORD_MISSING');result.priorRecordsRetained=m.priorRecords?true:undefined;};preserve();
  await stage('initializing_model_settings');settings=new ModelSettings(store,safeStorage,{get:()=>service.state,save:()=>service.save()});settings.initialize();
  if(!settings.defaultCredential())throw Error('LOCAL_CREDENTIAL_DECRYPT_FAILED');
  // Initialize only the newly prepared workspace. Old profile/session never opened.
  await stage('initializing_workspace');if(!service.state.root)await service.workspace(m.workspace);
  for(const [capability,decision] of Object.entries({workspace_read:'allow',artifact_write:'allow',web_read:'deny',process_execute:'deny',connection_config:'deny',external_action:'deny'}))service.setPermission(capability,decision);
  const tree=await service.projectTreeGet(),node=tree.appliedNodes.find(item=>item.role==='output');
  outputMount=service.state.mounts.find(item=>node?.path&&path.resolve(item.path).toLowerCase()===path.resolve(m.workspace,node.path).toLowerCase());
  if(!outputMount?.enabled)throw Error('OUTPUT_MOUNT_MISSING');
  for(const mount of service.state.mounts)mount.write=mount.id===outputMount.id;
  service.save();const textMount=service.state.mounts.find(mount=>mount.path===m.textCopies)??await service.mount(m.textCopies,false);if(!service.state.mounts.some(mount=>mount.path===m.originalCopies))await service.mount(m.originalCopies,false);
  for(const old of m.artifacts){const file=await service.files.resolve(outputMount.id,old.path);if(await hash(file)!==old.sha256)throw Error('COPIED_ARTIFACT_CHANGED');}
  if(!cfg.allowCloud){result.status='verified_before_send';result.localDecrypt=true;result.profileRoot=service.state.root;result.runCount=service.state.runs.length;result.sessionCount=service.state.conversations.length;result.referenceMounts=service.state.mounts.filter(mount=>[m.textCopies,m.originalCopies].includes(mount.path)).map(({path,write,enabled})=>({path,write,enabled}));await stage('before_send_verified_no_cloud');return;}
  conversationId=service.conversation(undefined,m.prdFieldsOnly?'真实PRD局部修订：'+m.prdFieldsPhase:m.constraintsOnly?'真实业务修订：仅约束对照':m.prdOnly?'真实业务修订第二步：仅PRD':'真实业务修订：机会门店新建');
  const sources=textMount?m.sources.map(s=>({mountId:textMount.id,path:path.basename(s.inputPath),contentHash:s.inputSha256,locator:s.inputLocator})):[];
  const scopedPrompt=cfg.prompt+'\n允许保存的精确成果路径：mountId='+outputMount.id+'；'+cfg.allowedChangePaths.join('、')+'。'+(m.htmlOnly?'本步未注入资料工作流，不要求读取其他成果或来源。':m.prdFieldsOnly?'本步不批量注入来源。必须实际读取来源片段与目标段：'+JSON.stringify({sources,readHints:m.readHints}):m.constraintsOnly?'本步未注入prd正文工作流。可按范围只读最新机会门店新建/PRD.md及来源引用：'+JSON.stringify(sources):'三份来源正文已由prd工作流提供，无需重复全文读取；只读本步目标相关段并增量编辑。');
  await stage('repair_running');result.cloudExecuted=true;
  runId=await service.send(conversationId,scopedPrompt,'build','standard',service.state.defaultModelId,undefined,undefined,m.htmlOnly?'coding':'writing',undefined,m.htmlOnly||m.constraintsOnly||m.prdFieldsOnly?undefined:{kind:'prd',sources});result.runId=runId;await save();
  const deadline=Date.now()+12*60*1000;let terminal=false;
  while(Date.now()<deadline){if(['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(service.state.runs.find(r=>r.id===runId)?.status)){terminal=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
  if(!terminal){result.timeout=true;service.cancel(runId);}
  if(!await settle())throw Error('RUNTIME_DID_NOT_SETTLE');
  const run=service.state.runs.find(item=>item.id===runId);result.terminalStatus=run.status;result.interruptionReason=run.interruptionReason;result.modelFinishedAt=new Date().toISOString();result.modelElapsedMs=run.startedAt&&run.finishedAt?Date.parse(run.finishedAt)-Date.parse(run.startedAt):undefined;
  const changes=service.state.changes.filter(c=>c.runId===runId),allowed=new Set(cfg.allowedChangePaths.map(canonical));
  // All draft destinations checked before any application. Latest pending wins.
  for(const c of changes)if(c.mountId!==outputMount.id||!allowed.has(canonical(c.path)))throw Error('CHANGE_OUTSIDE_SCOPE');
  const seen=new Set();
  for(const c of changes.filter(c=>c.status==='pending')){const key=c.mountId+'\0'+canonical(c.path);if(seen.has(key)){result.changes.push({id:c.id,path:c.path,status:'superseded_not_applied'});continue;}seen.add(key);await service.apply(c.id);result.changes.push({...c});}
  for(const c of changes.filter(c=>c.status==='applied'&&!result.changes.some(item=>item.id===c.id)))result.changes.push({...c});
  for(const old of m.artifacts){const file=await service.files.resolve(outputMount.id,old.path),bytes=await fs.readFile(file),versions=await service.listVersions(outputMount.id,old.path);result.artifacts.push({path:old.path,bytes:bytes.length,nonempty:Boolean(bytes.length&&bytes.toString('utf8').trim()),oldHash:old.sha256,newHash:createHash('sha256').update(bytes).digest('hex'),versions});}
  result.changedPaths=result.artifacts.filter(a=>a.oldHash!==a.newHash).map(a=>a.path);
  result.disposition=result.changedPaths.length?'artifacts_updated':'reply_only_no_artifact_change';
  if(!m.prdOnly&&!m.constraintsOnly){await stage('host_prototype_acceptance');
  const target={mountId:outputMount.id,path:'机会门店新建/index.html'};
  result.modelPrototypeBeforeHost=await service.getPrototypeAcceptance(target);
  const cases=cfg.hostCases;result.hostPrototypeSuite={caseCount:cases.length,totalSteps:cases.reduce((n,c)=>n+c.steps.length,0),definitionHash:cfg.hostCasesHash,validationEvidence:m.hostSuiteValidation,notice:'Eight fixed host cases cover the four original cases plus independently reproduced boundaries. No model self-evaluation. Reentry follows this version’s explicit retain-enabled strategy; other permitted strategies require reviewed case updates.'};
  const previous=result.modelPrototypeBeforeHost.spec;
  await service.savePrototypeAcceptance({...target,title:'固定宿主真实回归（不是模型自评）',cases,sourceRefs:sources,...(previous?{expectedRevision:previous.revision}:{})},'build');
  const view=await service.runPrototypeAcceptance({...target,mode:'build'},'build');result.prototypeChecks.push(view);
  const report=view.latestReport?.evidence;
  for(const image of report?.screenshots??[]){const loaded=await service.prototypeAcceptanceScreenshot(view.latestReport.reportId,image.id);const filename='prototype-'+image.caseId+'.png';await fs.writeFile(path.join(m.output,filename),Buffer.from(loaded.dataUrl.split(',')[1],'base64'),{flag:'wx'});}
  result.status=run.status==='succeeded'&&result.artifacts.every(a=>a.nonempty)?'completed_pending_business_review':'repair_incomplete';
  result.prototypeStatus=report?.status??'unknown';}else{result.status=run.status==='succeeded'&&result.artifacts.every(a=>a.nonempty)?'completed_pending_business_review':'repair_incomplete';result.prototypeStatus='not_run';result.prototypeNotice='Document-only: no browser result used as document business acceptance.';}preserve();await stage(result.status);
 }catch(error){result.status='failed';result.error=settings?settings.redact(error instanceof Error?error.message:String(error)):'REPAIR_SETUP_FAILED';process.exitCode=1;}
 finally{
  let settled=true;
  if(service){for(const run of service.state.runs)if(['queued','running','waiting_user','cancelling'].includes(run.status))service.cancel(run.id);settled=await settle();if(runId){const run=service.state.runs.find(r=>r.id===runId),operations=store.operationsForRun(runId);result.runs.push({run,operations,messages:service.state.conversations.find(c=>c.id===conversationId)?.messages.filter(message=>message.runId===runId),contextManifest:store.get('context-manifest:'+runId,null)});result.remainingDrafts=service.state.changes.filter(c=>c.runId===runId&&c.status==='pending').map(({id,path,content})=>({id,path,characters:content.length}));
   const names=['read_draft','edit_draft','write_draft'];result.toolStatistics={gatewayCounts:Object.fromEntries(names.map(name=>[name,operations.filter(op=>op.tool===name).length])),piCounts:Object.fromEntries(names.map(name=>[name,0])),editingRequests:[],readingRequests:[],usage:[],sessionEvidence:'unavailable'};
   result.nativeCompaction={runContextRecovery:run.contextRecovery,events:operations.filter(op=>op.tool==='context_compaction').map(op=>{let payload;try{payload=JSON.parse(op.result);}catch{payload={status:'unavailable'};}return{id:op.id,createdAt:op.createdAt,state:op.state,payload};})};
   try{
    const file=store.get('session:'+conversationId,undefined),relative=file&&path.relative(m.profile,file);
    if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep)||(await fs.stat(file)).size>32*1024*1024)throw Error('SESSION_EVIDENCE_UNAVAILABLE');
    // Redact before parsing/recording any Pi data. Retain numbers and sizes only.
    const rows=settings.redact(await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    for(const row of rows){const message=row.type==='message'?row.message:undefined;if(message?.role!=='assistant')continue;
     if(message.usage){const usage={};for(const key of ['input','output','cacheRead','cacheWrite','totalTokens'])if(typeof message.usage[key]==='number')usage[key]=message.usage[key];if(Object.keys(usage).length)result.toolStatistics.usage.push(usage);}
     for(const call of message.content??[])if(call.type==='toolCall'&&['read_file','read_draft'].includes(call.name)){const request=call.arguments??{},leaf=path.basename(String(request.path??'')),reference=m.sources.some(source=>[path.basename(source.inputPath),path.basename(source.textPath)].includes(leaf)),artifact=cfg.requiredPaths.includes(request.path),receipt=rows.find(row=>row.type==='message'&&row.message?.role==='toolResult'&&row.message.toolCallId===call.id)?.message;result.toolStatistics.readingRequests.push({tool:call.name,scope:reference?'reference':artifact?'artifact':'other_scope',path:reference||artifact?request.path:'other_scope',offset:Number.isInteger(request.offset)?request.offset:undefined,limit:Number.isInteger(request.limit)?request.limit:undefined,outcome:receipt?(receipt.isError?'returned_error':'returned_success'):'unconfirmed',notice:'Requested range and actual tool receipt only; does not claim complete source coverage.'});}
     for(const call of message.content??[])if(call.type==='toolCall'&&names.includes(call.name)){result.toolStatistics.piCounts[call.name]++;const request=call.arguments??{},entry={tool:call.name,requestBytesAfterRedaction:Buffer.byteLength(JSON.stringify(request)),path:cfg.requiredPaths.includes(request.path)?request.path:'other_scope'};if(call.name==='write_draft'&&typeof request.content==='string')entry.fullContentBytes=Buffer.byteLength(request.content);if(call.name==='edit_draft'){const edits=request.edits??[{oldText:request.oldText,newText:request.newText}];entry.oldTextBytes=edits.reduce((n,e)=>n+Buffer.byteLength(e.oldText??''),0);entry.newTextBytes=edits.reduce((n,e)=>n+Buffer.byteLength(e.newText??''),0);}result.toolStatistics.editingRequests.push(entry);}
    }result.toolStatistics.sessionEvidence='read_selected_fields_after_redaction';
   }catch{result.toolStatistics.sessionEvidence='unavailable_or_parse_failed';}
  }service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}
  for(const source of m.sources)try{result.sourceChecks.push({name:source.name,originalUnchanged:await hash(source.originalSourcePath)===source.sourceSha256Before,baselineOriginalCopyUnchanged:await hash(source.baselineOriginalCopyPath)===source.copySha256,baselineTextUnchanged:await hash(source.baselineTextPath)===source.textSha256,copyUnchanged:await hash(source.originalCopyPath)===source.copySha256,textUnchanged:await hash(source.textPath)===source.textSha256,inputUnchanged:await hash(source.inputPath)===source.inputSha256});}catch{result.sourceChecks.push({name:source.name,error:'SOURCE_CHECK_FAILED'});}
  for(const prior of m.baselineFiles)try{result.baselineChecks.push({path:prior.path,unchanged:await hash(prior.path)===prior.sha256});}catch{result.baselineChecks.push({path:prior.path,unchanged:false});}
  if(!settled||result.baselineChecks.some(c=>!c.unchanged)||result.sourceChecks.some(c=>c.error||!c.originalUnchanged||!c.baselineOriginalCopyUnchanged||!c.baselineTextUnchanged||!c.copyUnchanged||!c.textUnchanged||!c.inputUnchanged)){result.status='failed';result.error=!settled?'RUNTIME_DID_NOT_SETTLE':'SOURCE_OR_BASELINE_CHANGED';process.exitCode=1;}
  result.finishedAt=new Date().toISOString();result.elapsedMs=Date.parse(result.finishedAt)-Date.parse(result.startedAt);await save();if(settled)store?.close();app.exit(process.exitCode??0);
 }
}

async function prepare(){
 const testRoot=await fs.realpath(path.join(repo,'.test-data'));if(await fs.realpath(baseline)!==baseline||path.dirname(baseline)!==testRoot)throw Error('VERIFIED_BASELINE_REQUIRED');
 const old=JSON.parse(await fs.readFile(path.join(baseline,'manifest.json'),'utf8'));
 const resumed=JSON.parse(await fs.readFile(path.join(baseline,'resume-once-ZLq1do','resume-result.json'),'utf8'));
 if(resumed.status!=='completed_pending_business_review'||old.sources.length!==3||path.resolve(old.profile)!==path.join(baseline,'profile')||path.resolve(old.workspace)!==path.join(baseline,'workspace'))throw Error('VERIFIED_BASELINE_INVALID');
 const output=await fs.mkdtemp(path.join(testRoot,'pm-business-real-repair-')),profile=path.join(output,'profile'),workspace=path.join(output,'workspace'),originalCopies=path.join(output,'evidence-originals'),textCopies=path.join(output,'evidence-text');
 for(const folder of [profile,workspace,originalCopies,textCopies,path.join(workspace,'成果','机会门店新建')])await fs.mkdir(folder,{recursive:true});
 const sources=[];
 for(const s of old.sources){
  for(const file of [s.originalCopyPath,s.textPath,s.inputPath])if(!within(baseline,path.resolve(file))||await fs.realpath(file)!==path.resolve(file))throw Error('BASELINE_INPUT_PATH_INVALID');
  if(!within(path.resolve('E:\\code\\slash test'),path.resolve(s.originalSourcePath))||await sha(s.originalSourcePath)!==s.sourceSha256Before||await sha(s.originalCopyPath)!==s.copySha256||await sha(s.textPath)!==s.textSha256||await sha(s.inputPath)!==s.inputSha256)throw Error('SOURCE_VERSION_CHANGED');
  const originalCopyPath=path.join(originalCopies,s.name),textPath=path.join(textCopies,path.basename(s.textPath)),inputPath=path.join(textCopies,path.basename(s.inputPath));
  await fs.copyFile(s.originalCopyPath,originalCopyPath,constants.COPYFILE_EXCL);await fs.copyFile(s.textPath,textPath,constants.COPYFILE_EXCL);if(inputPath!==textPath)await fs.copyFile(s.inputPath,inputPath,constants.COPYFILE_EXCL);
  sources.push({...s,baselineOriginalCopyPath:s.originalCopyPath,baselineTextPath:s.textPath,originalCopyPath,textPath,inputPath});
 }
 const artifacts=[];
 for(const relative of requiredPaths){const oldPath=path.join(old.workspace,'成果',relative),record=resumed.artifacts.find(a=>a.path===relative);if(!record||await sha(oldPath)!==record.sha256)throw Error('BASELINE_ARTIFACT_VERSION_CHANGED');const copiedPath=path.join(workspace,'成果',relative);await fs.copyFile(oldPath,copiedPath,constants.COPYFILE_EXCL);artifacts.push({path:relative,baselinePath:oldPath,copiedPath,sha256:record.sha256,bytes:(await fs.stat(copiedPath)).size});}
 const baselineFiles=[];for(const file of [path.join(baseline,'manifest.json'),path.join(baseline,'result.json'),path.join(baseline,'resume-once-ZLq1do','resume-result.json'),path.join(old.profile,'slash.sqlite'),path.join(old.profile,'Local State'),...artifacts.map(a=>a.baselinePath)])baselineFiles.push({path:file,sha256:await sha(file)});
 const source=new DatabaseSync(path.join(old.profile,'slash.sqlite'),{readOnly:true}),dest=new DatabaseSync(path.join(profile,'slash.sqlite'));let metadata;
 try{
  const get=(key,fallback)=>{const row=source.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(String(row.value)):fallback;};
  const state=get('state',{}),model=state.models.find(m=>m.id===state.defaultModelId);if(!model)throw Error('DEFAULT_MODEL_MISSING');
  const encrypted=get('model-secret:'+model.id,'');if(!encrypted)throw Error('MODEL_CREDENTIAL_MISSING');
  dest.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const put=(key,value)=>dest.prepare('INSERT INTO kv VALUES(?,?)').run(key,JSON.stringify(value));
  put('state',{root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[model],defaultModelId:model.id,model:{baseUrl:model.baseUrl,id:model.modelId,hasKey:true}});put('model-secret:'+model.id,encrypted);
  // Only selected model capability entries; never copy task/session/workspace keys.
  const {thinkingFingerprint}=await import('../dist/main/model-thinking.js'),{resolveModelLimits}=await import('../dist/main/model-limits.js');const input={entryId:model.id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens},fingerprint=thinkingFingerprint(input),cached=get('model-thinking:v1:'+fingerprint,null);if(cached)put('model-thinking:v1:'+fingerprint,cached);
  const limits=resolveModelLimits(input,fingerprint,cached?.resolution?.metadataLimits);metadata={provider:model.provider,name:model.name,protocol:model.protocol,hasKey:true,limits:{contextWindow:limits.contextWindow,maxTokens:limits.maxTokens,status:limits.status,contextWindowSource:limits.contextWindowSource,maxTokensSource:limits.maxTokensSource}};
 }finally{source.close();dest.close();}
 await fs.copyFile(path.join(old.profile,'Local State'),path.join(profile,'Local State'),constants.COPYFILE_EXCL);
 const m={schemaVersion:1,status:'prepared_no_cloud_request',cloudExecuted:false,output,profile,workspace,originalCopies,textCopies,sources,artifacts,baselineFiles,model:metadata,htmlOnly,sessionStrategy:'fresh_conversation_reads_copied_previous_artifacts',createdAt:new Date().toISOString()};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(m,null,2),{flag:'wx'});await fs.writeFile(path.join(output,'repair-prompt.txt'),htmlOnly?htmlPrompt:prompt,{flag:'wx'});
 if(htmlOnly)await fs.writeFile(path.join(output,'experiment-notes.md'),'# 单成果串行实验准备\n\n仅HTML为本步模型写入范围，三份来源仍在只读挂载供后续核对，但此步明确不读且未注入PRD资料工作流。PRD与约束对照副本保持不变，由宿主核对hash，后续分别完成原业务总范围。固定浏览器用例来源是本次用户明确的模拟交互需求，不能当作旧业务制度。此实验与此前完整三成果同scope任务不同，不能据此计算性能节省或声称整体修订已完成。\n',{flag:'wx'});return m;
}

async function prepareAppend(project){
 const testRoot=await fs.realpath(path.join(repo,'.test-data')),projectOutput=path.resolve(project);
 if(path.dirname(projectOutput)!==testRoot||!path.basename(projectOutput).startsWith('pm-business-real-repair-')||await fs.realpath(projectOutput)!==projectOutput)throw Error('APPEND_PROJECT_INVALID');
 const old=JSON.parse(await fs.readFile(path.join(projectOutput,'manifest.json'),'utf8')),previousResult=path.resolve(arg('--after-result')??path.join(projectOutput,'repair-result.json'));
 if(!within(projectOutput,previousResult)||path.basename(previousResult)!=='repair-result.json'||await fs.realpath(previousResult)!==previousResult)throw Error('PREVIOUS_RESULT_INVALID');
 const previous=JSON.parse(await fs.readFile(previousResult,'utf8'));
 const acceptedFailure=prdFieldsOnly&&previous.status==='repair_incomplete'&&previous.terminalStatus==='interrupted'&&previous.interruptionReason==='model_output_limit'&&previous.changedPaths?.length===0;
 if(!old.htmlOnly||(!acceptedFailure&&(previous.status!=='completed_pending_business_review'||previous.terminalStatus!=='succeeded'))||previous.artifacts?.length!==3)throw Error('PREVIOUS_STEP_NOT_VERIFIED');
 for(const [key,leaf] of [['profile','profile'],['workspace','workspace'],['originalCopies','evidence-originals'],['textCopies','evidence-text']])if(old[key]!==path.join(projectOutput,leaf)||await fs.realpath(old[key])!==old[key])throw Error('APPEND_PROJECT_INVALID');
 const source=new DatabaseSync(path.join(old.profile,'slash.sqlite'),{readOnly:true});let priorRecords;
 try{const state=JSON.parse(String(source.prepare('SELECT value FROM kv WHERE key=?').get('state').value));if(state.root!==old.workspace||state.connections.length||state.runs.some(r=>['queued','running','waiting_user','cancelling'].includes(r.status)))throw Error('APPEND_PROJECT_NOT_SETTLED');priorRecords=Object.fromEntries(['runs','conversations','changes'].map(key=>[key,state[key].map(row=>row.id)]));if(!priorRecords.runs.includes(previous.runId))throw Error('HTML_RUN_MISSING');}finally{source.close();}
 const artifacts=[];for(const relative of requiredPaths){const copiedPath=path.join(old.workspace,'成果',relative),a=previous.artifacts.find(a=>a.path===relative);if(!a||await sha(copiedPath)!==a.newHash)throw Error('HTML_STEP_ARTIFACT_CHANGED');artifacts.push({...old.artifacts.find(a=>a.path===relative),copiedPath,sha256:a.newHash,bytes:(await fs.stat(copiedPath)).size});}
 const baselineFiles=[...old.baselineFiles];const evidenceFiles=new Set(['manifest.json','repair-result.json','attempt.json'].map(file=>path.join(projectOutput,file)));for(const file of ['manifest.json','repair-result.json','attempt.json'])evidenceFiles.add(path.join(path.dirname(previousResult),file));for(const exact of evidenceFiles)baselineFiles.push({path:exact,sha256:await sha(exact)});
 const scope=htmlOnly?'html':constraintsOnly?'constraint':prdFieldsOnly?'prd-fields':'prd',output=await fs.mkdtemp(path.join(projectOutput,scope+'-step-')),m={...old,output,projectOutput,appendProject:true,inputResult:previousResult,prdOnly:prdOnly||prdFieldsOnly,prdFieldsOnly,prdFieldsPhase:prdFieldsOnly?(arg('--fields-phase')??'address-name'):undefined,constraintsOnly,htmlOnly,artifacts,baselineFiles,priorRecords,status:'prepared_no_cloud_request',cloudExecuted:false,sessionStrategy:'same_isolated_project_new_conversation_preserves_previous_runs_versions',createdAt:new Date().toISOString()};
 if(prdFieldsOnly){const bytes=await fs.readFile(artifacts.find(a=>a.path==='机会门店新建/PRD.md').copiedPath,'utf8');const start=bytes.indexOf(m.prdFieldsPhase==='dimensions'||m.prdFieldsPhase==='structure'?'## 7.':'### 6.3'),end=m.prdFieldsPhase==='structure'?bytes.indexOf('## 8.',start):m.prdFieldsPhase==='dimensions'?Math.min(bytes.length,start+1600):bytes.indexOf('## 7.',start);if(start<0||end<=start)throw Error('PRD_SECTION_NOT_FOUND');const referenceRange=(name,ranges)=>({path:path.basename(m.sources.find(source=>source.name===name).inputPath),ranges});m.readHints=m.prdFieldsPhase==='structure'?{referenceSources:[referenceRange('05 网点主数据.xlsx',[{offset:1,limit:70}])],draftCharacters:{path:'机会门店新建/PRD.md',offset:start,limit:end-start}}:m.prdFieldsPhase==='dimensions'?{referenceSources:[referenceRange('05 网点主数据.xlsx',[{offset:1,limit:70}]),referenceRange('门店运营管理制度-V4.docx',[{offset:326,limit:9}]),referenceRange('新增终端流程v2.0.docx',[{offset:34,limit:14}])],draftCharacters:[['### 2.2','## 3.'],['## 5.','### 6.2'],['## 7.','| 位置信息 | 经度'],['## 8.','## 9.']].map(([from,to])=>{const offset=bytes.indexOf(from),end=bytes.indexOf(to,offset);if(offset<0||end<=offset)throw Error('PRD_SECTION_NOT_FOUND');return{path:'机会门店新建/PRD.md',offset,limit:end-offset};})}:{referenceSources:[referenceRange('05 网点主数据.xlsx',[{offset:1,limit:24},{offset:41,limit:16},{offset:102,limit:31}])],draftCharacters:{path:'机会门店新建/PRD.md',offset:start,limit:end-start}};m.readHints.notice='Source ranges use read_file line offsets; PRD uses read_draft character offset. Ranges locate verified text, not substitute facts.';}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(m,null,2),{flag:'wx'});await fs.writeFile(path.join(output,'repair-prompt.txt'),prdFieldsOnly?(m.prdFieldsPhase==='structure'?prdStructurePrompt:m.prdFieldsPhase==='dimensions'?prdDimensionsPrompt:prdAddressNamePrompt):htmlOnly?htmlPrompt:constraintsOnly?constraintsPrompt:prdPrompt,{flag:'wx'});await fs.writeFile(path.join(output,'experiment-notes.md'),(prdFieldsOnly?'PRD fields micro-experiment is a separate Run, source fragments must be actually read. No bulk workflow injection, no full PRD replacement, no browser. If address-name attempt only thinks without tool submission, stop this model experiment route.':htmlOnly?'HTML follow-up is a separate independent Run preserving the prior HTML evidence; no other artifact may change. No workflow source injection.':constraintsOnly?'Constraints-only is a separate independent Run after PRD. Only comparison document may change. No workflow source-body injection; sources/PRD are read only by relevant ranges. No browser invocation.':'PRD-only is the second independent Run of the original three-artifact business scope. Same isolated workspace/profile and prior records are preserved. Only PRD.md may change. Sources are injected once by the prd workflow; repeated full source reads are not requested. No browser result establishes document business acceptance. No performance comparison to full-scope runs.\n'),{flag:'wx'});return m;
}

let output;
try{
 if([htmlOnly,prdOnly,constraintsOnly,prdFieldsOnly].filter(Boolean).length>1)throw Error('MUTUALLY_EXCLUSIVE_SCOPE');
 if(arg('--fields-phase')&&(!prdFieldsOnly||!['address-name','dimensions','structure'].includes(arg('--fields-phase'))))throw Error('FIELDS_PHASE_INVALID');
 if(allowCloud&&verifyLocal)throw Error('LOCAL_VERIFICATION_CANNOT_REQUEST_CLOUD');
 if(args.some(a=>!['--prepare','--allow-cloud','--prepared-dir','--verify-local','--html-only','--prd-only','--constraints-only','--prd-fields-only','--fields-phase','--append-project','--after-result'].includes(a)&&a!==arg('--prepared-dir')&&a!==arg('--append-project')&&a!==arg('--after-result')&&a!==arg('--fields-phase')))throw Error('UNKNOWN_ARGUMENT');
 let m;const prepared=arg('--prepared-dir');
 if(prepared){output=path.resolve(prepared);const testRoot=await fs.realpath(path.join(repo,'.test-data')),parent=path.dirname(output),isRoot=parent===testRoot&&path.basename(output).startsWith('pm-business-real-repair-'),isStep=path.dirname(parent)===testRoot&&path.basename(parent).startsWith('pm-business-real-repair-')&&['prd-step-','prd-fields-step-','html-step-','constraint-step-'].some(prefix=>path.basename(output).startsWith(prefix));if((!isRoot&&!isStep)||await fs.realpath(output)!==output)throw Error('PREPARED_DIRECTORY_INVALID');m=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));}
 else{if(allowCloud)throw Error('PREPARE_BEFORE_CLOUD_REQUIRED');if((prdOnly||constraintsOnly||prdFieldsOnly)&&!arg('--append-project'))throw Error('APPEND_PROJECT_REQUIRED');if(arg('--append-project')&&!prdOnly&&!htmlOnly&&!constraintsOnly&&!prdFieldsOnly)throw Error('APPEND_SCOPE_REQUIRED');m=arg('--append-project')?await prepareAppend(arg('--append-project')):await prepare();output=m.output;}
 if(m.appendProject&&(path.dirname(output)!==m.projectOutput||path.dirname(m.projectOutput)!==await fs.realpath(path.join(repo,'.test-data'))))throw Error('APPEND_PROJECT_INVALID');
 if(m.output!==output||m.sources?.length!==3||m.artifacts?.length!==3)throw Error('ISOLATION_MANIFEST_INVALID');
 for(const [key,leaf] of [['profile','profile'],['workspace','workspace'],['originalCopies','evidence-originals'],['textCopies','evidence-text']])if(m[key]!==path.join(m.projectOutput??output,leaf)||await fs.realpath(m[key])!==m[key])throw Error('ISOLATION_MANIFEST_INVALID');
 for(const old of m.baselineFiles)if(await sha(old.path)!==old.sha256)throw Error('BASELINE_VERSION_CHANGED');
 for(const s of m.sources)if(await sha(s.originalSourcePath)!==s.sourceSha256Before||await sha(s.originalCopyPath)!==s.copySha256||await sha(s.textPath)!==s.textSha256||await sha(s.inputPath)!==s.inputSha256)throw Error('SOURCE_VERSION_CHANGED');
 for(const a of m.artifacts)if(await sha(a.copiedPath)!==a.sha256)throw Error('COPIED_ARTIFACT_CHANGED');
 const moduleNames=['store','service','settings','agent','prototype-browser','prototype-acceptance','model-runtime','model-thinking','files','draft-edit','session-compaction'],modules=Object.fromEntries(moduleNames.map(name=>[name,pathToFileURL(path.join(repo,'dist','main',name+'.js')).href]));
 const moduleHashes={};
 for(const relative of [...moduleNames.map(name=>'main/'+name+'.js'),'shared/draft-edit.js','shared/prototype-acceptance.js'])try{moduleHashes[relative]=await sha(path.join(repo,'dist',relative));}catch(error){if(error.code!=='ENOENT'||allowCloud)throw Error('RUNTIME_MODULE_NOT_BUILT');moduleHashes[relative]='awaiting_unified_build';}
 const hostCases=hostPrototypeCases(),hostCasesHash=createHash('sha256').update(JSON.stringify(hostCases)).digest('hex');
 const cfg={manifest:m,modules,requiredPaths,hostCases,hostCasesHash,allowedChangePaths:m.constraintsOnly?['机会门店新建/约束对照.md']:m.prdOnly?['机会门店新建/PRD.md']:m.htmlOnly?['机会门店新建/index.html']:requiredPaths,prompt:await fs.readFile(path.join(output,'repair-prompt.txt'),'utf8'),allowCloud},harness=path.join(output,'repair-harness.mjs');
 // Regenerated at explicit execution so a later unified build is actually used.
 await fs.writeFile(harness,"import {app,safeStorage} from 'electron';\nvoid ("+repairHarness.toString()+")(app,safeStorage,"+JSON.stringify(cfg)+");\n");
 await fs.writeFile(path.join(output,'runtime-manifest.json'),JSON.stringify({hostCaseModuleHash:await sha(path.join(repo,'scripts','pm-business-prototype-cases.mjs')),hostCasesHash,version:JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8')).version,moduleHashes,preparedAt:new Date().toISOString(),cloudAuthorized:allowCloud,cloudExecution:'not_started_at_manifest_write'},null,2));
 if(!allowCloud&&!verifyLocal)console.log(JSON.stringify({status:'prepared_no_cloud_request',output,harness,model:m.model,sessionStrategy:m.sessionStrategy,artifacts:m.artifacts.map(({path,sha256})=>({path,sha256})),baselineUnchanged:true}));
 else{
  if(allowCloud)await fs.writeFile(path.join(output,'attempt.json'),JSON.stringify({requestedAt:new Date().toISOString(),maximumAttempts:1,automaticRetries:0}),{flag:'wx'}).catch(()=>{throw Error('REPAIR_ALREADY_ATTEMPTED');});
  const env={...process.env,PM_SLASH_DATA_DIR:m.profile};delete env.ELECTRON_RUN_AS_NODE;let timedOut=false;
  const stdio={stdoutBytes:0,stderrBytes:0,stableCodes:[],policy:'Raw native output discarded; retain byte counts and fixed diagnostic codes only.'};
  const code=await new Promise((resolve,reject)=>{const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']}),start=Date.now();
   for(const [channel,stream] of [['stdout',child.stdout],['stderr',child.stderr]])stream.on('data',buffer=>{stdio[channel+'Bytes']+=buffer.length;for(const code of buffer.toString('utf8').match(/\b(?:PROTOTYPE|REPAIR|ERR)_[A-Z_]{2,80}\b/g)??[])if(!stdio.stableCodes.includes(code)&&stdio.stableCodes.length<20)stdio.stableCodes.push(code);});
   let started=false,checking=false;const watchdog=setInterval(async()=>{if(checking)return;checking=true;try{const p=JSON.parse(await fs.readFile(path.join(output,'harness-progress.json'),'utf8'));if(['repair_running','host_prototype_acceptance','completed_pending_business_review','repair_incomplete','before_send_verified_no_cloud'].includes(p.stage))started=true;}catch{}checking=false;if((!started&&Date.now()-start>120000)||Date.now()-start>16*60*1000){timedOut=true;child.kill();}},1000);child.once('error',()=>{clearInterval(watchdog);reject(Error('HARNESS_START_FAILED'));});child.once('exit',value=>{clearInterval(watchdog);resolve(value);});});
  await fs.writeFile(path.join(output,allowCloud?'harness-stdio-summary.json':'local-harness-stdio-summary.json'),JSON.stringify(stdio,null,2));
  const resultFile=path.join(output,allowCloud?'repair-result.json':'repair-local-verification.json');
  if(timedOut){let old={};try{old=JSON.parse(await fs.readFile(resultFile,'utf8'));}catch{}await fs.writeFile(resultFile,JSON.stringify({...old,status:'failed',error:'HARNESS_PARENT_TIMEOUT'}));throw Error('HARNESS_PARENT_TIMEOUT');}
  const result=JSON.parse(await fs.readFile(resultFile,'utf8'));console.log(JSON.stringify({status:result.status,cloudExecuted:result.cloudExecuted,output,runId:result.runId,terminalStatus:result.terminalStatus,prototypeStatus:result.prototypeStatus,businessReview:result.businessReview}));if(code!==0||result.status!==(allowCloud?'completed_pending_business_review':'verified_before_send'))process.exitCode=1;
 }
}catch(error){console.error(JSON.stringify({status:'failed',output,reason:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'REPAIR_LOCAL_SETUP_FAILED'}));process.exitCode=1;}

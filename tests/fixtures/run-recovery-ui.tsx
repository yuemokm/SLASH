import {createRoot} from 'react-dom/client';
import {RunRecoveryPanel} from '../../src/RunRecoveryPanel';
import {ConnectionsPanel} from '../../src/ConnectionsPanel';
import {TaskDeliveryReviewPanel} from '../../src/TaskDeliveryReviewPanel';
import {TaskOptionalScopePanel} from '../../src/TaskOptionalScopePanel';
import {TaskAcceptanceRecheck} from '../../src/TaskAcceptanceRecheck';
import {TaskAcceptanceStatus} from '../../src/TaskAcceptanceStatus';
import '../../src/style.css';
import '../../src/focus-workspace.css';
import '../../src/settings-focus.css';

const state=window as any;
state.requests=[];state.resumes=0;state.refreshes=0;state.notices=[];
const root=createRoot(document.getElementById('root')!);
const record={operationId:'operation-1',runId:'run-1',tool:'run_process',effect:'process',dispatch:'may_have_run',resolution:'pending',evidenceRefs:[],summary:'转换已授权副本为需求正文',updatedAt:'2026-10-11T00:00:00Z'};
let view={runId:'run-1',contextToken:'a'.repeat(64),blocked:true,records:[record]};
state.view=()=>structuredClone(view);
state.deliveryView={schemaVersion:1,runId:'run-1',workspaceId:'project-1',reportId:'report-1',contractHash:'a'.repeat(64),bindingHash:'b'.repeat(64),status:'needs_review',allowed:false,recordIds:[],limitations:[],notice:'请对照当前成果逐项核对',items:[{id:'finding-1',label:'审批规则候选问题',detail:'候选意见：审批责任人可能不明确',kind:'content_finding',critical:true,status:'needs_review',allowedActions:['confirm','dismiss'],requiredEvidence:{requestIds:['request-1'],outputIds:['output-1'],sourceKeys:['source-1']},originalEvidence:[{kind:'source',id:'source-1',sha256:'c'.repeat(64),quote:'金额达到阈值后，由经理审批。',locator:'审批规则表 · 第 4 行'}]},{id:'business-1',label:'关键业务要求',detail:'确认金额阈值与审批人对应',kind:'business',critical:true,status:'needs_review',allowedActions:['confirm'],requiredEvidence:{requestIds:['request-1'],outputIds:['output-1'],sourceKeys:['source-1']}}]};
const call=async(request:any)=>{
 state.requests.push(structuredClone(request));
 if(state.failNext){const message=state.failNext;state.failNext=undefined;throw Error(message);}
 if(request.type==='connectionDiscover')return[];
 if(state.defer){state.defer=false;return new Promise(resolve=>{state.release=resolve;});}
 if(request.type==='runRecoveryGet')return structuredClone(state.nextView??view);
 if(request.type==='taskDeliveryGet')return structuredClone(state.deliveryView);
 if(request.type==='taskAcceptanceGet')return structuredClone(state.qualityView);
 if(request.type==='taskDeliveryReview'){state.deliveryView={...state.deliveryView,items:state.deliveryView.items.map((item:any)=>item.id===request.decisions[0].itemId?{...item,status:"passed",decision:{...request.decisions[0],id:'decision-1',actor:'user',recordedAt:'2026-10-11T00:01:00Z'}}:item)};return structuredClone(state.deliveryView);}
 if(request.type==='runRecoveryReconcile'){view={...view,contextToken:'b'.repeat(64),blocked:false,records:[{...record,dispatch:'settled',resolution:request.resolution,resolvedBy:'user',evidenceRefs:['user:'+request.evidence],updatedAt:'2026-10-11T00:01:00Z'}] as any};return{record:view.records[0],view:structuredClone(view)};}
 return{};
};
state.renderRecovery=(workspaceRoot='project-1',runId='run-1')=>root.render(<RunRecoveryPanel run={{id:runId,status:'interrupted',updatedAt:'2026-10-11T00:00:00Z',resumable:true} as any} workspaceRoot={workspaceRoot} call={call} onResume={()=>{state.resumes++;}}/>);
state.renderConnections=()=>root.render(<ConnectionsPanel connections={[{id:'connection-1',name:'公司文档',kind:'mcp',command:'',args:[],url:'https://mcp.company.example/mcp',enabled:true,source:'manual',mcpAuth:'oauth',mcpNetworkAllowedOrigins:['https://login.company.example']}] as any} call={call} onRefresh={async()=>{state.refreshes++;}} onPrefill={()=>{}} onNotice={(text:string)=>state.notices.push(text)} onError={(text:string)=>state.notices.push(text)}/>);
state.renderRecovery();
state.renderDelivery=(runId='run-1',reportId='report-1')=>root.render(<TaskDeliveryReviewPanel runId={runId} reportId={reportId} call={call}/>);
state.renderOptional=()=>root.render(<TaskOptionalScopePanel runId="run-1" view={{contract:{contractHash:'d'.repeat(64),criteria:[{id:'optional-1',text:'补充检查：说明可选的帮助提示'},{id:'required-1',text:'金额阈值必检规则'}]},optionalScope:{candidateCriterionIds:['optional-1'],declaredCriterionIds:[]}} as any} call={call} onSaved={()=>{state.scopeSaved=(state.scopeSaved??0)+1;}}/>);
state.renderRecheck=(runId='run-1',status='succeeded',contractHash='d'.repeat(64),reportId='report-1',workspaceId='project-1')=>root.render(<TaskAcceptanceRecheck run={{id:runId,status} as any} view={{contract:{workspaceId,contractHash},latestReport:reportId?{id:reportId}:undefined} as any} call={call} onChanged={()=>{state.recheckRefreshes=(state.recheckRefreshes??0)+1;}}/>);
state.renderQualityWithoutReport=()=>{state.qualityView={contract:{workspaceId:'project-1',contractHash:'f'.repeat(64)},reports:[],sources:[]};root.render(<TaskAcceptanceStatus run={{id:'interrupted-before-first-report',status:'interrupted',acceptance:{outputCount:1,summary:'草稿已保存，尚无首次检查报告'}} as any} call={call}/>);};

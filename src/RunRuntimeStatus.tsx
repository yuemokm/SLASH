import type {Run} from '../shared/types';
import {RUN_INPUT_DELIVERY_NOTICE,RUN_INPUT_REASON_LABELS} from '../shared/run-inputs';

const inputLabels={queued:'待送达',delivered:'已送达',unknown:'送达待核对',cancelled:'未发送'};
export function RunRuntimeStatus({run,active,onClear}:{run:Run;active:boolean;onClear:()=>void}){
 const status=run.runtimeStatus,inputs=run.inputs??[],queued=inputs.filter(input=>input.status==='queued').length;
 if(!active&&!status&&!inputs.length)return null;
 const hint=active?(run.status==='cancelling'?'正在停止任务':run.status==='waiting_user'?'等待授权确认':run.status==='queued'?'正在准备任务':status?.activity==='compacting'?'正在整理上下文':status?.activity==='retry_wait'?`模型重试 ${status.retry?.attempt??''}${status.retry?.maxAttempts?`/${status.retry.maxAttempts}`:''}，等待 ${Math.ceil((status.retry?.delayMs??0)/1000)} 秒`:status?.activity==='tool'?'正在执行工具':'正在生成'):undefined;
 const context=status?.context;
 return <div className="run-runtime-status" aria-label="本轮运行记录">
  {hint&&<p className="muted" role="status">{hint}{queued?` · ${queued} 条补充待送达`:''}</p>}
  {active&&<p className="muted">本轮补充沿用：{run.mode==='plan'?'研究方案':'执行'} · {({standard:'标准权限',accept_edits:'接受编辑',full_access:'完整权限'})[run.permissionMode??'standard']} · {run.modelRoute?.modelId??run.modelEntryId??'本轮模型'}。底部设置用于下次任务。</p>}
  <details><summary>运行与补充记录{inputs.length?` · ${inputs.length} 条`:''}</summary>
   {!active&&status?.activity!=='settled'&&['interrupted','failed','cancelled'].includes(run.status)&&<p>本轮已停止，以下为最后收到的运行记录；其中“等待”和“进行中”不代表仍在执行。</p>}
   {context&&<p>上下文占用（估算）：{context.percent===null?'暂不可用':`${context.percent.toFixed(1)}%`}{context.tokens===null?'':` · ${context.tokens} / ${context.contextWindow} token`}</p>}
   {status?.retry&&<p>模型重试：第 {status.retry.attempt} 次 · {status.retry.status==='waiting'?'等待重试':status.retry.status==='succeeded'?'恢复成功':'重试结束，仍失败'}{status.retry.error&&` · ${status.retry.error}`}</p>}
   {status?.compaction&&<p>上下文整理：{({running:'进行中',completed:'已完成',failed:'未完成',cancelled:'已取消'})[status.compaction.status]} · {status.compaction.reason}{status.compaction.error&&` · ${status.compaction.error}`}</p>}
   {status?.summaryRetry&&<p>{status.summaryRetry.status==='completed'?'摘要重试结束':status.summaryRetry.status==='running'?'正在重试摘要':'等待摘要重试'} · 第 {status.summaryRetry.attempt} 次</p>}
   {status?.lastUsage&&<p>最近一次模型用量：输入 {status.lastUsage.input} · 输出 {status.lastUsage.output} token</p>}
   {inputs.length>0&&<><p className="muted">{RUN_INPUT_DELIVERY_NOTICE}</p>{inputs.map(input=><article key={input.id}><b>{input.delivery==='steer'?'本轮补充':'本轮结束后处理'} · {inputLabels[input.status]}</b><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{input.text}</p>{input.reason&&<small>{RUN_INPUT_REASON_LABELS[input.reason]??'状态需要核对，不会自动重发。'}</small>}</article>)}{active&&queued>0&&<button type="button" onClick={onClear}>清除全部待发送补充</button>}</>}
  </details>
 </div>;
}

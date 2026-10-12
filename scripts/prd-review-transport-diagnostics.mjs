// Fixed metadata projection for a fixture transport. No payload, headers,
// response text, thinking text, arbitrary error message, or hashes of those.
export function observeReviewFetch(originalFetch,{projectPayload,onUpdate=()=>{},clock=()=>performance.now()}={}){
 const origin=clock(),attempts=[];
 const elapsed=()=>Math.round(clock()-origin),publish=()=>{try{onUpdate(snapshot());}catch{/* Metadata must not interrupt the request. */}};
 const snapshot=()=>({version:1,fetchAttempts:attempts.length,attempts:attempts.map(a=>structuredClone(a))});
 const wrapped=async(input,init)=>{
  const a={index:attempts.length+1,requestAtMs:elapsed(),phase:'waiting_headers',responseBytes:0,eventCount:0,textCharacters:0,thinkingCharacters:0,parseFailures:0,doneSeen:false};attempts.push(a);
  if(typeof init?.body==='string'){
   a.requestBytes=new TextEncoder().encode(init.body).length;
   try{const payload=JSON.parse(init.body);const projection=projectPayload?.(payload);if(projection)a.requestDiagnostics={...projection,source:'fixture-fetch-request'};a.streamRequested=payload.stream===true;}catch{a.requestProjectionUnavailable=true;}
  }else a.requestProjectionUnavailable=true;
  publish();
  const onAbort=()=>{a.cancelledAtMs=elapsed();a.cancelledPhase=a.phase;a.phase='cancelled';publish();};
  const signal=init?.signal??(input instanceof Request?input.signal:undefined);
  signal?.addEventListener('abort',onAbort,{once:true});
  let response;
  try{response=await originalFetch(input,init);}catch(error){a.phase=signal?.aborted?'cancelled':'fetch_failed';a.failureAtMs=elapsed();a.failureKind=error?.name==='AbortError'?'abort':error?.name==='TimeoutError'?'timeout':'transport';signal?.removeEventListener('abort',onAbort);publish();throw error;}
  a.headersAtMs=elapsed();a.httpStatus=response.status;
  const contentType=response.headers.get('content-type')??'';a.responseType=contentType.includes('text/event-stream')?'event_stream':contentType.includes('json')?'json':'other';a.phase='waiting_first_byte';publish();
  if(!response.body){a.phase='empty_body';signal?.removeEventListener('abort',onAbort);publish();return response;}
  const decoder=new TextDecoder();let buffer='',eventParts=[],eventLength=0,discardEvent=false;
  const event=()=>{
   if(discardEvent){eventParts=[];eventLength=0;discardEvent=false;return;}
   const data=eventParts.join('\n');eventParts=[];eventLength=0;if(!data)return;
   a.eventCount++;a.lastEventAtMs=elapsed();if(a.firstEventAtMs===undefined){a.firstEventAtMs=a.lastEventAtMs;publish();}
   if(data==='[DONE]'){a.doneSeen=true;a.phase='done';publish();return;}
   try{
    const value=JSON.parse(data),delta=value.choices?.[0]?.delta;
    const responseType=value.type,knownResponseTypes=['response.created','response.in_progress','response.output_item.added','response.output_item.done','response.content_part.added','response.content_part.done','response.output_text.delta','response.output_text.done','response.reasoning_summary_part.added','response.reasoning_summary_part.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done','response.reasoning_text.delta','response.reasoning_text.done','response.completed','response.incomplete','response.failed'];
    if(typeof responseType==='string'){const name=knownResponseTypes.includes(responseType)?responseType:'other';a.responseEventCounts??={};a.responseEventCounts[name]=(a.responseEventCounts[name]??0)+1;}
    const text=typeof delta?.content==='string'?delta.content.length:responseType==='response.output_text.delta'&&typeof value.delta==='string'?value.delta.length:0;
    const thinking=typeof delta?.reasoning_content==='string'?delta.reasoning_content.length:typeof delta?.reasoning==='string'?delta.reasoning.length:['response.reasoning_summary_text.delta','response.reasoning_text.delta'].includes(responseType)&&typeof value.delta==='string'?value.delta.length:0;
    a.textCharacters+=text;a.thinkingCharacters+=thinking;
    if(text&&a.firstTextAtMs===undefined){a.firstTextAtMs=elapsed();publish();}
    if(thinking&&a.firstThinkingAtMs===undefined){a.firstThinkingAtMs=elapsed();publish();}
    const reason=value.choices?.[0]?.finish_reason;if(reason!=null)a.finishReason=['stop','length','tool_calls','content_filter','function_call'].includes(reason)?reason:'unrecognized';
    if(['response.completed','response.incomplete','response.failed'].includes(responseType)){
     a.responseTerminal=responseType;a.responseStatus=['completed','incomplete','failed','cancelled','in_progress','queued'].includes(value.response?.status)?value.response.status:'unrecognized';
     a.doneSeen=responseType==='response.completed';a.finishReason=responseType==='response.completed'?'stop':responseType==='response.incomplete'&&value.response?.incomplete_details?.reason==='max_output_tokens'?'length':responseType==='response.failed'?'error':'unrecognized';
     // Some servers provide only terminal output. Count it without retaining
     // text or double-counting deltas; all terminal strings remain transient.
     let terminalText=0,terminalThinking=0;for(const item of value.response?.output??[]){for(const part of item.content??[])if(part.type==='output_text'&&typeof part.text==='string')terminalText+=part.text.length;for(const part of item.summary??[])if(typeof part.text==='string')terminalThinking+=part.text.length;}
     a.textCharacters=Math.max(a.textCharacters,terminalText);a.thinkingCharacters=Math.max(a.thinkingCharacters,terminalThinking);
    }
    const usage=value.usage??value.response?.usage;if(usage&&typeof usage==='object'){const safe={};for(const key of ['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens'])if(Number.isSafeInteger(usage[key])&&usage[key]>=0)safe[key]=usage[key];if(Object.keys(safe).length)a.usage=safe;}
   }catch{a.parseFailures++;}
  };
  const line=text=>{
   if(text===''){event();return;}
   if(!text.startsWith('data:'))return;
   const part=text.slice(5).replace(/^ /,'');eventLength+=part.length;
   if(eventLength>262144){discardEvent=true;eventParts=[];a.oversizedEvents=(a.oversizedEvents??0)+1;return;}
   if(!discardEvent)eventParts.push(part);
  };
  const observe=chunk=>{
   a.responseBytes+=chunk.byteLength;a.lastByteAtMs=elapsed();
   if(a.firstByteAtMs===undefined){a.firstByteAtMs=a.lastByteAtMs;a.phase='streaming';publish();}
   if(a.responseType!=='event_stream')return;
   buffer+=decoder.decode(chunk,{stream:true});
   let next;while((next=buffer.indexOf('\n'))>=0){line(buffer.slice(0,next).replace(/\r$/,''));buffer=buffer.slice(next+1);}
   if(buffer.length>262144){buffer='';discardEvent=true;eventParts=[];eventLength=0;a.oversizedEvents=(a.oversizedEvents??0)+1;}
  };
  const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){observe(chunk);controller.enqueue(chunk);},flush(){if(buffer)line(buffer);event();a.bodyEndAtMs=elapsed();a.phase='body_complete';signal?.removeEventListener('abort',onAbort);publish();}}));
  // Preserve all bytes and the original fetch signal. Response metadata is
  // retained for SDK consumers; diagnostics project only the fields above.
  const result=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  for(const name of ['url','redirected','type'])Object.defineProperty(result,name,{value:response[name]});
  return result;
 };
 return{fetch:wrapped,snapshot};
}

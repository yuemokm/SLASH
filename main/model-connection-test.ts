import {contentText} from '@earendil-works/pi-ai';
import {createOpenAICompatibleModelRuntime,OPENAI_COMPATIBLE_RUNTIME_PROVIDER,type OpenAICompatibleModel} from './model-runtime.js';
import {runtimeRequestDiagnostics} from './runtime-request-diagnostics.js';

type ModelTextConnectionConfig=OpenAICompatibleModel&{provider?:string;name?:string};
function modelTestIdentity(config:ModelTextConnectionConfig){
 const protocol={'openai-completions':'completions','openai-responses':'responses','anthropic-messages':'claude'}[config.protocol];
 const name=config.name?.trim()||config.id;
 return [config.provider?.trim(),name].filter(Boolean).join(' · ')+`（${name===config.id?'':config.id+' · '}${protocol}）`;
}
function modelTestProviderError(message:string){
 // This is Pi's internal registration key, not the configured supplier.
 const safe=message.replaceAll(`${OPENAI_COMPATIBLE_RUNTIME_PROVIDER} API error`,'上游 API 错误');
 if(/(?:API error|HTTP|status(?: code)?)\s*[\s(:]*522\b|^522\b/i.test(message)&&/no body/i.test(message))return '上游服务返回 HTTP 522，且未提供错误正文。本次请求未完成，不能据此判定模型无效。若持续出现，请向供应商提供此状态码。';
 return safe;
}

/** A single text request through the same Pi provider as conversations. */
export async function testModelTextConnection(config:ModelTextConnectionConfig,key:string,createRuntime= createOpenAICompatibleModelRuntime){
 const configured=await createRuntime(config,key);
 let requestedThinkingDisabled=false;
 const response=await configured.runtime.completeSimple(configured.model,{messages:[{role:'user',content:'只回复：连接成功',timestamp:Date.now()}]},{
  maxTokens:Math.min(256,configured.model.maxTokens),maxRetries:0,timeoutMs:60_000,signal:AbortSignal.timeout(60_000),
  onPayload:payload=>{const diagnostics=runtimeRequestDiagnostics(payload);requestedThinkingDisabled=diagnostics.thinkingType==='disabled'||diagnostics.reasoningEffort==='none';},
 });
 const reply=contentText(response.content).trim(),hasThinking=response.content.some(block=>block.type==='thinking');
 const thinkingNotice=requestedThinkingDisabled&&hasThinking?'请求声明关闭思考，但响应仍包含思考内容；上游是否执行关闭思考尚未核实。':'';
 const fail=(reason:string):never=>{throw Error(`文字测试未通过：${modelTestIdentity(config)}：${reason}${config.proxyUrl?' 本次使用已配置的模型代理；请同时检查代理连通性。':''}${thinkingNotice?' '+thinkingNotice:''}`);};
 if(response.stopReason==='error')fail(modelTestProviderError(response.errorMessage||'模型请求出错。'));
 if(response.stopReason==='aborted')fail('请求被取消或超过 60 秒，未完成测试。');
 if(response.stopReason==='length')fail(`回复达到本次测试的输出上限，未完整结束（${reply?'已有部分文字':'无文字正文'}）。`);
 if(response.stopReason==='toolUse'||response.content.some(block=>block.type==='toolCall'))fail('文字测试意外返回工具调用，未获得完整文字回复。');
 if(response.stopReason!=='stop')fail('模型未正常结束回复，未完成测试。');
 if(!reply)fail(hasThinking?'只返回思考内容，没有文字正文。':'没有返回文字正文。');
 return{reply,notice:'文字连接测试通过；仅验证本次文字回复，不证明工具调用或图片能力。'+(config.proxyUrl?' 本次使用已配置的模型代理。':'')+(thinkingNotice?' '+thinkingNotice:'')};
}

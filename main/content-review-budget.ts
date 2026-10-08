import type {Api,Model,Context} from '@earendil-works/pi-ai';
import {normalizeContext} from '@earendil-works/pi-ai';
import {clampMaxTokensToContext} from '@earendil-works/pi-ai/api/simple-options';
import {estimateContextTokens} from '@earendil-works/pi-ai/utils/estimate';
import {validTokenLimit} from './model-limits.js';

export const CONTENT_REVIEW_BUDGET_NOTICE='maxTokens is the configured requested response cap. Native Pi context clamping and provider thinking policy may affect the effective response allowance. Provider usage is recorded separately; host/Pi estimates are not upstream token measurements.';

/** Use the resolved configured cap unchanged. Character selection remains the
 * Service's existing policy; native Pi owns the final per-request clamp. */
export function contentReviewBudget(limits:{contextWindow:number;maxTokens:number}){
 if(!validTokenLimit(limits.contextWindow)||!validTokenLimit(limits.maxTokens)||limits.maxTokens>=limits.contextWindow)throw Error('MODEL_LIMITS_INVALID: 模型限额须为有限正整数，最大输出必须小于已解析的上下文窗口');
 return{requestedOutputTokens:limits.maxTokens};
}

/** Diagnostic only: native Pi's estimate and base clamp for this exact packet.
 * No provider token assertion, context rewriting or additional model invocation. */
export function contentReviewBudgetDiagnostics(model:Model<Api>,context:Context,requestedOutputTokens:number){
 const normalized=normalizeContext(context);
 return{hostPiEstimatedInputTokens:estimateContextTokens(normalized).tokens,hostPiBaseClampedOutputTokens:clampMaxTokensToContext(model,normalized,requestedOutputTokens)};
}

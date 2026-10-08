import type {ContentReviewResponseDiagnostics} from '../shared/content-review.js';

/** Host-only shape metadata. No content, signature, unknown type name or thinking
 * hash survives. Pi-normalized reasoning tokens cannot prove actual thinking zero. */
export function contentReviewResponseDiagnostics(content:readonly unknown[]):ContentReviewResponseDiagnostics{
 const blockCounts={text:0,thinking:0,image:0,toolCall:0,unknown:0};let textCharacters=0,thinkingCharacters=0;
 for(const value of content){if(!value||typeof value!=='object'){blockCounts.unknown++;continue;}const block=value as Record<string,unknown>;
  if(block.type==='text'){blockCounts.text++;if(typeof block.text==='string')textCharacters+=block.text.length;}
  else if(block.type==='thinking'){blockCounts.thinking++;if(typeof block.thinking==='string')thinkingCharacters+=block.thinking.length;}
  else if(block.type==='image')blockCounts.image++;
  else if(block.type==='toolCall')blockCounts.toolCall++;
  else blockCounts.unknown++;
 }
 return{blockCounts,textCharacters,thinkingCharacters,textEmpty:textCharacters===0,reasoningTokenSource:'pi_normalized_actual_unknown'};
}

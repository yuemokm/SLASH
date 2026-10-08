import {SettingsManager} from '@earendil-works/pi-coding-agent';
import type {Model} from '@earendil-works/pi-ai';

/** Session-only defaults. Pi still owns estimation, cut points, summaries and
 * bounded recovery. Explicit ordinary/per-model settings retain precedence. */
export function configureSessionCompaction(settings:SettingsManager,model:Pick<Model<string>,'provider'|'id'|'contextWindow'>){
 const modelKey=`${model.provider}/${model.id}`;
 const explicit=[settings.getGlobalSettings(),settings.getProjectSettings()].some(s=>s.compaction?.keepRecentTokens!==undefined||s.compaction?.modelOverrides?.[modelKey]?.keepRecentTokens!==undefined);
 const current=settings.getCompactionSettings(model);
 if(explicit||!Number.isSafeInteger(model.contextWindow)||model.contextWindow<=0)return settings;
 const keepRecentTokens=Math.min(current.keepRecentTokens,Math.floor(model.contextWindow/8));
 // applyOverrides changes only effective in-memory settings; it does not save
 // the global/project settings files or change reserveTokens/model capacity.
 settings.applyOverrides({compaction:{modelOverrides:{[modelKey]:{keepRecentTokens}}}});
 return settings;
}

import {subagentSettingsSchema,type SubagentSettings} from '../shared/subagent-settings';
export const SUBAGENT_SETTINGS_CHANGED='slash:subagent-settings-changed';
export function announceSubagentSettings(value:unknown):SubagentSettings{
 const config=subagentSettingsSchema.parse(value);
 window.dispatchEvent(new CustomEvent(SUBAGENT_SETTINGS_CHANGED,{detail:config}));
 return config;
}

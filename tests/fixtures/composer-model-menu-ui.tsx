import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {ComposerModelMenu} from '../../src/ComposerControls';
import {SubagentSettings} from '../../src/SubagentSettings';
import {DEFAULT_SUBAGENT_SETTINGS} from '../../shared/subagent-settings';
import type {ModelEntry,ModelThinkingCapability} from '../../shared/types';
import '../../src/style.css';
import '../../src/focus-workspace.css';
import '../../src/settings-focus.css';
import '../../src/composer-select.css';
const state=window as any,root=createRoot(document.getElementById('root')!);
const models:ModelEntry[]=Array.from({length:20},(_,index)=>({id:'model-'+index,provider:'供应商-'+Math.floor(index/5),name:'模型 '+String(index+1).padStart(2,'0'),modelId:'native-'+index,baseUrl:'https://fixture.invalid/v1',protocol:'openai-completions',hasKey:true}));
const base:ModelThinkingCapability={modelEntryId:'model-19',modelId:'native-19',fingerprint:'fixture',status:'supported',levels:['low','high'],defaultLevel:'low',source:'fixture',reason:'fixture'};
function Demo({status,loading=false}:{status:string;loading?:boolean}){const [value,setValue]=useState('model-19'),[level,setLevel]=useState<any>('high');return <div className="fixture-composer composer-bottom"><ComposerModelMenu value={value} models={models} onChange={id=>{state.selected=id;setValue(id);}} capability={status==='missing'?undefined:{...base,status:status==='fixed'?'supported':status as any,levels:status==='fixed'?['high']:base.levels}} loading={loading} thinkingLevel={level} onThinkingChange={setLevel} onRefreshCapability={()=>{}}/></div>;}
state.renderMenu=(status='supported',loading=false)=>root.render(<Demo key={status+loading} status={status} loading={loading}/>);
state.renderSubagent=(status='unknown',follow=false)=>root.render(<div className="fixture-settings"><SubagentSettings key={status+follow} models={models} call={async(request)=>request.type==='subagentSettingsGet'?{...DEFAULT_SUBAGENT_SETTINGS,profiles:DEFAULT_SUBAGENT_SETTINGS.profiles.map(profile=>({...profile,modelEntryId:follow?null:'model-19'}))}:request.type==='modelThinkingCapability'?{...base,status}:request.type==='subagentSettingsSave'?request.config:{}} onNotice={()=>{}} onError={()=>{}}/></div>);
state.renderMenu();

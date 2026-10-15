import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsModal} from '../../src/SettingsModal';
import type {Request,State} from '../../shared/types';
import '../../src/style.css';
import '../../src/focus-workspace.css';
const testWindow=window as any;
testWindow.requests=[];
const state:State={root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],model:{baseUrl:'https://fixture.invalid/v1',id:'original',hasKey:false}};
const call=async(request:Request):Promise<unknown>=>{
 if(request.type==='models')return{groups:[]};
 if(request.type==='pendingApprovals')return[];
 if(request.type==='appPreferences')return{};
 if(request.type==='projectTreeGet')return{nodes:[],appliedNodes:[],preservedDirectories:[],root:'',revision:1};
 if(request.type==='systemPromptGet')return{content:'fixture system prompt',isDefault:true};
 if(request.type==='modelBatchAdd'){
  testWindow.requests.push(request);
  return new Promise((resolve,reject)=>{testWindow.resolveSave=resolve;testWindow.rejectSave=reject;});
 }
 return{};
};
function Fixture(){const[open,setOpen]=useState(true);return <SettingsModal open={open} requestedTab="models" state={state} call={call} onClose={()=>{testWindow.fixtureClosed=true;setOpen(false);}} onRefresh={async()=>{}} onNotice={()=>{}} onError={()=>{}} onPrefillSession={()=>{}} onOpenConversation={()=>{}} theme="reference" onThemeChange={()=>{}}/>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);

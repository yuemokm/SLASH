import {createRoot} from 'react-dom/client';
import {Component,type ReactNode} from 'react';
import type {Event,Request} from '../shared/types';
import {App} from './App';
import './style.css';
import './focus-workspace.css';

declare global {
 interface Window {
  pm:{request:(request:Request)=>Promise<{ok:boolean;data:unknown;error?:string}>;pathForFile?:(file:File)=>string;subscribe:(listener:(event:Event)=>void)=>()=>void};
 }
}

class WorkbenchErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(){console.error('[slash-startup] React workbench failed to render.');}
 render(){
  if(this.state.failed)return <main role="alert" style={{minHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Segoe UI, Microsoft YaHei, sans-serif',color:'#20242b',background:'#f6f7f8'}}><strong style={{fontSize:28}}>slash</strong><p>slash 显示遇到问题</p><p>请重新加载；若仍然失败，请保留诊断日志。</p><button type="button" onClick={()=>window.location.reload()}>重新加载</button></main>;
  return this.props.children;
 }
}

createRoot(document.getElementById('root')!).render(<WorkbenchErrorBoundary><App/></WorkbenchErrorBoundary>);

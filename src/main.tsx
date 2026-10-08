import {createRoot} from 'react-dom/client';
import type {Event,Request} from '../shared/types';
import {App} from './App';
import './style.css';
import './focus-workspace.css';

declare global {
 interface Window {
  pm:{request:(request:Request)=>Promise<{ok:boolean;data:unknown;error?:string}>;pathForFile?:(file:File)=>string;subscribe:(listener:(event:Event)=>void)=>()=>void};
 }
}

createRoot(document.getElementById('root')!).render(<App/>);

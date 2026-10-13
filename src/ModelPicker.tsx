import {useEffect,useRef,useState} from 'react';
import type {ModelDiscoveryResult,ModelProtocol,Request} from '../shared/types';
import {Icon} from './Icon';

export const parseModelIds=(text:string)=>Array.from(new Set(text.split(/[\s,，;；]+/).map(value=>value.trim()).filter(Boolean)));
export function ModelPicker({call,connection,value,onChange,disabled}:{call:(request:Request)=>Promise<unknown>;connection:{baseUrl:string;protocol:ModelProtocol;proxyUrl?:string;key?:string;credentialSourceId?:string};value:string;onChange:(value:string)=>void;disabled:boolean}){
 const [result,setResult]=useState<ModelDiscoveryResult>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[query,setQuery]=useState(''),[activeRow,setActiveRow]=useState<number>();
 const pickerRef=useRef<HTMLElement>(null),inputRefs=useRef<Array<HTMLInputElement|null>>([]);
 const rowKeys=useRef<string[]>([]),nextRowKey=useRef(0);
 const generation=useRef(0),connectionIdentity=JSON.stringify(connection);
 useEffect(()=>{generation.current++;setResult(undefined);setError('');setLoading(false);setQuery('');setActiveRow(undefined);return()=>{generation.current++;};},[connectionIdentity]);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!pickerRef.current?.contains(event.target as Node))setActiveRow(undefined);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const ids=parseModelIds(value),matches=result?.models.filter(model=>`${model.id} ${model.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))??[];
 const rows=value.split('\n'),updateRow=(index:number,next:string)=>onChange(rows.map((row,i)=>i===index?next:row).join('\n'));
 while(rowKeys.current.length<rows.length)rowKeys.current.push(`model-row-${++nextRowKey.current}`);
 if(rowKeys.current.length>rows.length)rowKeys.current.length=rows.length;
 const fetchModels=async()=>{
  const requestGeneration=++generation.current;setLoading(true);setError('');setResult(undefined);setActiveRow(undefined);
  try{const next=await call({type:'modelDiscover',...connection,key:connection.key||undefined,proxyUrl:connection.proxyUrl||null}) as ModelDiscoveryResult;if(generation.current===requestGeneration)setResult(next);}
  catch(reason){if(generation.current===requestGeneration)setError(reason instanceof Error?reason.message:'获取失败，请重试或手动填写模型 ID。');}
  finally{if(generation.current===requestGeneration)setLoading(false);}
 };
 return <section ref={pickerRef} className="model-picker" aria-label="选择模型" onKeyDown={event=>{if(event.key==='Escape'&&activeRow!==undefined){event.preventDefault();setActiveRow(undefined);inputRefs.current[activeRow]?.focus();}}}>
  <div className="model-picker-heading"><b>添加模型</b><button type="button" disabled={disabled||loading} onClick={()=>void fetchModels()}>{loading?'正在获取…':result||error?'重新获取模型列表':'获取模型列表'}</button></div>
  {error&&<p className="model-picker-error" role="alert">{error} 可以重试或直接手动添加。</p>}
  {result&&<p className="model-picker-notice" role="status">已获取 {result.models.length} 个模型。可点击输入框右侧选择；能否用于当前协议，请保存后单独测试。{result.truncated?'列表过长，未列出的模型可手动添加。':''}</p>}
  <div className="model-picker-rows">{rows.map((row,index)=><div className="model-picker-row" key={rowKeys.current[index]}>
   <label htmlFor={`model-id-row-${index}`}>模型 ID {index+1}</label>
   <div className="model-picker-row-controls"><div className="model-picker-input">
    <input id={`model-id-row-${index}`} ref={element=>{inputRefs.current[index]=element;}} aria-label={`模型 ID ${index+1}`} value={row} disabled={disabled} onChange={event=>updateRow(index,event.target.value)} onFocus={()=>setActiveRow(undefined)} placeholder="输入模型 ID"/>
    {result&&<button type="button" aria-label={`选择第 ${index+1} 行模型`} aria-expanded={activeRow===index} aria-controls={`model-options-${index}`} disabled={disabled} onClick={()=>{setActiveRow(active=>active===index?undefined:index);setQuery('');}}><Icon name="chevronDown" size={16}/></button>}
   </div>{rows.length>1&&<button className="model-picker-remove" type="button" aria-label={`移除第 ${index+1} 行模型`} disabled={disabled} onClick={()=>{setActiveRow(undefined);rowKeys.current.splice(index,1);onChange(rows.filter((_,i)=>i!==index).join('\n'));}}><Icon name="close" size={15}/></button>}</div>
   {result&&activeRow===index&&<div className="model-picker-dropdown"><input aria-label="搜索上游模型" placeholder="搜索模型 ID 或名称" value={query} disabled={disabled} onChange={event=>setQuery(event.target.value)}/><div className="model-picker-list" id={`model-options-${index}`} role="listbox" aria-label={`第 ${index+1} 行模型列表`}>{matches.length?matches.map(model=><button type="button" role="option" aria-selected={row===model.id} key={model.id} disabled={disabled} onClick={()=>{updateRow(index,model.id);setActiveRow(undefined);inputRefs.current[index]?.focus();}}><span><b>{model.name}</b>{model.name!==model.id&&<small>{model.id}</small>}</span>{row===model.id&&<Icon name="check" size={15}/>}</button>):<p>{result.models.length?'没有匹配的模型，可手动添加。':'上游返回空列表，可重试或手动添加。'}</p>}</div></div>}
  </div>)}</div>
  <button className="model-picker-add" type="button" disabled={disabled||rows.length>=100} onClick={()=>{onChange([...rows,''].join('\n'));setActiveRow(undefined);requestAnimationFrame(()=>inputRefs.current[rows.length]?.focus());}}><Icon name="plus" size={15}/>添加模型行</button>
  <small className="model-picker-notice">每个输入框填写一个模型 ID。已填写 {ids.length} 个；重复 ID 自动合并，已有配置会跳过。</small>
 </section>;
}

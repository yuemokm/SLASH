import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {DesignCatalogItem,DesignCatalogView} from '../shared/design-systems';
import {designPreviewSchema} from '../shared/design-systems';
import type {Request} from '../shared/types';
import {Icon} from './Icon';
import './design-systems.css';

/** Static, source-bound images; source scripts and network never run here. */
export function DesignReferencePreview({item}:{item:DesignCatalogItem}){
 const [failedSrc,setFailedSrc]=useState<string>();const preview=designPreviewSchema.safeParse(item.preview);
 const src=preview.success?`${import.meta.env.BASE_URL}${preview.data.src}`:undefined;
 return <div className="design-preview">{src&&failedSrc!==src?<img src={src} alt={`${item.name} ${preview.success&&preview.data.kind==='source-components'?'来源组件示例':'来源模板预览'}`} loading="lazy" decoding="async" onError={()=>setFailedSrc(src)}/>:<span className="design-preview-empty">{src?'预览图片暂时无法显示':'暂无来源预览图片'}</span>}</div>;
}

function DesignPreviewDialog({item,onClose}:{item:DesignCatalogItem;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="design-preview-dialog" aria-label={`${item.name} 预览大图`} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div className="design-preview-dialog-heading"><b>{item.name}</b><button type="button" onClick={onClose} aria-label="关闭预览大图"><Icon name="close" size={18}/></button></div><DesignReferencePreview item={item}/><small>{item.preview?.kind==='source-components'?'来源组件示例':'来源模板预览'}</small></dialog>;
}

export function DesignReferenceCollection({items,onRemove}:{items:Array<Pick<DesignCatalogItem,'id'|'name'|'kind'>>;onRemove?:(id:string)=>void}){
 if(!items.length)return null;
 return <div className="design-context-card" aria-label={onRemove?'待应用的设计体系':'本轮应用的设计体系'}><b>设计体系</b><div>{items.map(item=><span key={item.id}><small>{item.kind==='style'?'风格':'页面'}</small><span>{item.name}</span>{onRemove&&<button type="button" aria-label={`移除设计参考 ${item.name}`} onClick={()=>onRemove(item.id)}><Icon name="close" size={13}/></button>}</span>)}</div></div>;
}

export function DesignSystemsPanel({call,selected,onSelect,onBack}:{call:(request:Request)=>Promise<unknown>;selected:DesignCatalogItem[];onSelect:(item:DesignCatalogItem)=>void;onBack:()=>void}){
 const [catalog,setCatalog]=useState<DesignCatalogView>();const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
 const [kind,setKind]=useState<'style'|'template'>('style');const [query,setQuery]=useState('');const [category,setCategory]=useState('');const [inspected,setInspected]=useState<string>();const [largePreview,setLargePreview]=useState<DesignCatalogItem>();const [sourceError,setSourceError]=useState('');
 useEffect(()=>{let current=true;setError('');void call({type:'designCatalog'}).then(value=>{if(current)setCatalog(value as DesignCatalogView);}).catch(reason=>{if(current)setError(reason instanceof Error?reason.message:String(reason));});return()=>{current=false;};},[call,attempt]);
 const categories=useMemo(()=>[...new Set(catalog?.items.filter(item=>item.kind===kind).map(item=>item.category))].sort((a,b)=>a.localeCompare(b,'zh-CN')),[catalog,kind]);
 const items=useMemo(()=>catalog?.items.filter(item=>item.kind===kind&&(!category||item.category===category)&&(!query.trim()||`${item.name} ${item.category} ${item.summary} ${item.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())))??[],[catalog,kind,category,query]);
 const switchKind=(next:'style'|'template')=>{setKind(next);setCategory('');setInspected(undefined);};
 const openSource=(item:DesignCatalogItem,target:'reference'|'image')=>{setSourceError('');void call({type:'designSourceOpen',id:item.id,target}).catch(reason=>setSourceError(reason instanceof Error?reason.message:String(reason)));};
 return <section className="design-systems-panel" aria-label="设计体系">
  <div className="design-library-heading"><div><h1>设计体系</h1><p>选择设计风格或网页模板，应用到当前会话。</p></div><button type="button" className="design-library-back" onClick={onBack}><Icon name="chevronLeft" size={16}/>返回会话</button></div>
  <div className="design-library-toolbar"><div className="design-library-kinds" role="tablist" aria-label="设计参考分类"><button type="button" role="tab" aria-selected={kind==='style'} onClick={()=>switchKind('style')}>设计风格 <small>{catalog?.items.filter(item=>item.kind==='style').length??'—'}</small></button><button type="button" role="tab" aria-selected={kind==='template'} onClick={()=>switchKind('template')}>网页模板 <small>{catalog?.items.filter(item=>item.kind==='template').length??'—'}</small></button></div>
  <div className="design-library-filters"><label><Icon name="search" size={15}/><input aria-label="搜索设计参考" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索名称、风格或用途"/></label><select aria-label="设计参考用途" value={category} onChange={event=>setCategory(event.target.value)}><option value="">全部用途</option>{categories.map(value=><option value={value} key={value}>{value}</option>)}</select></div></div>
  {selected.length>0&&<div className="design-library-selected" aria-label="已加入会话的设计参考">{selected.map(item=><span key={item.id}>{item.name}<button type="button" aria-label={`移除设计参考 ${item.name}`} onClick={()=>onSelect(item)}><Icon name="close" size={12}/></button></span>)}</div>}
  {catalog&&(query.trim()||category)&&<div className="design-library-results" role="status"><span>找到 {items.length} 项</span></div>}
  <div className="design-library-list" aria-live="polite">
   {error?<div className="design-library-message" role="alert"><p>{error}</p><button onClick={()=>setAttempt(value=>value+1)}>重新加载</button></div>:!catalog?<p className="design-library-message" role="status">正在加载设计参考…</p>:!items.length?<p className="design-library-message">没有匹配的参考，试试其他名称或用途。</p>:items.map(item=>{const chosen=selected.some(value=>value.id===item.id);const expanded=inspected===item.id;return <article className={`design-library-card ${chosen?'chosen':''}`} key={item.id} data-design-id={item.id}><button type="button" className="design-library-inspect" aria-expanded={expanded} aria-label={`查看设计参考 ${item.name}`} onClick={()=>setInspected(expanded?undefined:item.id)}><DesignReferencePreview item={item}/><span className="design-library-card-title"><b>{item.name}</b>{chosen?<span>已应用</span>:<small>{item.category}</small>}</span></button><small className="design-library-preview-kind">{item.preview?.kind==='source-components'?'来源组件示例':item.preview?'来源模板预览':'暂无来源预览图片'}</small><p className={expanded?'expanded':''}>{item.summary}</p>{expanded&&<div className="design-library-note">{item.preview&&<button type="button" onClick={()=>setLargePreview(item)}>查看大图</button>}<button type="button" onClick={()=>openSource(item,'reference')}>查看原始来源</button>{item.preview&&<button type="button" onClick={()=>openSource(item,'image')}>{item.preview.kind==='official-poster'?'打开来源原图':'查看示例源码'}</button>}</div>}<button type="button" className="design-library-use" aria-pressed={chosen} onClick={()=>onSelect(item)}>{chosen?'取消应用':'应用'}<Icon name={chosen?'close':'plus'} size={13}/></button></article>;})}
  </div>
  {sourceError&&<p className="design-library-message" role="alert">{sourceError}</p>}
  {largePreview&&<DesignPreviewDialog item={largePreview} onClose={()=>setLargePreview(undefined)}/>}
  <details className="design-library-source"><summary>参考来源与许可</summary><p>OpenDesign · Apache-2.0<br/>内置参考仅供设计借鉴。品牌名称用于识别风格，不代表品牌授权。</p><a href="https://github.com/nexu-io/open-design" target="_blank" rel="noreferrer">查看 OpenDesign</a><small>来源版本 {catalog?.source.commit.slice(0,12)}</small></details>
 </section>;
}

import {z} from 'zod';

/** Explicit model transport only; authentication belongs to the model credential store. */
export const modelProxyUrlSchema=z.string().trim().min(1).max(2048).refine(value=>{
 try{const url=new URL(value);return(url.protocol==='http:'||url.protocol==='https:')&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/';}catch{return false;}
},'代理地址须为 HTTP 或 HTTPS 主机及端口，不能包含凭据、路径、查询或片段');

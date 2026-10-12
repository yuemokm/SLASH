import {ProxyAgent,fetch as proxyFetch} from 'undici';
import {modelProxyUrlSchema} from '../shared/model-proxy.js';

// Reuse connections for the same explicit endpoint without altering the global
// dispatcher. Eviction closes gracefully, so active streams remain intact.
const agents=new Map<string,ProxyAgent>();
function proxyAgent(endpoint:string){
 let agent=agents.get(endpoint);
 if(agent){agents.delete(endpoint);agents.set(endpoint,agent);return agent;}
 agent=new ProxyAgent(endpoint);agents.set(endpoint,agent);
 if(agents.size>16){const [oldEndpoint,oldAgent]=agents.entries().next().value!;agents.delete(oldEndpoint);void oldAgent.close().catch(()=>{});}
 return agent;
}
export function modelProxyFetch(proxyUrl:string):typeof globalThis.fetch{
 const endpoint=new URL(modelProxyUrlSchema.parse(proxyUrl)).href;
 return async(input,init)=>proxyFetch(input as Parameters<typeof proxyFetch>[0],{...init,dispatcher:proxyAgent(endpoint)} as Parameters<typeof proxyFetch>[1]) as unknown as Promise<Response>;
}
export async function closeModelProxyTransports(){const current=[...agents.values()];agents.clear();await Promise.all(current.map(agent=>agent.close()));}

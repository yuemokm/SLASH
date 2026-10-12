import { endpoint, required } from '../lib/config.ts';

export function smokeWebTarget(env:NodeJS.ProcessEnv,localWeb=false) {
  if(!localWeb)return {url:endpoint(env,'KNOWLEDGE_SMOKE_WEB_URL'),mode:'hosted' as const};
  const value=new URL(required(env,'KNOWLEDGE_SMOKE_WEB_URL'));
  if(value.protocol!=='http:'||!['127.0.0.1','localhost'].includes(value.hostname)||value.username||value.password||value.pathname!=='/'||value.search||value.hash)throw Error('--local-web only accepts an HTTP origin on 127.0.0.1 or localhost.');
  return {url:value.origin,mode:'local-production' as const};
}

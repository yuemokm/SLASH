import KnowledgePage from './ui';
import { fixtureEnabled } from '../lib/fixture';
export const dynamic='force-dynamic';
export default function Page() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  let validKey=key.startsWith('sb_publishable_');
  if(!validKey) {try{validKey=JSON.parse(Buffer.from(key.split('.')[1]??'', 'base64url').toString()).role==='anon';}catch{}}
  let validUrl=false; try{validUrl=new URL(url).protocol==='https:';}catch{}
  const fixture=fixtureEnabled();
  return <KnowledgePage config={!fixture&&validKey&&validUrl ? {url,key}:null} fixture={fixture}/>;
}

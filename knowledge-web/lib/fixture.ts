import { randomUUID } from 'node:crypto';
import { ApiError, TOKENIZER_VERSION, type Hit, type Repository, type Providers } from './contracts';
// Explicitly local, fake adapters. Never usable in a production build or on Vercel.
export const fixtureEnabled = () => process.env.KNOWLEDGE_LOCAL_FIXTURE === 'true' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const hit: Hit = { id: 'fixture-chunk', kb_id: 'fixture-kb', index_id: 'fixture-v1', document_id: 'fixture-doc', text: '本地演示资料：门店定位地址只读，图商地址可以由管理员修改。', text_hash: 'fixture-hash', display_name: '演示门店规则', source_version: '演示第1版', locator: {kind:'lines', startLine:1, endLine:1}, similarity: 0.95, keyword_rank: 1 };
export function fixtureAdapters(request: Request) {
  if (!fixtureEnabled() || request.headers.get('authorization') !== 'Bearer local-fixture') throw new ApiError(401, 'LOGIN_REQUIRED', '本地演示需要显式进入。');
  const repository: Repository & {listBases(): Promise<any[]>; source(id:string,version:string):Promise<Hit|null>; feedback(id:string, helpful:boolean):Promise<void>} = {
    async listBases() { return [{id:hit.kb_id,title:'本地演示知识库',active_version:hit.index_id,sharing_enabled:true}]; },
    async getBase(id) { return id === hit.kb_id ? (await this.listBases())[0] : null; },
    async getIndex(id) { return id === hit.index_id ? {id,kb_id:hit.kb_id,status:'published',fingerprint:'fixture',embedding_dimensions:2,tokenizer_version:TOKENIZER_VERSION}:null; },
    async search({question}) { return /地址|门店/.test(question) ? [hit] : []; },
    async revalidate(kb,index) { return kb === hit.kb_id && index === hit.index_id; },
    async saveReceipt() { return randomUUID(); },
    async source(id,version) { return id === hit.id && version === hit.index_id ? hit : null; },
    async feedback() {}
  };
  const providers: Providers = {fingerprint:'fixture',dimensions:2,model:'local-fixture',minSimilarity:0.7,async embed(){return [1,0];},async answer(){return {status:'supported',paragraphs:[{text:'本地演示：门店定位地址只读；图商地址可由管理员修改。',sourceIds:[hit.id]}]};}};
  return {repository, providers};
}

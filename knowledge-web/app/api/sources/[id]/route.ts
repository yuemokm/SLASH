import { json, failure, repositoryFor } from '../../../../lib/http';
import { ApiError, validId } from '../../../../lib/contracts';
export const runtime = 'nodejs';
export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  try {
    const {id}=await context.params, version=new URL(request.url).searchParams.get('version');
    if(!validId(id)||!validId(version)) throw new ApiError(400,'INVALID_SOURCE','来源参数不正确。');
    const repository=await repositoryFor(request), source=await repository.source(id,version);
    if(!source || !await repository.revalidate(source.kb_id,source.index_id,[source])) throw new ApiError(404,'SOURCE_UNAVAILABLE','来源已更新、停止分享，或你没有访问权限。');
    return json({source});
  } catch(e) {return failure(e);}
}

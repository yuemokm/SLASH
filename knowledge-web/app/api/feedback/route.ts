import { json, failure, repositoryFor, bodyOf } from '../../../lib/http';
import { ApiError, validId } from '../../../lib/contracts';
export const runtime = 'nodejs';
export async function POST(request:Request) {
  try {
    const repository=await repositoryFor(request), value=await bodyOf(request) as Record<string,unknown>;
    if(!value || Object.keys(value).sort().join(',')!=='helpful,receiptId'||!validId(value.receiptId)||typeof value.helpful!=='boolean') throw new ApiError(400,'INVALID_FEEDBACK','反馈格式不正确。');
    await repository.feedback(value.receiptId,value.helpful); return json({saved:true});
  } catch(e) {return failure(e);}
}

import { json, failure, repositoryFor } from '../../../lib/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json({bases:await (await repositoryFor(request)).listBases()}); } catch(e) {return failure(e);}
}

import { json, failure, repositoryFor, bodyOf } from '../../../lib/http';
import { parseQuestion } from '../../../lib/contracts';
import { ask } from '../../../lib/qa';
import { createProviders } from '../../../lib/providers';
import { fixtureEnabled, fixtureAdapters } from '../../../lib/fixture';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const repository = await repositoryFor(request);
    const {kbId,question} = parseQuestion(await bodyOf(request));
    const providers = fixtureEnabled() ? fixtureAdapters(request).providers : createProviders();
    return json(await ask(repository,providers,kbId,question,request.signal));
  } catch(e) {return failure(e);}
}

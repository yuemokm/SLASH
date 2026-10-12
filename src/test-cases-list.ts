import type {Change, FileRef, Mount} from '../shared/types';
import {isTestCasePath} from '../shared/test-cases';

export type TestCaseListEntry = {key:string;file:FileRef;change?:Change};

/** Saved files and unresolved drafts have different identities; applied history is in versions. */
export function testCaseListEntries(files:FileRef[], changes:Change[], mounts:Mount[]):TestCaseListEntry[] {
  const enabled = new Set(mounts.filter(mount=>mount.enabled).map(mount=>mount.id));
  const entries:TestCaseListEntry[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const key = `${file.mountId}\0${file.path}`;
    if (!enabled.has(file.mountId) || !isTestCasePath(file.path) || seen.has(key)) continue;
    seen.add(key);entries.push({key:`file:${key}`,file});
  }
  for (const change of changes) {
    if (!enabled.has(change.mountId) || !isTestCasePath(change.path) || change.status==='applied') continue;
    entries.push({key:`draft:${change.id}`,file:{mountId:change.mountId,path:change.path,size:change.content.length},change});
  }
  return entries.sort((a,b)=>a.file.path.localeCompare(b.file.path,'zh-CN') || (b.change?.createdAt||'').localeCompare(a.change?.createdAt||''));
}

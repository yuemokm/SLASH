import fs from 'node:fs/promises';
import path from 'node:path';

/** Only explicitly opted-in, real test profiles may suppress the main window. */
export async function isHiddenTestProfile(dataDir:string|undefined,testRoot:string,flag:string|undefined){
 if(flag!=='1'||!dataDir||!path.isAbsolute(dataDir))return false;
 try{
  const root=path.resolve(testRoot),dir=path.resolve(dataDir),relative=path.relative(root,dir);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))return false;
  // Reject junctions/symlinks, including the test root; no alternate real tree.
  let component=root;
  if((await fs.lstat(component)).isSymbolicLink())return false;
  for(const part of relative.split(path.sep)){component=path.join(component,part);if((await fs.lstat(component)).isSymbolicLink())return false;}
  const [realRoot,realDir]=await Promise.all([fs.realpath(root),fs.realpath(dir)]),realRelative=path.relative(realRoot,realDir);
  return Boolean(realRelative)&&!path.isAbsolute(realRelative)&&realRelative!=='..'&&!realRelative.startsWith('..'+path.sep)&&realDir.toLowerCase()===dir.toLowerCase()&&realRoot.toLowerCase()===root.toLowerCase();
 }catch{return false;}
}

import path from 'node:path';

/** Conversation-bound virtual references. They are never persisted as indexed mounts. */
export function computerScopeId(conversationId:string){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(conversationId))throw Error('COMPUTER_SCOPE_INVALID');
 return `computer:${conversationId}`;
}
export function computerReference(id:string,filePath:string){
 if(!id.startsWith('computer:'))return undefined;
 const match=/^computer:([A-Za-z0-9_-]{1,100})(?::root:([A-Za-z0-9_-]+))?$/.exec(id);
 if(!match)throw Error('COMPUTER_SCOPE_INVALID');
 let root:string,relative:string;
 if(match[2]){
  root=Buffer.from(match[2],'base64url').toString('utf8');
  if(Buffer.from(root).toString('base64url')!==match[2]||!path.isAbsolute(root)||path.parse(root).root!==root)throw Error('COMPUTER_SCOPE_INVALID');
  if(path.isAbsolute(filePath)||filePath.includes(':'))throw Error('INVALID_PATH');
  relative=filePath;
 }else{
  if(!path.isAbsolute(filePath))throw Error('COMPUTER_ABSOLUTE_PATH_REQUIRED');
  const absolute=path.resolve(filePath);root=path.parse(absolute).root;relative=path.relative(root,absolute)||'.';
 }
 if(filePath.includes('\0')||relative.split(/[\\/]/).some(part=>part==='..'))throw Error('INVALID_PATH');
 if(process.platform==='win32'){root=root.toLowerCase();relative=relative.toLowerCase();}
 const mountId=`${computerScopeId(match[1])}:root:${Buffer.from(root).toString('base64url')}`;
 if(mountId.length>200)throw Error('COMPUTER_SCOPE_INVALID');
 return{conversationId:match[1],root,mountId,path:relative,absolute:path.resolve(root,relative)};
}

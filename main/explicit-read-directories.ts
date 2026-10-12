import fs from 'node:fs/promises';
import path from 'node:path';
import type {Mount} from '../shared/types.js';

export type ExplicitReadDirectory={path:string;userPathQuote:string};
const negative=/(?:不要|禁止|不得|不能|别读|别访问|不用读取|无需读取|do\s+not|don't|never\s+(?:read|access))/i;
const quotedData=/(?:示例|例如|(?:原文|引文|引用|日志|模型说)\s*[:：]|资料(?:中|里)(?:写|说))/;
const readIntent=/(?:根据|读取|查找|检索|参考|使用|查看|打开|分析|资料|文件夹|目录|read|search|based\s+on)/i;

/** Parse only the trusted user's current message. Never called on file text,
 * skill instructions, model output or tool arguments. No parent fallback. */
export function explicitReadDirectories(text:string):ExplicitReadDirectory[]{
 const result:ExplicitReadDirectory[]=[];
 const fenced=[...text.matchAll(/```[\s\S]*?(?:```|$)/g)].map(m=>[m.index!,m.index!+m[0].length]);
 const starts=[...text.matchAll(/[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+/g)];
 for(const start of starts){
  const index=start.index!;
  if(fenced.some(([from,to])=>index>=from&&index<to))continue;
  const lineStart=text.lastIndexOf('\n',index)+1;
  if(/^\s*>/.test(text.slice(lineStart,index)))continue;
  if([...text.matchAll(/<untrusted_[^>]+>[\s\S]*?<\/untrusted_[^>]+>/g)].some(m=>index>=m.index!&&index<m.index!+m[0].length))continue;
  // A quoted paragraph is task data. A quote containing only the exact path
  // remains a usable path delimiter, including names with spaces.
  if([['“','”'],['‘','’']].some(([open,close])=>{const opened=text.lastIndexOf(open,index-1),closed=text.lastIndexOf(close,index-1);return opened>closed&&opened!==index-1;}))continue;
  if(['"',"'"].some(quote=>{const prefix=text.slice(lineStart,index),positions=[...prefix.matchAll(new RegExp(quote==='"'?'"':"'",'g'))];return positions.length%2===1&&positions.at(-1)!.index!==prefix.length-1;}))continue;
  const before=text.slice(0,index),sentenceStart=Math.max(before.lastIndexOf('\n'),before.lastIndexOf('。'),before.lastIndexOf('；'),before.lastIndexOf(';'))+1;
  const sentenceEnd=text.slice(index).search(/[\r\n。；;]/),sentence=text.slice(sentenceStart,sentenceEnd<0?text.length:index+sentenceEnd);
  if(negative.test(sentence)||quotedData.test(sentence)||!readIntent.test(sentence)&&text.trim()!==sentence.slice(index-sentenceStart).trim())continue;
  const opening=text[index-1],closing:Record<string,string>={'"':'"',"'":"'",'`':'`','“':'”','‘':'’'};
  let literal:string;
  if(closing[opening]){
   const end=text.indexOf(closing[opening],index);if(end<0)throw Error('EXPLICIT_DIRECTORY_PATH_AMBIGUOUS: 目录路径的引号未闭合');
   literal=text.slice(index,end);
  }else{
   const rest=text.slice(index),boundary=rest.search(/[\r\n，,。；;"'`“”‘’<>]|\s+(?:下的|中的|里的|内的|目录下|文件夹下|中(?:的)?资料|下(?:的)?文件)/);
   literal=(boundary<0?rest:rest.slice(0,boundary)).trimEnd();
  }
  if(!literal||literal.length>32767||/[\0\r\n<>|?*]/.test(literal)||literal.split(/[\\/]/).some(part=>part==='.'||part==='..'))throw Error('EXPLICIT_DIRECTORY_PATH_INVALID: 请提供完整、精确的资料目录路径');
  // Trailing natural language without a recognized boundary is ambiguous;
  // checking the entire literal will fail rather than authorize a parent.
  if(!result.some(item=>item.path.toLowerCase()===literal.toLowerCase()))result.push({path:literal,userPathQuote:literal});
  if(result.length>8)throw Error('EXPLICIT_DIRECTORY_PATH_LIMIT: 单次最多指定8个资料目录');
 }
 return result;
}

function within(root:string,target:string){const relative=path.relative(root,target);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
async function canonicalExisting(directory:string){
 const absolute=path.resolve(directory),stat=await fs.lstat(absolute);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('EXPLICIT_DIRECTORY_UNAVAILABLE: 指定路径不是普通资料目录，目录链接不能自动授权');
 const real=await fs.realpath(absolute);
 if(process.platform==='win32'?real.toLowerCase()!==absolute.toLowerCase():real!==absolute)throw Error('EXPLICIT_DIRECTORY_UNAVAILABLE: 指定目录包含路径链接，请明确选择真实目录');
 return real;
}

/** Existing disabled ranges cannot be bypassed by a new parent/child mount. */
export async function resolveExplicitReadDirectory(directory:string,mounts:ReadonlyArray<Mount>,guard:()=>void){
 guard();let real:string;
 try{real=await canonicalExisting(directory);}catch(error){guard();if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error('EXPLICIT_DIRECTORY_UNAVAILABLE: 用户指定的资料目录不存在；未授权其父目录');throw error;}
 guard();const checked:Array<{mount:Mount;path:string}>=[];
 for(const mount of mounts){
  guard();let root=path.resolve(mount.path);try{root=await fs.realpath(root);}catch{/* Missing disabled ranges still constrain their exact lexical scope. */}
  guard();checked.push({mount,path:root});
 }
 if(checked.some(item=>!item.mount.enabled&&(within(item.path,real)||within(real,item.path))))throw Error('PERMISSION_DENIED: 指定目录与已禁用范围重叠，完全访问不能重新授权');
 const existing=checked.filter(item=>item.mount.enabled&&within(item.path,real)).sort((a,b)=>b.path.length-a.path.length)[0]?.mount;
 return{directory:real,existing};
}

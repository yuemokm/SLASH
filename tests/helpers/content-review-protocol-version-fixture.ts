import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

/** Build a legal installed-version B from the current implementation, never a
 * maintained Service copy or a caller-authored prompt accepted by checkInput. */
export async function createContentReviewProtocolVersionFixture(){
 const main=path.resolve(fileURLToPath(new URL('../../main/',import.meta.url))),parent=path.resolve(os.tmpdir()),directory=await fs.mkdtemp(path.join(parent,'slash-review-protocol-identity-'));
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex'),files=['content-review-protocol.ts','content-review.ts','service.ts'],identities:Array<{path:string;sourceHash:string;generatedHash:string}>=[];
 const replaceSpecifier=(value:string)=>{
  if(value.startsWith('node:'))return value;
  if(value.startsWith('./')&&files.includes(value.slice(2).replace(/\.js$/,'.ts')))return value;
  if(value.startsWith('.')){let target=path.resolve(main,value);if(!existsSync(target)&&target.endsWith('.js')&&existsSync(target.slice(0,-3)+'.ts'))target=target.slice(0,-3)+'.ts';return pathToFileURL(target).href;}
  return import.meta.resolve(value);
 };
 const rewrite=(source:string)=>source.replace(/\bfrom\s+(['"])([^'"]+)\1/g,(_match,q,value)=>'from '+q+replaceSpecifier(value)+q).replace(/\bimport\((['"])([^'"]+)\1\)/g,(_match,q,value)=>'import('+q+replaceSpecifier(value)+q+')');
 try{
  // The fixture lives in system TEMP, outside the project's ESM package scope.
  // Keep the generated current-version modules ESM without changing Pi exports.
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({type:'module'}),{flag:'wx'});
  for(const file of files){const source=await fs.readFile(path.join(main,file),'utf8');let generated=source;if(file==='content-review-protocol.ts'){const before='schema描述格式，不是答案示例。',after='schema描述结构，不是答案示例。';assert.equal(source.split(before).length,2,'Protocol fixture requires one explicit current prompt anchor');generated=source.replace(before,after);assert.equal(generated.length,source.length,'The controlled prompt change must preserve character budget');}generated=rewrite(generated);await fs.writeFile(path.join(directory,file),generated);identities.push({path:file,sourceHash:sha(source),generatedHash:sha(generated)});}
  return{directory,contentReviewUrl:pathToFileURL(path.join(directory,'content-review.ts')).href,serviceUrl:pathToFileURL(path.join(directory,'service.ts')).href,identities,protocolChange:{before:'schema描述格式，不是答案示例。',after:'schema描述结构，不是答案示例。',sameCharacterCount:true},dispose:async()=>{assert.equal(path.dirname(path.resolve(directory)),parent);assert.ok(path.basename(directory).startsWith('slash-review-protocol-identity-'));await fs.rm(directory,{recursive:true,force:true});}};
 }catch(error){assert.equal(path.dirname(path.resolve(directory)),parent);assert.ok(path.basename(directory).startsWith('slash-review-protocol-identity-'));await fs.rm(directory,{recursive:true,force:true});throw error;}
}

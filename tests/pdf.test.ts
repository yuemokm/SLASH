import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Files,PDF_TEXT_LIMITS} from '../main/files.js';
import type {Mount} from '../shared/types.js';

function makePdf(pageTexts:string[]){
 const pageCount=pageTexts.length;const fontId=3+pageCount*2;const objects:string[]=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';objects[2]=`<< /Type /Pages /Count ${pageCount} /Kids [${pageTexts.map((_,index)=>`${3+index} 0 R`).join(' ')}] >>`;
 for(let index=0;index<pageCount;index++){const pageId=3+index,contentId=3+pageCount+index;objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;const chunks=pageTexts[index].match(/[\s\S]{1,1000}/g)??[];const commands=chunks.map(chunk=>`(${chunk.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)')}) Tj 0 -0.5 Td`).join('\n');const stream=commands?`BT /F1 0.5 Tf 72 720 Td\n${commands}\nET`:'q Q';objects[contentId]=`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`;}
 objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';let body='%PDF-1.4\n';const offsets:number[]=[0];for(let id=1;id<objects.length;id++){offsets[id]=Buffer.byteLength(body,'ascii');body+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}const xref=Buffer.byteLength(body,'ascii');body+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let id=1;id<objects.length;id++)body+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;body+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(body,'ascii');
}

async function fixture(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-pdf-'));const root=path.join(dir,'root');await fs.mkdir(root);const mounts:Mount[]=[{id:'m',path:root,name:'pdf',write:true,enabled:true}];return{dir,root,files:new Files(()=>mounts)};}

test('读取并搜索本地 PDF 正文',async()=>{const f=await fixture();try{await fs.writeFile(path.join(f.root,'research.pdf'),makePdf(['Enterprise customer onboarding approval','Risk review is required']));const text=await f.files.read('m','research.pdf');assert.match(text,/Enterprise customer onboarding approval/);assert.match(text,/Risk review is required/);const result=await f.files.search('onboarding approval');assert.equal(result.length,1);assert.equal(result[0].path,'research.pdf');assert.match(result[0].snippet??'',/onboarding approval/);}finally{await fs.rm(f.dir,{recursive:true,force:true});}});

test('扫描件、无效 PDF、页数、文件大小和结果长度都有明确限制',async()=>{const f=await fixture();try{
 await fs.writeFile(path.join(f.root,'scan.pdf'),makePdf(['']));await assert.rejects(f.files.read('m','scan.pdf'),/PDF_TEXT_UNAVAILABLE:.*不支持 OCR/);
 await fs.writeFile(path.join(f.root,'invalid.pdf'),Buffer.from('%PDF-1.4\ninvalid'));await assert.rejects(f.files.read('m','invalid.pdf'),/PDF_PARSE_FAILED/);
 await fs.writeFile(path.join(f.root,'too-many-pages.pdf'),makePdf(Array.from({length:PDF_TEXT_LIMITS.maxPages+1},()=>'')));await assert.rejects(f.files.read('m','too-many-pages.pdf'),/PDF_PAGE_LIMIT/);
 const oversized=Buffer.alloc(PDF_TEXT_LIMITS.maxBytes+1);oversized.write('%PDF-1.4');await fs.writeFile(path.join(f.root,'oversized.pdf'),oversized);await assert.rejects(f.files.read('m','oversized.pdf'),/PDF_FILE_LIMIT/);
 await fs.writeFile(path.join(f.root,'too-much-text.pdf'),makePdf(Array.from({length:11},()=> 'A'.repeat(100_000))));await assert.rejects(f.files.read('m','too-much-text.pdf'),/PDF_TEXT_LIMIT/);
 }finally{await fs.rm(f.dir,{recursive:true,force:true});}});

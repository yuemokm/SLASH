import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractOfficeTextSnapshot} from './office-extraction.js';
import type {Files} from './files.js';
import type {DocumentContent} from '../shared/types.js';

export const WORD_READING_LIMITS=Object.freeze({inputBytes:20_000_000,outputBytes:2_000_000});
const version=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const checkSize=(size:number)=>{if(size>WORD_READING_LIMITS.inputBytes)throw Error('WORD_FILE_LIMIT: Word 文件超过阅读限制 20 MB');};

/** UI reading only. Agent read receipts and historical version text are separate. */
export async function readWordDocument(files:Pick<Files,'resolve'>,mountId:string,relative:string,assertCurrent:()=>void):Promise<DocumentContent>{
 assertCurrent();const file=await files.resolve(mountId,relative);if(path.extname(file).toLowerCase()!=='.docx')throw Error('WORD_FILE_REQUIRED');
 const before=await fs.stat(file);checkSize(before.size);assertCurrent();
 const bytes=await fs.readFile(file);checkSize(bytes.length);const sourceVersion=version(bytes);
 const snapshot=await extractOfficeTextSnapshot(bytes,path.basename(file));
 if(snapshot.readingText===undefined)throw Error('WORD_TEXT_UNAVAILABLE');
 if(Buffer.byteLength(snapshot.readingText)>WORD_READING_LIMITS.outputBytes)throw Error('WORD_TEXT_LIMIT: Word 阅读正文超过 2 MB，请拆分后阅读');
 assertCurrent();const current=await files.resolve(mountId,relative),after=await fs.stat(current);
 if(current!==file||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('READ_VERSION_CHANGED: Word 读取期间文件已变化，请重新打开');
 // Recheck actual bytes as well: matching file metadata is not a content proof.
 const latest=await fs.readFile(current);checkSize(latest.length);
 if(version(latest)!==sourceVersion)throw Error('READ_VERSION_CHANGED: Word 读取期间文件已变化，请重新打开');
 assertCurrent();if(await files.resolve(mountId,relative)!==file)throw Error('READ_VERSION_CHANGED: Word 读取期间文件路径已变化');assertCurrent();
 return{content:snapshot.readingText,version:sourceVersion,format:'word',wordPresentation:'host-structured-v1',notice:'已提取正文；图片未做 OCR，页眉页脚、批注、文本框和页面版式可能未完整保留。合并或复杂表格按单元格顺序阅读，请对照原文核对。'};
}

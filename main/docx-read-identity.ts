import {docxContextIdentitySchema,docxTextExtractionSchema,type DocxTextExtraction} from '../shared/docx-read-identity.js';
import {OFFICE_TEXT_PARSER_VERSION} from './office-extraction.js';

export function assertCurrentDocxTextExtraction(recorded:unknown,actual:DocxTextExtraction|undefined){
 const parsed=docxTextExtractionSchema.safeParse(recorded);
 if(!parsed.success)throw Error('DOCX_SOURCE_REQUIRES_READ: 旧 Word 正文回执缺少解析身份，请重新读取');
 if(!actual||parsed.data.parserVersion!==OFFICE_TEXT_PARSER_VERSION||actual.parserVersion!==OFFICE_TEXT_PARSER_VERSION||parsed.data.parserVersion!==actual.parserVersion||parsed.data.textHash!==actual.textHash)throw Error('DOCX_SOURCE_CHANGED: Word 解析版本或正文已变化，请重新读取');
}
export function assertDocxContextIdentity(source:{versionId?:string;hashKind?:'text'|'file';textExtraction?:DocxTextExtraction}){
 const parsed=docxContextIdentitySchema.safeParse({versionId:source.versionId,hashKind:source.hashKind,...(source.textExtraction?{textExtraction:source.textExtraction}:{})});
 if(!parsed.success)throw Error('DOCX_CONTEXT_REQUIRES_READ: 旧 Word 上下文缺少明确版本或正文身份，请重新读取');
 return parsed.data;
}

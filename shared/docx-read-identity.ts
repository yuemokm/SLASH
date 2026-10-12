import {z} from 'zod';

// Host receipts only. This is deliberately not part of workflowSourceSchema.
export const docxTextExtractionSchema=z.object({parserVersion:z.string().min(1).max(200),textHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type DocxTextExtraction=z.infer<typeof docxTextExtractionSchema>;
export const docxContextIdentitySchema=z.object({versionId:z.union([z.literal('current'),z.string().regex(/^read:[a-f0-9]{64}$/),z.string().regex(/^before:[A-Za-z0-9_-]{1,200}$/)]),hashKind:z.enum(['text','file']),textExtraction:docxTextExtractionSchema.optional()}).strict().superRefine((value,ctx)=>{
 if(value.hashKind!==(value.versionId==='current'?'file':'text'))ctx.addIssue({code:'custom',path:['hashKind'],message:'DOCX context hash kind must match its explicit version'});
 if(!value.versionId.startsWith('before:')&&!value.textExtraction)ctx.addIssue({code:'custom',path:['textExtraction'],message:'Current DOCX body requires a host extraction identity'});
});

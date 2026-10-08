import {createHash} from 'node:crypto';
import type {ProcessingResult} from '../shared/types.js';
import {spreadsheetFieldEvidenceSchema,type SpreadsheetFieldEvidence,type SpreadsheetFieldReadInput} from '../shared/spreadsheet-field-evidence.js';
import {businessPathKey} from '../shared/business-rules.js';
import type {extractSpreadsheetFieldSelection} from './office-extraction.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function bindSpreadsheetSelection(input:SpreadsheetFieldReadInput,receipt:ProcessingResult,selected:Awaited<ReturnType<typeof extractSpreadsheetFieldSelection>>):SpreadsheetFieldEvidence[]{
 return selected.values.map(({headers,value})=>{
  const cells=[selected.field,...headers,value],textBindings=cells.map(cell=>{const binding=selected.bindings.get(cell.masterAddress);if(!binding)throw Error('SPREADSHEET_TEXT_BINDING_MISSING');return binding;});
  const fieldAxis=hash({source:{mountId:receipt.source.mountId,path:businessPathKey(receipt.source.path)},sheet:input.sheet,field:{address:selected.field.masterAddress,merge:selected.field.mergeRange},headers:headers.map(cell=>({address:cell.masterAddress,merge:cell.mergeRange})),column:value.column});
  const base={schemaVersion:1 as const,fieldAxis,basis:receipt.copyHash===receipt.source.contentHash?'original_xlsx' as const:'processing_copy_xlsx' as const,mountId:input.mountId,path:input.path,contentHash:input.expectedContentHash,processingReceiptId:receipt.changeId,copyId:receipt.copyId,originalHash:receipt.source.contentHash,copyHash:receipt.copyHash,sheet:{name:input.sheet,state:selected.sheetState},field:selected.field,headers,value,textBindings,semanticStatus:'unverified' as const,humanConfirmed:false as const};
  return spreadsheetFieldEvidenceSchema.parse({...base,evidenceId:hash(base)});
 });
}
export function evidenceReadInput(evidence:SpreadsheetFieldEvidence):SpreadsheetFieldReadInput{return{mountId:evidence.mountId,path:evidence.path,expectedContentHash:evidence.contentHash,sheet:evidence.sheet.name,fieldCell:evidence.field.requestedAddress,values:[{valueCell:evidence.value.requestedAddress,headerCells:evidence.headers.map(cell=>cell.requestedAddress)}]};}
export function spreadsheetIncludedCharacters(text:string,evidence:SpreadsheetFieldEvidence[]){
 const lines=text.split('\n'),starts:number[]=[];let offset=0;for(const line of lines){starts.push(offset);offset+=line.length+1;}
 const ranges=evidence.flatMap(item=>item.textBindings.map(binding=>{const start=starts[binding.startLine-1];if(start===undefined||lines.slice(binding.startLine-1,binding.endLine).join('\n')!==binding.quote)throw Error('SPREADSHEET_TEXT_BINDING_MISSING');return{start,end:start+binding.quote.length};})).sort((a,b)=>a.start-b.start||a.end-b.end);let end=0,characters=0;for(const range of ranges){characters+=Math.max(0,range.end-Math.max(end,range.start));end=Math.max(end,range.end);}return characters;
}

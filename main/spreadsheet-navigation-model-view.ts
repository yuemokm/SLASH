import {spreadsheetNavigationResponseSchema,type SpreadsheetNavigationResponse} from '../shared/spreadsheet-navigation.js';

type Cell=SpreadsheetNavigationResponse['rows'][number]['cells'][number];
type ModelCell=Pick<Cell,'address'|'text'|'row'|'column'>&Partial<Omit<Cell,'address'|'text'|'row'|'column'>>;
const cellDefaults={rowHidden:false,columnHidden:false,kind:'text',textOffset:0,textTruncated:false,formulaExecuted:false,masterAddress:'=address',totalCharacters:'=text UTF-16 length'} as const;
type CompactNavigation=Omit<SpreadsheetNavigationResponse,'rows'>&{cellEncoding:'named_defaults_v1';cellDefaults:typeof cellDefaults;rows:Array<{number:number;hidden:boolean;cells:ModelCell[]}>};

/** Model-only lossless omission of defaults. The verified host response,
 * source identity, coverage, literal text and continuation are never changed. */
export function spreadsheetNavigationForModel(response:SpreadsheetNavigationResponse):SpreadsheetNavigationResponse|CompactNavigation{
 spreadsheetNavigationResponseSchema.parse(response);
 if(response.state!=='current'||response.mode==='sheets')return response;
 const rows=response.rows.map(row=>{const cells=row.cells.map(cell=>{
  const result:ModelCell={...cell};
  if(cell.rowHidden===false)delete result.rowHidden;
  if(cell.columnHidden===false)delete result.columnHidden;
  if(cell.kind==='text')delete result.kind;
  if(cell.textOffset===0)delete result.textOffset;
  if(cell.textTruncated===false)delete result.textTruncated;
  if(cell.formulaExecuted===false)delete result.formulaExecuted;
  if(cell.masterAddress===cell.address)delete result.masterAddress;
  if(cell.totalCharacters===cell.text.length)delete result.totalCharacters;
  return result;
 });return{...row,cells};});
 const compact:CompactNavigation={...response,cellEncoding:'named_defaults_v1',cellDefaults,rows};
 return JSON.stringify(compact).length<JSON.stringify(response).length?compact:response;
}

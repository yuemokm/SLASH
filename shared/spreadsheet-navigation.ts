import {z} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200);
const relative=z.string().min(1).max(32767).refine(value=>!value.includes(':')&&!value.includes('\0')&&!value.replaceAll('\\','/').startsWith('/')&&!value.replaceAll('\\','/').split('/').includes('..'));
export const spreadsheetNavigationCursorSchema=z.object({position:z.number().int().min(0),textOffset:z.number().int().min(0).optional(),version:hash}).strict();
const base={mountId:id,path:relative.describe('已登记且已应用的内置XLSX提取TXT相对路径，不是原.xlsx或处理副本.xlsx'),expectedContentHash:hash.describe('该提取TXT正文SHA-256'),cursor:spreadsheetNavigationCursorSchema.optional().describe('续页复制原请求及上页nextCursor；不改sheet/startRow/搜索列/查询/上下文列，不将cursor.position当新startRow')};
const sheetName=z.string().min(1).max(255).describe('必填真实工作表名称；先从sheets目录核对，不自动选择业务对象');
const rowLimit=z.number().int().min(1).max(10).default(5).describe('每页最多1–10个命中/选定行；完整JSON仍受10000字符预算限制');
const literalQueries=z.array(z.string().min(1).max(80)).min(1).max(8).refine(items=>new Set(items).size===items.length,'字面查询不得重复');
const contextColumns=z.array(z.number().int().min(1).max(16384)).max(3).default([]).refine(items=>new Set(items).size===items.length,'上下文列不得重复');
export const spreadsheetNavigationRequestSchema=z.discriminatedUnion('mode',[
 z.object({...base,mode:z.literal('sheets'),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(20).default(10)}).strict(),
 z.object({...base,mode:z.literal('rows'),sheet:sheetName,startRow:z.number().int().min(1).max(1048576).default(1),startColumn:z.number().int().min(1).max(16384).default(1),columnLimit:z.number().int().min(1).max(16).default(16),rowLimit,query:z.string().min(1).max(80).optional().describe('可选区分大小写的字面文本；只搜索指定sheet/startRow之后及选定列窗口，不支持正则')}).strict(),
 z.object({...base,mode:z.literal('find_rows'),sheet:sheetName,startRow:z.number().int().min(1).max(1048576).default(1),searchColumn:z.number().int().min(1).max(16384).describe('明确搜索名称所在的单列编号，不从名称猜列'),queries:literalQueries.describe('1–8个区分大小写的literal子串，任一命中即可；返回全部同名候选直至cursor耗尽，不作同义词扩展'),contextColumns:contextColumns.describe('明确选择最多3个类别/归属列；逐行原样返回，不借邻行推断业务含义'),rowLimit}).strict().refine(value=>!value.contextColumns.includes(value.searchColumn),'上下文列不能重复搜索列')
]);
const cell=z.object({address:z.string().max(12),masterAddress:z.string().max(12),mergeRange:z.string().max(32).optional(),row:z.number().int().positive(),column:z.number().int().positive(),rowHidden:z.boolean(),columnHidden:z.boolean(),kind:z.enum(['empty','text','number','boolean','date','rich_text','hyperlink','formula','error','unsupported']),text:z.string().max(512),textOffset:z.number().int().min(0),totalCharacters:z.number().int().min(0),textTruncated:z.boolean(),formulaExecuted:z.literal(false)}).strict();
export const spreadsheetNavigationIdentitySchema=z.object({mountId:id,path:relative,contentHash:hash,processingReceiptId:id,copyId:id,originalHash:hash,copyHash:hash,basis:z.enum(['original_xlsx','processing_copy_xlsx']),authorizationVersion:hash}).strict();
export const spreadsheetNavigationResponseSchema=z.object({
 state:z.enum(['current','unverified']),mode:z.enum(['sheets','rows','find_rows']),identity:spreadsheetNavigationIdentitySchema.optional(),textCharacters:z.number().int().min(0).optional(),
 sheets:z.array(z.object({name:z.string().min(1).max(255),state:z.enum(['visible','hidden','veryHidden']),rowCount:z.number().int().min(0),columnCount:z.number().int().min(0)}).strict()).max(20),
 rows:z.array(z.object({number:z.number().int().positive(),hidden:z.boolean(),cells:z.array(cell).max(80)}).strict()).max(10),
 range:z.object({sheet:z.string().min(1).max(255),startRow:z.number().int().positive(),endRow:z.number().int().min(0),startColumn:z.number().int().positive(),endColumn:z.number().int().min(0),query:z.string().max(80).optional()}).strict().optional(),
 findRows:z.object({sheet:z.string().min(1).max(255),startRow:z.number().int().positive(),endRow:z.number().int().min(0),searchColumn:z.number().int().min(1).max(16384),queries:literalQueries,contextColumns}).strict().optional(),
 scanned:z.object({cells:z.number().int().min(0).max(2000),characters:z.number().int().min(0).max(64000)}).strict(),
 truncated:z.boolean(),nextCursor:spreadsheetNavigationCursorSchema.nullable(),
 coverage:z.object({partial:z.literal(true),fullBodyRead:z.literal(false),bodyCharactersIncluded:z.number().int().min(0).max(64000),fieldRelationshipVerified:z.literal(false),semanticStatus:z.literal('unverified'),humanConfirmed:z.literal(false)}).strict(),reasons:z.array(z.string().max(500)).max(10)
}).strict().superRefine((value,ctx)=>{if(value.state==='current'&&(!value.identity||value.textCharacters===undefined))ctx.addIssue({code:'custom',message:'current导航必须有宿主来源身份及真实正文长度'});if(value.state!=='current'&&(value.sheets.length||value.rows.length||value.nextCursor))ctx.addIssue({code:'custom',message:'未核验不能返回目录/单元格'});if(JSON.stringify(value).length>10000)ctx.addIssue({code:'custom',message:'导航完整响应超过10000字符'});});
export type SpreadsheetNavigationInput=z.infer<typeof spreadsheetNavigationRequestSchema>;
export type SpreadsheetNavigationIdentity=z.infer<typeof spreadsheetNavigationIdentitySchema>;
export type SpreadsheetNavigationResponse=z.infer<typeof spreadsheetNavigationResponseSchema>;
export type SpreadsheetNavigationOptions={maxCharacters?:number};

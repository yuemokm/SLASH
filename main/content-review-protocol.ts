import {z} from 'zod';
import {createHash} from 'node:crypto';
import {contentReviewWireFindingSchema,contentReviewWireCoverageSchema} from '../shared/content-review.js';

// Prompt structure comes from the actual validators. The host still performs
// per-finding validation: JSON schema cannot express quote binding/refinements.
const promptOutputSchema=z.object({findings:z.array(contentReviewWireFindingSchema).max(3),coverage:contentReviewWireCoverageSchema}).strict();
export const REVIEW_OUTPUT_JSON_SCHEMA=z.toJSONSchema(promptOutputSchema,{target:'draft-7'});
export const REVIEW_OUTPUT_SCHEMA_TEXT=JSON.stringify(REVIEW_OUTPUT_JSON_SCHEMA);
export const REVIEW_OUTPUT_SCHEMA_HASH=createHash('sha256').update(REVIEW_OUTPUT_SCHEMA_TEXT).digest('hex');
export const REVIEW_PROTOCOL_PROMPT='只返回符合下列JSON Schema的单个JSON对象，不返回解释文字、hash、通过状态、人工确认或工具请求。schema描述格式，不是答案示例。最多3项关键问题，每项总引用最多3处；单引句最多160字符，解释最多160字符，建议最多100字符，未完成说明最多3项各120字符。逐项核对成果中的肯定性业务结论：来源明确支持、用户本次新决策、仅为假设/未知或与正面条款矛盾；重点核对对象、术语、阶段、生命周期、上线批次、权限和范围。未说明不等于允许，不同来源不能凭名称/版本自动裁决效力。只报告证据完整的关键风险，不为凑数量虚构问题，也不能把没有发现具体问题等同业务通过。使用宿主提供的短引用A/S/R，精确按类型引用，不回抄真实ID或hash；不能猜别名或跨类型引用。每项至少有一句实际成果原文，并至少有一句真实来源或用户要求原文；引句是连续完整原文，不能仅为空白或用省略号替代。跨成果问题引用两份实际成果和一份依据。未用来源、要求数组给空数组，不能给null；coverage所有必填数组必须提供，只列实际检查的方向。未覆盖方向/选段及超出3项未完成检查必须明确保留partial，写入coverage.limitations。逐字引用仍由宿主独立校验。\n输出JSON Schema：'+REVIEW_OUTPUT_SCHEMA_TEXT;

type SchemaNode={type?:unknown;properties?:Record<string,SchemaNode>;items?:SchemaNode;anyOf?:SchemaNode[]};
type Issue={code:string;path?:PropertyKey[]};
const codes=new Set(['invalid_type','too_big','too_small','invalid_format','not_multiple_of','unrecognized_keys','invalid_union','invalid_key','invalid_element','invalid_value','custom']);
const findingJsonSchema=z.toJSONSchema(contentReviewWireFindingSchema,{target:'draft-7'}) as SchemaNode;
function safePath(path:PropertyKey[]|undefined,schema:SchemaNode,prefix:string){
 let node:SchemaNode|undefined=schema,output=prefix;
 for(const segment of (path??[]).slice(0,12)){
  if(typeof segment==='number'&&node?.items){output+='['+(Number.isSafeInteger(segment)&&segment>=0&&segment<=100?segment:'*')+']';node=node.items;continue;}
  if(typeof segment==='string'&&node?.properties&&Object.hasOwn(node.properties,segment)){output+='.'+segment;node=node.properties[segment];continue;}
  output+='.[unknown]';break;
 }
 return output;
}
/** Only schema-owned path segments and enumerated Zod codes survive. Never
 * serialize issue.message, keys, input, received, expected, values or union dumps. */
export function safeSchemaDiagnostics(phase:'root'|'finding',issues:Issue[],index?:number){
 const schema=phase==='finding'?findingJsonSchema:REVIEW_OUTPUT_JSON_SCHEMA as SchemaNode;
 const prefix=phase==='finding'?'$.findings['+(Number.isInteger(index)&&index!>=0&&index!<100?index:'*')+']':'$';
 return issues.slice(0,12).map(issue=>{
  const path=safePath(issue.path,schema,prefix),area=phase==='finding'?'finding':path.startsWith('$.coverage')?'coverage':path.startsWith('$.findings')?'findings':'root';
  return 'CONTENT_REVIEW_SCHEMA '+area+' '+(codes.has(issue.code)?issue.code:'schema_error')+' '+path;
 });
}

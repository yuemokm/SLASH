import {parse} from 'acorn';

export type HtmlScriptBindingStatus='bound'|'unbound'|'unknown';
export type HtmlScriptControl={tag:string;id?:string;classes?:string[]};
export type HtmlScriptBinding={status:HtmlScriptBindingStatus;reason?:string};
export type HtmlScriptBindingAnalysis={forControl:(control:HtmlScriptControl)=>HtmlScriptBinding;limitations:string[];hasUnknownBindings:boolean};
export const HTML_SCRIPT_BINDING_LIMITS=Object.freeze({scriptCharacters:250000,totalCharacters:1000000,nodes:40000,scripts:100});
type AstNode={type:string;start:number;end:number;loc?:{start:{line:number;column:number}};[key:string]:unknown};
type Script={text:string;sourceType:'script'|'module'};
type Parsed={root:AstNode;nodes:AstNode[];body:AstNode[]};
type Reference={selector:string;all:boolean};
type Helper={kind:'getElementById'|'querySelector';node:AstNode};
const node=(value:unknown):AstNode|undefined=>value&&typeof value==='object'&&'type' in value&&typeof value.type==='string'?value as AstNode:undefined;
const children=(value:unknown):AstNode[]=>Array.isArray(value)?value.map(node).filter((n):n is AstNode=>Boolean(n)):[];
const field=(n:AstNode|undefined,key:string)=>node(n?.[key]);
const name=(n:AstNode|undefined)=>n?.type==='Identifier'&&typeof n.name==='string'?n.name:undefined;
const literal=(n:AstNode|undefined)=>n?.type==='Literal'&&typeof n.value==='string'?n.value:undefined;
const identifier=(n:AstNode|undefined,value:string)=>name(n)===value;
const prop=(n:AstNode|undefined)=>n?.type==='MemberExpression'&&!n.computed?name(field(n,'property')):undefined;
const writtenProperty=(n:AstNode|undefined)=>n?.type==='MemberExpression'?n.computed?literal(field(n,'property')):name(field(n,'property')):undefined;
const args=(n:AstNode|undefined)=>children(n?.arguments);
function walk(root:AstNode){const result:AstNode[]=[],stack=[root];while(stack.length){const current=stack.pop()!;if(result.length>=HTML_SCRIPT_BINDING_LIMITS.nodes)throw Error('NODE_LIMIT');result.push(current);for(const value of Object.values(current)){if(Array.isArray(value))stack.push(...children(value));else{const child=node(value);if(child)stack.push(child);}}}return result;}
function ownScope(root:AstNode){const result:AstNode[]=[],stack=[root];while(stack.length){const current=stack.pop()!;if(result.length>=HTML_SCRIPT_BINDING_LIMITS.nodes)throw Error('NODE_LIMIT');if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassDeclaration','ClassExpression'].includes(current.type))continue;result.push(current);for(const value of Object.values(current)){if(Array.isArray(value))stack.push(...children(value));else{const child=node(value);if(child)stack.push(child);}}}return result;}
function lookup(n:AstNode|undefined):'getElementById'|'querySelector'|'querySelectorAll'|undefined{
 const callee=field(n,'callee'),method=prop(callee);
 return n?.type==='CallExpression'&&identifier(field(callee,'object'),'document')&&['getElementById','querySelector','querySelectorAll'].includes(method??'')&&args(n).length===1?method as 'getElementById'|'querySelector'|'querySelectorAll':undefined;
}
function reference(n:AstNode|undefined):Reference|undefined{const kind=lookup(n),value=literal(args(n)[0]);if(!kind||!value)return;return{selector:kind==='getElementById'?'#'+value:value,all:kind==='querySelectorAll'};}
function simpleHelper(fn:AstNode|undefined):Helper|undefined{
 if(!fn||!['FunctionExpression','ArrowFunctionExpression'].includes(fn.type)||fn.async||fn.generator)return;
 const params=children(fn.params);if(params.length!==1||!name(params[0]))return;
 const body=field(fn,'body'),statements=children(body?.body),call=body?.type==='BlockStatement'&&statements.length===1&&statements[0].type==='ReturnStatement'?field(statements[0],'argument'):body?.type==='CallExpression'?body:undefined,kind=lookup(call);
 if((kind==='getElementById'||kind==='querySelector')&&identifier(args(call)[0],name(params[0])!))return{kind,node:fn};
}
function matchingSelector(selector:string,control:HtmlScriptControl){
 // Simple literal selectors only. CSS escapes/compounds require a browser.
 if(/^#[\p{L}\p{N}_-]+$/u.test(selector))return control.id===selector.slice(1);
 if(/^\.[\p{L}\p{N}_-]+$/u.test(selector))return control.classes?.includes(selector.slice(1))??false;
 return /^[a-z][a-z0-9-]*$/i.test(selector)&&control.tag.toLowerCase()===selector.toLowerCase();
}
function knownSelector(selector:string){return /^(?:[.#][\p{L}\p{N}_-]+|[a-z][a-z0-9-]*)$/iu.test(selector);}
function attr(attributes:string,key:string){const match=new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i').exec(attributes);return match?.[1]??match?.[2]??match?.[3];}
function hasAttr(attributes:string,key:string){return new RegExp(`(?:^|\\s)${key}(?:\\s*=|\\s|$)`,'i').test(attributes);}
function scriptsFromHtml(html:string){
 const text=html.replace(/<!--[\s\S]*?-->/g,comment=>comment.replace(/[^\r\n]/g,' ')),scripts:Script[]=[],limitations=new Set<string>();let external=false,total=0;
 for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const attributes=match[1],type=(attr(attributes,'type')??'').trim().toLowerCase();
  if(hasAttr(attributes,'nomodule'))continue;
  if(type&&type!=='module'&&!['text/javascript','application/javascript','text/ecmascript','application/ecmascript','text/jscript','text/livescript','application/x-javascript','application/x-ecmascript','text/x-javascript','text/x-ecmascript',...Array.from({length:6},(_,i)=>'text/javascript1.'+i)].includes(type))continue;
  if(hasAttr(attributes,'src')){external=true;limitations.add('EXTERNAL_SCRIPT');continue;}
  total+=match[2].length;
  if(scripts.length>=HTML_SCRIPT_BINDING_LIMITS.scripts||match[2].length>HTML_SCRIPT_BINDING_LIMITS.scriptCharacters||total>HTML_SCRIPT_BINDING_LIMITS.totalCharacters){limitations.add('SCRIPT_BUDGET');continue;}
  scripts.push({text:match[2],sourceType:type==='module'?'module':'script'});
 }
 return{scripts,external,limitations};
}

/** Does not execute JavaScript. A bound result only proves a specific static
 * binding shape; DOM behavior and business acceptance always need a browser. */
export function analyseHtmlScriptBindings(html:string):HtmlScriptBindingAnalysis{
 const extracted=scriptsFromHtml(html),limitations=extracted.limitations,parsed:Parsed[]=[],declared=new Map<string,number>(),writes=new Set<string>();let unknown=extracted.external||limitations.size>0,invalidatesProof=false;
 const increment=(value:string|undefined)=>{if(value)declared.set(value,(declared.get(value)??0)+1);};
 for(const script of extracted.scripts){
  try{const root=parse(script.text,{ecmaVersion:'latest',sourceType:script.sourceType}) as unknown as AstNode,all=walk(root);
   const body=children(root.body).flatMap(statement=>{const expression=field(statement,'expression'),callee=field(expression,'callee');return expression?.type==='CallExpression'&&args(expression).length===0&&callee?.type==='FunctionExpression'&&!callee.async&&!callee.generator&&children(callee.params).length===0?children(field(callee,'body')?.body):[statement];});
   parsed.push({root,nodes:all,body});
   for(const n of all){
    if(n.type==='VariableDeclarator'){const id=field(n,'id');if(name(id))increment(name(id));else{unknown=true;invalidatesProof=true;limitations.add('COMPLEX_DECLARATION');}}
    if(n.type==='FunctionDeclaration')increment(name(field(n,'id')));
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))for(const p of children(n.params)){if(name(p))increment(name(p));else{unknown=true;invalidatesProof=true;limitations.add('COMPLEX_SCOPE');}}
    if(n.type==='ImportDeclaration'){unknown=true;for(const spec of children(n.specifiers))increment(name(field(spec,'local')));}
    if(n.type==='AssignmentExpression'){const left=field(n,'left');if(name(left))writes.add(name(left)!);if(['getElementById','querySelector','querySelectorAll','addEventListener','removeEventListener'].includes(writtenProperty(left)??'')){invalidatesProof=true;unknown=true;limitations.add('DOM_METHOD_CHANGED');}if(left?.type==='MemberExpression'&&left.computed){unknown=true;if(!writtenProperty(left)||['onclick','onchange','onsubmit'].includes(writtenProperty(left)??'')){invalidatesProof=true;limitations.add('COMPUTED_HANDLER_CHANGE');}}}
    if(n.type==='UpdateExpression'&&name(field(n,'argument')))writes.add(name(field(n,'argument'))!);
    if(['CallExpression','NewExpression'].includes(n.type)&&['eval','Function'].includes(name(field(n,'callee'))??writtenProperty(field(n,'callee'))??'')){invalidatesProof=true;unknown=true;limitations.add('DYNAMIC_CODE');}
    if(n.type==='CallExpression'&&['setTimeout','setInterval'].includes(name(field(n,'callee'))??'')&&literal(args(n)[0])!==undefined){invalidatesProof=true;unknown=true;limitations.add('DYNAMIC_CODE');}
    if(n.type==='ImportExpression'){unknown=true;limitations.add('DYNAMIC_IMPORT');}
    if(n.type==='CallExpression'&&field(n,'callee')?.type==='MemberExpression'&&field(n,'callee')?.computed){unknown=true;limitations.add('COMPUTED_CALL');}
    if(n.type==='CallExpression'&&['defineProperty','defineProperties','assign'].includes(prop(field(n,'callee'))??'')&&identifier(field(field(n,'callee'),'object'),'Object')){invalidatesProof=true;unknown=true;limitations.add('OBJECT_MUTATION_UNKNOWN');}
   }
  }catch{unknown=true;invalidatesProof=true;limitations.add('SCRIPT_PARSE_UNKNOWN');}
 }
 if(['document','window'].some(id=>declared.has(id)||writes.has(id))){invalidatesProof=true;unknown=true;limitations.add('DOM_ROOT_SHADOWED');}
 const proofs:Reference[]=[],claimed=new Set<AstNode>(),excluded=new Set<AstNode>();
 const mutable=(id:string)=>declared.get(id)!==1||writes.has(id);
 const mark=(n:AstNode|undefined)=>{if(n)for(const child of walk(n))claimed.add(child);};
 for(const entry of parsed){
  const helpers=new Map<string,Helper>(),aliases=new Map<string,Reference>(),handlers=new Map<string,AstNode>();
  for(const s of entry.body){if(s.type==='FunctionDeclaration'){const id=name(field(s,'id'));if(id&&!mutable(id))handlers.set(id,s);}if(s.type!=='VariableDeclaration')continue;for(const d of children(s.declarations)){const id=name(field(d,'id')),init=field(d,'init');if(!id||mutable(id))continue;const helper=simpleHelper(init);if(helper){helpers.set(id,helper);for(const n of walk(helper.node))excluded.add(n);}if(init&&['FunctionExpression','ArrowFunctionExpression'].includes(init.type))handlers.set(id,init);}}
  const resolve=(n:AstNode|undefined):Reference|undefined=>{const direct=reference(n);if(direct)return direct;const id=name(n);if(id)return aliases.get(id);if(n?.type==='CallExpression'){const helper=helpers.get(name(field(n,'callee'))??''),value=literal(args(n)[0]);if(helper&&args(n).length===1&&value)return{selector:helper.kind==='getElementById'?'#'+value:value,all:false};}};
  for(const s of entry.body)if(s.type==='VariableDeclaration')for(const d of children(s.declarations)){const id=name(field(d,'id'));if(id&&!mutable(id)){const value=resolve(field(d,'init'));if(value)aliases.set(id,value);}}
  const handler=(n:AstNode|undefined)=>n&&['FunctionExpression','ArrowFunctionExpression'].includes(n.type)?n:handlers.get(name(n)??'');
  const record=(ref:Reference|undefined,n:AstNode,object:AstNode|undefined)=>{claimed.add(n);if(!ref||!knownSelector(ref.selector)){unknown=true;return;}proofs.push(ref);mark(object);};
  const registration=(e:AstNode|undefined,override?:{id:string;reference:Reference})=>{
   if(!e)return;const callee=field(e,'callee'),left=field(e,'left');
   const call=e.type==='CallExpression'&&prop(callee)==='addEventListener'&&['click','change','submit'].includes(literal(args(e)[0])??'')&&args(e).length>=2,property=e.type==='AssignmentExpression'&&e.operator==='='&&['onclick','onchange','onsubmit'].includes(prop(left)??'');
   if(!call&&!property)return;
   const object=field(call?callee:left,'object'),fn=handler(call?args(e)[1]:field(e,'right'));
   if(!fn){unknown=true;return;}
   if(override&&identifier(object,override.id)){record(override.reference,e,object);return;}
   const ref=resolve(object);if(ref&&!ref.all){record(ref,e,object);return;}
   const documentBody=prop(object)==='body'&&identifier(field(object,'object'),'document'),root=identifier(object,'document')||identifier(object,'window')||documentBody;
   if(!root){unknown=true;return;}
   // Event delegation must be in this actual listener callback and refer to
   // its event.target. A closest() elsewhere cannot bless unrelated controls.
   const parameters=children(fn.params),event=name(parameters[0]);if(!event){unknown=true;return;}
   claimed.add(e);const callbackBody=field(fn,'body'),fnNodes=callbackBody?ownScope(callbackBody):[],delegationAliases=new Map<string,{selector:string;origin:AstNode}>();
   const delegatedMatch=(match:AstNode)=>{const c=field(match,'callee'),target=field(c,'object'),selector=literal(args(match)[0]);return match.type==='CallExpression'&&['closest','matches'].includes(prop(c)??'')&&prop(target)==='target'&&identifier(field(target,'object'),event)&&selector&&knownSelector(selector)?selector:undefined;};
   for(const declaration of fnNodes.filter(n=>n.type==='VariableDeclarator')){const id=name(field(declaration,'id')),init=field(declaration,'init'),selector=init?delegatedMatch(init):undefined;if(id&&init&&selector&&!writes.has(id)&&declared.get(id)===1)delegationAliases.set(id,{selector,origin:init});}
   for(const condition of fnNodes.filter(n=>n.type==='IfStatement')){const conditionRoot=field(condition,'test');if(!conditionRoot)continue;for(const match of ownScope(conditionRoot)){const alias=delegationAliases.get(name(match)??''),selector=delegatedMatch(match)??alias?.selector;if(selector){proofs.push({selector,all:true});mark(alias?.origin??match);}}}
  };
  for(const statement of entry.body){if(statement.type!=='ExpressionStatement')continue;const expression=field(statement,'expression');registration(expression);
   const callee=field(expression,'callee'),collection=resolve(field(callee,'object')),fn=handler(args(expression)[0]);
   if(expression?.type==='CallExpression'&&prop(callee)==='forEach'&&collection?.all&&fn){const parameters=children(fn.params),id=name(parameters[0]);if(parameters.length!==1||!id||writes.has(id)){unknown=true;continue;}claimed.add(expression);mark(field(callee,'object'));const body=field(fn,'body'),statements=body?.type==='BlockStatement'?children(body.body):body?[body]:[];for(const s of statements)registration(s.type==='ExpressionStatement'?field(s,'expression'):s,{id,reference:collection});}
  }
  for(const n of entry.nodes){if(claimed.has(n)||excluded.has(n))continue;
   const callee=field(n,'callee'),left=field(n,'left');
   if(n.type==='CallExpression'&&(['addEventListener','removeEventListener','closest','matches'].includes(prop(callee)??'')||lookup(n)&&!reference(n)||helpers.has(name(callee)??''))){unknown=true;if(prop(callee)==='removeEventListener'){invalidatesProof=true;limitations.add('HANDLER_REMOVED');}}
   if(n.type==='AssignmentExpression'&&['onclick','onchange','onsubmit','innerHTML','outerHTML'].includes(prop(left)??'')){unknown=true;if(['onclick','onchange','onsubmit'].includes(prop(left)??'')){invalidatesProof=true;limitations.add('HANDLER_REBOUND');}}
  }
 }
 if(invalidatesProof)proofs.length=0;
 return{limitations:[...limitations].slice(0,16),hasUnknownBindings:unknown||proofs.some(ref=>!ref.all&&!ref.selector.startsWith('#')),forControl(control){const positive=proofs.some(ref=>matchingSelector(ref.selector,control)&&(ref.all||ref.selector.startsWith('#')));if(positive)return{status:'bound'};const ambiguous=proofs.some(ref=>matchingSelector(ref.selector,control)&&!ref.all);return unknown||ambiguous?{status:'unknown',reason:'静态分析无法确认当前控件的完整处理路径，请运行浏览器断言'}:{status:'unbound'};}};
}

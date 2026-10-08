import {z} from 'zod';

export const FLOW_PARSE_LIMITS={maxCharacters:2_000_000,maxNodes:5_000,maxDepth:64,maxAttributes:100} as const;
export const SUPPORTED_FLOW_FEATURES={container:'mxfile or mxGraphModel with direct, uncompressed mxGraphModel content',shapes:['rectangle','rounded','ellipse','rhombus','text'],edges:['straight','orthogonal'],labels:'plain text; HTML labels are flattened with a limitation',compression:'unsupported'} as const;

const hexColor=z.string().regex(/^#[0-9a-f]{6}$/i);
export const flowSpecSchema=z.object({
 id:z.string().min(1).max(100),
 version:z.number().int().positive(),
 allowedFillColors:z.array(hexColor).min(1).max(50),
 allowedStrokeColors:z.array(hexColor).min(1).max(50),
 minNodeWidth:z.number().positive(),
 maxNodeWidth:z.number().positive(),
 minNodeHeight:z.number().positive(),
 maxNodeHeight:z.number().positive(),
 minDecisionBranches:z.number().int().min(1).max(10),
 requireDecisionEdgeLabels:z.boolean(),
 reportIsolatedNodes:z.boolean(),
}).superRefine((value,ctx)=>{
 if(value.minNodeWidth>value.maxNodeWidth)ctx.addIssue({code:'custom',path:['minNodeWidth'],message:'最小宽度不能大于最大宽度'});
 if(value.minNodeHeight>value.maxNodeHeight)ctx.addIssue({code:'custom',path:['minNodeHeight'],message:'最小高度不能大于最大高度'});
});
export type FlowSpec=z.infer<typeof flowSpecSchema>;
export const DEFAULT_FLOW_SPEC:FlowSpec=Object.freeze(flowSpecSchema.parse({
 id:'slash-default-flow',version:1,
 allowedFillColors:['#ffffff','#dae8fc','#d5e8d4','#fff2cc','#f8cecc','#e1d5e7'],
 allowedStrokeColors:['#000000','#6c8ebf','#82b366','#d6b656','#b85450','#9673a6'],
 minNodeWidth:40,maxNodeWidth:480,minNodeHeight:30,maxNodeHeight:240,
 minDecisionBranches:2,requireDecisionEdgeLabels:true,reportIsolatedNodes:true,
}));

export type FlowShape='rectangle'|'rounded'|'ellipse'|'rhombus'|'text'|'unsupported';
export type FlowLimitation={code:'COMPRESSED_DIAGRAM_UNSUPPORTED'|'COMPLEX_SHAPE_UNSUPPORTED'|'USER_OBJECT_UNSUPPORTED'|'NESTED_VERTEX_UNSUPPORTED'|'HTML_LABEL_FLATTENED'|'EDGE_WAYPOINTS_IGNORED'|'SELF_LOOP_UNSUPPORTED'|'UNSAFE_COLOR_REPLACED';message:string;diagramId?:string;cellId?:string};
export type FlowIssue={code:'MISSING_ROOT_CELL'|'MISSING_DEFAULT_LAYER'|'MISSING_CELL_ID'|'DUPLICATE_CELL_ID'|'INVALID_PARENT'|'INVALID_CELL_TYPE'|'MISSING_GEOMETRY'|'INVALID_GEOMETRY'|'FILL_COLOR_NOT_ALLOWED'|'STROKE_COLOR_NOT_ALLOWED'|'NODE_SIZE_OUT_OF_RANGE'|'DECISION_BRANCH_COUNT'|'DECISION_EDGE_LABEL_REQUIRED'|'ISOLATED_NODE'|'DANGLING_EDGE';severity:'error'|'warning';message:string;diagramId:string;cellId?:string};
export type FlowVertex={id:string;label:string;shape:FlowShape;x:number;y:number;width:number;height:number;fillColor:string;strokeColor:string;fontColor:string;parent:string;style:Record<string,string>;supported:boolean};
export type FlowEdge={id:string;label:string;source:string|null;target:string|null;strokeColor:string;style:Record<string,string>;orthogonal:boolean};
export type FlowDiagram={id:string;name:string;supported:boolean;vertices:FlowVertex[];edges:FlowEdge[];issues:FlowIssue[];limitations:FlowLimitation[]};
export type FlowDocument={format:'drawio';diagrams:FlowDiagram[];limitations:FlowLimitation[]};
export type FlowCheckReport={valid:boolean;specId:string;specVersion:number;issues:FlowIssue[];counts:{diagrams:number;vertices:number;edges:number;errors:number;warnings:number}};
export type FlowSvgPreview={diagramId:string;name:string;svg:string|null;limitations:FlowLimitation[]};
export type FlowProcessResult={document:FlowDocument;report:FlowCheckReport;previews:FlowSvgPreview[]};

type XmlNode={name:string;attributes:Record<string,string>;children:XmlNode[];text:string};

function decodeXml(value:string){
 const valid=/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi;const stripped=value.replace(valid,'');if(stripped.includes('&'))throw Error('INVALID_XML_ENTITY: 只允许 XML 预定义实体和数字字符引用');
 return value.replace(valid,entity=>{const key=entity.slice(1,-1).toLowerCase();if(key==='amp')return'&';if(key==='lt')return'<';if(key==='gt')return'>';if(key==='quot')return'"';if(key==='apos')return"'";const point=key.startsWith('#x')?Number.parseInt(key.slice(2),16):Number.parseInt(key.slice(1),10);const allowed=point===0x9||point===0xa||point===0xd||(point>=0x20&&point<=0xd7ff)||(point>=0xe000&&point<=0xfffd)||(point>=0x10000&&point<=0x10ffff);if(!Number.isInteger(point)||!allowed)throw Error('INVALID_XML_ENTITY: 数字字符引用无效');return String.fromCodePoint(point);});
}

function findTagEnd(xml:string,start:number){let quote='';for(let index=start;index<xml.length;index++){const char=xml[index];if(quote){if(char===quote)quote='';continue;}if(char==='"'||char==="'"){quote=char;continue;}if(char==='>')return index;}throw Error('INVALID_XML: 标签未闭合');}

function parseTag(source:string){
 let index=0;const skip=()=>{while(index<source.length&&/\s/.test(source[index]))index++;};skip();const nameMatch=/^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(index));if(!nameMatch)throw Error('INVALID_XML: 标签名无效');const name=nameMatch[0];index+=name.length;const attributes:Record<string,string>={};
 while(index<source.length){skip();if(index>=source.length)break;const attribute=/^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(index));if(!attribute)throw Error('INVALID_XML: 属性名无效');const key=attribute[0];index+=key.length;skip();if(source[index]!=='=')throw Error('INVALID_XML: 属性必须使用等号');index++;skip();const quote=source[index];if(quote!=='"'&&quote!=="'")throw Error('INVALID_XML: 属性值必须加引号');index++;const end=source.indexOf(quote,index);if(end<0)throw Error('INVALID_XML: 属性值未闭合');if(Object.hasOwn(attributes,key))throw Error(`INVALID_XML: 属性 ${key} 重复`);attributes[key]=decodeXml(source.slice(index,end));index=end+1;if(Object.keys(attributes).length>FLOW_PARSE_LIMITS.maxAttributes)throw Error('XML_LIMIT_EXCEEDED: 单个标签属性过多');
 }
 return{name,attributes};
}

function parseSafeXml(xml:string):XmlNode{
 if(xml.length>FLOW_PARSE_LIMITS.maxCharacters)throw Error(`XML_LIMIT_EXCEEDED: XML 超过 ${FLOW_PARSE_LIMITS.maxCharacters} 字符`);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml))throw Error('INVALID_XML: 包含 XML 1.0 禁止的控制字符');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('UNSAFE_XML_DECLARATION: 禁止 DOCTYPE 和实体声明');
 const roots:XmlNode[]=[];const stack:XmlNode[]=[];let nodes=0,index=0,outerText='';
 while(index<xml.length){const open=xml.indexOf('<',index);if(open<0){const text=decodeXml(xml.slice(index));if(stack.length)stack.at(-1)!.text+=text;else outerText+=text;break;}const text=decodeXml(xml.slice(index,open));if(stack.length)stack.at(-1)!.text+=text;else outerText+=text;
  if(xml.startsWith('<!--',open)){const end=xml.indexOf('-->',open+4);if(end<0)throw Error('INVALID_XML: 注释未闭合');index=end+3;continue;}
  if(xml.startsWith('<?',open)){const end=xml.indexOf('?>',open+2);if(end<0)throw Error('INVALID_XML: 处理指令未闭合');index=end+2;continue;}
  if(xml.startsWith('<![CDATA[',open))throw Error('UNSUPPORTED_XML_CDATA: 不支持 CDATA');if(xml.startsWith('<!',open))throw Error('UNSAFE_XML_DECLARATION: 禁止声明节点');
  const end=findTagEnd(xml,open+1);let content=xml.slice(open+1,end).trim();
  if(content.startsWith('/')){const closing=content.slice(1).trim();const current=stack.pop();if(!current||current.name!==closing)throw Error(`INVALID_XML: 关闭标签 ${closing} 不匹配`);}
  else{const selfClosing=content.endsWith('/');if(selfClosing)content=content.slice(0,-1).trim();const parsed=parseTag(content);const node:XmlNode={...parsed,children:[],text:''};nodes++;if(nodes>FLOW_PARSE_LIMITS.maxNodes)throw Error(`XML_LIMIT_EXCEEDED: XML 节点超过 ${FLOW_PARSE_LIMITS.maxNodes}`);if(stack.length)stack.at(-1)!.children.push(node);else roots.push(node);if(!selfClosing){stack.push(node);if(stack.length>FLOW_PARSE_LIMITS.maxDepth)throw Error(`XML_LIMIT_EXCEEDED: XML 深度超过 ${FLOW_PARSE_LIMITS.maxDepth}`);}}
  index=end+1;
 }
 if(stack.length)throw Error(`INVALID_XML: 标签 ${stack.at(-1)!.name} 未闭合`);if(roots.length!==1||outerText.trim())throw Error('INVALID_XML: XML 必须只有一个根元素');return roots[0];
}

function descendants(node:XmlNode,name:string):XmlNode[]{const result:XmlNode[]=[];const visit=(item:XmlNode)=>{if(item.name===name)result.push(item);for(const child of item.children)visit(child);};visit(node);return result;}
function child(node:XmlNode,name:string){return node.children.find(item=>item.name===name);}
function styleMap(value=''){const result:Record<string,string>={};for(const token of value.split(';').map(item=>item.trim()).filter(Boolean)){const equals=token.indexOf('=');if(equals<0){if(!result.shape)result.shape=token;}else result[token.slice(0,equals)]=token.slice(equals+1);}return result;}
function number(value:string|undefined,fallback=Number.NaN){if(value===undefined)return fallback;const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function plainLabel(value:string,html:boolean){if(!html)return value.replace(/\s+/g,' ').trim();return value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:div|p|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
function normalizedColor(value:string|undefined,fallback:string,limitations:FlowLimitation[],diagramId:string,cellId:string){if(!value||value==='default')return fallback;const lower=value.toLowerCase();if(lower==='none'||/^#[0-9a-f]{6}$/.test(lower))return lower;limitations.push({code:'UNSAFE_COLOR_REPLACED',message:`颜色 ${value} 不在静态预览安全子集内，已使用默认色`,diagramId,cellId});return fallback;}
function shapeFor(style:Record<string,string>):FlowShape{const shape=(style.shape||'').toLowerCase();if(shape==='ellipse')return'ellipse';if(shape==='rhombus')return'rhombus';if(shape==='text')return'text';if(!shape||shape==='rectangle')return style.rounded==='1'?'rounded':'rectangle';return'unsupported';}

function emptyDiagram(id:string,name:string,supported=true):FlowDiagram{return{id,name,supported,vertices:[],edges:[],issues:[],limitations:[]};}
function issue(diagram:FlowDiagram,code:FlowIssue['code'],severity:FlowIssue['severity'],message:string,cellId?:string){diagram.issues.push({code,severity,message,diagramId:diagram.id,cellId});}
function limitation(diagram:FlowDiagram,code:FlowLimitation['code'],message:string,cellId?:string){diagram.limitations.push({code,message,diagramId:diagram.id,cellId});}

function parseGraph(graph:XmlNode,id:string,name:string){
 const diagram=emptyDiagram(id,name);if(descendants(graph,'object').length||descendants(graph,'UserObject').length)limitation(diagram,'USER_OBJECT_UNSUPPORTED','object/UserObject 包装节点不在首版支持范围');const cells=descendants(graph,'mxCell');const byId=new Map<string,XmlNode>();
 for(const cell of cells){const cellId=cell.attributes.id;if(!cellId){issue(diagram,'MISSING_CELL_ID','error','mxCell 缺少 id');continue;}if(byId.has(cellId)){issue(diagram,'DUPLICATE_CELL_ID','error',`mxCell id ${cellId} 重复`,cellId);continue;}byId.set(cellId,cell);}
 if(!byId.has('0'))issue(diagram,'MISSING_ROOT_CELL','error','缺少根 mxCell id=0');if(!byId.has('1'))issue(diagram,'MISSING_DEFAULT_LAYER','error','缺少默认图层 mxCell id=1');
 for(const [cellId,cell] of byId){if(cellId!=='0'){const parent=cell.attributes.parent;if(!parent||!byId.has(parent))issue(diagram,'INVALID_PARENT','error',`父节点 ${parent||'空'} 不存在`,cellId);}const vertex=cell.attributes.vertex==='1',edge=cell.attributes.edge==='1';if(vertex&&edge)issue(diagram,'INVALID_CELL_TYPE','error','mxCell 不能同时是 vertex 和 edge',cellId);}
 const vertexIds=new Set([...byId].filter(([,cell])=>cell.attributes.vertex==='1').map(([cellId])=>cellId));
 for(const [cellId,cell] of byId){const isVertex=cell.attributes.vertex==='1',isEdge=cell.attributes.edge==='1';if(!isVertex&&!isEdge)continue;const style=styleMap(cell.attributes.style);const html=style.html==='1';const label=plainLabel(cell.attributes.value??'',html);if(html&&/<[^>]+>/.test(cell.attributes.value??''))limitation(diagram,'HTML_LABEL_FLATTENED','HTML 标签已安全降级为纯文本',cellId);
  if(isVertex){const geometry=child(cell,'mxGeometry');if(!geometry){issue(diagram,'MISSING_GEOMETRY','error','节点缺少 mxGeometry',cellId);continue;}const x=number(geometry.attributes.x,0),y=number(geometry.attributes.y,0),width=number(geometry.attributes.width),height=number(geometry.attributes.height);const validGeometry=[x,y,width,height].every(value=>Number.isFinite(value)&&Math.abs(value)<=1_000_000)&&width>0&&height>0;if(!validGeometry)issue(diagram,'INVALID_GEOMETRY','error','节点坐标或尺寸无效',cellId);let shape=shapeFor(style),supported=shape!=='unsupported'&&validGeometry;if(shape==='unsupported')limitation(diagram,'COMPLEX_SHAPE_UNSUPPORTED',`形状 ${style.shape||'未知'} 不在首版静态预览子集`,cellId);const parent=cell.attributes.parent??'';if(vertexIds.has(parent)){limitation(diagram,'NESTED_VERTEX_UNSUPPORTED','嵌套节点坐标不在首版静态预览范围',cellId);supported=false;}const fillColor=normalizedColor(style.fillColor,shape==='text'?'none':'#ffffff',diagram.limitations,id,cellId);const strokeColor=normalizedColor(style.strokeColor,shape==='text'?'none':'#000000',diagram.limitations,id,cellId);const fontColor=normalizedColor(style.fontColor,'#000000',diagram.limitations,id,cellId);diagram.vertices.push({id:cellId,label,shape,x,y,width,height,fillColor,strokeColor,fontColor,parent,style,supported});}
  if(isEdge){const geometry=child(cell,'mxGeometry');if(geometry&&descendants(geometry,'mxPoint').length)limitation(diagram,'EDGE_WAYPOINTS_IGNORED','自定义路由点已忽略，静态预览使用直线或正交折线',cellId);const source=cell.attributes.source??null,target=cell.attributes.target??null;if(source&&target&&source===target)limitation(diagram,'SELF_LOOP_UNSUPPORTED','自环连线不在首版静态预览范围',cellId);diagram.edges.push({id:cellId,label,source,target,strokeColor:normalizedColor(style.strokeColor,'#000000',diagram.limitations,id,cellId),style,orthogonal:/orthogonal/i.test(style.edgeStyle??'')});}
 }
 return diagram;
}

export function parseDrawioXml(xml:string):FlowDocument{
 const root=parseSafeXml(xml);const diagrams:FlowDiagram[]=[];
 if(root.name==='mxGraphModel')diagrams.push(parseGraph(root,'page-1','第 1 页'));
 else if(root.name==='mxfile'){
  const pages=root.children.filter(item=>item.name==='diagram');if(!pages.length)throw Error('INVALID_DRAWIO: mxfile 不含 diagram');for(let index=0;index<pages.length;index++){const page=pages[index];const id=page.attributes.id||`page-${index+1}`,name=page.attributes.name||`第 ${index+1} 页`;const graph=page.children.find(item=>item.name==='mxGraphModel');if(graph)diagrams.push(parseGraph(graph,id,name));else{const diagram=emptyDiagram(id,name,false);limitation(diagram,'COMPRESSED_DIAGRAM_UNSUPPORTED','diagram 未包含直接 mxGraphModel；压缩 draw.io 内容需先在 diagrams.net 中关闭压缩保存');diagrams.push(diagram);}}
 }else throw Error('INVALID_DRAWIO: 根元素必须是 mxfile 或 mxGraphModel');
 return{format:'drawio',diagrams,limitations:diagrams.flatMap(diagram=>diagram.limitations)};
}

export function checkFlowDocument(document:FlowDocument,specInput:FlowSpec=DEFAULT_FLOW_SPEC):FlowCheckReport{
 const spec=flowSpecSchema.parse(specInput);const issues=document.diagrams.flatMap(diagram=>[...diagram.issues]);const fills=new Set(spec.allowedFillColors.map(color=>color.toLowerCase())),strokes=new Set(spec.allowedStrokeColors.map(color=>color.toLowerCase()));
 for(const diagram of document.diagrams){const supported=new Map(diagram.vertices.filter(vertex=>vertex.supported).map(vertex=>[vertex.id,vertex]));const degree=new Map([...supported.keys()].map(id=>[id,0]));
  for(const vertex of supported.values()){if(vertex.shape!=='text'&&!fills.has(vertex.fillColor.toLowerCase()))issues.push({code:'FILL_COLOR_NOT_ALLOWED',severity:'error',message:`填充色 ${vertex.fillColor} 不符合规范`,diagramId:diagram.id,cellId:vertex.id});if(vertex.shape!=='text'&&!strokes.has(vertex.strokeColor.toLowerCase()))issues.push({code:'STROKE_COLOR_NOT_ALLOWED',severity:'error',message:`边框色 ${vertex.strokeColor} 不符合规范`,diagramId:diagram.id,cellId:vertex.id});if(vertex.width<spec.minNodeWidth||vertex.width>spec.maxNodeWidth||vertex.height<spec.minNodeHeight||vertex.height>spec.maxNodeHeight)issues.push({code:'NODE_SIZE_OUT_OF_RANGE',severity:'error',message:`节点尺寸 ${vertex.width}×${vertex.height} 超出规范`,diagramId:diagram.id,cellId:vertex.id});}
  for(const edge of diagram.edges){if(!edge.source||!edge.target||!supported.has(edge.source)||!supported.has(edge.target)){issues.push({code:'DANGLING_EDGE',severity:'error',message:'连线缺少有效 source 或 target',diagramId:diagram.id,cellId:edge.id});continue;}degree.set(edge.source,(degree.get(edge.source)??0)+1);degree.set(edge.target,(degree.get(edge.target)??0)+1);if(!strokes.has(edge.strokeColor.toLowerCase()))issues.push({code:'STROKE_COLOR_NOT_ALLOWED',severity:'error',message:`连线颜色 ${edge.strokeColor} 不符合规范`,diagramId:diagram.id,cellId:edge.id});}
  for(const vertex of supported.values()){if(vertex.shape==='rhombus'){const outgoing=diagram.edges.filter(edge=>edge.source===vertex.id&&edge.target&&supported.has(edge.target));if(outgoing.length<spec.minDecisionBranches)issues.push({code:'DECISION_BRANCH_COUNT',severity:'error',message:`判断节点至少需要 ${spec.minDecisionBranches} 条有效出边`,diagramId:diagram.id,cellId:vertex.id});if(spec.requireDecisionEdgeLabels)for(const edge of outgoing)if(!edge.label.trim())issues.push({code:'DECISION_EDGE_LABEL_REQUIRED',severity:'error',message:'判断节点的出边必须标注条件',diagramId:diagram.id,cellId:edge.id});}if(spec.reportIsolatedNodes&&vertex.shape!=='text'&&(degree.get(vertex.id)??0)===0)issues.push({code:'ISOLATED_NODE',severity:'warning',message:'节点没有任何有效连线',diagramId:diagram.id,cellId:vertex.id});}
 }
 const errors=issues.filter(item=>item.severity==='error').length,warnings=issues.length-errors;return{valid:errors===0,specId:spec.id,specVersion:spec.version,issues,counts:{diagrams:document.diagrams.length,vertices:document.diagrams.reduce((sum,item)=>sum+item.vertices.length,0),edges:document.diagrams.reduce((sum,item)=>sum+item.edges.length,0),errors,warnings}};
}

function escapeSvg(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function labelSvg(label:string,x:number,y:number,color:string){const lines=label.split(/\n/).filter(Boolean);if(!lines.length)return'';const start=y-(lines.length-1)*7;return`<text x="${x}" y="${start}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="12" fill="${color}">${lines.map((line,index)=>`<tspan x="${x}" dy="${index===0?0:14}">${escapeSvg(line)}</tspan>`).join('')}</text>`;}

type Point={x:number;y:number};
function vertexCenter(vertex:FlowVertex):Point{return{x:vertex.x+vertex.width/2,y:vertex.y+vertex.height/2};}
function boundaryAnchor(vertex:FlowVertex,toward:Point):Point{
 const center=vertexCenter(vertex),dx=toward.x-center.x,dy=toward.y-center.y,rx=vertex.width/2,ry=vertex.height/2;if(dx===0&&dy===0)return center;
 let scale:number;if(vertex.shape==='ellipse')scale=1/Math.sqrt((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry));else if(vertex.shape==='rhombus')scale=1/(Math.abs(dx)/rx+Math.abs(dy)/ry);else scale=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
 return{x:center.x+dx*scale,y:center.y+dy*scale};
}
function orthogonalAnchors(source:FlowVertex,target:FlowVertex):{start:Point;end:Point}{
 const from=vertexCenter(source),to=vertexCenter(target),dx=to.x-from.x,dy=to.y-from.y;if(Math.abs(dx)>=Math.abs(dy)){const direction=dx>=0?1:-1;return{start:{x:from.x+direction*source.width/2,y:from.y},end:{x:to.x-direction*target.width/2,y:to.y}};}const direction=dy>=0?1:-1;return{start:{x:from.x,y:from.y+direction*source.height/2},end:{x:to.x,y:to.y-direction*target.height/2}};
}
function segmentCrossesVertex(a:Point,b:Point,vertex:FlowVertex){
 const left=vertex.x,right=vertex.x+vertex.width,top=vertex.y,bottom=vertex.y+vertex.height;if(a.x===b.x)return a.x>left&&a.x<right&&Math.max(Math.min(a.y,b.y),top)<Math.min(Math.max(a.y,b.y),bottom);if(a.y===b.y)return a.y>top&&a.y<bottom&&Math.max(Math.min(a.x,b.x),left)<Math.min(Math.max(a.x,b.x),right);return true;
}
function routeIsClear(points:Point[],obstacles:FlowVertex[]){for(let index=1;index<points.length;index++)for(const obstacle of obstacles)if(segmentCrossesVertex(points[index-1],points[index],obstacle))return false;return true;}
function compactRoute(points:Point[]){return points.filter((point,index)=>index===0||point.x!==points[index-1].x||point.y!==points[index-1].y);}
function routeLength(points:Point[]){let length=0;for(let index=1;index<points.length;index++)length+=Math.abs(points[index].x-points[index-1].x)+Math.abs(points[index].y-points[index-1].y);return length;}
function orthogonalRoute(source:FlowVertex,target:FlowVertex,vertices:FlowVertex[]):Point[]{
 const direct=orthogonalAnchors(source,target),middle=(direct.start.x+direct.end.x)/2,simple=compactRoute([direct.start,{x:middle,y:direct.start.y},{x:middle,y:direct.end.y},direct.end]),obstacles=vertices.filter(vertex=>vertex.id!==source.id&&vertex.id!==target.id);if(routeIsClear(simple,obstacles))return simple;
 const margin=30,minX=Math.min(...vertices.map(vertex=>vertex.x))-margin,maxX=Math.max(...vertices.map(vertex=>vertex.x+vertex.width))+margin,minY=Math.min(...vertices.map(vertex=>vertex.y))-margin,maxY=Math.max(...vertices.map(vertex=>vertex.y+vertex.height))+margin;const sourceCenter=vertexCenter(source),targetCenter=vertexCenter(target);const horizontal=[minY,maxY].map(y=>{const start=boundaryAnchor(source,{x:sourceCenter.x,y}),end=boundaryAnchor(target,{x:targetCenter.x,y});return compactRoute([start,{x:start.x,y},{x:end.x,y},end]);});const vertical=[minX,maxX].map(x=>{const start=boundaryAnchor(source,{x,y:sourceCenter.y}),end=boundaryAnchor(target,{x,y:targetCenter.y});return compactRoute([start,{x,y:start.y},{x,y:end.y},end]);});const safe=[...horizontal,...vertical].filter(route=>routeIsClear(route,obstacles)).sort((a,b)=>routeLength(a)-routeLength(b));return safe[0]??simple;
}
function routeLabelPoint(points:Point[]):Point{let bestStart=points[0],bestEnd=points.at(-1)!,bestLength=-1;for(let index=1;index<points.length;index++){const start=points[index-1],end=points[index],length=Math.abs(end.x-start.x)+Math.abs(end.y-start.y);if(length>bestLength){bestStart=start;bestEnd=end;bestLength=length;}}return{x:(bestStart.x+bestEnd.x)/2,y:(bestStart.y+bestEnd.y)/2-10};}

export function renderFlowSvg(diagram:FlowDiagram):FlowSvgPreview{
 if(!diagram.supported)return{diagramId:diagram.id,name:diagram.name,svg:null,limitations:[...diagram.limitations]};const vertices=diagram.vertices.filter(vertex=>vertex.supported);if(!vertices.length)return{diagramId:diagram.id,name:diagram.name,svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><text x="160" y="90" text-anchor="middle">没有可预览的受支持节点</text></svg>',limitations:[...diagram.limitations]};const minX=Math.min(...vertices.map(vertex=>vertex.x))-30,minY=Math.min(...vertices.map(vertex=>vertex.y))-30,maxX=Math.max(...vertices.map(vertex=>vertex.x+vertex.width))+30,maxY=Math.max(...vertices.map(vertex=>vertex.y+vertex.height))+30;const byId=new Map(vertices.map(vertex=>[vertex.id,vertex]));const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${Math.max(1,maxX-minX)} ${Math.max(1,maxY-minY)}" role="img" aria-labelledby="flow-title">`,`<title id="flow-title">${escapeSvg(diagram.name)}</title>`,'<defs><marker id="flow-arrow" markerWidth="10" markerHeight="6" viewBox="0 0 10 6" refX="9" refY="3" orient="auto" markerUnits="strokeWidth" overflow="visible"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>'];
 for(const edge of diagram.edges){if(!edge.source||!edge.target||edge.source===edge.target)continue;const source=byId.get(edge.source),target=byId.get(edge.target);if(!source||!target)continue;const from=vertexCenter(source),to=vertexCenter(target),route=edge.orthogonal?orthogonalRoute(source,target,vertices):[boundaryAnchor(source,to),boundaryAnchor(target,from)],start=route[0],end=route.at(-1)!;const d=route.map((point,index)=>`${index===0?'M':'L'} ${point.x} ${point.y}`).join(' ');parts.push(`<path data-cell-id="${escapeSvg(edge.id)}" d="${d}" fill="none" stroke="${edge.strokeColor}" stroke-width="2" marker-end="url(#flow-arrow)"/>`);if(edge.label){const position=routeLabelPoint(route);parts.push(labelSvg(edge.label,position.x,position.y,'#000000'));}}
 for(const vertex of vertices){const id=escapeSvg(vertex.id),cx=vertex.x+vertex.width/2,cy=vertex.y+vertex.height/2;if(vertex.shape==='ellipse')parts.push(`<ellipse data-cell-id="${id}" cx="${cx}" cy="${cy}" rx="${vertex.width/2}" ry="${vertex.height/2}" fill="${vertex.fillColor}" stroke="${vertex.strokeColor}" stroke-width="2"/>`);else if(vertex.shape==='rhombus')parts.push(`<polygon data-cell-id="${id}" points="${cx},${vertex.y} ${vertex.x+vertex.width},${cy} ${cx},${vertex.y+vertex.height} ${vertex.x},${cy}" fill="${vertex.fillColor}" stroke="${vertex.strokeColor}" stroke-width="2"/>`);else if(vertex.shape!=='text')parts.push(`<rect data-cell-id="${id}" x="${vertex.x}" y="${vertex.y}" width="${vertex.width}" height="${vertex.height}" rx="${vertex.shape==='rounded'?12:0}" fill="${vertex.fillColor}" stroke="${vertex.strokeColor}" stroke-width="2"/>`);parts.push(labelSvg(vertex.label,cx,cy,vertex.fontColor));}
 parts.push('</svg>');return{diagramId:diagram.id,name:diagram.name,svg:parts.join(''),limitations:[...diagram.limitations]};
}

export function processDrawio(xml:string,spec:FlowSpec=DEFAULT_FLOW_SPEC):FlowProcessResult{const document=parseDrawioXml(xml);return{document,report:checkFlowDocument(document,spec),previews:document.diagrams.map(renderFlowSvg)};}

export const DEFAULT_DRAWIO_TEMPLATE_XML=`<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="slash" version="1">
  <diagram id="business-flow" name="业务流程">
    <mxGraphModel grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="start" value="开始" style="shape=ellipse;whiteSpace=wrap;html=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="40" y="100" width="100" height="50" as="geometry"/></mxCell>
        <mxCell id="submit" value="提交申请" style="shape=rectangle;rounded=1;whiteSpace=wrap;html=0;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="190" y="90" width="120" height="70" as="geometry"/></mxCell>
        <mxCell id="decision" value="资料完整" style="shape=rhombus;whiteSpace=wrap;html=0;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="370" y="85" width="110" height="80" as="geometry"/></mxCell>
        <mxCell id="end" value="完成" style="shape=ellipse;whiteSpace=wrap;html=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="550" y="40" width="100" height="50" as="geometry"/></mxCell>
        <mxCell id="revise" value="补充资料" style="shape=rectangle;rounded=1;whiteSpace=wrap;html=0;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="540" y="150" width="120" height="60" as="geometry"/></mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#000000;" edge="1" parent="1" source="start" target="submit"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#000000;" edge="1" parent="1" source="submit" target="decision"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e3" value="是" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#000000;" edge="1" parent="1" source="decision" target="end"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e4" value="否" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#000000;" edge="1" parent="1" source="decision" target="revise"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e5" value="重新提交" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#000000;" edge="1" parent="1" source="revise" target="submit"><mxGeometry relative="1" as="geometry"/></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

export function createDrawioTemplate(options:{diagramId?:string;name?:string}={}){const diagramId=options.diagramId??'business-flow',name=options.name??'业务流程';if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(diagramId))throw Error('INVALID_DIAGRAM_ID');if(!name.trim()||name.length>100||/[\u0000-\u001f]/.test(name))throw Error('INVALID_DIAGRAM_NAME');return DEFAULT_DRAWIO_TEMPLATE_XML.replace('id="business-flow"',`id="${diagramId}"`).replace('name="业务流程"',`name="${escapeSvg(name)}"`);}

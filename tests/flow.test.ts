import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DRAWIO_TEMPLATE_XML,DEFAULT_FLOW_SPEC,createDrawioTemplate,parseDrawioXml,processDrawio,renderFlowSvg} from '../main/flow.js';

test('默认模板形成未压缩 draw.io 解析、规范检查和 SVG 预览闭环',()=>{
 const result=processDrawio(DEFAULT_DRAWIO_TEMPLATE_XML);assert.equal(result.document.diagrams.length,1);assert.equal(result.report.valid,true);assert.equal(result.report.counts.vertices,5);assert.equal(result.report.counts.edges,5);const svg=result.previews[0].svg??'';assert.match(svg,/<svg/);assert.match(svg,/<rect/);assert.match(svg,/<ellipse/);assert.match(svg,/<polygon/);assert.match(svg,/<path/);assert.match(svg,/提交申请/);assert.match(svg,/data-cell-id="e3"/);assert.deepEqual(result.document.limitations,[]);
});

test('规范检查发现颜色、尺寸、判断出边标签、孤立节点和悬空连线',()=>{
 const xml=`<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="decision" value="判断" style="shape=rhombus;fillColor=#123456;strokeColor=#654321;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="20" height="10" as="geometry"/></mxCell><mxCell id="target" value="目标" vertex="1" parent="1"><mxGeometry x="100" y="10" width="100" height="50" as="geometry"/></mxCell><mxCell id="isolated" value="孤立" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="50" as="geometry"/></mxCell><mxCell id="edge" edge="1" parent="1" source="decision" target="target"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="dangling" edge="1" parent="1" source="target" target="missing"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`;const result=processDrawio(xml);const codes=new Set(result.report.issues.map(item=>item.code));for(const code of ['FILL_COLOR_NOT_ALLOWED','STROKE_COLOR_NOT_ALLOWED','NODE_SIZE_OUT_OF_RANGE','DECISION_BRANCH_COUNT','DECISION_EDGE_LABEL_REQUIRED','ISOLATED_NODE','DANGLING_EDGE'])assert.equal(codes.has(code as never),true,`缺少 ${code}`);assert.equal(result.report.valid,false);
});

test('拒绝 DOCTYPE、实体和畸形 XML',()=>{
 assert.throws(()=>parseDrawioXml('<!DOCTYPE mxfile [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><mxfile/>'),/UNSAFE_XML_DECLARATION/);assert.throws(()=>parseDrawioXml('<mxGraphModel><root><mxCell id="&unknown;"/></root></mxGraphModel>'),/INVALID_XML_ENTITY/);assert.throws(()=>parseDrawioXml('<mxGraphModel><root><mxCell id="&#0;"/></root></mxGraphModel>'),/INVALID_XML_ENTITY/);assert.throws(()=>parseDrawioXml('<mxGraphModel><root></mxGraphModel>'),/INVALID_XML/);
});

test('压缩 diagram 和复杂形状明确返回限制且不误渲染',()=>{
 const compressed=parseDrawioXml('<mxfile><diagram id="compressed" name="压缩">jVBLDoMgED3N7BE2</diagram></mxfile>');assert.equal(compressed.diagrams[0].supported,false);assert.equal(compressed.limitations[0].code,'COMPRESSED_DIAGRAM_UNSUPPORTED');assert.equal(renderFlowSvg(compressed.diagrams[0]).svg,null);
 const complex=processDrawio('<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cloud" value="云" style="shape=cloud;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="70" as="geometry"/></mxCell></root></mxGraphModel>');assert.equal(complex.document.limitations.some(item=>item.code==='COMPLEX_SHAPE_UNSUPPORTED'),true);assert.doesNotMatch(complex.previews[0].svg??'',/>云</);
});

test('模板工厂输出可编辑 XML 并校验 diagram id',()=>{const xml=createDrawioTemplate({diagramId:'approval-v2',name:'准入审批'});assert.match(xml,/id="approval-v2"/);assert.match(xml,/name="准入审批"/);assert.equal(processDrawio(xml,DEFAULT_FLOW_SPEC).report.valid,true);assert.throws(()=>createDrawioTemplate({diagramId:'bad id'}),/INVALID_DIAGRAM_ID/);});

test('独立文本节点和 none 颜色属于安全支持子集',()=>{const result=processDrawio('<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="note" value="说明文字" style="shape=text;fillColor=none;strokeColor=none;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="40" as="geometry"/></mxCell></root></mxGraphModel>');assert.match(result.previews[0].svg??'',/说明文字/);assert.equal(result.document.limitations.some(item=>item.code==='UNSAFE_COLOR_REPLACED'),false);});

test('直线与正交线使用形状边界锚点，箭头不落入目标节点中心',()=>{
 const straight=processDrawio('<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="ellipse" style="shape=ellipse;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="60" as="geometry"/></mxCell><mxCell id="diamond" style="shape=rhombus;" vertex="1" parent="1"><mxGeometry x="200" y="0" width="100" height="60" as="geometry"/></mxCell><mxCell id="straight" edge="1" parent="1" source="ellipse" target="diamond"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>').previews[0].svg??'';
 assert.match(straight,/data-cell-id="straight" d="M 100 30 L 200 30"/);assert.doesNotMatch(straight,/L 250 30/);
 const orthogonal=processDrawio(DEFAULT_DRAWIO_TEMPLATE_XML).previews[0].svg??'';assert.match(orthogonal,/data-cell-id="e3" d="M 480 125 L 515 125 L 515 65 L 550 65"/);
});

test('正交返回边绕开无关节点，默认模板每段均不穿过节点内部',()=>{
 const result=processDrawio(DEFAULT_DRAWIO_TEMPLATE_XML),diagram=result.document.diagrams[0],svg=result.previews[0].svg??'';const pathPattern=/<path data-cell-id="([^"]+)" d="([^"]+)"/g;const paths:Map<string,Array<{x:number;y:number}>>=new Map([...svg.matchAll(pathPattern)].map(match=>[match[1],[...match[2].matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map(point=>({x:Number(point[1]),y:Number(point[2])}))]));
 assert.match(svg,/data-cell-id="e5" d="M 600 210 L 600 240 L 250 240 L 250 160"/);
 for(const edge of diagram.edges){const points=paths.get(edge.id);assert.ok(points,`缺少连线 ${edge.id}`);const obstacles=diagram.vertices.filter(vertex=>vertex.id!==edge.source&&vertex.id!==edge.target);for(let index=1;index<points.length;index++){const start:{x:number;y:number}=points[index-1];const end:{x:number;y:number}=points[index];for(const vertex of obstacles){const horizontal:boolean=start.y===end.y&&start.y>vertex.y&&start.y<vertex.y+vertex.height&&Math.max(Math.min(start.x,end.x),vertex.x)<Math.min(Math.max(start.x,end.x),vertex.x+vertex.width);const vertical:boolean=start.x===end.x&&start.x>vertex.x&&start.x<vertex.x+vertex.width&&Math.max(Math.min(start.y,end.y),vertex.y)<Math.min(Math.max(start.y,end.y),vertex.y+vertex.height);assert.equal(horizontal||vertical,false,`${edge.id} 穿过无关节点 ${vertex.id}`);}}
 }
});

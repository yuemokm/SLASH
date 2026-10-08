import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { FileBlob, Presentation, PresentationFile } from '@oai/artifact-tool';
import JSZip from 'jszip';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
process.env.RUNTIME_NODE_MODULES ??= 'C:/Users/yuemokm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const skill = 'C:/Users/yuemokm/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations';
const python = 'C:/Users/yuemokm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const tag = arg('--tag') ?? 'pending-v1';
if (!/^[a-z0-9-]{1,60}$/.test(tag)) throw new Error('Use a simple output tag');
const resultPath = path.resolve(root, arg('--result') ?? 'repair-result.json');
if (!resultPath.startsWith(root + path.sep)) throw new Error('Result JSON must stay in the deliverables directory');
const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
if (!['not_completed', 'pending_review', 'partial_review', 'reviewed'].includes(result.state)) throw new Error('Unknown result state');
if (!Array.isArray(result.rows) || result.rows.length > 4 || result.rows.some(r => !Array.isArray(r) || r.length !== 2 || r.some(t => typeof t !== 'string' || t.length > 80))) throw new Error('Invalid result rows');
for (const k of ['headline', 'summary', 'notice', 'source']) if (typeof result[k] !== 'string' || result[k].length > (k === 'source' ? 2000 : 200)) throw new Error('Invalid result text');
const build = path.join(root, 'build', tag);
const output = path.join(root, 'output', `slash-competition-${tag}.pptx`);
await fs.mkdir(build, { recursive: true });
await fs.mkdir(path.dirname(output), { recursive: true });
try { await fs.access(output); throw new Error('Output already exists, use a new tag'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

// Design choice, verified installed in the bundled renderer before authoring.
const family = 'Microsoft YaHei';
const fontPolicy = { basis: 'design', families: [family] };
const C = { bg: '#FBF8F3', ink: '#262321', accent: '#E85B3A', muted: '#6F6862', rule: '#D8D1CA' };
const pres = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const evidence = [];
function text(slide, value, x, y, w, h, size = 28, color = C.ink, bold = false) {
  const box = slide.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  box.text = value;
  box.text.style = { typeface: family, fontSize: size, color, bold, autoFit: 'none' };
  return box;
}
function slide(title, number, caption, notes) {
  const s = pres.slides.add(); s.background.fill = C.bg;
  text(s, title, 64, 48, 1140, 80, 44, C.ink, true);
  text(s, caption, 64, 664, 1060, 32, 18, C.muted);
  text(s, String(number).padStart(2, '0'), 1160, 662, 56, 32, 18, C.accent, true);
  s.speakerNotes.textFrame.setText(notes);
  return s;
}
async function image(s, name, x, y, w, h, alt, crop) {
  const absolute = path.join(root, 'assets', name);
  const bytes = await fs.readFile(absolute);
  evidence.push({ asset: path.relative(root, absolute), sha256: createHash('sha256').update(bytes).digest('hex'), alt });
  const im=s.images.add({ blob: new Uint8Array(bytes), contentType: 'image/png', alt, fit: crop ? 'cover' : 'contain', position: { left: x, top: y, width: w, height: h } });
  if (crop) im.crop=crop;
  return im;
}
function table(s, values, x, y, widths, height, size = 25) {
  const t = s.tables.add({ rows: values.length, columns: values[0].length, left: x, top: y, width: widths.reduce((a,b)=>a+b,0), height, values, columnWidths: widths });
  t.borders.assign({ style: 'solid', fill: C.rule, width: 1 });
  for(let r=0;r<values.length;r++) for(let c=0;c<values[0].length;c++) {
    const cell=t.getCell(r,c); cell.fill = r===0 ? C.ink : C.bg;
    cell.text.style = { typeface: family, fontSize: size, color: r===0 ? '#FFFFFF' : C.ink, bold: r===0, autoFit: 'none' };
  }
  return t;
}

{
  const s=slide('',1,'比赛演示 · 2026.10.05 · 具体成果与核对范围见第 7 页','依据 docs/competition-demo-outline.md。用户关注落地价值和与成熟 Agent 的区别。各成果修订与独立审核状态以第 7 页为准，不能将 HTML 交互通过解读为全部业务正确。图标来自 public/brand/slash.png。');
  await image(s,'slash.png',64,74,112,112,'slash 官方品牌图标');
  text(s,'slash',202,83,720,120,86,C.ink,true);
  text(s,'产品经理的\n资料到交付工作台',64,254,1100,166,64,C.ink,true);
  text(s,'根据已有资料写需求、做原型，\n用可回查的依据与实际运行证据推进修订。',68,482,1060,100,32,C.muted);
}
{
  const s=slide('机会门店新建：从三份资料开始',2,'实际 0.3.11 隔离产品截图 · 三份成果分别核对，具体修订结果见第 7 页','来源 docs/real-model-business-baseline-2026-10-05.md。三份来源：新增终端流程v2.0.docx、门店运营管理制度-V4.docx、05 网点主数据.xlsx 的 03 机会门店主数据。截图来自 deliverables/competition-2026-10-05/video/assets/footage/01-work.png，是实际 0.3.11 应用隔离演示项目的成果与 PRD 同屏。该截图展示基线文档，不能当作后续新 PRD 已审核的证据。各成果终态和人工复核见第7页备注。');
  text(s,'流程 Word、运营制度 Word、字段 Excel',68,147,1130,51,29,C.accent,true);
  await image(s,'app-work.png',64,219,1136,416,'实际 slash 应用：真实模型基线的 PRD、HTML 与约束对照三份成果');
}
{
  const s=slide('资料有版本，提取文本也有来处',3,'右图：隔离产品功能验证 · 合成审批字段，不代表真实业务已通过','来源 docs/source-freshness-2026-10-05.md、main/processing-provenance.ts，实际截图 .test-data/business-upstream-ui-packaged-1791158683826/original-changed.png。原件、副本、已应用提取输出使用登记回执核对版本，不猜文件名，不验证 Office 语义。截图是合成审批字段的隔离产品功能验证。');
  text(s,'原件保持只读',68,175,700,54,34,C.accent,true);
  text(s,'大资料在副本中处理，\n引用保留提取位置与登记版本。',68,252,694,99,31);
  text(s,'原始资料变了，\n提取文本可能仍然没变。',68,392,694,101,34,C.ink,true);
  text(s,'缺少回执或无权核对时，\n产品如实显示未完整核对。',68,528,690,78,27,C.muted);
  await image(s,'source-changed.png',798,347,410,108,'隔离产品真实截图：提取文本版本有效，但原始资料已变化', { left:0,top:0.58,right:0,bottom:0.30 });
}
{
  const s=slide('一个字段，四种独立约束',4,'来源：05 网点主数据 · 03 机会门店主数据 · A/H/O/P 列及第 2、3 行','来源 .test-data/pm-business-real-2026-10-05T06-28-41-722Z/evidence-text/05 网点主数据.xlsx.03机会门店.txt：A1 第7行仅正式落库，H1第14行必填，O1第21行新增展示，P1第22行后续前端变更。A2第25行是，H2第32行是，O2第39行是，P2第40行否。A3第41行是，H3第48行是，O3第55行是，P3第56行否。F2第30行自动计算，F3第46行手动，G3第47行50。来源 hash45f654aa9abe19b72900bed39d0c38e44a003f2076dc72e86decc754e19abe53。这里只转述原文，各列适用阶段仍需人工确认。');
  table(s,[['字段','A 仅正式落库','H 必填','O 新增展示','P 后续前端变更'],['网点编码','是','是','是','否'],['网点名称','是','是','是','否']],64,167,[218,270,190,220,238],238,27);
  text(s,'编码可以展示，同时由系统自动计算。',68,457,1118,59,32,C.accent,true);
  text(s,'新建时录入名称，与建档后能否改名，是两个问题。\n正式落库与新建阶段的关系仍需确认，候选解释保留未知。',68,535,1115,93,27,C.muted);
}
{
  const s=slide('同一规则，要落实到文档和控件',5,'此页展示真实基线的跨成果发现 · 各成果新稿结论见第 7 页','来源字段文本 F7第107行不允许调整、F8第122行允许调整、K8第127行可编辑。真实基线 PRD.md 第96行 §6.3将定位地址和详细地址均描述为可编辑，违反 F7；HTML 实际定位只读、详细地址可改。截图 .test-data/pm-business-prototype-interaction-final2-20261005/03-location-and-edited-detail.png。基线 PRD hash3c4bf86d3c4b3fc62bdeefd1e32e5d047e42b15a9e1f458fb8bb0d986f4e1539。截图保留旧版本，不把旧校验错误当作最终 HTML 仍存在的缺口；该错误已在最终13项独立交互中复验清除。');
  text(s,'字段依据',68,164,690,44,28,C.accent,true);
  text(s,'F7 定位地址：不允许调整\nF8 详细地址：允许调整',68,225,692,108,32);
  text(s,'实际基线',68,372,690,44,28,C.accent,true);
  text(s,'HTML 控件权限符合两条依据。\nPRD 第 96 行把两种地址混写为可编辑。',68,434,700,110,29);
  text(s,'规则关联成果位置与版本，\n为人工核对提供具体入口。',68,568,706,71,25,C.muted);
  await image(s,'model-address.png',798,239,410,336,'真实基线：定位地址只读，详细地址可编辑；旧错误提示未即时清除', {left:0,top:0.54,right:0,bottom:0.077});
}
{
  const s=slide('从运行中的失败，找到下一处修改',6,'最终 HTML 的真实独立观察 · 本地模拟服务，使用演示数据','初稿确有服务失败入口缺失，见 .test-data/pm-business-prototype-interaction-final2-20261005/result.json。后续三次真实模型 HTML 局部修订经草稿应用，最终独立 .test-data/pm-business-repair-review-XeeFst-n6ltjN/result.json 13项交互通过。右图来源 03-service-failure.png，图片字节保留、仅原生裁切模拟服务失败控件及提示；完整截图和控件观察证明合法输入提交后姓名与地址仍保留，随后取消模拟失败并真实重试成功，见04-successful-retry.png。此页不证明实际后台、MDM或AI服务已联通。');
  text(s,'真实初稿缺少异常入口',68,174,710,62,39,C.accent,true);
  text(s,'三轮局部修改，再实际运行',68,257,706,53,33,C.ink,true);
  text(s,'选择模拟服务失败，提交合法输入。\n失败出现，名称和地址仍然保留。',68,358,694,104,30);
  text(s,'切回成功后真实重试。\n修正字段，旧错误随之消失。',68,506,698,102,29,C.muted);
  await image(s,'model-final-service-failure.png',798,236,410,361,'最终真实 HTML：模拟服务失败控件、实际错误提示与重试按钮', {left:0,top:0.80,right:0,bottom:0.09});
}
{
  const s=slide(result.headline,7,result.state==='reviewed'?'此页使用新稿的独立审核记录':result.state==='partial_review'?'实际局部修订结果 · 其余成果与未知规则保留待核对':'当前修订未完成 · 三份成果保持基线版本',`第7页数据来自 ${path.relative(root,resultPath)}。${result.source}\n${result.notice}\n该页不得由模型自评或关键词命中填写。`);
  text(s,result.summary,68,165,1120,105,30,C.muted);
  table(s,[['核对对象','当前结论'],...result.rows],64,299,[310,826],235,26);
  text(s,result.notice,68,575,1100,64,27,C.accent,true);
}
{
  const s=slide('版本变化后，旧报告需要重验',8,'右图：隔离产品功能验证 · 旧执行记录保留，当前版本尚未执行','来源 docs/prototype-acceptance-2026-10-05.md，截图 .test-data/prototype-acceptance-ui-packaged-1791187460199/dependency-stale.png。检查完整网页依赖 manifest，而非仅 HTML。用户确认 requiredSpecHash，Agent 改用例后需要用户重新确认。必检 copy/ZIP 导出固定网页资源快照，ZIP 明示不含同目录 PRD 等非网页附件。官方 document_delivery 与 HTML copy/ZIP 覆盖门禁，无成果绑定的通用 MCP 本轮未覆盖，不能宣称全渠道。');
  text(s,'HTML 没变，依赖也可能变。',68,173,680,78,36,C.accent,true);
  text(s,'产品保存旧记录，\n同时标明新版本尚未执行。',68,291,678,100,31);
  text(s,'必检范围由用户确认。\nAgent 修改用例后需要再次确认。',68,426,680,100,29);
  text(s,'必检 ZIP 交付验收过的网页快照，\n并明确说明非网页附件的限制。',68,570,694,69,25,C.muted);
  await image(s,'dependency-stale.png',798,167,410,410,'隔离产品真实截图：版本已变，旧通过报告仍保留，当前版本未执行');
}
{
  const s=slide('区别落在 PM 的工作过程',9,'成熟 Agent 能力可以复用 · 业务规则含义与验收范围由人确认','依据 docs/competition-demo-outline.md、deliverables/competition-2026-10-05/答辩准备.md 与本项目已实现的专用证据/处理来源/成果关联/原型验收工作流。slash 复用 Pi 的推理、工具、原生增量编辑与会话能力，不宣称这些底层能力独有，不声称未进行对照的通用 Agent 做不到。它将资料来源、规则解释、成果版本、验收截图和交付状态接入 PM 流程；此价值未量化成节省工时。编辑先在pending草稿执行，宿主核对差异与版本后应用，原件不直接修改。最终HTML经历三次局部模型修订；整任务尝试曾输出上限/超时无编辑，PRD-only yFEnh9亦输出上限无编辑。这些记录保留，不把未提交修改算成功。演示价值限本次实际任务，不保证复杂文档修改稳定性。');
  text(s,'复用 Pi 的推理、增量编辑与会话能力',68,173,1120,64,35,C.muted);
  text(s,'slash 将专用证据接入已有成果流程',68,278,1120,61,38,C.accent,true);
  text(s,'字段属于哪个业务对象，依据来自哪个位置。\n修改先保存为草稿，来源保持只读。\n实际验过什么，版本变更后哪些结论需要重验。',68,372,1125,161,31);
  text(s,'本次演示：资料回查、局部修改、异常恢复与版本追溯。\n阶段、导入范围和真实接口仍需业务确认。',68,572,1100,68,27,C.muted);
}

const rawCandidate = path.join(build,'candidate-artifact-tool.pptx');
const candidate = path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(pres)).save(rawCandidate);
// The bundled exporter currently replaces explicit image crop with centered cover.
// Keep the original images intact and set only native OOXML srcRect on the draft.
// This remains a PowerPoint crop, not a flattened slide or edited evidence image.
const zip=await JSZip.loadAsync(await fs.readFile(rawCandidate));
for(const [n,crop] of [[3,{top:.58,bottom:.30}],[5,{top:.54,bottom:.077}],[6,{top:.80,bottom:.09}]]) {
  const file=`ppt/slides/slide${n}.xml`;
  const xml=await zip.file(file).async('string');
  const matches=xml.match(/<a:srcRect\b[^>]*\/>/g) ?? [];
  if(matches.length!==1) throw new Error(`Unexpected image crop count on slide ${n}`);
  const rect=`<a:srcRect l="0" t="${Math.round(crop.top*100000)}" r="0" b="${Math.round(crop.bottom*100000)}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" />`;
  zip.file(file,xml.replace(matches[0],rect));
}
await fs.writeFile(candidate,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
const validation = await finalizePresentation({ workspaceDir:root, candidatePath:candidate, finalPath:output, pythonExecutable:python, integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'), layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'), explicitTotalSlideCount:9, requiredNativeTableOwnerSlides:[4,7], fontPolicy, verifyArtifactToolImport:true, layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','4','--require-native-table-slide','7'], receiptPath:path.join(build,'validation.json') });
const finalPresentation = await PresentationFile.importPptx(await FileBlob.load(output));
for(let i=0;i<finalPresentation.slides.items.length;i++) {
  const s=finalPresentation.slides.items[i];
  const preview=await finalPresentation.export({slide:s,format:'png',scale:1});
  await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await preview.arrayBuffer()));
  const layout=await s.export({format:'layout'});
  await fs.writeFile(path.join(build,`slide-${i+1}.layout.json`),await layout.text());
}
const thumbs=[];
for(let i=0;i<9;i++) thumbs.push({input:await sharp(path.join(build,`slide-${i+1}.png`)).resize(640,360).png().toBuffer(),left:(i%3)*640,top:Math.floor(i/3)*360});
await sharp({create:{width:1920,height:1080,channels:4,background:C.bg}}).composite(thumbs).png().toFile(path.join(build,'contact-sheet.png'));
await fs.writeFile(path.join(build,'evidence-manifest.json'),JSON.stringify({output,resultState:result.state,resultPath,fontPolicy,assets:evidence,validation},null,2));
console.log(JSON.stringify({output,previews:build,slides:9,state:result.state}));

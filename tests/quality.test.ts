import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHtml,checkMarkdown,evaluateQualityGate,qualityCheckForArtifact,qualityKindForArtifact} from '../main/quality.js';

test('质量检查按成果 kind 对 Markdown 发现阻断与警告',()=>{
 const report=qualityCheckForArtifact({kind:'document',relativePath:'PRD.md'},'# 需求\n\n```ts\nconst x = 1;');
 assert.equal(report.kind,'markdown');
 assert.equal(report.valid,false);
 assert.ok(report.issues.some(issue=>issue.code==='UNCLOSED_CODE_FENCE'&&issue.severity==='blocking'));
});

test('质量检查按 prototype 调 HTML 并区分阻断与 warning',()=>{
 const report=qualityCheckForArtifact({kind:'prototype',relativePath:'index.html'},'<html><head></head><body><script src="https://cdn.example.test/app.js"></script></body></html>');
 assert.equal(report.kind,'html');
 assert.equal(report.valid,false);
 assert.ok(report.issues.some(issue=>issue.code==='EXTERNAL_ASSET'&&issue.severity==='blocking'));
});

test('质量检查按 flow 调 drawio 检查并支持扩展名推断',()=>{
 const report=qualityCheckForArtifact({kind:'other',relativePath:'流程.drawio'},'<?xml version="1.0"?><mxfile><diagram id="d" name="流程"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="开始" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>');
 assert.equal(qualityKindForArtifact({kind:'other',relativePath:'流程.drawio'}),'flow');
 assert.equal(report.kind,'flow');
 assert.equal(report.valid,true);
});

test('模块 PRD 可交付，默认完整章节和验收追踪格式只给建议',()=>{
 const content='# 客户准入 PRD · 退回原因模块\n\n## 页面与字段\n退回原因必填，最多 200 字。\n\n## 验收标准\n- 空原因不能提交，填写后可退回。\n- AC-2 退回后保留历史内容。\n- AC-3 页面: old-page 历史引用需要后续核对。\n';
 const report=qualityCheckForArtifact({kind:'document',relativePath:'PRD/退回模块.md'},content);
 assert.equal(report.valid,true);
 assert.equal(evaluateQualityGate(report,'current','current').allowed,true);
 for(const code of ['MISSING_PRD_SECTION','MISSING_SECTION_ID','ACCEPTANCE_CRITERION_UNSTABLE','ACCEPTANCE_UNMAPPED','ACCEPTANCE_MAPPING_TARGET_NOT_FOUND'])assert.ok(report.issues.some(issue=>issue.code===code&&issue.severity==='warning'),code);
 assert.equal(report.counts.blocking,0);
});

test('会议与普通 Markdown 不附加 PRD 缺章节或验收编号警告',()=>{
 for(const content of ['# PRD 评审会议记录\n\n讨论现有 PRD 的修改。\n\n## 验收\n- 已确认保留原字段。\n','# 需求整理\n\n记录用户反馈及后续访谈问题。\n']){
  const report=qualityCheckForArtifact({kind:'document',relativePath:'PRD/产品需求会议.md'},content);
  assert.equal(report.valid,true);
  assert.equal(report.details?.markdown?.requiredSections,0);
  assert.ok(!report.issues.some(issue=>/PRD_SECTION|ACCEPTANCE|MISSING_目标|MISSING_角色|MISSING_验收/.test(issue.code)));
 }
 const explicitGeneric=checkMarkdown('# 产品需求研讨\n\n会议记录。',{isPrd:false});
 assert.equal(explicitGeneric.details?.markdown?.requiredSections,0);
});

test('显式绑定模板的必填章节仍严格阻断，与 PRD 自动推断无关',()=>{
 const options={isPrd:false,requiredSections:[{id:'decision',aliases:['确认事项']},{id:'optional',aliases:['附录'],required:false}]};
 const missing=checkMarkdown('# 会议记录\n\n讨论内容。',options);
 assert.equal(missing.valid,false);
 assert.ok(missing.issues.some(issue=>issue.code==='MISSING_PRD_SECTION'&&issue.severity==='blocking'&&issue.locator==='decision'));
 const empty=checkMarkdown('# 会议记录\n\n## 确认事项 <!-- pm-section:decision -->\n',options);
 assert.equal(empty.valid,false);
 assert.ok(empty.issues.some(issue=>issue.code==='EMPTY_PRD_SECTION'&&issue.severity==='blocking'));
 const complete=qualityCheckForArtifact({kind:'document',relativePath:'会议.md'},'# 会议记录\n\n## 确认事项 <!-- pm-section:decision -->\n保留现有权限规则。',options);
 assert.equal(complete.valid,true);
 assert.ok(!complete.issues.some(issue=>issue.locator==='optional'));
});

test('真实空内容、重复稳定章节标识、无效 XML 与版本冲突继续阻断',()=>{
 assert.equal(checkMarkdown(' \n').valid,false);
 const duplicate=checkMarkdown('# 模块 <!-- pm-section:module -->\n正文\n## 模块二 <!-- pm-section:module -->\n正文');
 assert.ok(duplicate.issues.some(issue=>issue.code==='DUPLICATE_SECTION_ID'&&issue.severity==='blocking'));
 assert.equal(duplicate.valid,false);
 assert.equal(qualityCheckForArtifact({kind:'flow',relativePath:'流程.drawio'},'<mxfile><diagram>').valid,false);
 const conflict=evaluateQualityGate(checkMarkdown('# 说明\n正文'),'before','after');
 assert.equal(conflict.allowed,false);
 assert.equal(conflict.code,'VERSION_CONFLICT');
});

const htmlPage=(body:string,script='')=>`<!doctype html><html><head><title>原型</title></head><body><main>${body}</main>${script}</body></html>`;

test('SFA同类Vue CDN、资源src/srcset与CSS外网加载均成为明确阻断',()=>{
 const resources=[
  '<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>',
  '<script src="//cdn.example.test/app.js"></script>',
  '<link rel="alternate STYLESHEET" href="http://cdn.example.test/app.css">',
  '<img src="https&#58;//example.test/a.png">',
  '<picture><source srcset="local.png 1x, https://example.test/a.png 2x"></picture>',
  '<video poster="https://example.test/a.png"><source src="https://example.test/a.mp4"></video>',
  '<div style="background:url(https://example.test/a.png)"></div>',
  '<style>@import "https://example.test/fonts.css";body{background:url(//example.test/a.png)}</style>',
  '<style>@import url("https://example.test/fonts.css");</style>',
 ];
 for(const resource of resources){const report=checkHtml(htmlPage('页面',resource));assert.equal(report.valid,false,resource);assert.ok(report.issues.some(issue=>issue.code==='EXTERNAL_ASSET'&&issue.severity==='blocking'),resource);assert.equal(evaluateQualityGate(report).allowed,false);}
});

test('离线资源检查不将导航、本地/data资源、脚本字符串与注释误判为加载依赖',()=>{
 const html=htmlPage('<a href="https://example.test/help">帮助</a><img src="data:image/png;base64,AAAA" srcset="local.png 1x, assets/a.png 2x"><div style="background:url(assets/a.png)"></div>',
  '<!-- <script src="https://example.test/comment.js"></script><style>@import "https://example.test/comment.css";</style> -->'+
  '<script src="app.js"></script><script>const sample = \'<img src="https://example.test/text.png">\'; const css = \'<style>@import "https://example.test/text.css";</style>\';</script>'+
  '<style>/* url(https://example.test/comment.png) */.x::after{content:"url(https://example.test/text.png)"}body{background:url(data:image/png;base64,AAAA)}</style>');
 const report=checkHtml(html);assert.equal(report.valid,true,JSON.stringify(report.issues));assert.equal(report.details?.interactions?.externalResources,0);
});

test('普通外链是导航，外部脚本和样式阻断默认离线交付',()=>{
 const navigation=checkHtml(htmlPage('<a href="https://example.test/help">帮助文档</a>'));
 assert.equal(navigation.valid,true);
 assert.equal(navigation.details?.interactions?.externalResources,0);
 assert.ok(!navigation.issues.some(issue=>issue.code==='EXTERNAL_ASSET'));
 const dependency=checkHtml(htmlPage('<a href="https://example.test/help">帮助</a>','<script src="https://cdn.example.test/app.js"></script>'));
 assert.ok(dependency.issues.some(issue=>issue.code==='EXTERNAL_ASSET'&&issue.severity==='blocking'));
 assert.match(dependency.summary,/静态检查/);
 assert.match(dependency.summary,/需试用/);
 assert.doesNotMatch(dependency.summary,/交互.*通过|质量检查通过/);
});

test('原生表单提交、summary 展开和 class 事件委托不被误报无交互',()=>{
 const examples=[
  htmlPage('<form><input name="reason" required><button>提交</button></form>'),
  htmlPage('<details><summary>查看说明</summary><p>内容</p></details>'),
  htmlPage('<button class="save">保存</button>','<script>document.addEventListener("click", event => { if (event.target.closest(".save")) document.body.dataset.state="saved"; });</script>'),
  htmlPage('<button id="save">保存</button>','<script>const save = document.getElementById("save"); save.addEventListener("click", () => document.body.dataset.state="saved");</script>'),
  htmlPage('<button id=save>保存</button>','<script>document.querySelector("#save").addEventListener("click", () => {});</script>'),
 ];
 for(const source of examples){const report=checkHtml(source);assert.equal(report.valid,true,`${source}\n${JSON.stringify(report.issues)}`);assert.ok(!report.issues.some(issue=>/BUTTON_WITHOUT_ACTION|NO_INTERACTION_PATH|FORM_WITHOUT_SUBMIT_PATH/.test(issue.code)));}
});

test('仅查找 DOM 元素不是已绑定事件，真正缺失的按钮和表单入口仍发现',()=>{
 const lookup=checkHtml(htmlPage('<button id="save">保存</button>','<script>const save = document.getElementById("save"); console.log(save);</script>'));
 assert.equal(lookup.valid,false);
 assert.ok(lookup.issues.some(issue=>issue.code==='BUTTON_WITHOUT_ACTION'&&issue.severity==='blocking'));
 const form=checkHtml(htmlPage('<form><input name="reason"><button type="button" disabled>稍后提交</button></form>'));
 assert.ok(form.issues.some(issue=>issue.code==='FORM_WITHOUT_SUBMIT_PATH'&&issue.severity==='blocking'));
 const broken=checkHtml(htmlPage('<button onclick="show()" aria-controls="missing">打开</button>'));
 assert.ok(broken.issues.some(issue=>issue.code==='BROKEN_INTERACTION_TARGET'&&issue.severity==='blocking'));
 const malformed=checkHtml('<main><button onclick="save()">保存</button></main>');
 assert.equal(malformed.valid,false);
 assert.ok(malformed.issues.some(issue=>issue.code==='MISSING_HTML_ROOT'));
 assert.ok(malformed.issues.some(issue=>issue.code==='MISSING_BODY'));
});

test('外部脚本事件和 disabled 控件保持静态检查限制，不能宣称已试用',()=>{
 const external=checkHtml(htmlPage('<button id="save">保存</button>','<script src="app.js"></script>'));
 assert.equal(external.valid,true);
 assert.ok(external.issues.some(issue=>issue.code==='BUTTON_WITHOUT_ACTION'&&issue.severity==='warning'));
 assert.match(external.summary,/核心交互仍需试用/);
 const disabled=checkHtml(htmlPage('<button disabled>暂不可用</button>'));
 assert.equal(disabled.valid,true);
 assert.ok(!disabled.issues.some(issue=>issue.code==='NO_INTERACTION_PATH'));
 const fakeTags=checkHtml(htmlPage('<button id="save" onclick="save()">保存</button>','<script>const snippet = `<button id="save">示例</button>`;</script>'));
 assert.ok(!fakeTags.issues.some(issue=>issue.code==='DUPLICATE_HTML_ID'));
});

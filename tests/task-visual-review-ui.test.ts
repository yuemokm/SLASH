import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TaskVisualReviewStatus} from '../src/TaskAcceptanceStatus.js';
import type {TaskAcceptanceReport} from '../shared/task-acceptance.js';
import {VISUAL_REVIEW_VERSION,type VisualReviewReceipt} from '../shared/prototype-visual-review.js';

type DisplayReport=Pick<TaskAcceptanceReport,'versionState'|'visualReview'|'visualReviewRequired'|'visualReviewNotice'|'targets'>;
const hash='a'.repeat(64),imageHash='b'.repeat(64);
const base:DisplayReport={versionState:'current',targets:[{id:'out',kind:'html',target:{source:'applied',mountId:'m',path:'page.html',contentHash:hash}}]};
function receipt():VisualReviewReceipt{return{id:'vr',version:VISUAL_REVIEW_VERSION,contractHash:hash,inputHash:hash,resultHash:hash,checkedAt:'2026-10-08T00:00:00.000Z',versionState:'current',status:'needs_human',completion:'completed',reviewer:{modelId:'fixture-vision',provider:'fixture',protocol:'openai'},images:[{ref:'V1',outputId:'out',receipt:{source:'prototype_screenshot',mimeType:'image/png',contentHash:imageHash,bytes:100,width:390,height:844,viewport:{width:390,height:844},readAt:'2026-10-08T00:00:00.000Z',mountId:'m',path:'page.html',reportId:'browser-report',screenshotId:'screenshot-private',caseId:'mobile',entryHash:hash,versionState:'current'}}],findings:[{id:'f1',screenshotRef:'V1',category:'clipping',confidence:'high',explanation:'候选按钮文字裁切',suggestion:'局部增加按钮可用宽度',region:{x:0.1,y:0.2,width:0.3,height:0.1},outputId:'out',entryHash:hash,reportId:'browser-report',screenshotId:'screenshot-private',screenshotHash:imageHash,caseId:'mobile',viewport:{width:390,height:844},repairEligible:true}],coverageLimits:['未覆盖弹窗及其他视口'],durationMs:1000,stopReason:'stop'};}
const draw=(report:DisplayReport)=>renderToStaticMarkup(createElement(TaskVisualReviewStatus,{report}));

test('same-version screenshot review shows bounded candidates and viewport without calling it passed or expanding by default',()=>{
 const html=draw({...base,visualReview:receipt()});assert.match(html,/当前版已审查 · 1 项候选问题/);assert.match(html,/390 × 844 CSS px/);assert.match(html,/候选按钮文字裁切/);assert.match(html,/距左 10%、距上 20%/);assert.match(html,/未覆盖弹窗及其他视口/);assert.match(html,/美学质量仍待确认/);assert.doesNotMatch(html,/<details[^>]*open|视觉审查通过|视觉通过<\/summary>/);
});
test('old HTML reports and capability/budget skips remain unexecuted instead of inventing a visual verdict',()=>{
 const old=draw(base);assert.match(old,/当前版尚未执行/);assert.match(old,/本报告未记录截图视觉审查/);
 for(const notice of ['当前模型视觉能力尚未确认','本轮辅助预算已用尽']){const html=draw({...base,visualReviewRequired:true,visualReviewNotice:notice});assert.match(html,/当前版尚未执行/);assert(html.includes(notice));assert.doesNotMatch(html,/当前版已审查/);}
 assert.equal(draw({...base,targets:[]}), '');
});
test('stale or unavailable parent/receipt and stale screenshot hide candidate content, identity and viewport',()=>{
 for(const report of [{...base,versionState:'stale' as const,visualReview:receipt()},{...base,versionState:'unavailable' as const,visualReview:receipt()},{...base,visualReview:{...receipt(),versionState:'stale' as const}},{...base,visualReview:{...receipt(),versionState:'unavailable' as const}}]){const html=draw(report);assert.match(html,/当前版未验证/);assert.doesNotMatch(html,/候选按钮文字裁切|局部增加按钮可用宽度|390 × 844|fixture-vision|screenshot-private/);}
 const staleImage=receipt();staleImage.images[0].receipt.versionState='stale';const html=draw({...base,visualReview:staleImage});assert.doesNotMatch(html,/候选按钮文字裁切|390 × 844|当前版已审查/);
});
test('interrupted response and unmatched finding never become a completed candidate verdict',()=>{
 for(const completion of ['failed','invalid','interrupted'] as const){const html=draw({...base,visualReview:{...receipt(),completion,reason:undefined,stopReason:'stop'}});assert.match(html,/未完整完成/);assert.doesNotMatch(html,/当前版已审查|候选按钮文字裁切/);}
 const interrupted=draw({...base,visualReview:{...receipt(),reason:'视觉审查中断或返回错误，意见未采用',stopReason:'length'}});assert.match(interrupted,/已尝试 · 未完整完成/);assert.match(interrupted,/视觉审查中断/);assert.doesNotMatch(interrupted,/候选按钮文字裁切|当前版已审查/);
 const mismatched=receipt();mismatched.findings[0].screenshotHash='c'.repeat(64);const html=draw({...base,visualReview:mismatched});assert.match(html,/未完整完成/);assert.doesNotMatch(html,/候选按钮文字裁切|未提出候选问题/);
});

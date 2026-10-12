import {checkHtml,htmlLoadingAssets} from '../main/quality.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {capturePrototypeStaticManifest,assertPrototypeStaticManifest,immutablePrototypeStaticBytes,prototypeFixturePayload,assertPrototypeFixturePayload,requirePrototypePublishingCodec,createFixturePrototypePublishingCodec,PROTOTYPE_FIXTURE_TOOL_SCHEMA} from '../main/prototype-delivery.js';
import {mcpPrototypeProjectLocatorSchema,prototypeStaticManifestSchema} from '../shared/prototype-delivery.js';
const entry=(value:string|Buffer)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');return{bytes,hash:createHash('sha256').update(bytes).digest('hex')};};
function snapshot(){return new Map([['index.html',entry('<!doctype html><link rel="stylesheet" href="assets/app.css"><script src="assets/app.js"></script><img src="assets/icon.png">')],['assets/app.css',entry('body{color:#123456}')],['assets/app.js',entry('document.body.dataset.ready="yes"')],['assets/icon.png',entry(Buffer.from([137,80,78,71,13,10,26,10,255,0,1]))]]);}

test('complete native snapshot manifest binds entry plus CSS JS and actual binary bytes independently of insertion order',()=>{
 const value=snapshot(),manifest=capturePrototypeStaticManifest('index.html',value),reverse=new Map([...value].reverse());assert.deepEqual(capturePrototypeStaticManifest('index.html',reverse),manifest);
 assert.equal(manifest.files.length,4);assert.equal(manifest.deliveryKind,'prototype_static_project');assert.equal(manifest.buildProof,'native_static_snapshot');assert.equal(manifest.boundary,'entry_parent_web_assets');assert.equal(manifest.entryHash,value.get('index.html')!.hash);
 const {manifestHash,...body}=manifest;assert.equal(manifestHash,createHash('sha256').update(JSON.stringify(body)).digest('hex'));
});

test('asset change addition deletion or supplied hash tampering is rejected without reverting original data',()=>{
 const before=snapshot(),expected=capturePrototypeStaticManifest('index.html',before);
 for(const mutate of [(value:ReturnType<typeof snapshot>)=>value.set('assets/app.css',entry('body{color:red}')),(value:ReturnType<typeof snapshot>)=>value.set('assets/extra.js',entry('new file')),(value:ReturnType<typeof snapshot>)=>value.delete('assets/icon.png')]){const current=snapshot();mutate(current);assert.throws(()=>assertPrototypeStaticManifest('index.html',current,expected),/PROTOTYPE_PROJECT_VERSION_CHANGED/);}
 const changed=snapshot();changed.get('assets/app.js')!.bytes[0]=0;assert.throws(()=>capturePrototypeStaticManifest('index.html',changed),/PROTOTYPE_SNAPSHOT_BYTES_CHANGED/);assert.equal(changed.get('assets/app.js')!.bytes[0],0);
});

test('canonical path aliases collisions traversal absolute paths and unsupported source files are never normalized into valid manifests',()=>{
 for(const file of ['../x.js','/x.js','a/./x.js','a//x.js','a\\x.js','C:x.js','a/x.js:stream','a/x.js ','NUL.js','a/x.tsx','e\u0301.js']){const value=snapshot();value.set(file,entry('x'));assert.throws(()=>capturePrototypeStaticManifest('index.html',value));}
 const collision=snapshot();collision.set('INDEX.HTML',entry('second entry'));assert.throws(()=>capturePrototypeStaticManifest('index.html',collision),/Snapshot paths must be unique/);
 assert.equal(mcpPrototypeProjectLocatorSchema.safeParse({mountId:'m',path:'../x.html',adapterId:'a'}).success,false);
 assert.equal(mcpPrototypeProjectLocatorSchema.safeParse({mountId:'m',path:'x.html',adapterId:'a',manifestHash:'a'.repeat(64)}).success,false);
});

test('copied capture separates original buffers while later mutation of retained bytes still invalidates the manifest',()=>{
 const source=snapshot(),captured=immutablePrototypeStaticBytes('index.html',source);source.get('assets/app.css')!.bytes[0]=0;assert.notEqual(captured.snapshot.get('assets/app.css')!.bytes[0],0);assertPrototypeStaticManifest('index.html',captured.snapshot,captured.manifest);
 captured.snapshot.get('assets/app.css')!.bytes[0]=0;assert.throws(()=>assertPrototypeStaticManifest('index.html',captured.snapshot,captured.manifest),/PROTOTYPE_SNAPSHOT_BYTES_CHANGED/);
});

test('fixture file list exactly expresses all bytes and never substitutes single HTML for a complete project',()=>{
 const value=snapshot(),manifest=capturePrototypeStaticManifest('index.html',value),args=prototypeFixturePayload('index.html',value);assert.equal(args.files.find(f=>f.path.endsWith('.png'))!.encoding,'base64');assertPrototypeFixturePayload(args,manifest,value);
 const partial={...args,files:args.files.filter(f=>f.path==='index.html')};assert.throws(()=>assertPrototypeFixturePayload(partial,manifest,value),/PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH/);
 const incorrect=structuredClone(args);incorrect.files.find(f=>f.path.endsWith('.css'))!.content='body{}';assert.throws(()=>assertPrototypeFixturePayload(incorrect,manifest,value),/PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH/);
});

test('non-canonical base64 duplicate paths and JSON byte limit failures do not silently resize or convert payload',()=>{
 const value=snapshot(),manifest=capturePrototypeStaticManifest('index.html',value),args=prototypeFixturePayload('index.html',value);
 const bad=structuredClone(args);bad.files.find(f=>f.path.endsWith('.png'))!.content+='\n';assert.throws(()=>assertPrototypeFixturePayload(bad,manifest,value),/PROTOTYPE_PUBLISH_ENCODING_INVALID/);
 const dup=structuredClone(args);dup.files[1]=dup.files[0];assert.throws(()=>assertPrototypeFixturePayload(dup,manifest,value),/PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH/);
 const huge=new Map([['index.html',entry('<!doctype html>'+ '中文'.repeat(20000))]]);assert.throws(()=>prototypeFixturePayload('index.html',huge),/PROTOTYPE_PUBLISH_PAYLOAD_LIMIT/);
});

test('production registry stays empty and actual fixture schema identity must match; test codec cannot enable production publication',()=>{
 assert.throws(()=>requirePrototypePublishingCodec('fixture_static_file_list_v1'),/PROTOTYPE_PUBLISH_ADAPTER_UNAVAILABLE/);
 const codec=createFixturePrototypePublishingCodec(PROTOTYPE_FIXTURE_TOOL_SCHEMA);assert.equal(codec.availability,'fixture_only');assert.throws(()=>requirePrototypePublishingCodec(codec.id,[codec]),/PROTOTYPE_PUBLISH_ADAPTER_UNAVAILABLE/);
 assert.equal(requirePrototypePublishingCodec(codec.id,[codec],true),codec);
 assert.throws(()=>createFixturePrototypePublishingCodec({...PROTOTYPE_FIXTURE_TOOL_SCHEMA,description:'different wire capability'}),/PROTOTYPE_PUBLISH_TOOL_SCHEMA_CHANGED/);
});

test('empty missing entry oversized snapshot and forged manifest metadata fail the host contract',()=>{
 assert.throws(()=>capturePrototypeStaticManifest('index.html',new Map()),/PROTOTYPE_ENTRY_MISSING/);
 const oversized=new Map([['index.html',entry(Buffer.alloc(16*1024*1024+1))]]);assert.throws(()=>capturePrototypeStaticManifest('index.html',oversized));
 const manifest=capturePrototypeStaticManifest('index.html',snapshot());assert.equal(prototypeStaticManifestSchema.safeParse({...manifest,buildProof:'build_succeeded'}).success,false);assert.throws(()=>assertPrototypeStaticManifest('index.html',snapshot(),{...manifest,manifestHash:'a'.repeat(64)}),/PROTOTYPE_PROJECT_VERSION_CHANGED/);
});


test('resource enumeration preserves existing single entity decoding and ignores comments/script text/CSS strings',()=>{
 const literal='<link rel="stylesheet" href="https&amp;colon;//example.test/style.css">',encoded='<link rel="stylesheet" href="https&colon;//example.test/style.css">';
 assert.equal(htmlLoadingAssets(literal)[0].raw,'https&amp;colon;//example.test/style.css');assert.equal(htmlLoadingAssets(literal)[0].url,'https&colon;//example.test/style.css');
 assert.equal(checkHtml(literal).issues.filter(issue=>issue.code==='EXTERNAL_ASSET').length,0);assert.equal(checkHtml(encoded).issues.filter(issue=>issue.code==='EXTERNAL_ASSET').length,1);
 assert.deepEqual(htmlLoadingAssets('<!--<img src="hidden.png">--><script>const text=\'<img src="text.png">\';</script><style>.x{content:"url(text.png)"}</style>'),[]);
 const refs=htmlLoadingAssets('<script src="app.js"></script><link rel="stylesheet" href="style.css"><img src="data:image/png;base64,YQ==">');assert.deepEqual(refs.map(ref=>ref.url),['app.js','style.css','data:image/png;base64,YQ==']);
});

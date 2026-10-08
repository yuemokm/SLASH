import {_electron as electron} from 'playwright';
import {projectResourceLocation} from './composer-smoke-helpers.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const testDataRoot=path.resolve(root,'.test-data');
const smokeRoot=path.resolve(testDataRoot,'pdf-packaged-smoke');
const profile=path.join(smokeRoot,'profile');
const workspace=path.join(smokeRoot,'workspace');
const evidencePath=path.join(smokeRoot,'result.json');
const executable=path.resolve(process.argv[2]||path.join(root,'release','win-unpacked','slash.exe'));
const appAsar=path.join(path.dirname(executable),'resources','app.asar');
const expectedText='Packaged PDF parser worker smoke passed';

if(path.dirname(smokeRoot)!==testDataRoot||path.basename(smokeRoot)!=='pdf-packaged-smoke')throw Error('PDF 冒烟目录越界');

function makePdf(text){
 const escaped=text.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
 const stream=`BT /F1 16 Tf 72 720 Td (${escaped}) Tj ET`;
 const objects=[
  '',
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 let body='%PDF-1.4\n';const offsets=[0];
 for(let id=1;id<objects.length;id++){offsets[id]=Buffer.byteLength(body,'ascii');body+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}
 const xref=Buffer.byteLength(body,'ascii');body+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let id=1;id<objects.length;id++)body+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
 body+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(body,'ascii');
}

await fs.rm(smokeRoot,{recursive:true,force:true});
await fs.mkdir(profile,{recursive:true});
await fs.mkdir(workspace,{recursive:true});

let application;
let evidence={status:'failed',checkedAt:new Date().toISOString(),executable:path.relative(root,executable),appAsar:path.relative(root,appAsar)};
try{
 await fs.access(executable);await fs.access(appAsar);
 application=await electron.launch({executablePath:executable,cwd:root,args:[],env:{...process.env,PM_SLASH_DATA_DIR:profile}});
 const page=await application.firstWindow();await page.waitForSelector('.brand',{timeout:30_000});
 const request=async payload=>{const response=await page.evaluate(value=>window.pm.request(value),payload);if(!response.ok)throw Error(response.error);return response.data;};
 await request({type:'workspace',path:workspace});
 const reference=projectResourceLocation(await request({type:'projectTreeGet'}));
 const fixtureName='packaged-pdf-worker.pdf';const fixture=makePdf(expectedText);await fs.writeFile(path.join(reference.directory,fixtureName),fixture,{flag:'wx'});
 const extracted=await request({type:'read',mountId:reference.mountId,path:reference.file(fixtureName)});
 if(typeof extracted!=='string'||!extracted.includes(expectedText))throw Error(`打包应用 PDF 正文不匹配：${String(extracted).slice(0,200)}`);
 evidence={status:'passed',checkedAt:new Date().toISOString(),executable:path.relative(root,executable),appAsar:path.relative(root,appAsar),profile:path.relative(root,profile),workspace:path.relative(root,workspace),fixture:{name:fixtureName,bytes:fixture.length},ipc:{request:'read',mountId:reference.mountId,path:reference.file(fixtureName),extractedCharacters:extracted.length,textSha256:createHash('sha256').update(extracted).digest('hex'),expectedTextFound:true},validation:'pdf-parse loaded from packaged app.asar and extracted text through the production IPC boundary'};
}catch(error){evidence={...evidence,error:error instanceof Error?error.message:String(error)};throw error;
}finally{
 if(application)await application.close().catch(()=>{});
 await fs.writeFile(evidencePath,JSON.stringify(evidence,null,2),'utf8');
}

console.log(`Packaged PDF smoke passed; evidence: ${path.relative(root,evidencePath)}`);

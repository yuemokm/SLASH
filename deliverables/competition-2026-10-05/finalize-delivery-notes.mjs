import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import sharp from 'sharp';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
const root=path.dirname(fileURLToPath(import.meta.url));
process.env.RUNTIME_NODE_MODULES ??= 'C:/Users/yuemokm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const skill='C:/Users/yuemokm/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const build=path.join(root,'build/demo-final-v9');
const output=path.join(root,'output/slash-competition-demo-final-v9.pptx');
const candidate=path.join(build,'candidate-delivery-notes.pptx');
const replacements=[
 ['.test-data/pm-business-manual-review-final/suggested-PRD.md','deliverables/competition-2026-10-05/reviewed-documents/PRD-人工核对建议.md'],
 ['suggested-constraints.md（7780','deliverables/competition-2026-10-05/reviewed-documents/约束对照-人工核对建议.md（7780']
];
const resultPath=path.join(root,'repair-result.json');const result=JSON.parse(await fs.readFile(resultPath,'utf8'));
for(const [before,after]of replacements)result.source=result.source.replaceAll(before,after);
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
const preserved=path.join(build,'before-delivery-notes.pptx');
const initial=await fs.readFile(output).catch(error=>{if(error.code!=='ENOENT')throw error;return fs.readFile(preserved);});
const zip=await JSZip.loadAsync(initial);let changed=0;
for(const file of Object.keys(zip.files).filter(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))){let text=await zip.file(file).async('string');const old=text;for(const [before,after]of replacements)text=text.replaceAll(before,after);if(text!==old){zip.file(file,text);changed++;}}
if(changed!==1)throw new Error('Expected only the result slide notes to change');
await fs.writeFile(candidate,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
await fs.rename(output,preserved).catch(error=>{if(error.code!=='ENOENT')throw error;});
const validation=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:output,pythonExecutable:'C:/Users/yuemokm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),explicitTotalSlideCount:9,requiredNativeTableOwnerSlides:[4,7],fontPolicy:{basis:'design',families:['Microsoft YaHei']},verifyArtifactToolImport:true,layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','4','--require-native-table-slide','7'],receiptPath:path.join(build,'validation-delivery.json')});
const pres=await PresentationFile.importPptx(await FileBlob.load(output));
for(let i=0;i<9;i++){const s=pres.slides.items[i];const png=await pres.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));const layout=await s.export({format:'layout'});await fs.writeFile(path.join(build,`slide-${i+1}.layout.json`),await layout.text());}
const thumbs=[];for(let i=0;i<9;i++)thumbs.push({input:await sharp(path.join(build,`slide-${i+1}.png`)).resize(640,360).png().toBuffer(),left:(i%3)*640,top:Math.floor(i/3)*360});
await sharp({create:{width:1920,height:1080,channels:4,background:'#FBF8F3'}}).composite(thumbs).png().toFile(path.join(build,'contact-sheet.png'));
const manifest=JSON.parse(await fs.readFile(path.join(build,'evidence-manifest.json'),'utf8'));manifest.validation=validation;manifest.deliveryNotesUpdated=true;manifest.notes='Manual documents referenced through deliverable reviewed-documents paths; slide content and original screenshots unchanged.';await fs.writeFile(path.join(build,'evidence-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({output,previews:build,slides:9,validation},null,2));

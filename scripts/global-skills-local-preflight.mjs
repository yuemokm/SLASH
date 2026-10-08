import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {GlobalSkillsRegistry} from '../main/global-skills.ts';
import {AuthorizedSkills} from '../main/skills.ts';
import {Files} from '../main/files.ts';

// Offline only: hash originals, import a managed copy, use actual Pi discover/load.
const source=path.resolve(process.argv[2]??'E:\\code\\slash test\\资源\\skills');
const testRoot=path.resolve('.test-data');await fs.mkdir(testRoot,{recursive:true});
const directory=await fs.mkdtemp(path.join(testRoot,'global-skills-local-'));
const digest=data=>createHash('sha256').update(data).digest('hex');
async function snapshot(root){const entries=[];async function walk(folder){for(const item of await fs.readdir(folder,{withFileTypes:true})){const absolute=path.join(folder,item.name);if(item.isSymbolicLink())throw Error('SOURCE_LINK_DENIED');if(item.isDirectory())await walk(absolute);else if(item.isFile()){const bytes=await fs.readFile(absolute);entries.push({path:path.relative(root,absolute).replaceAll('\\','/'),sha256:digest(bytes),bytes:bytes.length});}else throw Error('SOURCE_SPECIAL_FILE_DENIED');}}await walk(root);return entries.sort((a,b)=>a.path.localeCompare(b.path));}
const before=await snapshot(source),report={directory,source,networkRequests:0,modelRequests:0,appStarted:false,sourceFileCount:before.length,sourceBeforeHash:digest(JSON.stringify(before)),status:'unknown',projects:[]};
try{const registry=new GlobalSkillsRegistry(path.join(directory,'profile'));
 const receipt=await registry.importLocal(source);report.installedSkills=receipt.view.skills.map(({name,contentHash,scope})=>({name,contentHash,scope}));
 const expected=['create-prd','drawio-process-redraw-vertical','qianhe-marketing-product-design'];if(JSON.stringify(receipt.view.skills.map(item=>item.name).sort())!==JSON.stringify(expected))throw Error('UNEXPECTED_REAL_SKILL_SET');
 for(const name of ['first-project','second-project']){const runtime=await registry.runtimeSnapshot(),catalog=new AuthorizedSkills(new Files(()=>runtime.runtimeMounts),runtime.runtimeDirectories,()=>registry.assertSnapshotCurrent(runtime.revisionToken)),discovery=await catalog.discover(),loaded=[];
  for(const skill of discovery.skills){const result=await catalog.load(skill.name,'command');loaded.push({name:skill.name,bodyHash:digest(result.content),scope:result.receipt.scope});}
  if(loaded.length!==3)throw Error('REAL_SKILL_DISCOVERY_INCOMPLETE');report.projects.push({name,projectMounts:[],runtimeMountCount:runtime.runtimeMounts.length,loaded,diagnostics:discovery.diagnostics});}
 report.managedFileCount=JSON.parse(await fs.readFile(path.join(registry.root,'registry.json'),'utf8')).packages.reduce((sum,pkg)=>sum+pkg.files.length,0);report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}
finally{const after=await snapshot(source);report.sourceAfterHash=digest(JSON.stringify(after));report.sourcePreserved=report.sourceBeforeHash===report.sourceAfterHash;if(!report.sourcePreserved){report.status='failed';process.exitCode=1;}await fs.writeFile(path.join(directory,'source-hashes.json'),JSON.stringify({before,after},null,2));await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,status:report.status,sourcePreserved:report.sourcePreserved,sourceFileCount:report.sourceFileCount,installedSkills:report.installedSkills,projectCount:report.projects.length,networkRequests:0,modelRequests:0,error:report.error},null,2));}

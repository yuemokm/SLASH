import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Read one explicitly selected model draft; never read model/credential kvs.
const root=process.cwd(),args=process.argv.slice(2),arg=name=>{const index=args.indexOf(name);if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw Error('Missing '+name);return args[index+1];};
const database=path.resolve(arg('--database')),target=arg('--path'),output=path.resolve(arg('--output'));
const testData=path.resolve(root,'.test-data');for(const selected of [database,output]){const relative=path.relative(testData,selected);if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Only isolated .test-data paths are allowed');}
const db=new DatabaseSync(database,{readOnly:true});let row;
try{row=db.prepare("SELECT json_extract(c.value,'$.id') AS changeId, json_extract(c.value,'$.runId') AS runId, json_extract(c.value,'$.path') AS path, json_extract(c.value,'$.status') AS status, json_extract(c.value,'$.content') AS content FROM kv, json_each(json_extract(kv.value,'$.changes')) AS c WHERE kv.key='state' AND json_extract(c.value,'$.path')=? ORDER BY CAST(c.key AS INTEGER) ASC LIMIT 1").get(target);}finally{db.close();}
if(!row||typeof row.content!=='string')throw Error('Selected HTML draft was not found');
await fs.mkdir(output,{recursive:true});const file=path.join(output,'index.html');await fs.writeFile(file,row.content,{flag:'wx'});
const metadata={sourceKind:'real_model_change_content',sourceState:row.status,changeId:row.changeId,runId:row.runId,sourceDatabase:database,artifactPath:row.path,characters:row.content.length,sha256:createHash('sha256').update(row.content).digest('hex'),file,extractedAt:new Date().toISOString(),notice:'Byte-equivalent copy of the selected real model draft, including pending state; artifact content was not edited. No other kv rows were selected.'};await fs.writeFile(path.join(output,'draft-source.json'),JSON.stringify(metadata,null,2),{flag:'wx'});console.log(JSON.stringify(metadata));

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createJiti} from 'jiti';

/** Trusted releases only; never discovers project/global extension directories. */
export const PI_PACKAGES={
 memory:{name:'pi-memory',version:'0.4.2',license:'MIT'},
 web:{name:'pi-web-access',version:'0.37.0',license:'MIT'},
 mcp:{name:'pi-mcp-adapter',version:'5.1.0',license:'MIT'},
 subagents:{name:'pi-subagents',version:'0.76.1',license:'MIT'},
 lens:{name:'pi-lens',version:'4.4.0',license:'MIT'},
 plan:{name:'@plannotator/pi-extension',version:'0.28.8',license:'MIT OR Apache-2.0'},
 observability:{name:'@langfuse/pi-observability-plugin',version:'0.1.2',license:'MIT'},
} as const;
export type PiPackageId=keyof typeof PI_PACKAGES;
const require=createRequire(import.meta.url);
const jiti=createJiti(import.meta.url,{moduleCache:true,fsCache:false});
export function piPackageRoot(id:PiPackageId){
 const expected=PI_PACKAGES[id];let root:string;
 try{root=path.dirname(require.resolve(`${expected.name}/package.json`));}
 catch{root=path.dirname(require.resolve(expected.name));while(!fs.existsSync(path.join(root,'package.json'))){const parent=path.dirname(root);if(parent===root)throw Error('PI_PACKAGE_MANIFEST_MISSING');root=parent;}}
 const actual=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(actual.name!==expected.name||actual.version!==expected.version)throw Error(`PI_PACKAGE_VERSION_MISMATCH: ${expected.name} requires ${expected.version}`);
 return root;
}
export function piPackageFile(id:PiPackageId,relative:string){const root=piPackageRoot(id),target=path.resolve(root,relative);if(!target.startsWith(root+path.sep)||!fs.existsSync(target))throw Error('PI_PACKAGE_ENTRY_MISSING');return target;}
export async function loadPiPackage<T>(id:PiPackageId,subpath=''){piPackageRoot(id);return await jiti.import<T>(PI_PACKAGES[id].name+subpath);}
export async function loadPiPackageDependency<T>(id:PiPackageId,name:string){const location=createRequire(path.join(piPackageRoot(id),'package.json')).resolve(name);return await jiti.import<T>(location);}
export function piPackageStatus(){return Object.entries(PI_PACKAGES).map(([id,expected])=>{try{piPackageRoot(id as PiPackageId);return{...expected,id,installed:true};}catch(error){return{...expected,id,installed:false,error:String((error as Error).message)};}});}

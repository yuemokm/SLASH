import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const TEST_RECORDS_ROOT=path.join(projectRoot,'过程文件','测试记录');
export const TEST_TEMP_ROOT=path.join(projectRoot,'过程文件','临时文件','runtime-temp');
await Promise.all([fs.mkdir(TEST_RECORDS_ROOT,{recursive:true}),fs.mkdir(TEST_TEMP_ROOT,{recursive:true})]);

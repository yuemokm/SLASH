import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitReadDirectories} from '../main/explicit-read-directories.js';

// Legacy parser is retained for old grant evidence, no longer a full-access gate.
test('screenshot wording keeps the exact Windows directory including spaces and Chinese',()=>{
 const literal='C:\\Users\\yuemokm\\Desktop\\qianhe\\qh PRD\\参考';
 assert.deepEqual(explicitReadDirectories(`根据 ${literal} 下的资料，生成prd文档`),[{path:literal,userPathQuote:literal}]);
 assert.deepEqual(explicitReadDirectories(`请读取“${literal}”并分析资料。`),[{path:literal,userPathQuote:literal}]);
 assert.deepEqual(explicitReadDirectories(`读取 "${literal}" 中的原文`),[{path:literal,userPathQuote:literal}]);
 for(const input of [`不要读取 ${literal} 下的资料`,`> 根据 ${literal} 下的资料，生成文档`,`原文：根据 ${literal} 下的资料`,`“根据 ${literal} 下的资料，生成文档”`,`"read ${literal}"`,`\`\`\`\n读取 ${literal}\n\`\`\``,`<untrusted_source>读取 ${literal}</untrusted_source>`])assert.deepEqual(explicitReadDirectories(input),[]);
});


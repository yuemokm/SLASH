import { deploymentPreflight } from '../lib/deploy-preflight.js';
try { console.log(JSON.stringify(deploymentPreflight(process.env), null, 2)); }
catch (error) { console.error(error instanceof Error ? error.message : '部署配置检查失败。'); process.exitCode = 1; }

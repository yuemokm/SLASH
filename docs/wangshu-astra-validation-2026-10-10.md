# Wangshu Astra 正式配置、文字与图片验证（2026-10-10）

F03/PF03、PF09、QE12。用户授权使用桌面认证 TXT 配置 Wangshu Astra。当前真实用户配置已保存为默认模型，文字连接和一次随机图片识别均真实通过；随后只为该正式条目启用图片输入。此记录不把单张合成图片通过等同原型视觉修订或业务验收通过。

## 当前正式配置

| 字段 | 保存值 |
| --- | --- |
| 用户 profile | `C:/Users/yuemokm/AppData/Roaming/slash` |
| entry ID | `cbfc4c25-c0f2-460e-99fa-4cd62e7a0553` |
| provider / modelId | `wangshu` / `gpt-6-astra` |
| 端点 origin | `https://wangshu-api.com` |
| 协议 | `openai-responses` |
| 显式代理 | `http://127.0.0.1:7897` |
| 默认与路由 | 该 entry 为默认；`fixed`，coding/general 使用同一 entry |
| 当前正式 `supportsVision` | `true`，在本次真实看图通过之后保存 |

配置由原有 `ModelSettings` 接口保存，加密凭据往返通过；其他模型、会话/资料/历史、偏好及其他 KV 保留。认证 TXT 的内容和密钥不进入本报告、图片、提示词、公开日志或源码。初次保存时 `supportsVision=false`，先避免把文字成功误报为看图成功；[初次配置与文字结果](../.test-data/wangshu-astra-config-20261010/result.json) 保留这一历史时点。

正式文字连接测试只有一次真实请求，使用本条目的 Responses 和显式代理，正常成功，耗时 **15,268 ms**，收到完整4字符正文。它证明本次文字路由可用，不证明工具调用、图片理解、长文质量或持续可用性。相关正式代码：[模型设置](../main/settings.ts)、[模型运行时](../main/model-runtime.ts)、[显式代理](../main/model-proxy.ts)、[文字连接测试](../main/model-connection-test.ts)。

## 随机图片的一次真实验证

复用现有 Pi `0.86.1` 公开模型运行接口和原有 Slash adapter，没有新增依赖、通用视觉框架或改产品源码。旧参考实现为 `.test-data/vision-capability-probe-2026-10-08` 的随机 PNG/单请求方案；新[最小探针](../scripts/vision-capability-probe.mjs) 使用纯 Node PNG 编码生成无私密内容的 **660×420** 图片，内含两行三列卡片，各有随机两位数字，六种颜色的布局随机排列。只有原始 PNG 和固定格式提示词进入请求；本地答案文件不发送，PNG只含IHDR/IDAT/IEND，没有答案metadata。

正式配置代理提供的最小加密来源是 `.test-data/wangshu-astra-config-20261010/isolated-profile`，只有该模型、加密KV和Local State，没有用户历史。探针复制到独立随机 profile，**只在测试副本临时声明图片输入**；该最小来源保持 `supportsVision=false`，不影响PRD/SFA已冻结输入。使用官方 `ModelSettings.credential` 在测试进程内解密，不保存明文密钥。

`createRuntime.reviewContent` 当前固定配置一次重试，不能满足本探针的零重试要求。因此这里调用现有 `createOpenAICompatibleModelRuntime` → Pi公开 `completeSimple`，设置 `maxRetries:0`、输出最多2048 tokens、90秒取消信号，并在`onPayload`与`fetch`分别严格校验。正式proxy branch会覆盖fetch，故测试通过Pi公开fetch参数包住**同一现有 `modelProxyFetch`**；真实模型、端点、Responses协议和显式代理均未改变。请求无工具、无会话历史、无外部文档，仅固定user提示词和一张精确hash的图片，第二次payload/HTTP请求被拒绝。没有查询metadata、自动路由、超时续跑或盲重试。外层110秒仅负责结束自有诊断进程，不改变产品期限。

实际主代理执行的唯一云命令：

```powershell
node scripts/vision-capability-probe.mjs --run-cloud --case-dir .test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d
```

结果：**1次payload、1次HTTP请求，HTTP 200、stop正常结束，6/6位置的数字与颜色完全匹配，15,807 ms，实际归一化usage 486 input / 148 output / 636 total tokens**。源码评分要求完整2×3结构、每格颜色与整数精确一致，不容许换位置、漏数字、额外宣称或宽松相似判断。该次图片为上行红50、蓝33、绿57，下行青90、橙69、紫72；主代理另行人工查看PNG并复核评分。原始模型文字/思考未保存，安全结果只保留计数、usage、结果和时间。

证据：[挑战PNG](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/challenge.png)、[冻结manifest](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/manifest.json)、[安全云结果](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/cloud-result.json)、[自有进程退出](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/launcher.json)。`cloud-once.lock` 防止复用同一case再次发云请求。

## 正式启用图片输入及数据保护

看图通过后，[最小配置helper](../scripts/model-vision-enable.mjs) 先两次查询进程，确认没有真实用户 Slash 应用运行；其他Electron均为隔离验收进程，未停止或操作它们。helper先在内存运行正式 `ModelSettings.upsert` 验证候选变化，再复核当前整个KV快照未变，才通过原 `Store`/`ModelSettings` 保存真实用户条目。无密钥参数、无解密、无凭据写入、无云请求。

```powershell
node scripts/model-vision-enable.mjs --profile C:/Users/yuemokm/AppData/Roaming/slash --entry-id cbfc4c25-c0f2-460e-99fa-4cd62e7a0553 --evidence-case-dir .test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d
```

保存后逐项核对：只有目标模型持久化的 **`supportsVision:false→true`** 和正常 **`updatedAt`** 改变；整个其他state、所有非state KV及加密凭据字符串完全一致，默认模型与路由保持。配置helper按准确Store JSON持久化形态比较，Zod产生但不会写入的undefined可选键不算持久化变更。两次内存候选检查在这一比较修正前拒绝，均未写真实数据库。最小加密来源仍为false，PRD/SFA冻结profile未变。[正式启用结果](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/vision-enabled.json)记录全部保护检查。

## 检查与边界

- `node --check scripts/vision-capability-probe.mjs`、`node --check scripts/model-vision-enable.mjs`通过。
- `node scripts/vision-capability-probe.mjs --preflight-only --case-dir .test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d`：真实Pi本机Responses SSE **2/2场景通过**。一个验证精确PNG与JSON评分；另一个返回500并观察仅1次HTTP、零重试。此处预先给定SSE答案只验证协议，不认证视觉理解。[本机结果](../.test-data/vision-capability-c96a019b-eadd-41ce-b4eb-a591f124017d/preflight-result.json)。
- `npx tsx --test tests/vision-capability-probe.test.ts`：**3/3通过**，覆盖随机PNG、严格评分及拒绝变更图片/答案泄漏/工具/隐藏instructions。
- 主代理合并命令 `npx tsx --test tests/prd-review-transport-diagnostics.test.ts tests/prd-review-transport-runtime.test.ts tests/sfa-focused-contract.test.ts tests/vision-capability-probe.test.ts`：**11/11通过**；另一批 `npx tsx --test tests/prd-review-responses-proxy.test.ts`：**4/4通过**。15是两批不重叠用例合计，不是一批结果。主代理`npm run check`、`git diff --check`退出0。
- 本轮探针与启用没有build、dist写入或打包。正式profile已启用图片能力，下一次打开应用读取新配置；未修改其他模型的图片声明。
- 一次合成PNG正确只证实这条路线本次理解了实际像素，不认证复杂原型审美、OCR普适性、工具写入、修改落稿、手机布局、同版本复核或永久视觉可靠性。原型完整视觉闭环仍需真实成果和独立截图验收。

通俗说：Astra现在已经实际读对一张随机测试图，因此允许它接收参考图片和原型截图；这不等于它已把任何真实原型改好。

流程见[Mermaid源](wangshu-astra-validation-2026-10-10.mmd)。

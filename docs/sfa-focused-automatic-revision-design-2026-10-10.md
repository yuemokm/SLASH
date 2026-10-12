# SFA 局部自动修订：触控尺寸与交付版本

目标依据：`docs/active-development-goals.md` 的原型自动制作/自检/修正交付，以及既有 SFA 独立稿记录的移动小按钮触控不足 44px。对应 F02 会话成果编辑、F10 原型历史能力与本轮移动可用性目标。此任务只证明已离线稿的局部自动修订闭环，不能代替原 CDN HTML 全自动离线转换验收，也不能把此前人工稿称为 Slash 自动生成。

## 输入与实际任务

- 授权基线：`output/sfa-delivery-20261010/异动端SFA主要界面-改进版.html`，SHA-256 `0be9757b651548831a19853a53fc79e0c6cc4799c14659450981b970989a6232`。
- 源只读挂载；新 UUID 隔离目录包含 preflight/cloud 两套 profile/workspace。只从此前同任务授权配置复制选定模型元数据、加密密钥、选定能力缓存与 Local State，不复制会话、工具历史或用户工作区。不持久化明文密钥。
- 历史本机预演仅检验 baishan / DeepSeek-V4-Flash-0731 加密配置可读，没有发送该模型云请求。用户最新授权改用 Wangshu Astra；新云 case 须由主代理提供已加密 profile 与验证后的 provider/model/protocol，入口不再默认旧模型。视觉能力未确认，隔离实验显式关闭视觉输入。任务文字提供 CSS UTF-16 offset=168566、limit=9653，避免阅读内联 Vue 大库；不提供已写好的修改代码。
- 模型实际调用 `read_draft`，用宿主真实哈希和 pending ID 通过 `edit_draft` 形成新 pending。只改现有 CSS 中按钮触控尺寸，所有有文字操作按钮宽高 ≥44 CSS px；保持 320/390 宽度无横向溢出。保留蓝/白/灰层级、字号、数据、动作、模拟限制、预编译 render 与离线 Vue。禁止整页 `write_draft` 或模型自行 apply。

入口与合同：`scripts/sfa-focused-fixture.mjs`、`scripts/sfa-focused-contract.mjs`；可执行合同测试 `tests/sfa-focused-contract.test.ts`。不修改正式原稿、不改产品源码、不 build/dist、不打包应用。

## 宿主验收

1. 真实编译 Service/Pi 与网关，记录 read/edit 成功工具记录及真实 Pi session 的范围、编辑字节数、usage 数值，不复制完整响应或思考正文到额外报告。
2. pending 与授权路径、owner Run、baseline hash 绑定，正式副本在 apply 前仍相同。HTML 在 `<style>` 外逐字不变，因此业务脚本、render、离线依赖及全部业务字段不变；拒绝新 CSS 远程依赖。
3. 原有 10 例、77 步定义哈希保持不变，作为必检规格，真实 Service 在 pending 与 applied 版本分别运行。原固定 DOM 断言不放宽。
4. 另加 7 例、46 步（含 24 次实际按钮几何断言）：320/390 首页、路线、访销、复盘、外勤抽屉、失访弹层；使用既有 `min-target-size`、真实点击/输入及无横向溢出断言，并保留截图。额外几何覆盖是指定按钮及代表状态，不宣称全站可访问性认证。
5. 只有范围与 pending 浏览器回归通过，宿主才 apply 到隔离副本，使用生产 `listFileVersions/readFileVersion` 校验历史快照可读回原基线。
6. 使用实际 `preparePrototypeExport`、`preparePrototypeAcceptanceExport`、`exportAcceptedPrototype` 静态/必检/版本门禁。暂改隔离副本证明旧版本导出拒绝且不生成文件，再恢复已验证字节；最终导出 hash 必须与 pending/applied/验收入口一致。
7. root 看云任务实际生成版本截图，确认尺寸增大没有挤压/遮挡。宿主明确 `humanScreenshotReview=pending`，DOM 自动通过不代替人工判断。

## 执行与界限

准备：`npx tsx scripts/sfa-focused-fixture.mjs --prepare-only --encrypted-profile <approved-profile> --provider <verified-provider> --model-id <verified-id> --protocol <verified-protocol>`。从选定配置精确核对身份；不读取桌面认证明文，不接受默认猜测。

本机预演：`npx tsx scripts/sfa-focused-fixture.mjs --preflight-only --case-dir <prepared-dir>`。固定 localhost SSE 实际调用 Service/Pi read/edit，fetch 拒绝本地模拟模型以外的网络；只验证链路/门禁，不证明云模型自主修改。preflight 与 cloud 的 profile、workspace、会话互不复用。

云运行：由主代理统一执行 `npx tsx scripts/sfa-focused-fixture.mjs --run-cloud --case-dir <frozen-prepared-dir>`。要求同 case 本机 preflight 通过、脚本与入口版本仍冻结；云 profile 必须无旧 Run、端点/模型/协议与准备身份一致。单次 outer run、不自动重跑，Pi 内部配置最多一次 retry；8 分钟任务上限、12 分钟 owned 子进程 watchdog。超时先取消并等待终态，保留 pending/工具记录，不默认 apply。旧 case 的脚本 hash 因配置入口调整而不再满足新脚本门禁，不能意外启动旧 DeepSeek 云任务。

首轮 preflight 在 `sfa-focused-ed50bdd1-9059-46f1-8bec-62506498fc03`：真实网关 read/edit、原 pending 10/77、额外 7 例均通过；版本断言误用 Service 简表 API 导致 fixture 失败。真实备份存在；已改为实际版本读取 API，保留失败记录，不据此称产品版本机制失败，也不隐藏失败。

第二轮本机预演 `sfa-focused-21a3b93e-b96c-4ca7-af17-55f3520f3922/preflight/result.json` 状态 `passed_local_transport_only`：localhost 3 次实际 Pi 请求，云 0、图像 0；Service/网关 read/edit、CSS 外保留、pending 10/77、额外 7/46、隔离 apply、历史读回、applied 10/77、旧验收导出拒绝且无文件、静态/必检/同版本实际导出全通过。导出 hash `0584cdb05104f4a5c8a9e7dfa677b0140f639fee0d5b393ba597ddc488abb4a1` 是固定本机响应产物，不是云模型交付。之后仅配置 bootstrap 改为显式来源并增加新 profile/身份门禁；语法检查与 2 项合同测试通过。新的 Wangshu case 仍需再次本机 bootstrap/preflight。

本机 `TaskAcceptance.latestReport.status/automaticStatus` 都是 `unverified`，没有把缺少自动视觉与业务全覆盖改成 passed。此次通过的是明确保留的 DOM、触控尺寸、权限和版本导出合同；实际云修订仍须主代理截图审查。生产导出门禁允许当前必检 DOM 与入口静态检查通过的同版本文件，不等于整个任务已获业务批准。

## Astra 冻结 case

新加密来源：`.test-data/wangshu-astra-config-20261010/isolated-profile`；精确条目 `cbfc4c25-c0f2-460e-99fa-4cd62e7a0553`、provider `wangshu`、model `gpt-6-astra`、protocol `openai-responses`，baseURL `https://wangshu-api.com/v1`，代理 `http://127.0.0.1:7897`。只复制既有加密配置，不读取或复制桌面认证明文。

新 case `.test-data/sfa-focused-4ed5002f-d8b3-4243-80c7-d7a4fcce2145` 已通过完整零云 preflight，状态 `passed_local_transport_only`、23 项 checks；localhost 3 请求、云 0、图像 0。原 pending 与 applied 10/77、新增 7/46/24、历史可读回基线、旧验收导出拒绝且不生成文件、恢复后同 hash 实际导出均通过。源码/脚本/受保护输入 hash 当前匹配；cloud/profile 独立且为 0 Run/0 会话。

本机模拟传输显式使用 localhost `openai-completions` SSE，因此没有把它称为 Astra `openai-responses` 真实云工具验收。主代理另已报告 Astra 单次真实视觉测试 6/6；本冻结 case 仍保留 `supportsVision=false`，只发文字任务，不跟随真实用户 profile 的视觉设置更新。

冻结 fixture SHA-256 `79e16b645ce805dfdcd211f7b77927da66700bf314b90fbb2ac9ed61c2c0d2c8`；contract SHA-256 `183b609018e1d4a0fb85036ec0ae6539c6fc2a757645751ffafa2d83540fcee8`。测试已改为自包含合成输入，`npx tsx --test tests/sfa-focused-contract.test.ts` 3/3 通过，无忽略目录/私有 SFA 数据依赖。

主代理统一执行：

```powershell
npx tsx scripts/sfa-focused-fixture.mjs --run-cloud --case-dir E:/code/slash/.test-data/sfa-focused-4ed5002f-d8b3-4243-80c7-d7a4fcce2145
```

以上为云启动前的冻结记录；实际结果如下，不复用本机固定响应 hash 作为云交付。

## 真实云结果与独立交付

真实 Astra Run `1d1a0ff5-5abb-4bb9-adf1-420748df64f9` succeeded，wrapper 正常 exit 0；`cloud/result.json` 为 `passed_pending_human_screenshot_review`，23 项具体 checks 通过。Run 131.141 秒包含宿主自动 DOM 回归，不作为模型纯生成速度或性能对比。repairRounds=0，未发生有限修稿循环。

真实 `read_draft` 与 `edit_draft` 各 2 次成功：首次编辑 6 项（old/new 文本 348/379 bytes），再次读取后按真实 pending ID 与最新 hash 编辑 1 项（37/37 bytes）。最终只改 7 条 CSS：chip、store-action 两处、通用 btn、review-entry、tabs、359px 媒体查询。CSS 之外逐字保持，protectedNonCssHash=`c0e399d1fb09fec4a2351c00a41aa5a5956a4841ab26f11a642aac9a8122a56c`，无新外部依赖、整页 write 或模型 apply。

**真实失败保留**：另有 2 次 `get_task_acceptance` returned_error。模型以 `section=summary` 同时传非空 sourceId/readId/reportId/itemId，Zod 分别返回 `code=custom`：“sourceId只用于sources/reads”“readId只用于reads”“reportId只用于report”“itemId只用于具体合同条目”。字段 schema description 已说明这些限制，属于模型参数误用并重复一次；附带 runId 也不是本 Run、cursor 不是宿主实际回执，但查询在 section 约束处已拒绝，未执行或写入。未构成权限/fatal 阻断；不能宣称全部工具成功或零工具错误。此次不扩大为工具契约重构。

原 pending/applied 10/77 与新增 7/46（24 次按钮几何）通过；原规格定义 hash=`0edc588032235a75f345ed81b3611ea09ec862f8f3ad63f0d29109bddf716574` 未变。历史 API 读回原基线；故意改变隔离版本后导出被 `PROTOTYPE_ACCEPTANCE_REQUIRED` 拒绝且没有文件，恢复验证字节后正常导出。对应 F12 关联修改、F14 历史与 F15 本地交付的本次局部验证。

独立交付：`output/sfa-astra-delivery-20261010/异动端SFA主要界面-触控优化版.html`；pending/applied/必检入口/实际 export/交付副本同 SHA-256：`08fa77302ba39a083cad3207a78b957b89d9f83acb19cf5c454a9d1293c3fe09`。新路径 create-only，原用户文件与此前人工稿不覆盖；README 与 Vue 许可一并保留。

主代理逐张查看该云 case 的 7 状态实际截图，未见新增横向溢出、截断或遮挡，蓝白灰层级保留；320首页toast为原有短时反馈。单独 `cloud/root-review.json` 与交付目录同名证据绑定入口及 7 图像 hash；这是主代理图像复核，不是人类用户批准或全站视觉认证。没有改写原机器 `humanScreenshotReview=pending`，TaskAcceptance status/automaticStatus 仍 `unverified`。模型图像输入未用于这次任务；模拟数据、外部集成与原CDN稿全自动转换限制仍按README披露。

尚未验证：云模型本次自主编辑、root 对云产物截图审查、外部定位/照片/导航/钉钉/后台集成、原 CDN HTML 完整自动转换。SFA 仍为原业务模拟数据；汇总与明细历史不一致仍保留并披露，不借尺寸任务擅改数字。

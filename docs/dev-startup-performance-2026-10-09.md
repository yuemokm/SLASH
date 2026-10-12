# 开发启动性能诊断（2026-10-09）

## 2026-10-10 真实项目根 BAT 最后一次隔离验证

PF10。独立应用根的11–17秒不能直接当作用户根目录结果，因此最后单独运行 `node scripts/dev-startup-profile.mjs --root-bat`：实际执行 `E:/code/slash/双击启动开发环境.bat`，保留根现有 Vite 缓存、全部历史文件和正常 watcher，用随机端口、全新测试 profile、隐藏窗口及同一 CDP 观察器。这次获明确授权执行开发 BAT 必需的根主进程/preload `tsc`，没有 Vite 生产构建、打包或删除缓存；只有此显式参数运行根编译，诊断脚本默认仍编译独立夹具。

真实根 BAT **通过且退出0**：含截图/退出总 **16,743 ms**；主进程/preload 编译 **2,534 ms**；Vite完整首页准备 **752 ms**；BAT到窗口 **11,861 ms**；窗口到 `did-finish-load` **3,750 ms**；BAT到首次 React DOM **15,731 ms**；BAT到诊断 `state` IPC成功 **15,752 ms**，该次IPC本身 **18.4 ms**。窗口前阶段还记录 BAT到Electron观察器入口 **6,990 ms**、入口到 `app-ready` **1,776 ms**、`app-ready` 到建窗 **3,095 ms**；这些是观察节点，不能直接等同某个业务模块的纯执行成本。

91个renderer请求，0源码/测试HTML重载、0依赖重新优化、0renderer错误、0被观察到的远程请求；Vite日志确认依赖hash一致并跳过优化。首页document耗时约2,445ms，其中CDP记录从开始到 `sendStart` 为2,434ms，实际DNS/连接/响应很短；这证明本次有浏览器发出请求前的等待，不能把这段算成Vite源码转换或归因某个schema。首React标记安装于页面约2,466ms，早于首React约3,863ms。根源码和配置前后固定，**完整根 `dist` SHA-256 前后相同**，虽然真实 `tsc` 执行了写文件。工作台截图与已视检的完整冷轮截图字节相同，界面和真实IPC均通过。

证据：[结果/源码与dist哈希](../.test-data/startup-profile-root-1791564237796/result.json)、[原BAT/Vite日志](../.test-data/startup-profile-root-1791564237796/root-bat.log)、[窗口/CDP/React/IPC](../.test-data/startup-profile-root-1791564237796/profile/startup-evidence.json)、[工作台截图](../.test-data/startup-profile-root-1791564237796/profile/workbench.png)、[自有进程与端口退出核对](../.test-data/startup-profile-root-1791564237796/process-cleanup.json)。仅核对并退出本次自有BAT/Electron进程，端口已关闭，未操作用户应用。测量结束立即释放根dist与UI独占窗口，没有追加benchmark。

本轮真实根目录也未重现约69/135秒慢启动；只有一次根样本，调试和隐藏运行可能影响时长，不声称稳定提速、完整解决偶发慢启动，亦没有证据支持拆分schema或改变HMR。通俗说：这次真实双击启动链约16.7秒完成；以后若再次等很久，已有计时能区分卡在编译、建窗还是页面。

## 2026-10-10 独占环境下的完整 BAT 冷/热分段取证

PF10。全量回归结束后运行 `node scripts/dev-startup-profile.mjs`，两轮均通过真实工作台、截图和 `state` IPC；没有改产品源码、根 `dist`、用户缓存或用户进程。[诊断脚本](../scripts/dev-startup-profile.mjs) 将当前源码、配置、锁文件、BAT、public 及历史编译依赖 `knowledge-web/lib` 复制到独立应用根，复用同一份已安装 `node_modules`，执行复制后的真实 BAT → npm → `tsc` → Vite → Electron。`tsc` 只写夹具自己的 `dist`，没有生产 renderer 构建或 electron-builder。Vite 配置只增加独立 `cacheDir`，保留当前首页扫描和 `.test-data` watcher 过滤。两轮各用空应用 profile 和随机端口；第一轮缓存目录不存在，第二轮复用同一 Vite 缓存。未清 Windows 文件缓存，冷指 Vite 缓存，不指重启后的冷系统。

[结果及 SHA-256](../.test-data/startup-profile-1791563969490/result.json) 证明夹具源码前后完全一致，根产品源码、配置、锁文件及完整 `dist` 前后相同。根 `scripts` 同时允许其他代理准备诊断脚本，完整哈希仍保留，其新增不作为页面源码变更；本次启动所用夹具 scripts 始终固定。`DEBUG=vite:deps,vite:hmr,vite:transform,vite:time`、[CDP 观察器](../scripts/dev-startup-profile-observer.cjs) 和 renderer Navigation/Resource Timing 共同记录阶段；源码和合法 HMR 保持原样。Electron 隐藏运行，观察器仅安装在本次自有进程。首 React 指 `.brand` 首次进入 DOM；IPC 指随后诊断主动发起的成功 `state` 请求，不冒称产品自身最早的一次 IPC。

| 阶段 | 空 Vite 缓存 | 复用 Vite 缓存 |
| --- | ---: | ---: |
| BAT → 自有启动链退出（含截图/退出） | 11,700 ms | 17,023 ms |
| 主进程/preload 编译 | 2,977 ms | 5,400 ms |
| Vite 启动 → 完整首页准备 | 395 ms | 474 ms |
| BAT → 创建窗口 | 8,773 ms | 13,563 ms |
| 创建窗口 → did-finish-load | 1,649 ms | 2,309 ms |
| BAT → 首次 React 工作台 DOM | 10,551 ms | 15,976 ms |
| BAT → 诊断 state IPC 成功 | 10,572 ms | 15,997 ms |
| 单次诊断 state IPC | 17.9 ms | 18.9 ms |

两轮均记录 91 个 renderer 请求，无 `page reload`、`full-reload`、依赖重新优化、renderer 错误或被观察到的远程请求。冷轮依赖扫描 **51.53 ms**、打包 **307.81 ms**，日志明确 scanner 找到全部依赖；热轮 `Hash is consistent. Skipping.`。因此本轮没有 unified/Markdown 动态发现反复优化证据。最长源码转换为 `App.tsx` 的 **86.09 / 116.12 ms**；`shared/types.ts` 请求为约 **164 / 204 ms**，未证明它构成持续导入瓶颈。网络中仍有浏览器排队与较大的开发模块，但本次页面阶段均在约2秒内，不能据此提出大拆包。热轮总耗时更长，主要增量在编译和窗口创建前，不能把 Vite 热缓存等同稳定加速。

原始证据：[冷日志](../.test-data/startup-profile-1791563969490/cold.log)、[热日志](../.test-data/startup-profile-1791563969490/warm.log)、[冷窗口/网络/页面阶段](../.test-data/startup-profile-1791563969490/fixture/.test-data/cold-profile/startup-evidence.json)、[热窗口/网络/页面阶段](../.test-data/startup-profile-1791563969490/fixture/.test-data/warm-profile/startup-evidence.json)、[分段与请求摘要](../.test-data/startup-profile-1791563969490/phase-summary.json)。冷轮[工作台截图](../.test-data/startup-profile-1791563969490/fixture/.test-data/cold-profile/workbench.png)已视检完整界面。自有 BAT/Electron/Vite 启动链退出0，没有操作用户应用。

两份探索失败保留：[首份](../.test-data/startup-profile-1791563823936/result.json)因夹具漏复制历史 `knowledge-web/lib` 在编译阶段退出；[第二份](../.test-data/startup-profile-1791563866699/result.json)实际 UI/IPC 成功且建窗到加载为26,831 ms，但 CDP 首文档标记存在安装竞态，未取得首次 React，按诊断完整性判失败。观察器补上新建 default execution context 安装后，重新采集上述完整冷/热对照；不将不完整探索样本拼入该对照。调试观察本身及系统调度仍可能影响时长，只有一组完整对照，不认证稳定性能。

本轮没有重现先前受并发测试 HTML 重载污染的约69秒等待，也未确定原135秒或偶发慢启动的完整根因。没有新增产品优化、延长产品等待期限、清用户缓存或关闭 HMR。以后若用户实际双击仍慢，优先用同一分段观察定位具体等待，不按静态导入数量猜测修改。

通俗说：单独测试时两次工作台都较快打开，但还不能保证每次如此；现在已有完整计时，下一次变慢能看出卡在哪一段。

## 2026-10-10 测试产物不再触发开发页面重载

PF10。已有 [fresh Vite 日志](../.test-data/startup-dev-dedup-1791562138536/fresh-vite.log) 在 `00:11:08` 和 `00:11:12` 明确记录两份 `.test-data/draft-edit-recovery-local-*/project/成果/recovery/index.html` 引发 `page reload`。`optimizeDeps.entries` 只限制依赖扫描入口，不限制文件 watcher；并发测试写出的 HTML 仍会干扰开发页面。现仅在 `vite.config.ts` 增加 `server.watch.ignored:['**/.test-data/**']`，保留正常源码与资源监听、HMR、原启动期限和故障恢复。

`npx tsx --test tests/dev-vite-watch.test.ts` **1/1通过**。[真实 watcher 回归](../tests/dev-vite-watch.test.ts) 在独立临时 root 导入本项目实际 Vite 配置，启动真实 Vite 与 WebSocket：新建测试目录 HTML 不发送 `full-reload`，修改临时 `src/main.ts` 收到 `update`，HMR 仍启用。没有修改用户源码、运行 Electron、启动性能样本或打包。测试证明过滤与正常 HMR，不代表完整工作台或稳定启动速度已经重新验收。

耗时边界按现有记录拆分：[原 BAT](../.test-data/startup-dev-dedup-1791562138536/bat-profile/startup-evidence.json) 建窗 `16:09:18.561Z` 至 `did-finish-load` `16:10:05.450Z` 为 **46,889 ms**；总 **69,306 ms** 还包含 `tsc` **3,898 ms**、完整首页准备 **9,336 ms** 以及 npm/Electron早期、UI/IPC观察、截图和退出。不能把减去前两个阶段后的约55秒全部称为页面准备。[fresh profile](../.test-data/startup-dev-dedup-1791562138536/fresh-profile/startup-evidence.json) 建窗至加载为 **53,330 ms**，且上述日志证明同次有测试 HTML 重载污染；不能把这个样本当作无干扰基线或完整根因证据。

冷缓存控制记录中，首页入口扫描约21秒，页面总耗时仍有明显波动。日志没有记录依赖变化后重新优化的明确消息，现有 metadata 已包含 `react-markdown`、`remark-gfm` 与 `zod`；尚不能归因 unified 动态发现。当前 `ConnectionsPanel` 为连接发现 schema 运行时导入 `shared/types`，确实扩大了静态导入图，但没有各模块或请求耗时证据证明它造成剩余延迟。本轮只修已证实的 watcher 干扰，未据此拆 schema、调整优化器调度或关闭 HMR。

后续应在全量测试结束后、冻结源码和锁文件，用独立 profile 单独采样；同时记录 `vite:deps`/`vite:hmr`、浏览器请求与导航耗时、首个工作台渲染和 IPC。先确认没有测试文件重载，再比较一致缓存条件下的冷/热启动。原“整体慢启动未解决、原135秒根因未查明”的限制保持。

通俗说：自动测试生成的页面不会再让开发窗口反复刷新；剩余等待还需要单独测量，暂不承诺启动变快。

## 2026-10-10 开发启动去掉重复生产构建

PF10。`scripts/dev-electron.mjs` 原来依次执行 `vite build`、主进程 `tsc`、Vite 开发服务。主进程在 `PM_SLASH_DEV_SERVER_URL` 存在时只加载开发 URL，生产 renderer 并不是开发工作台的必需输入。现只保留主进程与 preload 的 TypeScript 编译，生产构建仍由原 `npm run build` 完成；已有生产 renderer 字节保留。主进程唯一额外引用是窗口图标，开发模式改从 `app.getAppPath()/public/brand/slash.png` 获取，生产模式保持原 dist 路径。增加主进程编译与完整首页准备的阶段耗时日志，原就绪期限和失败/取消清理保持。

`tests/dev-electron.test.ts` 在全新临时根目录执行真实启动脚本，CLI 替身核对只编译主进程、已有生产文件保留、编译失败、入口缺失和端口占用阻断；与原 `dev-renderer-readiness.test.ts` 共 **17/17通过**。该组只验证进程编排，不当作真实桌面验收。日志：[定向检查](../.test-data/startup-dev-dedup-1791562138536/targeted-tests.log)。

随后单独串行验证原根 BAT，使用随机端口、空 profile 和隐藏测试应用；完整工作台与 `state` IPC 通过，退出0，总 **69,306 ms**，其中主进程编译 **3,898 ms**、完整首页准备 **9,336 ms**。将本次主进程/shared 编译产物复制到另一份全新应用根目录，明确不存在 `dist/renderer`，仍通过真实开发页面与 IPC，退出0，总 **69,293 ms**；实际 `app.getAppPath` 指向新应用根，public 图标存在。两张工作台截图已核对；不使用用户模型、历史或当前 profile。原生产 renderer 入口哈希前后相同，自有应用/服务已退出，未操作用户进程。证据：[结果](../.test-data/startup-dev-dedup-1791562138536/result.json)、[原 BAT](../.test-data/startup-dev-dedup-1791562138536/bat-profile/startup-evidence.json)、[无生产界面的新应用](../.test-data/startup-dev-dedup-1791562138536/fresh-profile/startup-evidence.json)。

这次实际执行了开发路径所需 `tsc`，没有执行 Vite 生产构建或 electron-builder。没有与旧脚本进行同范围受控耗时对照，测试时其他 Agent 仍可能修改业务源码；结果只代表当前时点开发启动，不代替主代理最后集成构建。两次仍约69秒，不能宣称整体启动慢已解决、稳定提速或原135秒根因已查明。renderer 网络观察为空，仅覆盖该观察器路径，不认证全部网络出口。

通俗说：双击启动时不再先做一份开发窗口不会使用的生产页面，第一次没有生产文件也能启动；剩余界面准备仍需继续查。

以下是前次 Vite 扫描诊断，保留其原始实测边界。

PF10。本轮确认并修正 Vite 冷启动的冗余入口扫描；没有稳定证明整体启动提速，也没有确认此前窗口创建前约 135 秒的根因。

## 已确认的缺陷与最小修改

`vite.config.ts` 原来没有指定 `optimizeDeps.entries`。已安装 Vite 8.3.0 的 `computeEntries`/`globEntries` 实现默认查找 `**/*.html`，仅排除构建输出、node_modules、__tests__、coverage。实际命中 25 个 HTML，共 327,617,501 字节，其中历史 release 中 16 个 `LICENSES.chromium.html` 各 20,472,827 字节；参赛视频入口也进入扫描。扫描器会读取每份 HTML 并匹配其中脚本。这些文件不是 Slash 的应用入口。

最小修改为 `optimizeDeps:{entries:['index.html']}`。当前产品开发入口只有根 `index.html`，源码入口为 `/src/main.tsx`，构建没有配置另一份 `rolldownOptions.input`。通过实际 `resolveConfig` 和 Vite 使用的 tinyglobby 核对，修改后的扫描集合只有根首页。历史 release、第三方许可证和用户资料全部保留。

配置语义依据为本机已安装官方 [类型说明](../node_modules/vite/dist/node/index.d.ts) 的 `DepOptimizationOptions.entries`（覆盖默认入口推导），以及 [扫描实现](../node_modules/vite/dist/node/chunks/node.js) 的 `computeEntries`、`globEntries`、`htmlTypeOnLoadCallback`。未新增依赖或更换 Agent 底座。实际集合见 [入口证据](../.test-data/startup-performance-entry-evidence.json)。

## 实际测量

设备：Intel i5-8300H，4 核/8 线程，约 16 GB RAM，Windows 11 教育版 10.0.26200；Node 24.15.0、Electron 44.0.0、Vite 8.3.0。每次使用全新 profile 和独立、空的 Vite cacheDir；未清空 Windows 文件缓存，也未在重启后的冷系统测量。测试只启动自有隐藏应用和 loopback 服务，没有构建、修改 dist、打包或触发云模型任务。

不带 NODE_OPTIONS 的现有编译版本机采样：Electron 调试入口返回 2,900 ms，观察到窗口 4,859 ms，完整界面 5,116 ms，state IPC 成功 5,254 ms。见 [原始记录](../.test-data/startup-performance-1791560895654/result.json)。最小 Electron `app.whenReady` 在入口代码执行后 56 ms；顺序导入主入口的本地依赖合计 3,316 ms，其中 Service 的增量为 2,952 ms。复用旧 NODE_OPTIONS 观察器的生产页面也在 4,768 ms 内成功并退出，见 [分离记录](../.test-data/startup-compare-1791560952500/result.json)。这些样本没有重现原 135 秒，不足以否定历史慢启动或归因某一依赖。

真实开发页面进行了两组冷 Vite 缓存对照。下表总耗时从启动 Vite 到完整界面、IPC 检查及测试 Electron 正常退出，包含截图和退出；扫描时长按 Vite 日志秒级时间估计。

| 对照 | 默认全 HTML 扫描 | 仅应用首页 | 默认/首页扫描时长 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 第一组探索 | 117,369 ms | 61,263 ms | 约 91 / 16 秒 | 两者完整 UI/IPC 通过 |
| 第二组控制 | 62,612 ms | 72,228 ms | 约 54 / 21 秒 | 两者完整 UI/IPC、SettingsModal 动态导入通过 |

第一组发生其他源码热修改，日志保留，不能用于严格量化加速。第二组在两个配置运行前后核对 dist/main/main.js、service.js、agent.js、src/App.tsx、src/main.tsx、package-lock.json 六份 SHA-256，全部一致。两种配置仅入口选择不同，并各用独立缓存；两次都实际 `import('/src/SettingsModal.tsx')`，导出的 SettingsModal 为 function。`entries` 没有阻止必需模块按正常路径加载。

证据：[第一组默认](../.test-data/startup-cold-vite-1791561006284/result.json)、[第一组首页](../.test-data/startup-cold-vite-1791561133316/result.json)、[第二组默认](../.test-data/startup-cold-vite-1791561354347/result.json)、[第二组首页](../.test-data/startup-cold-vite-1791561433868/result.json)；各目录包含 Vite 日志、profile/startup-evidence.json 和工作台截图。[最终截图](../.test-data/startup-cold-vite-1791561433868/profile/workbench.png)已人工核对。观察器 `errors=[]`、`cloudRequests=[]`；其云请求观察仅覆盖 Electron renderer，不能据此认证所有网络路径。

两轮扫描等待都减少，但第二轮总耗时反而增加约 9.6 秒，说明依赖打包、源码转换、Electron 初始化和系统负载仍有明显波动。该配置消除已证明的冗余扫描；不宣称整体速度收益稳定或原窗口前 135 秒已解决。没有增加等待超时来隐藏问题。

## 验证与交付边界

- `node --import tsx --test tests/dev-renderer-readiness.test.ts`：12/12 通过，已有慢响应、完整 HTML、取消、退出和真实错误诊断规则保留。
- 本轮源码只修改 `vite.config.ts`；主代理统一执行 check/build。此次采样使用修改前已有 dist 与当前 Vite 源码页面，不能作为最终编译产物或根 BAT 编译链已重新验收的证据。
- 本轮自有 Vite/Electron 已退出、只清理自有子进程树；没有操作用户应用、删除数据或制作便携包。后续更改配置需重启开发环境，已有加载/故障恢复路径继续适用。

通俗说：启动时不再顺便扫描旧安装包里的大许可证页面；软件仍需准备自身界面，因此目前不能承诺每次都很快启动。

流程见 [Mermaid 源](dev-startup-performance-2026-10-09.mmd)。

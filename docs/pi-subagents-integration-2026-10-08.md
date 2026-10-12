# pi-subagents 独立子任务接入

日期：2026-10-08。对应 PF03 / F08 / F12。适配模块和包级运行验收完成；主运行工具目录、Service 网关和界面的整体验收由六包集成记录汇总，不能用本记录代替整体验收。

`main/pi-subagents.ts` 提供 `createPiSubagentTools(PiSubagentOptions)`，返回模型工具 `delegate_readonly`。请求只接受 `task` 与 `purpose: research | check`，不能自行传目录、模型、权限、Shell 或递归配置。子 Agent 使用真实 `pi-subagents@0.76.1` 的独立 Pi 会话，并返回独立 session ID、只读工具范围、所用模型、真实最终输出、usage、耗时和截断标记。子任务意见不等于业务通过或用户确认，需要修改时仍回父任务 ChangeSet。

## 真实包与宿主边界

固定版本发布包的 `src/runs/shared/child-session.js` 导出 `createDefaultChildSessionFactory`，对应发布包 `docs/extension-api.md` 内部结构表明确列出的可注入会话工厂。它不是稳定 export-map 子路径；本项目通过 `piPackageFile('subagents', ...)` 仅定位精确固定版本，检查工厂存在，作为显式版本适配点，不宣称稳定通用 SDK。升级该包必须重新验证。

默认工厂会创建自身 ModelRuntime、读取默认 agent 配置并允许内建工具。本适配使用其 `loadPiCodingAgent` 注入口，在这些调用发生之前强制：

- 使用父任务已有 ModelRuntime 和明确模型/思考档位；不启动 CLI，不另外发现全局凭据，不切换模型。
- 使用独立内存 SessionManager 与 SettingsManager；没有父历史复制、个人规则加载或全局/项目扩展与技能自动发现。模型只读到明确任务及受控工具结果。
- 子工具同时满足父任务提供名单和宿主固定只读名单；禁用内建 read/bash/powershell/write/edit 等旁路，禁用递归委派、连接设置和发布。
- 工具执行复用父任务已有工具闭包，其中的 `o.log`、能力网关、授权目录、来源回执与版本检查仍然执行。子任务不会重新获得 120 次调用额度；委派入口本身也计入父预算。
- 每个父运行最多 3 项子任务、最多 2 项并行，单项只读工具最多 24 次，单项最多 120 秒并取父截止时间的较早值。父取消、调用取消、超额与权限撤销会中止正在运行的真实子会话并回收。

仍由第三方包真实工厂创建、绑定、订阅、prompt、abort、dispose 会话；没有将既有单工具代理改名为子 Agent，没有复制包的通用执行内核。子模型重试关闭，防止宿主有界任务外再积累另一层无界重试；会话压缩继续使用 Pi 原生机制。

## 本机验收

已执行：

`node node_modules/tsx/dist/cli.mjs --test tests/pi-subagents-runtime.test.ts`

最终 7/7 通过，全部使用真实固定包工厂、真实 Pi SDK 和 127.0.0.1 HTTP/SSE 模型夹具：

1. 子模型真实调用授权读取工具再返回结果；两次任务 session ID 不同，第二项不含第一项历史。项目中放置的 AGENTS 标记和会抛错的扩展未被读取/加载；传入的写入、执行及递归工具未声明给模型。
2. 父预算仅剩一次时，委派入口消耗一次，子工具因父共享预算拒绝执行；没有实际文件读取或第二轮模型请求。
3. 父目录外资料读取被原网关拒绝，外部资料正文没有进入模型。
4. 父 AbortSignal 终止正在等待的真实流请求，无后续读取/请求，子状态显示取消。
5. 已过期的父截止时间不派发模型，第四项子任务拒绝。
6. 正在流式等待时父截止时间到达会中止真实请求，不延长到新的子超时预算。
7. 两个真实子会话并行时第三个拒绝；模型无法通过参数选择 cwd/model。

此外，独立编译检查 `main/pi-subagents.ts` 通过（TypeScript noEmit、NodeNext、strict）。本代理没有运行根构建或打包；没有调用真实云模型、读取真实用户资料或上传内容。

### 编译后桌面验收

根代理统一构建完成后，执行 `node scripts/pi-packages-ui-smoke.mjs` 通过。证据：`.test-data/pi-packages-ui-1791469851992/evidence.json`，截图 `six-packages-settings.png`、`plan-child-feedback.png`。本机 Electron 正常关闭，对应独立 profile 残留进程为 0。

- 真实设置页显示六个固定包均已安装；Langfuse 默认关闭。填写本机地址/测试密钥并保持关闭，保存后密码输入清空，IPC/全局状态没有返回密钥，整个任务期间观测请求为 0。
- 真实编译后父 Plan 调用 `delegate_readonly`，真实固定包 child 用独立上下文调用 `read_file`，其结果回到父模型。父任务与子任务使用同一个本机模型凭据及文件授权；父私有标记没有复制到子上下文。
- 父模型真实调用 `review_plan`；Plannotator 官方 HTML 与协议可访问，任意文件读取路由返回 403。提交“补充来源日期”反馈后，`delegate_readonly`、`read_file`、`review_plan`、`review_plan_feedback` 均为同一 Run 的成功操作，子任务状态及批注状态也写入该 Run。
- 反馈后仍是 `awaiting_plan`，没有自动 Build、ChangeSet 或参考原件变更。脚本记录的应用源码/构建文件 SHA256 前后相同；没有为通过测试修改产品代码。批注使用真实本机 HTTP 协议，没有打开用户私人浏览器，也没有声称覆盖鼠标逐段批注动作。

独立审查提醒主接线补齐了 `delegate_readonly`/`check_draft_code` 的父读取能力检查、从执行开始计时的父截止时间；辅助包代理修正了观测事件同步等待问题，改为有界异步队列和有限关闭等待。子任务继续共享父 `o.log` 总调用预算，Plan 工具白名单在宿主网关与会话可见工具两层保留。

通俗解释：现在验证的是“另起一个只读助手帮忙查资料”，它与主助手用同一份权限和总额度。主助手一停，它也停；子助手不能直接改文件，建议需由主助手准备草稿。

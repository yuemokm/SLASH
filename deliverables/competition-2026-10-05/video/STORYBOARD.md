---
format: 1920x1080
duration: 180s
message: "slash把真实资料、规则、成果、运行证据与修订串进PM的日常交付。"
arc: 落地任务 → 独立字段维度 → 成果交互 → 失败证据 → 反馈修订与复验 → 版本与交付
audience: 公司AI项目赛评审与PM
mode: autonomous
---

## Frame 1 — 从一个PM任务开始
- status: recorded / keyframes visually checked
- src: compositions/01-work.html
- duration: 20s
- poster: 10s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
真实slash隔离项目会话与三份基线成果。说明对象是依据已有资料写PRD、做原型、持续修改的PM，不夸大覆盖范围。合成演示输入明确标注。

## Frame 2 — 四个维度分别核对
- status: recorded / keyframes visually checked
- src: compositions/02-rules.html
- duration: 28s
- poster: 14s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
合成最小字段资料，实际业务规则核对面板：仅正式落库/必填/新增展示/后续变更独立。来源版本一致不表示业务含义已确认。资料全文和凭据不进入画面。

## Frame 3 — 看真实控件怎么工作
- status: recorded / keyframes visually checked
- src: compositions/03-prototype.html
- duration: 30s
- poster: 15s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
真实基线HTML内容不改：系统编码只读、模拟采集定位地址只读、详细地址可录入。交互输入使用合成门店，不把模拟当真实后台。

## Frame 4 — 失败有位置和证据
- status: recorded / keyframes visually checked
- src: compositions/04-evidence.html
- duration: 25s
- poster: 12s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
真实基线缺服务失败入口。在隔离项目用实际runner断言记录失败与受控截图，携证据预填回会话。此镜头只说明具体缺项，不改模型页配合录像。

## Frame 5 — 修订之后再验收
- status: recorded / keyframes visually checked
- src: compositions/05-repair.html
- duration: 50s
- poster: 25s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
已录制实际生成HTML，SHA256 9533e2dc10ab5bc094b6141d8275c54fe69e98de42f4a42464cd23e323b51d73。经3轮局部反馈修订后，13项独立HTML界面交互通过。先显示真实应用中的来源，再切独立普通浏览器，实际操作本地模拟失败→保留输入→修改详细地址清错→关闭失败开关→重试模拟成功。录制仅在本工程的隔离副本，阻断非本地网络，没有主应用IPC；页面内容未修改。这里只验证所列HTML交互，PRD、约束对照和后台业务需分别核对，不宣称单次生成全对。

## Frame 6 — 交付哪个版本，验过什么
- status: recorded / keyframes visually checked
- src: compositions/06-delivery.html
- duration: 27s
- poster: 13s
- transition_in: cut
- motion: registry staggered-fade-up / linear chapter progress
实际产品fixture依赖变化使旧证据过期、用户确认必检范围与网页快照ZIP说明。合成工程回归明确标注；结束在来源→候选规则→成果位置→运行证据→修订的证据路径。复用Pi底层能力，区别落在PM交付流程。

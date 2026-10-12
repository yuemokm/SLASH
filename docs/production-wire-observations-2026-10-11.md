# 生产评测：完整请求事件窗核对

需求：生产方案 G4/G5 的真实试次身份和可比较性。实现位置：`shared/production-wire-observations.ts`、`main/production-wire-observations.ts`。对应 Mermaid：`production-wire-observations-2026-10-11.mmd`。

reader 以只读 SQLite 读取指定 Run 的整个 `run:<id>` 流，验证从 1 开始的连续序列、事件身份和安全投影。SQL 不返回消息正文、任意事件 text、prompt、请求 body 或凭据。列 text 与 payload.text 必须一致；仅按真实 Store 的 `durable.text || null` 规则将 payload 空串规范为 NULL，任何非空差异仍拒绝。

主会话参数与原生压缩参数按实际 start/request/end 窗口关联分开。关联依据明确为 `event_window_correlation`，不声称供应商内部请求用途；不根据 8192 等预算数值猜用途。主会话固定参数出现漂移时，完整覆盖可以成立，但可比较身份仍为未知。请求次数、事件 ID、时间和 Run ID 不进入跨任务参数身份；配置、路由、运行模块哈希仍由 start 单独绑定。

`verifyProductionWireObservations` 只验证证据自身一致性。最终 evaluator/collector 必须重读实际 SQLite，并严格核对整个安全事件窗及摘要；追加事件也会使原证据不再相等，不能用封存 JSON 自证真实。

封存与根集成：

- 首版 `wire-seal.json`：`ff3958a9ee636976e7e3118c147aeffd0526167e2ca0947f49a96edc8211f13f`，13/13、类型检查通过。
- Store 适配最终 `wire-store-seal.json`：`0459be09871981ba3941ae75088adddc036fa7b9ca46f23961397b2ff7f5d186`，14/14、类型检查通过。含真正 Store.appendEvent 临时 profile、只读 SQLite 前后哈希、5000 行缺首段、重复、伪造、未闭合压缩和非空文本身份不符反例。
- 隔离证据：`.test-data/production-wire-observations-isolated-20261011-319aa5/`。首轮新增 fixture 的保留字 alias / 隔离 tsconfig 类型加载失败日志保留；修复后另存最终日志，不覆盖失败。
- 根回执：`.test-data/production-wire-observations-root-integration-20261011/integration.json` 与 `store-normalization/integration.json`。三文件依照封存哈希先核后写；Store 本身未改。

真实旧 Store 适配核查：`.test-data/production-wire-reader-real-legacy-store-final-20261011.json`，SHA `42c8a790ae0340a017be421804c30acc58545013f647080f34ecf40203e4244b`。QE05/QE12 分别 1277/1498 个事件，均从序列 1 开始完整且主参数可比较；实际压缩窗口分别 2/4 个。两个 DB 前后字节哈希不变。首版 QE05 将正常空串与 NULL 误判不一致的记录单独保留，没有改旧 profile 或回填旧 manifest。

限制：这些检查证明事件证据机制和实际 Store 格式适配，不能证明供应商支持指定推理强度，也不改变旧 QE05/QE12 的业务失败结论。旧 manifest 不升级。现有评测入口 overlay、统一检查/构建、真实桌面与新云批次仍须分别验收；SMB 双机因没有第二台 Windows 仍未验证。

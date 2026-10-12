# G2 验收调用说明候选

## 2026-10-11 根集成状态

候选已进入根 `main/agent.ts` 与独有测试，原 hash/patch 核验及实际字节 hash 见 [集成清单](../.test-data/production-three-candidate-integration-20261011/integration.json)。根类型检查通过；首轮定向 67 项中两项新测试因夹具依赖未建 `temp` 父目录失败，完整 [失败日志](../.test-data/production-three-candidate-integration-20261011/targeted.log) 保留。仅修夹具：使用系统临时目录下自行创建的专用父目录；随后 [定向复验](../.test-data/production-three-candidate-integration-20261011/guidance-temp-fixture-retest.log) 3/3 通过，9,347.8544ms。产品严格 schema、ID/来源身份、权限语义均未放宽。工具说明已合入，减少真实模型非法调用的效果仍待新试次。

对应流程：[Mermaid](production-acceptance-call-guidance-candidate-2026-10-11.mmd)。下文保留隔离候选阶段证据；根测试因上述临时目录修复已产生新实际 hash。

日期：2026-10-11。依据 QE12 的真实原生 schema 拒绝：顶层 `sourceIds` 非法，`criteria[].outputIds` 不能为空。候选仅澄清既有合法接口，不改变校验、权限或宿主登记规则。根源码、QE12/QE16 profile 均未修改，不计入正式48项成绩。

隔离副本：[acceptance-call-guidance-isolated-58074c6af32a4c2ca8e66585b17f177b](../.test-data/acceptance-call-guidance-isolated-58074c6af32a4c2ca8e66585b17f177b)。仅本子代理写入，node_modules 为只读复用 junction，TEMP/TMP、测试数据和日志均留在副本。未安装依赖，未运行根全量、构建或真实模型。

候选改动仅 `main/agent.ts` 的 define_task_acceptance 描述及任务质量提示：来源选择在 `prd.sourceIds`；新成果尚无 ID 时保存完整首稿，等待宿主自动登记，再读取真实 outputIds 定义检查；已有成果复用 ID，不重复新建草稿。每项检查必须有非空宿主 outputIds，不能编造或用占位 ID。

## 验证与限制

- `node node_modules/tsx/dist/cli.mjs --test tests/acceptance-call-guidance.test.ts`：3/3，40822.0237 ms。本机 HTTP 传输运行真实 Pi 与 Service.send；原生 schema 拒绝顶层来源及空成果数组，宿主拒绝虚构 ID，合法新草稿自动登记→读取 ID→define 成功，既有成果无需再次 draft。
- `node node_modules/tsx/dist/cli.mjs --test tests/agent-mode.test.ts tests/task-acceptance-model-view-runtime.test.ts tests/task-acceptance-model-view-service.test.ts`：8/8，22110.7872 ms。Plan、权限、摘要/分页、真实来源选择、不可变来源及撤权保持原有行为。
- `node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit`：通过；从根项目只读执行 `git apply --check`：通过，未应用。
- 首轮 1/3：测试误写宿主错误码 `OUTPUT_MISSING`，实际返回 `TASK_ACCEPTANCE_OUTPUT_NOT_FOUND`，本机响应触发重试后断言失败。原失败日志完整保留；仅纠正断言，未放宽产品校验。

本机模拟模型选择固定合法/非法调用，只证明实际工具说明已出现、合法顺序兼容且保护仍成立；尚未证明 Wangshu 模型看到澄清后会减少非法调用。没有伪造业务通过或用户人工核对。

## 待集成交付

[候选 patch](../.test-data/acceptance-call-guidance-isolated-58074c6af32a4c2ca8e66585b17f177b/acceptance-call-guidance-candidate.patch) 仅含 `main/agent.ts` 与专属测试。完整清单见 original-hashes.json / final-hashes.json；根 agent 与原 hash 相同，shared/schema 未修改。

| 文件 | SHA256 |
|---|---|
| 根/原 main/agent.ts | d1b96d462cbd214837274a27d570d6a5658f7b34e6e5ea41c7c58b0454c32e7a |
| 候选 main/agent.ts | 279f453fcb55efc1b94201aeaaaac416ce208e9ceaa79593d9d9943d591aec0b |
| 专属测试 | dab53d6ad84733dc77ae38365fb5eee28e2fea44148f18693bcbe92c3d30563e |
| patch | fbc15da2277087719153ebe717805afb0b779e3648e2e5bdfbf42360df8adeef |

通俗说明：验收清单需要引用软件已经登记的成果。候选把“先保存、再取得编号、最后写验收要求”说清楚；并没有允许空编号或让模型自己造编号。

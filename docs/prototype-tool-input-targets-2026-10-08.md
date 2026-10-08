# 原型工具输入与草稿目标契约

2026-10-08。范围：质量目标 2（具体任务验收）、3（未保存草稿隔离检查）、6（版本与回归）。本轮修复工具输入和身份可恢复性，不代表真实 QE12 中两项浏览器交互失败已修复。

模型调用的 11 处 Zod 工具 schema 统一通过 `main/tool-input-schema.ts` 转成输入 JSON Schema（`io: 'input'`）。模型可省略宿主默认值，例如 `sourceRefs`、`limit`、草稿 `dependencies` 与文本断言 `match`；原有 Zod 解析继续补默认值、拒绝未知字段、非法版本及超限参数。审查模型的输出协议不使用这个输入 helper。

`define_prototype_acceptance` 的简短回执及 `get_prototype_acceptance` 视图新增可选的 `targetState`、`targetReason`、`target` 和 `runRequest`。宿主核对真实入口、草稿 Change、原件基线、显式依赖、每份 owner 和授权后，返回仅包含 `mountId/path` 及必要 `draft` 身份的请求：

```json
{
  "targetState": "current",
  "runRequest": {
    "tool": "run_prototype_acceptance",
    "input": {
      "mountId": "真实目录ID",
      "path": "index.html",
      "draft": {
        "changeId": "真实ChangeID",
        "parentRunId": "入口实际owner",
        "expectedContentHash": "宿主返回的当前64位SHA-256",
        "dependencies": []
      }
    }
  }
}
```

示例身份仅说明形状，不能当作真实请求。`targetState=current` 只表示入口和显式依赖当前可核验，不表示规格来源当前、业务正确或验收通过。执行仍冻结并核对来源 hash、权限、规格和实际断言。来源变化会在浏览器执行前阻断并保留未知/陈旧报告；不会因为可复制请求而通过门禁。

`artifactId` 仅接受已注册成果的 `artifact.id`。`specId` 是用例规格编号，任务 `outputId` 是输出编号，`changeId` 是未应用草稿编号，四者不能互换。有效 `artifactId` 与显式路径冲突仍拒绝；错误 ID 不会被忽略后改用草稿。未落盘草稿使用真实 `mountId/path+draft` 即可，不要求先注册或应用。`register_artifact` 找不到文件时保留 `ENOENT` 失败，并提示草稿直接验收路径。

历史查询继续显示失效报告；目标 hash、原件基线或依赖无法核验时，视图返回 `targetState=unavailable` 及明确原因，不提供可执行请求。权限撤销和取消仍抛错，不降为成功。只读终态 Run 可查询历史目标，但不能借查询绕过浏览器执行要求的 active Run。合法恢复沿祖先授权，保留各草稿真实 owner；有 caller context 时优先检查该 context，不借历史执行权限放行另一个 Run。

普通无规格、无报告查询不读取依赖快照。有规格或历史、需要返回可复用目标时进行一次既有有界快照检查（最多 100 文件、16 MiB），并复用它检查历史报告，避免按报告数量重复遍历。只有规格没有历史的查询因此新增这一次读取成本。保存 pending 规格前用既有 overlay 校验身份和原件基线；没有扩大预览文件类型或目录授权。

验证位置：`tests/tool-input-schema.test.ts` 使用 Pi 原生参数校验；`tests/prototype-tools-runtime.test.ts` 用生产 `createRuntime`、真实 Store/Files/领域与本机 HTTP 流验证工具回执和 Plan 清单；`tests/prototype-acceptance-draft.test.ts` 与 `tests/prototype-acceptance.test.ts` 覆盖版本、撤权、历史、恢复、请求纯净和读取成本；现有 Service 回归与依赖测试保持运行。HTTP 回复和浏览器观察是明确的测试夹具，不证明真实模型会自行纠错，也不证明实际视觉或业务通过。

通俗解释：模型以后可以直接复制软件核验过的“这份草稿怎么检查”的请求。把“用例编号”误当“文件编号”时，软件会指出错误，而不会让它先覆盖正式文件。检查请求能执行和最终成果正确，仍是两件不同的事。

流程源见 [prototype-tool-input-targets-2026-10-08.mmd](prototype-tool-input-targets-2026-10-08.mmd)。

## 集成验证记录

类型检查、45 项定向检查和正常构建通过。构建仅保留既有前端包超过 500 kB 的体积提示。日志为 `.test-data/prototype-tool-contract-check.log`、`prototype-tool-contract-final-tests.log` 和 `prototype-tool-contract-final-build.log`。

首次有界并发全量运行记录 663 项、662 通过、1 失败：`image-reading.test.ts` 前两项通过后，独立测试进程以 `3221226505`（`0xC0000409`）退出，没有 JavaScript 调用栈。原日志 `prototype-tool-contract-final-tests.tap` 保留；该文件单独串行复跑 4/4 通过（`prototype-tool-contract-image-reading-serial.tap`）。未找到能绑定该进程的系统故障事件，原因仍未知，不能直接归因为并发或判定只是偶发。后续串行全量结果在最终集成记录补充，不能用单文件通过抹掉初次异常。

最终串行全量 **664/664 通过**，零失败、取消或跳过，exit 0，耗时 423256.0328 ms。完整日志 `.test-data/prototype-tool-contract-final-serial-tests.tap`。没有改源码来回避首次异常；初次 worker 中止使剩余图片用例未全部完成，因此两轮计数不同，不能相加。该复测证明当前串行组合通过，原生异常的确切原因仍未确认。

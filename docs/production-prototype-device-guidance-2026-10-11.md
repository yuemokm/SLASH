# 原型本地验收的网络与设备说明

2026-10-11：独立候选已获父审批准并串行合入根；[根集成回执](../.test-data/production-device-guidance-root-integration-20261011/integration.json)保留原/最终/实际 hash 与 patch 检查。两个实际文件与封存字节完全一致。与 collector/wire 的根组合专项 19/19、exit0（26898.0206ms，其中设备既有专项7项），日志位于 `.test-data/production-collector-authorized-target-20261011/targeted.log`。本文不代替真实原型验收结果。

现有 `main/prototype-browser.ts` 已启用离线网络仿真，只读取冻结的授权 HTML 与本地相对依赖；权限请求、权限检查和设备权限处理全部拒绝。定位、摄像头、麦克风等服务不能作为受限本地验收的可用能力。

本次仅补充 `main/agent.ts` 的 `run_prototype_acceptance` 工具说明及 `main/prototype-guidance.ts` 离线制作建议。核心流程应提供符合业务规则的可操作本地示例或替代交互，不能仅等待不可用的真实服务，也不能以手填或示例结果冒充真实定位、身份核验或服务校验。必需的真实验证未完成时保留相应业务状态。模拟范围与未接服务仍记录在原型之外的 Slash 交付说明，不在产品界面插入制作声明。

封存：[seal.json](../.test-data/prototype-device-guidance-candidate-94ebb082-5d1e-4d56-abab-753811448454/seal.json)，SHA-256 `036fe1544c1bc4944136c38983fd6031260fdeaae2c0f3af325384206afb997f`。两份相对路径 patch、原/新 hash 均在该目录。隔离 node 类型检查 exit 0；既有原型指导与真实 Pi 工具专项 7/7，通过时间 10362.5788ms。首次隔离类型检查缺少复制的三个知识发布依赖，保留失败日志；补齐隔离支撑文件后通过，未改变相关业务源码。

没有新增能力、协议或依赖，没有放宽权限，没有修改用户自定义提示、工作空间 skill 或已接受任务保存的提示快照。本次没有新增真实页面/设备交互验证，也没有付费模型请求，不能把说明完善当作原型业务质量通过。

用户后续明确“先查资料再问”的取舍仅属于项目 skill/评测任务。通用 source-first 三文件候选已在改写前停止，不合入全局 Agent；隔离复制与停止记录保留在 `.test-data/source-first-guidance-candidate-94b7662c-e20b-4b81-9894-82660c0b884e/cancelled-before-edit.json`。

通俗解释：验收浏览器不能替用户真的定位或拍照，但原型仍应让用户试完整操作过程。示例操作可以展示流程，不能被记成真实业务验证成功。

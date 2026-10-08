# 白山思考参数真实对照（2026-10-07）

## 目的与边界

此前复杂原型修改连续在单轮输出达到 12,000 token 时中断，只有思考内容而没有可执行的工具调用。容量设置和 Pi 参数传递已通过本地真实请求构造验证，本次只验证当前代理端点的参数行为，不把简单连接测试当作业务成功。

测试模型为 `DeepSeek-V4-Flash-0731`，端点为白山 `https://api.edgefn.net/v1/chat/completions`。四个隔离实例均通过正式 `modelTest` 读取应用内加密凭据，测试包装器只对这一次请求替换合成题目和指定参数；没有执行模型返回的工具，也没有修改用户配置或业务文件。

同一题目计算三笔订单折后金额，要求通过纯声明函数提交 `[144,90,84]`、总额 `318` 和数量 `3`。四次均使用 `max_completion_tokens:1024`、相同 prompt、相同工具定义及 `tool_choice:required`，只改变思考字段。每个格式一次请求，无自动重试。

## 实际结果

| 请求格式 | HTTP / 完整工具调用 | 返回思考字符数 | 输出 token | 调用耗时 |
| --- | --- | ---: | ---: | ---: |
| `thinking:{type:"disabled"}`（当前实现） | 200 / 数值正确 | 245 | 193 | 6.821 秒 |
| `chat_template_kwargs:{enable_thinking:false}` | 200 / 数值正确 | 196 | 170 | 3.279 秒 |
| `chat_template_kwargs:{thinking_mode:"disabled"}` | 200 / 数值正确 | 260 | 203 | 3.203 秒 |
| `enable_thinking:false` | 200 / 数值正确 | 259 | 202 | 5.610 秒 |

四次均收到完整 SSE 终态和正确工具参数，均仍包含 `reasoning` 内容。单次样本中的耗时差异不能证明某格式更快或更稳定；也不能证明任何一个格式关闭了该模型的上游思考。因此本轮没有据此修改产品适配，没有提高未知模型的默认输出容量。

官方文档列出了这些参数格式，但关闭示例使用其他型号，不能直接推导当前 Flash 型号的具体行为：[白山接口文档](https://ai.baishan.com/docs/docs/llm-api.html)。

## 证据与后续

- 脚本：`scripts/pm-thinking-control-diagnostic.mjs`。
- 独立回执：`.test-data/pm-thinking-control-real-2026-10-07T05-45-45.749Z-OrnKXT/{baseline,chat_enable,chat_mode,top_enable}/result.json`。
- 回执只保存安全计数、合成数值、用量和终止状态，不保存密钥、原始思考正文或请求头。
- 四次均验证 seed、原业务成果及旧失败证据哈希不变。
- 下一步采用新会话测试已有原型的局部业务修改，缩小单次范围并排除旧历史影响；这仍是待执行的业务验收，不是本表已通过的能力。

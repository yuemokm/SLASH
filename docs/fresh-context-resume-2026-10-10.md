# 明确短上下文恢复

根集成补充：48项相关回归、`npm run check`及`npm run build`通过；构建保留既有大chunk提示。原PRD默认续跑已自然因上游请求错误失败，保留4278字符草稿；已在新编译版正式启动fresh恢复，真实效果及完整Word尚待验收，未打包。

2026-10-10，PF03/PF05/PF08/PF09。代码已实现；运行中的dist保持冻结，没有对真实模型或当前PRD任务调用新路径。

## 问题与行为

明确恢复原任务时，默认仍打开已有Pi会话，注入根输入和最近检查点。大量历史与长请求可能让恢复再次进入压缩。本次增加可选`freshContext`：调用者明确提供涵盖原范围、模板、真实草稿状态和剩余工作的短摘要，宿主通过现有Pi公开接口创建新文件并链接旧会话。旧消息、12k部分回复和工作流/模板正文预览不带入新模型上下文；来源及模板仍做真实版本预检，路径、哈希和冻结结构可由正式工具取得；原请求仍在历史与任务合同保留，摘要不改变冻结要求或授予权限。

它降低旧上下文重复带入的负担，但不是自动无损压缩器；摘要质量、完整PRD与真实模型效果须单独验证。缺少范围或模板的摘要不能据此宣称完整任务已完成。新会话仍使用现有Pi原生压缩、工具组和运行预算。

## 复用检查

2026-10-10先查[Pi包目录](https://pi.dev/packages)，其列表标注`billion-context`月下载779.6K/mo；这是目录当次月下载口径，并非安装量或稳定性证据。npm当次公开元数据为0.1.189、MIT。它属于压缩扩展，跨底座兼容与取消、恢复、持久化、回退没有在Slash完成本轮验收，因此不切换默认压缩底座，也未新增依赖。

直接复用现有锁定`@earendil-works/pi-coding-agent`0.86.1、MIT、headless SDK。公开`SessionManager.create(cwd,sessionDir,{parentSession})`及`newSession(options)`均有父会话参数；本地锁定版本的声明和实现已核对。参考[官方session-manager源文件](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/session-manager.ts)和[SDK说明](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)。下载量用于筛选，选现有官方能力的依据是无需更换执行底座且符合此次明确恢复需求。

## 可执行契约和接口

schema：`shared/run-resume.ts`，`summary`非空、去首尾空格、≤12000字符、禁止空字符，嵌套与外层请求均拒绝额外字段。没有传`freshContext`时不触发新行为。

正式IPC例子：

```json
{
  "type": "resume",
  "id": "原失败或中断Run的ID",
  "freshContext": {
    "summary": "沿用原27个流程与已冻结七章模板。唯一目标仍是原PRD；草稿仅为骨架，须先read_draft核对，再逐段补齐业务规则、字段、状态、异常、集成及验收；来源版本按原合同核对。"
  }
}
```

`main/main.ts`把此可选字段传给`Service.resumeRun`；不能从IPC提供session路径、切换模式或权限。宿主保存`contextResume`（模式、摘要、原输入哈希、父Pi文件）及每轮`piSessionFile`，后者优先作为父会话路径；旧Run缺少该字段时沿用既有会话路径，仅用于历史链接，不读取其消息。

Run继续用`resumedFromRunId`关联父链；`beginTaskAcceptance`沿用原合同、输出、模板、基准和要求。草稿沿用既有owner、CAS、资源锁和版本校验；继承来源读取回执保留原readAt；本轮来源版本预检单列locator=fresh-context-version-precheck、includedCharacters=0、truncated=true，不冒充给新模型提供了正文；原已读回执与原冻结来源仍保留。当前workspace、权限、模式、模型和来源版本仍执行原检查。正在退出的runtime、已取消任务、结果未知的外部或数据库操作继续拒绝恢复；变更工作流来源在创建runtime前失败。

数据库无需新表或破坏性迁移：现有JSON状态增加可选字段，旧记录仍可读，PRAGMA/schema不变。默认恢复不被自动切换；原Pi文件不删除、不重写，新文件持久化`parentSession`用于追溯。

## 验收与限制

- `npm run check`通过，两套TypeScript无输出类型检查；未生成dist。
- `tests/fresh-context-resume.test.ts`4/4通过：正式请求schema的新旧兼容与参数拒绝；同卡owner/原合同/模板/来源回执继承且不重复长输入；未知结果/取消/来源变更保护；本机HTTP夹具下真实Pi新文件parentSession关联、旧messages不带入、原文件字节不变、仅一次新请求而无旧历史压缩。
- 同批`draft-resumption-service`7项、`runtime-recovery`10项、`prd-template-service`13项均通过；最终合并34/34通过；初次合并34项有1项夹具错误（先执行默认open会更新旧文件系统提示），已调整在默认兼容核验之后记录旧文件，再验证fresh路径不修改它；修正后fresh4/4通过。未将夹具失误当产品故障。
- 没有云请求、build、electron-builder、便携打包、修改当前live profile或实际PRD源数据。IPC schema与Service及真实SDK已验；冻结应用中的Electron IPC入口、新路径真实PRD续作及完整业务质量未验。

通俗解释：任务和原稿都保留，只让模型带着一份明确的工作摘要继续，减少反复翻旧聊天；这并不代表它已经补完PRD。

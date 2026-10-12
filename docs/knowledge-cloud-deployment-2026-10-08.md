# 知识库云端发布验收（2026-10-08）

## 实际目标与授权

用户授权删除原暂停的 CODE 项目，并在 yuemokm 组织按免费方案创建 slash-knowledge、新加坡区域。旧项目已由官方 CLI 删除；新 Supabase 项目为 `apxdejyicmuzfhbtckup`，PostgreSQL 17.11。免费方案未升级。费用工具不可用，改用组织套餐及官方价格页核对，并取得用户费用确认。

Vercel 原 MCP 范围权限不足、本机令牌失效，用户完成官方设备登录后使用 CLI 部署。项目 `prj_zNpEWgB2zUCOdO6sWjK6h4VwGabg`，团队 `team_rr55UfO2j2hD3wnsEKYgQkpS`。网站地址：https://slash-knowledge.vercel.app 。首次部署 `dpl_5jt6NVeYf4Cmk1M3g1Zr3nY1vHQa` 已 Ready。

## 本轮行为

- 桌面知识库增加预检、明确确认发布、版本更新、停止分享和未知结果核对；同事账号可用邮箱填写。复用同一 bundle 白名单与回执校验，未另建发布算法。
- 发布专用管理密钥由桌面 safeStorage 保存，不进入模型或网页服务器。网页只持有公开 Supabase key 与独立模型密钥；Vercel 服务端敏感变量保存模型密钥。
- 发布前持久化 operation；断连不重发，重启查询原回执。确定性认证/事务失败可修正后重新预检。
- 网页提供邮箱注册/登录；注册并不获得知识库访问权限，仍须集合成员授权。Supabase 邮箱确认保持开启，回跳地址已改为生产网站。
- 部署使用临时目录白名单，仅网页源码、锁文件与必要共享类型；不上传桌面程序、业务资料、环境文件、数据库管理密钥。
- 用户指定回答模型 `GLM-5.3-Flash`，向量模型 `BAAI/bge-m3`，1024 维；revision `edgefn-bge-m3-2026-10-08`。完整向量接口为 `/v1/embeddings`。阈值 0.35 是待业务样本校准的初值，不宣称检索质量已认证。

## 已执行验证

- 云端迁移成功；原 SQL 的 11 项 RLS、16 项发布事务检查在真实 Supabase 全通过，完整断言聚合且任何失败即抛错，事务回滚不留种子。证据：`knowledge-web/test-results/supabase-cloud-sql-2026-10-08.json`。
- 云安全检查只有 `knowledge_publications` 开启 RLS 无普通用户 policy 的 INFO：这是仅供管理端核对的回执表，普通用户刻意拒绝。没有为消除此提示放开数据。
- 本机 PGlite 实际执行同一 27 项 SQL，通过；桌面相关自动测试 21 项通过，实际 Electron 5 组通过。见 `docs/knowledge-cloud-desktop-2026-10-08.md`。
- 网页本机界面 8 组、注册隔离测试 4 组通过。根桌面和网页 check/build 通过。桌面最终 renderer `index-v9-JjPus.js`，未制作便携版。

## 真实模型链路与故障记录

首轮、第二轮合成云验收均通过真实 embedding、发布 RPC、Auth 登录和授权列表；问答阶段返回 502。第二轮已明确记录 `MODEL_UNAVAILABLE`，两轮随机合成资料和临时账号均清理完成。证据分别为 `knowledge-web/test-results/cloud-53a3a9d4-3004-4691-8c27-223def11d6f8/result.json`、`cloud-3b26c2e3-97e4-479c-af25-0efb330d8abd/result.json`。不能把网站 Ready 或本机测试当作真实问答已通过。

本机独立 GLM-5.3-Flash 合成请求正常 stop，17.85 秒、897 tokens，严格 JSON 可解析。下一步区分云端向量/回答上游失败、保留安全错误类型，完成后补充线上验收结果。未经确认不自动重复发布；真实业务文件未上传。

最终诊断部署 `dpl_DYVrwY8ywCB5e3JVQjn6ir4VQ6VB` Ready，生产域名不变。真实第三次测试 `cloud-a02a4629-45c4-47ab-b6bd-757dac8ba4eb/result.json` 确认：`EMBEDDING_UNAVAILABLE`、阶段 `embedding`、上游 HTTP **403**。没有进入云端 GLM 回答阶段；不能推断是 IP、区域还是服务商其他规则。用户随后选择“先保留现状，完成软件开发”，因此不再重试云模型、不切换出口或供应商。清理后云库集合、索引、块、回执、测试账号均为 0。

诊断只保留阶段、HTTP 状态、网络/超时分类，不暴露上游正文、密钥或思考内容；网页单测最终 29/29 通过。完整回答须 finish_reason=stop，截断结果不会冒充成功。

随后只执行一次本机生产网页连接真实 Supabase 的完整合成验收：`test-results/local-production-9b157753-bbe0-4697-9ce0-6265c86c7ec6/result.json`。真实向量、发布、登录、GLM-5.3-Flash 回答、精确引用、停止分享后立即 404 均通过。回答正确区分门店定位地址与图商地址。测试脚本收尾报 cleanup-incomplete，保留原失败；根按此次随机知识库 ID 使用数据库事务精确清理，再经 Auth Admin 删除该临时账号（HTTP 200），单独保存 `cleanup-recovery.json`，不改写原结果为成功。本机 Next 测试进程已退出。该结果证明同一代码的实际业务链，可用性不延伸到仍被上游403拒绝的Vercel环境。

网页新增本机生产验收目标校验后，根 check、最终30项自动测试通过；桌面21项与云SQL27项分列，避免把PGlite重复测试累计。注册邮件实际投递未测试，不能直接承诺全部同事现在即可注册。

## 保留限制

独立网页部署和资料发布是两件事。正式同事邮箱确认投递、自定义 SMTP、真实业务中文检索与答案质量、大资料规模均需后续验收。免费服务的容量与暂停规则不构成可用性承诺。此轮不替换 Pi 上下文方案、不制作 PPT 或视频。

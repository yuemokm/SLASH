# 内容审查缓存完整身份

2026-10-11根已合入，统一check/test/build待本窗口终态。关联生产方案G2版本绑定与内容核对。

main/content-review.ts及main/service.ts的缓存复用、送审与刷新均同时核对inputHash和promptHash。相同材料但提示身份变化时，旧收据保留历史，当前派生视图标为stale/unverified，旧finding不能用于修稿或放行交付。若当前模块无法验证传入的新协议输入，则进一步标为unavailable并隐藏意见；不能把这两种状态混为一谈。没有迁移旧收据、没有更改默认wire4或开启strict新路径，也没有修改Skill。

新增tests/content-review-identity.test.ts六个回归；tests/helpers/content-review-protocol-version-fixture.ts从当前源临时生成合法版本B，保留正式schema、预算和checkInput验证，没有长期维护第二套实现或私有资料依赖。隔离最终6/6、原有125/125、main及helper类型0、临时目录清理完成；最初两次夹具失败保留，不计入通过。

根回执[ integration.json ](../.test-data/production-grid-review-identity-root-integration-20261011/integration.json)记录局部补丁与实际hash；候选manifest de05f19a…62eba0、product patch ae5dd435…bf0838、regression patch68588c63…30ba87b。实际Service字节596afb98…9d973c与候选相等，其余仅CRLF差异，全文归一化已核。

这项修复确保新提示重新核对，不证明提示本身判断正确。此前真实wire5提示对照的漏报、误报及超时记录保留，默认仍wire4。实际根构建与业务效果另行验收。

Mermaid源：[content-review-identity-2026-10-11.mmd](diagrams/content-review-identity-2026-10-11.mmd)。

根全量在本轮中断前暴露常规夹具加载失败：系统TEMP生成的`.ts`文件缺少项目ESM包边界，导致Pi仅ESM导出被CJS加载（`ERR_PACKAGE_PATH_NOT_EXPORTED`）。最小修复仅在独占临时目录创建`package.json`且`type=module`，保留现有源模块生成、schema、预算和全部业务断言；没有改Pi导出、依赖或产品代码。根专项6/6通过（14690.9877ms），证据为`identity-esm-recheck.log/json`及`identity-esm-fixture-repair.json`。原全量实际失败与中断日志保留；该整轮没有TAP摘要，不计全量通过，构建尚未开始。

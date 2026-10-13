# 仓库文件清理记录

2026-10-13 本地目录整理：下方为 10-12 的 Git 跟踪清理记录。现有媒体、历史成果、备份和散落测试证据已按用户要求统一归入 `过程文件/`；源码、当前开发依据与 `.test-data/` 保留。当前路径与执行边界见[本地过程文件整理](workspace-organization-2026-10-13.md)。

日期：2026-10-12。范围：整理 Git 跟踪文件，不改变产品行为。

## 分类与处理

| 文件 | 处理与依据 |
| --- | --- |
| `deliverables/` | 演示、参赛及介绍材料；移出索引并忽略，保留本地文件 |
| `output/` | 生成成果及交付副本；移出索引并忽略，保留本地文件 |
| `ui参考/` | 外部界面参考材料；移出索引并忽略，保留本地文件 |
| `docs/competition-demo-outline.md` | 纯 PPT 与视频制作提纲；移出索引并精确忽略，保留本地文件 |
| 根目录下列六份 JSON | 自动验收输出；移出索引并精确忽略，保留本地文件 |
| `docs/`、`exa-results/` | 除上述纯演示提纲外，工程规格、架构、开发依据与验收结论继续跟踪 |
| `scripts/`、`tests/` | 开发入口、复验工具、测试代码及夹具；继续跟踪 |
| `knowledge-web/` | 已退出产品的历史源码；`main/knowledge-publication.ts` 仍静态导入 `lib/bundle.ts` 与 `lib/publication.ts`，保留兼容与历史契约 |

六份报告：`contract-race-changed-evidence.json`、`contract-race-control-evidence.json`、`current-zip-byte-equality.json`、`default-registry-service-negative.json`、`lost-restart-evidence.json`、`mount-revoke-evidence.json`。测试可以重新生成报告，不把它们作为输入。

本次仅撤销当前索引中的跟踪并增加忽略规则，不删除磁盘文件，不清理 Git 历史。之后克隆仓库不会获得这些本地材料；历史提交中仍可能存在旧副本。

已撤销跟踪 495 个文件，共 97,190,382 字节。逐文件 SHA-256 核对确认本地文件及原字节均保留；本地清单为 `.test-data/repository-cleanup-20261012.json`。

## 依赖与验证边界

开发、构建与自动化测试未静态依赖上述本地材料。`scripts/sfa-focused-fixture.mjs` 是手动历史复验工具，需本地 `output/sfa-delivery-20261010/异动端SFA主要界面-改进版.html`、`.test-data/` 冻结报告及指定的加密模型配置；克隆后须自行备齐材料才能执行此复验。`tests/sfa-focused-contract.test.ts` 使用合成 HTML，独立于这些材料。

忽略规则只匹配指定根路径，不忽略全部 JSON、HTML 或文档，避免漏掉产品源码、契约与必要测试夹具。

已通过：`npm run check`；`node --import tsx --test tests/sfa-focused-contract.test.ts`（3/3）。代码、包配置与测试引用扫描未发现新增缺失的开发或测试输入。没有执行全量测试、打包、手动历史复验、真实模型或外部发布验收。

通俗说明：源码与开发说明留在仓库；参考图片、演示稿和跑测试产生的报告留在电脑上。清理后软件开发所需文件仍完整。

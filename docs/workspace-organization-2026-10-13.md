# 本地过程文件整理

日期：2026-10-13。范围：用户授权的目录整理与测试输出位置修正；不改变产品业务行为。

## 目录分类

| 原位置 | 新位置 |
| --- | --- |
| 根目录 52 个 `run-*` | `过程文件/测试记录/run-*` |
| `evidence/`、`evidence-v2/`、`temp/`、空 `test-data/` | `过程文件/测试记录/` 下的原目录名 |
| 根目录六份验收 JSON | `过程文件/测试记录/历史报告/` 下的原文件名 |
| `deliverables/` | `过程文件/演示材料/deliverables/` |
| `docs/competition-demo-outline.md` | `过程文件/演示材料/competition-demo-outline.md` |
| `output/` | `过程文件/历史成果/output/` |
| `ui参考/` | `过程文件/界面参考/ui参考/` |
| `.dev-backups/` | `过程文件/开发备份/.dev-backups/` |
| `.codex-package-audit/` | `过程文件/包调研/.codex-package-audit/` |
| `.temp/` | `过程文件/临时文件/.temp/` |

原目录归入对应分类，保留素材内部相对路径和全部缓存，不删除文件、不覆盖同名文件。共整理 69 个原顶层项目：52 个 `run-*` 目录、10 个过程目录、6 份 JSON、1 份媒体提纲。具体原路径、新路径、结果和原单文件 SHA-256 见本机 `过程文件/整理记录/move-manifest-20261013.json`；该清单和本地材料一起忽略，不作为仓库源码提交。历史验收记录中的路径保留当时事实，以本表定位现存副本。

媒体含大型历史语音环境，PowerShell 逐文件移动耗时较长；终止本轮自己的移动进程后，对已拆分的原目录按记录补完，用同盘目录重命名迁入尚未移动的子项，所有文件保留。恢复操作见 `move-recovery-20261013.json`，原空目录也保留在 `过程文件/整理记录/迁移空目录/`。没有终止用户进程。

## 保留位置与依据

- `.test-data/` 是现有规范化测试根，包含真实验收输入、模型隔离配置、历史草稿与测试记录；大量脚本、权限校验和文档固定引用，保留原路径。
- `docs/` 与 `exa-results/` 是 AGENTS 明确要求的当前开发规格、调研与验收依据，除纯媒体制作提纲外保留原路径。
- `knowledge-web/` 的旧静态依赖经后续审计确认只来自退役发布模块及其旧执行测试，2026-10-13 已完整归档至 `过程文件/历史模块/knowledge-web/` 并移出当前源码；资料集合与用户记录仍保留。见[退役源码清理](knowledge-source-cleanup-2026-10-13.md)。
- `dev-startup.log` 是启动 BAT 和开发脚本的诊断文件，保留。用户本轮追加授权删除旧 `release/`；只读验证确认其位于项目内且无 reparse/junction 外指，共 3,569 个文件、18,761,872,984 字节。变量路径及精确字面路径的 PowerShell `Remove-Item -LiteralPath` 均被自动执行策略拒绝（`blocked by policy`，未提供更具体原因），实际删除未执行，目录仍保留；未改用其他 Shell/API 绕过。记录见本机 `过程文件/整理记录/release-cleanup-20261013.json`。
- 源码、测试夹具、配置、依赖、`public/`、`dist/`、`.git/` 和启动 BAT 保留。此前其他功能的未提交修改保持原样。

## 防止再次堆积

`tests/test-records.ts` 提供统一 `过程文件/测试记录` 和 `过程文件/临时文件/runtime-temp` 路径。发布操作、发布 Service、交付 Service 测试改为在该处生成证据；首轮验收测试的子进程 TEMP/TMP 同步迁入临时文件。旧六份报告留在历史报告，新测试报告写到测试记录根，避免覆盖归档证据。手工 `scripts/sfa-focused-fixture.mjs` 已指向归档后的原 SFA 文件。

归档媒体中的 43 份生成/检查脚本，仅将原 `E:/code/slash/deliverables/` 绝对前缀改为新目录；脚本原件保留在 `过程文件/整理记录/脚本原件/`，前后 SHA-256 与替换次数见 `archived-script-path-updates-20261013.json`。HTML、PPT、视频和图片内容未修改；原语音环境虚拟环境中的已生成启动器可能仍携带旧路径，本轮未迁移或重建历史媒体运行环境，不能据此承诺历史工程全部可运行。

Vite 忽略 `过程文件`，避免媒体缓存和测试记录触发开发监听。两个 TypeScript 配置仅包含 `src/shared` 或 `main/shared`，归档源码不会加入检查与构建，无需增加全局排除规则。

## 验证记录

已通过 `npm run check`、本轮文件 `git diff --check`；43 份归档脚本的 JavaScript 语法检查/Python AST 解析通过，原件与新脚本逐一核对仅目标前缀变化。移动清单 69/69 成功，目标存在、原路径已迁出、根目录 `run-*` 为 0。

三组初始定向测试在停止前 30 项通过、2 项失败：原生 Electron 八场景发生 `Network service crashed` / `NATIVE_PROFILE_NOT_PASSED`；一项发布 stdio 测试触发原 35 秒超时。另一组交付 Service 在停止前 5 项通过。为限制本轮整理范围，中止本轮自己的未完成长测试，保留日志，不宣称完整套件通过。随后串行重跑发布 stdio 小用例 1/1 通过（3.37 秒）；交付 `lost` 与默认 registry 小用例 2/2 通过。新 run、SQLite、stdio 会话、JSON 及临时文件均落在统一新路径，根目录未再出现散落记录。原生八场景失败未修复或重验，不能据此宣称其通过。

本机日志：`过程文件/整理记录/typecheck-20261013.log`、`targeted-tests-20261013.log`、`delivery-tests-20261013.log`、`publish-output-recheck-20261013.log`、`delivery-output-recheck-20261013.log`。26 个本轮提交候选文件扫描未发现私钥/API token 模式或环境/运行证据候选；公开设计预览 186 个文件已在既有 HEAD 跟踪，未重复生成。

目录整理不代表真实云发布、模型质量、媒体重新渲染或 SMB 双机验收完成；本轮不打包，不 push。

通俗说明：软件开发要用的文件仍留在原处；截图、演示稿、旧交付和运行过程记录统一放进“过程文件”。以后这几类测试也会直接把记录放进去。

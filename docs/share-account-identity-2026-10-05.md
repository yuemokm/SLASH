# 共享账号识别修复：2026-10-05

问题：已有共享的管理表单取第一条Allow ACL作为当前账号。Windows的显式授权可以先列Administrators或Everyone等组；这既不是当前个人账号，也不能据此默认替换。当前本机Windows身份枚举本身在只读核验中是正确的，错误集中在ACL与UI默认选择的关联。

当前实现：

- `main/windows-share-principal.ts`固定只读LookupAccountSid读取SID对应的规范账号和SID_NAME_USE，明确用户、组或未知。没有读取凭据或改变系统账号。无法解析保留未知状态，不从环境用户名、显示名称或主机+昵称拼造身份。
- `main/sharing-setup.ts`以当前进程WindowsIdentity.User SID为真实身份，按SID关联本地账户和去重。Get-LocalUser不可用时只读CIM Win32_UserAccount fallback；显示名与PrincipalSource只作为说明，Microsoft账号/域/本地账号不靠字符串昵称合并。命令失败或没有SID不能标已识别。共享设置与网络模块统一UTF8控制台收发，避免非ASCII账号损坏。
- `main/network-share.ts`只读权限检查返回每条原始ACL账号、SID、规范名和用户/组/未知类型；不改变既有ACL创建/管理行为。
- `shared/network-share-management.ts`的shareAuthorizationSelection只用当前已核对SID匹配个人Allow，不取首条、不只比名称。显式Deny不当作可用授权。没有直接个人授权时默认添加当前真实账号并保留已有用户/组；身份未知默认账号为空。
- `src/ShareManagement.tsx`列表标明组/用户；真实Windows账号下拉直接提供当前身份，手工域账号入口保留。明确选择另一ACL时同步该账号的Read/Change/Full请求权限，不继承先前对象的切换值。
- `src/SharingPanel.tsx`创建表单有真实识别与不可核对两种文案，任何账号数量都能选/手输；账号为空禁用创建。新账号选择复用ComposerSelect，未新增原生下拉。

验收边界：32项定向离线测试通过，覆盖组排首位/当前个人在后、SID别名、没有个人授权、显示名与用户名不同、Microsoft/域身份、local枚举不可用、无SID、Deny、非0退出及此前生命周期保护。9份固定生成PowerShell脚本通过系统AST仅解析检查，回执`.test-data/share-management-ast-1791203617387.json`，没有执行管理脚本。根代理使用新源码进行了实际本机只读核验：当前身份与本地账户SID匹配；三个普通共享的ACL类型正确，其中两个只有组授权时默认添加当前个人，一个已有个人授权时按SID命中更新。文档不保存真实电脑/人员/共享路径清单。

桌面验收入口仍为`node scripts/share-management-ui-smoke.mjs`：整个share* IPC都mock，不操作Windows真实共享，新增上述默认选择、目标权限同步与账号不可用手输场景。桌面最新结果由根代理统一build后实际运行记录，不能把mock当作实际SMB修改。双机访问、真实ACL授权改动及不同企业域/策略仍未验证。

启动：本次包含主进程修改，需重启开发应用使新身份解析生效。不增版本，不打包。Mermaid源见[共享账号选择](diagrams/share-account-identity.mmd)。

官方参考：[LookupAccountSidW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-lookupaccountsidw)返回SID对应账号/域与账号类型，可能因不可解析而失败；[Get-LocalUser](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.localaccounts/get-localuser?view=powershell-5.1)提供SID及PrincipalSource，64位Windows中的32位PowerShell可能没有该模块。

根代理最终桌面结果：统一`npm run build`通过，日志`.test-data/share-account-build.log`；真实开发版Electron mock GUI **14/14通过，pageErrors=[]，exit0**，回执[share-management-ui-development-1791203737047/result.json](../.test-data/share-management-ui-development-1791203737047/result.json)。实际查看group-only-add-current.png，组身份、添加当前真实账号、读写请求与保留原授权说明完整可见。身份未核对的手输及目标Read同步也由实际桌面断言覆盖。根代理另行运行AST **9/9通过**，回执`.test-data/share-management-ast-1791203638574.json`。这些共享写回均为IPC mock，真实本机只做身份/ACL元数据读取；没有真实授权、共享、映射或用户项目文件修改，没有版本调整或打包。

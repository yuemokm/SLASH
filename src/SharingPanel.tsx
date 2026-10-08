import { Icon } from "./Icon";
import { ShareManagement } from "./ShareManagement";
import { ComposerSelect } from "./ComposerSelect";
import React, { useEffect, useState } from "react";
import type {
  Request,
  ShareConnectResult,
  ShareCreateResult,
  ShareFolderSelection,
  ShareConflictDiagnostic,
  ShareLock,
  ShareSetupInfo,
} from "../shared/types";

type Call = (request: Request) => Promise<unknown>;
type Mode = "home" | "create" | "connect";

export function SharingPanel({
  call,
  onNotice,
  onError,
}: {
  call: Call;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [setup, setSetup] = useState<ShareSetupInfo>();
  const [mode, setMode] = useState<Mode>("home");
  const [folder, setFolder] = useState<ShareFolderSelection>();
  const [shareName, setShareName] = useState("");
  const [account, setAccount] = useState("");
  const [invitation, setInvitation] = useState("");
  const [drive, setDrive] = useState("P:");
  const [authentication, setAuthentication] = useState<
    "current-user" | "username-password"
  >("current-user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    text: string;
  }>();
  const [busy, setBusy] = useState("");
  const [conflicts, setConflicts] = useState<Record<string, ShareConflictDiagnostic>>({});
  const [locks, setLocks] = useState<Record<string, ShareLock>>({});
  const ownerId = "slash-ui";
  const conflictLabels: Record<ShareConflictDiagnostic["code"], string> = {
    LOCK_HELD: "正在编辑",
    VERSION_CONFLICT: "版本冲突",
    TARGET_UNAVAILABLE: "目标不可用",
    PERMISSION_DENIED: "没有写入权限",
    NO_CONFLICT: "状态正常",
  };
  const inspectMapping = async (item: ShareSetupInfo["mappings"][number]) => {
    try {
      const result = (await call({ type: "shareConflictDiagnose", resourceId: `share-${item.drive}`, path: item.remotePath })) as ShareConflictDiagnostic;
      setConflicts((previous) => ({ ...previous, [item.drive]: result }));
    } catch (reason) {
      setConflicts((previous) => ({ ...previous, [item.drive]: { code: "TARGET_UNAVAILABLE", resource: { resourceId: `share-${item.drive}`, path: item.remotePath }, message: reason instanceof Error ? reason.message : String(reason), retryable: true } }));
    }
  };
  const load = async () => {
    const result = (await call({ type: "shareSetup" })) as ShareSetupInfo;
    setSetup(result);
    setAccount((value) => value || (result.currentUser.status === "verified" ? result.currentUser.qualifiedName : ""));
    setDrive((value) =>
      result.availableDrives.includes(value)
        ? value
      : result.availableDrives[0] || value,
    );
    await Promise.all(result.mappings.map(inspectMapping));
    const activeLocks = (await call({ type: "shareLocks" })) as ShareLock[];
    setLocks(Object.fromEntries(activeLocks.map((lock) => [lock.id, lock])));
  };
  useEffect(() => {
    void load().catch((reason) =>
      setFeedback({
        kind: "error",
        text: reason instanceof Error ? reason.message : String(reason),
      }),
    );
  }, []);
  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setFeedback(undefined);
    try {
      await action();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason);
      setFeedback({ kind: "error", text });
      onError(text);
    } finally {
      setBusy("");
      setPassword("");
    }
  };
  const notify = (text: string) => {
    setFeedback({ kind: "success", text });
    onNotice(text);
  };
  const reportResult = (result: { status: string; diagnostic: string }) => {
    if (result.status === "succeeded") notify(result.diagnostic);
    else {
      setFeedback({ kind: "error", text: result.diagnostic });
      onError(result.diagnostic);
    }
  };
  const chooseFolder = () =>
    run("folder", async () => {
      const result = (await call({
        type: "shareSelectFolder",
      })) as ShareFolderSelection | null;
      if (!result) return;
      setFolder(result);
      setShareName(result.suggestedShareName);
    });
  const createShare = () =>
    run("create", async () => {
      if (!folder) throw Error("请先选择要共享的文件夹");
      if (!account.trim()) throw Error("请先选择已核对的 Windows 账号或手动输入账号");
      const result = (await call({
        type: "shareCreate",
        path: folder.path,
        shareName,
        account: account || undefined,
        access: "read_write",
      })) as ShareCreateResult;
      if (result.invitation) setInvitation(result.invitation);
      reportResult(result);
      await load();
    });
  const connectShare = () =>
    run("connect", async () => {
      const auth =
        authentication === "current-user"
          ? ({ mode: "current-user" } as const)
          : ({ mode: "username-password", username, password } as const);
      const result = (await call({
        type: "shareConnect",
        invitation,
        drive,
        authentication: auth,
      })) as ShareConnectResult;
      if (result.retryWithCredentials) setAuthentication("username-password");
      reportResult(result);
      await load();
    });
  return (
    <section className="sharing-page">
      <div className="page-intro">
        <p className="muted">
          把资料文件夹分享给同事，或把同事发来的资料连接到这台电脑。连接成功后会出现在
          Windows 资源管理器中。
        </p>
      </div>
      {feedback && (
        <div
          className={`inline-feedback ${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
          <button onClick={() => setFeedback(undefined)}><Icon name="close" size={16}/></button>
        </div>
      )}
      {setup && !setup.supported && (
        <div className="inline-feedback error">
          {setup.diagnostic || "这台电脑当前不支持 Windows 文件共享。"}
        </div>
      )}
      {setup && (
        <div className="share-environment-strip" aria-label="本机共享环境">
          <div>
            <span>这台电脑</span>
            <b>{setup.host}</b>
          </div>
          <div>
            <span>当前 Windows 账号</span>
            <b>{setup.currentUser.name}</b>
          </div>
          <div>
            <span>可用盘符</span>
            <b>{setup.availableDrives.slice(0, 5).join(" · ") || "暂无"}</b>
          </div>
        </div>
      )}
      {Object.values(locks).length > 0 && (
        <section className="share-locks" aria-label="共享文件锁状态">
          <div className="section-heading"><div><span className="eyebrow">协作状态</span><h3>正在编辑的资源</h3></div><button onClick={() => void load()}>重新读取</button></div>
          {Object.values(locks).map((lock) => <div className="mapping-row" key={lock.id}><span>{lock.resource.path || lock.resource.resourceId}</span><b>{lock.mode === "write" ? "写入锁" : "读取锁"}</b><small>{lock.ownerId} · 到期 {new Date(lock.expiresAt).toLocaleString()}</small></div>)}
        </section>
      )}
      {mode === "home" && (
        <div className="share-choices">
          <button className="share-choice" onClick={() => setMode("create")}>
            <span>01</span>
            <b>把本机文件夹分享给同事</b>
            <p>选择文件夹后，slash 会为指定账号建立可读写共享。</p>
            <i>开始创建 <Icon name="chevronRight" size={16}/></i>
          </button>
          <button className="share-choice" onClick={() => setMode("connect")}>
            <span>02</span>
            <b>连接同事发来的共享</b>
            <p>粘贴邀请，选择盘符，然后在资源管理器中使用。</p>
            <i>开始连接 <Icon name="chevronRight" size={16}/></i>
          </button>
        </div>
      )}
      {mode === "create" && (
        <section className="share-wizard">
          <div className="wizard-top">
            <button className="back-link" onClick={() => setMode("home")}>
              ← 返回
            </button>
            <div>
              <span className="eyebrow">创建共享</span>
              <h2>把本机文件夹分享给同事</h2>
            </div>
          </div>
          <ol className="wizard-steps">
            <li className={folder ? "done" : "active"}>
              <span>1</span>选择文件夹
            </li>
            <li className={folder ? "active" : ""}>
              <span>2</span>确认访问者
            </li>
            <li>
              <span>3</span>复制邀请
            </li>
          </ol>
          <div className="wizard-content">
            <section className="wizard-block">
              <div>
                <b>1. 选择要分享的文件夹</b>
                <small>
                  选择需要协作编辑的文件夹。同事获得授权后，可以读取、添加和修改其中的文件。
                </small>
              </div>
              {folder ? (
                <div className="chosen-folder">
                  <div>
                    <span>{folder.folderName}</span>
                    <small>{folder.path}</small>
                    {folder.existingShare && (
                      <em>这个目录已有共享：{folder.existingShare.name}，创建时会检查并升级指定账号的读写权限。</em>
                    )}
                  </div>
                  <button onClick={() => void chooseFolder()}>重新选择</button>
                </div>
              ) : (
                <button
                  className="choose-folder"
                  disabled={busy === "folder"}
                  onClick={() => void chooseFolder()}
                >
                  选择文件夹
                </button>
              )}
            </section>
            {folder && (
              <section className="wizard-block">
                <div>
                  <b>2. 确认共享信息</b>
                  <small>{setup?.currentUser.status === "verified" ? "当前 Windows 账号已按 SID 核对，请确认要授权的访问身份。" : "当前 Windows 账号暂未核对，请手动输入并确认访问身份。"}</small>
                </div>
                <div className="environment-summary">
                  <div>
                    <span>来自这台电脑</span>
                    <b>{setup?.host || "正在识别…"}</b>
                  </div>
                  <div>
                    <span>允许访问的账号</span>
                    <b>
                      {setup?.accounts.find(
                        (item) => item.qualifiedName === account,
                      )?.name || account}
                    </b>
                  </div>
                  <div>
                    <span>访问方式</span>
                    <b>可读写</b>
                  </div>
                </div>
                <label>
                  同事看到的名称
                  <input
                    value={shareName}
                    onChange={(event) =>
                      setShareName(
                        event.target.value.replace(/[^A-Za-z0-9_-]/g, ""),
                      )
                    }
                    placeholder="例如 product_docs"
                  />
                  <small>可使用英文字母、数字、短横线和下划线。</small>
                </label>
                <details className="advanced" open={setup?.currentUser.status !== "verified"}>
                  <summary>选择或输入访问账号</summary>
                  <ComposerSelect ariaLabel="创建共享访问账号" value={setup?.accounts.some(item => item.qualifiedName === account) ? account : "__manual__"} options={[...(setup?.accounts || []).map(item => ({value:item.qualifiedName,label:item.qualifiedName + (item.current ? "（当前账号）" : ""),description:item.principalSource || "已按 SID 核对"})),{value:"__manual__",label:"手动输入其他 Windows 账号"}]} onChange={value => setAccount(value === "__manual__" ? "" : value)} />
                  <label>Windows 访问账号<input value={account} onChange={event => setAccount(event.target.value)} placeholder="主机或域\\账号" autoComplete="off" /></label>
                  <small>登录账号与显示名称不同；电脑 PIN 不能用作其他电脑访问共享时的密码。</small>
                </details>
                <button
                  className="primary"
                  disabled={!shareName || !account.trim() || busy === "create"}
                  onClick={() => void createShare()}
                >
                  创建或升级读写共享
                </button>
              </section>
            )}
            {invitation && (
              <section className="wizard-block invitation-result">
                <div>
                  <b>3. 邀请已生成</b>
                  <small>把下面的邀请完整发给同事。</small>
                </div>
                <textarea readOnly value={invitation} />
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(invitation)
                      .then(() => notify("邀请已复制"))
                  }
                >
                  复制邀请
                </button>
              </section>
            )}
          </div>
        </section>
      )}
      {mode === "connect" && (
        <section className="share-wizard">
          <div className="wizard-top">
            <button className="back-link" onClick={() => setMode("home")}>
              ← 返回
            </button>
            <div>
              <span className="eyebrow">连接共享</span>
              <h2>连接同事发来的资料</h2>
            </div>
          </div>
          <ol className="wizard-steps">
            <li className="active">
              <span>1</span>粘贴邀请
            </li>
            <li className={invitation.trim() ? "active" : ""}>
              <span>2</span>选择盘符
            </li>
            <li>
              <span>3</span>完成连接
            </li>
          </ol>
          <div className="wizard-content">
            <section className="wizard-block">
              <div>
                <b>1. 粘贴同事发来的邀请</b>
                <small>
                  邀请里包含共享电脑和目录信息，无需手动填写主机名。
                </small>
              </div>
              <label>
                共享邀请
                <textarea
                  aria-label="共享邀请"
                  value={invitation}
                  onChange={(event) => setInvitation(event.target.value)}
                  placeholder="在这里粘贴完整邀请…"
                />
              </label>
            </section>
            <section className="wizard-block">
              <div>
                <b>2. 选择在资源管理器中显示的位置</b>
                <small>已自动选择一个可用盘符，连接后仍会保留。</small>
              </div>
              <label>
                盘符
                <select
                  aria-label="共享盘符"
                  value={drive}
                  onChange={(event) => setDrive(event.target.value)}
                >
                  {setup?.availableDrives.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <details className="advanced">
                <summary>如果 Windows 要求其他账号</summary>
                <label className="radio-row">
                  <input
                    type="radio"
                    checked={authentication === "current-user"}
                    onChange={() => setAuthentication("current-user")}
                  />
                  使用当前 Windows 身份
                </label>
                <label className="radio-row">
                  <input
                    type="radio"
                    checked={authentication === "username-password"}
                    onChange={() => setAuthentication("username-password")}
                  />
                  使用共享方提供的账号
                </label>
                {authentication === "username-password" && (
                  <div className="credential-fields">
                    <label>
                      账号
                      <input
                        autoComplete="username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                      />
                    </label>
                    <label>
                      密码
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                    <small>
                      请使用该 Windows 账号的密码，不能使用电脑
                      PIN。密码只用于本次连接。
                    </small>
                  </div>
                )}
              </details>
              <button
                className="primary"
                disabled={
                  !invitation.trim() ||
                  !drive ||
                  (authentication === "username-password" &&
                    (!username.trim() || !password)) ||
                  busy === "connect"
                }
                onClick={() => void connectShare()}
              >
                连接并打开网络盘
              </button>
            </section>
          </div>
        </section>
      )}
      <ShareManagement setup={setup} call={call} onRefresh={load} onNotice={notify} onError={onError} renderMappingStatus={(item) => conflicts[item.drive] ? <div className={`share-conflict ${conflicts[item.drive].code === "NO_CONFLICT" ? "ok" : "warning"}`} role="status"><span>{conflictLabels[conflicts[item.drive].code]}</span><small>{conflicts[item.drive].message}</small><button type="button" onClick={() => void inspectMapping(item)}>查看状态</button></div> : null} />
    </section>
  );
}

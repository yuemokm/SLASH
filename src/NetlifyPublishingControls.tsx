import React, {useEffect, useRef, useState} from 'react';
import type {Request, DeliveryRecord} from '../shared/types';
import {staticPublishReceiptSchema, staticPublishDisposition} from '../shared/prototype-publish-operation';

type Call = (request: Request) => Promise<unknown>;
type Status = {status: 'credential_saved' | 'signed_out'; verified?: boolean; siteId?: string};

export function NetlifyPublishingControls({id, siteId, enabled, call, onNotice, onError}: {
  id: string; siteId: string; enabled: boolean; call: Call;
  onNotice: (text: string) => void; onError: (text: string) => void;
}) {
  const identity = JSON.stringify([id, siteId, enabled]);
  const scope = useRef({identity, call, generation: 0, live: true});
  if (scope.current.identity !== identity || scope.current.call !== call) {
    scope.current = {identity, call, generation: scope.current.generation + 1, live: true};
  }
  const [status, setStatus] = useState<{owner: typeof scope.current; value: Status}>();
  const [secret, setSecret] = useState({owner: scope.current, value: ''});
  const [working, setWorking] = useState<{owner: typeof scope.current; generation: number}>();
  const currentStatus = status?.owner === scope.current ? status.value : undefined;
  const token = secret.owner === scope.current ? secret.value : '';
  const busy = working?.owner === scope.current;

  useEffect(() => {
    const owner = scope.current;
    owner.live = true;
    const generation = ++owner.generation;
    const current = () => scope.current === owner && owner.live && owner.generation === generation;
    setSecret({owner: scope.current, value: ''});
    void call({type: 'mcpPublisherStatus', id}).then(value => {
      if (current()) setStatus({owner, value: value as Status});
    }).catch(() => {
      if (current()) setStatus({owner, value: {status: 'signed_out'}});
    });
    return () => { owner.live = false; owner.generation++; };
  }, [identity, id, call]);

  const act = async (type: 'mcpPublisherCredential' | 'mcpPublisherVerify' | 'mcpPublisherDisconnect') => {
    const owner = scope.current;
    const generation = ++owner.generation;
    const current = () => scope.current === owner && owner.live && owner.generation === generation;
    setWorking({owner, generation});
    const value = token;
    setSecret({owner: scope.current, value: ''});
    try {
      await call(type === 'mcpPublisherCredential' ? {type, id, siteId, token: value} : {type, id, siteId});
      if (!current()) return;
      const refreshed = await call({type: 'mcpPublisherStatus', id}) as Status;
      if (!current()) return;
      setStatus({owner, value: refreshed});
      onNotice(type === 'mcpPublisherCredential' ? '凭据已加密保存，请核对站点访问' :
        type === 'mcpPublisherVerify' ? '站点访问已核对；每次发布仍须确认成果与目标' : '发布凭据已清除');
    } catch (error) {
      if (current()) onError(error instanceof Error ? error.message : '发布连接操作失败');
    } finally {
      if (current()) setWorking(undefined);
    }
  };

  return <div className="mcp-auth-controls">
    <small role="status">{currentStatus?.verified ? '站点访问已核对' :
      currentStatus?.status === 'credential_saved' ? '凭据已保存，站点尚未核对' : '尚未连接 Netlify'} · 站点 {siteId}</small>
    <label>Netlify API 凭据<input type="password" aria-label="Netlify API 凭据" value={token}
      autoComplete="new-password" spellCheck={false} disabled={busy}
      onChange={event => setSecret({owner: scope.current, value: event.target.value})}/></label>
    <small>只保存在本机加密存储中，不会回显。更换站点后需重新保存和核对。</small>
    <div className="button-row">
      <button disabled={!enabled || busy || token.length < 10} onClick={() => void act('mcpPublisherCredential')}>保存发布凭据</button>
      <button disabled={!enabled || busy || currentStatus?.status !== 'credential_saved'} onClick={() => void act('mcpPublisherVerify')}>核对站点访问</button>
      <button disabled={busy} onClick={() => void act('mcpPublisherDisconnect')}>断开发布连接</button>
    </div>
  </div>;
}

export function PublicationDeliveryRecords({conversationId, revision, call, onNotice, onError}: {
  conversationId?: string; revision: unknown; call: Call;
  onNotice: (text: string) => void; onError: (text: string) => void;
}) {
  const identity = conversationId ?? '';
  const scope = useRef({identity, call, live: true, load: 0, action: 0});
  if (scope.current.identity !== identity || scope.current.call !== call) {
    scope.current = {identity, call, live: true, load: 0, action: 0};
  }
  const [snapshot, setSnapshot] = useState<{owner: typeof scope.current; records: DeliveryRecord[]}>();
  const [working, setWorking] = useState<{owner: typeof scope.current; id: string}>();
  const records = snapshot?.owner === scope.current ? snapshot.records : [];
  const busy = working?.owner === scope.current ? working.id : undefined;
  const reload = async (owner: typeof scope.current) => {
    const sequence = ++owner.load;
    const result = await call({type: 'deliveryRecords'});
    if (scope.current !== owner || !owner.live || sequence !== owner.load) return;
    setSnapshot({owner, records: (result as DeliveryRecord[]).filter(item =>
      item.conversationId === owner.identity && staticPublishReceiptSchema.safeParse(item.receipt).success)});
  };
  useEffect(() => {
    const owner = scope.current;
    owner.live = true;
    return () => { owner.live = false; owner.action++; owner.load++; };
  }, [identity, call]);
  useEffect(() => {
    if (identity) void reload(scope.current).catch(() => {});
  }, [identity, revision, call]);

  const check = async (record: DeliveryRecord) => {
    const owner = scope.current;
    const sequence = ++owner.action;
    const current = () => scope.current === owner && owner.live && owner.action === sequence;
    setWorking({owner, id: record.id});
    try {
      await call({type: 'prototypePublicationStatus', id: record.id});
      if (current()) await reload(owner);
    } catch (error) {
      if (current()) onError(error instanceof Error ? error.message : '发布核对失败');
    } finally {
      if (current()) setWorking(undefined);
    }
  };
  if (!records.length) return null;
  return <div aria-label="原型发布记录">{records.map(record => {
    const parsed = staticPublishReceiptSchema.safeParse(record.receipt);
    if (!parsed.success) return null;
    const receipt = parsed.data;
    const complete = staticPublishDisposition(receipt) === 'ready';
    return <article className="approval-card" key={record.id}>
      <div><h3>{record.target}</h3><p>{complete ? '草稿发布链接已交付' : receipt.readyObservedAt ?
        '部署已就绪，发布链接尚未交付' : '发布结果待核对，请勿重复执行'}</p>
        {complete && <label>发布链接<input aria-label="发布链接" readOnly value={receipt.publishUrl}/></label>}
        {record.diagnostic && <small>{record.diagnostic}</small>}
      </div>
      <div className="button-row">
        {complete && <button onClick={() => {
          const owner = scope.current;
          void navigator.clipboard.writeText(receipt.publishUrl!).then(() => {
            if (scope.current === owner && owner.live) onNotice('发布链接已复制');
          }).catch(() => {
            if (scope.current === owner && owner.live) onError('链接复制失败，请选中链接复制');
          });
        }}>复制发布链接</button>}
        {receipt.deployId && !complete && <button disabled={busy === record.id}
          onClick={() => void check(record)}>只核对发布结果</button>}
      </div>
    </article>;
  })}</div>;
}


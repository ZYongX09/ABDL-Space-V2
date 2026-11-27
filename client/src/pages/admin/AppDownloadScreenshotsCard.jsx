import { useEffect, useRef, useState } from 'react';
import { getAdminDownloadScreenshots, getScreenshotBlob, MAX_SCREENSHOT_BYTES, saveDownloadScreenshot, SCREENSHOT_GROUPS, SCREENSHOT_THEMES, SCREENSHOT_TYPES } from '../../appDownloadScreenshots.js';
import { Card, ErrorBox, FormField, Loading, Pill, useConfirm } from './ui';
import './appDownloadScreenshotsCard.css';

function Preview({ source, label }) {
  const [state, setState] = useState(null);
  const url = state?.source === source ? state.url : '';
  const failed = state?.source === source && state.failed;
  useEffect(() => {
    const controller = new AbortController();
    let objectURL;
    const ready = blob => {
      if (controller.signal.aborted) return;
      objectURL = URL.createObjectURL(blob);
      setState({ source, url: objectURL, failed: false });
    };
    if (typeof source === 'string') {
      const timeout = window.setTimeout(() => {
        controller.abort();
        setState({ source, failed: true });
      }, 10000);
      getScreenshotBlob(source, controller.signal).then(ready).catch(() => {
        if (!controller.signal.aborted) setState({ source, failed: true });
      }).finally(() => window.clearTimeout(timeout));
      return () => { window.clearTimeout(timeout); controller.abort(); if (objectURL) URL.revokeObjectURL(objectURL); };
    }
    ready(source);
    return () => { if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [source]);
  return <figure className="ac-app-shot-preview">
    {failed ? <span>无法预览</span> : url ? <img src={url} alt={label} decoding="async" onError={() => setState({ source, failed: true })} /> : <span>正在读取…</span>}
    <figcaption>{label}</figcaption>
  </figure>;
}

function ScreenshotSlot({ row, label, busy, pending, loading, mustRefresh, issue, onSave }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [invalid, setInvalid] = useState('');
  const [notice, setNotice] = useState('');
  const id = `app-download-screenshot-${row.slot}`;
  const clearFile = () => { if (input.current) input.current.value = ''; setFile(null); setInvalid(''); };
  const select = event => {
    const candidate = event.target.files?.[0] ?? null;
    setNotice('');
    if (candidate && (!SCREENSHOT_TYPES.includes(candidate.type) || !candidate.size || candidate.size > MAX_SCREENSHOT_BYTES)) {
      clearFile(); setInvalid('请选择 3 MiB 以内的 PNG、JPEG 或 WebP 图片。'); return;
    }
    setInvalid(''); setFile(candidate);
  };
  const submit = async event => {
    event.preventDefault();
    if (!file || busy || loading || mustRefresh) return;
    if (await onSave(row, file)) { clearFile(); setNotice('已更新，两站下载页共用此图。'); }
  };
  const remove = async () => {
    if (await onSave(row, null)) setNotice('已从下载页下架。');
  };
  return <section className="ac-app-shot-slot" aria-labelledby={`${id}-title`}>
    <div className="ac-app-shot-slot-head"><h4 id={`${id}-title`}>{label}</h4><Pill tone={row.image ? 'blue' : 'slate'}>{row.image ? '已发布' : '未配置'}</Pill></div>
    <div className="ac-app-shot-previews">
      {row.image && <Preview source={row.image.url} label="当前截图" />}
      {file && <Preview source={file} label="待上传预览" />}
      {!row.image && !file && <p className="ac-section-note">还没有截图</p>}
    </div>
    {row.image && <p className="ac-section-note">当前尺寸：{row.image.width} × {row.image.height}</p>}
    <form onSubmit={submit}>
      <FormField label={`选择${label}截图`} htmlFor={id} error={invalid}>
        <input ref={input} id={id} type="file" className="ac-input" accept={SCREENSHOT_TYPES.join(',')} disabled={busy || loading} onChange={select} />
      </FormField>
      {file && <p className="ac-section-note ac-app-shot-filename">已选：{file.name}</p>}
      <div className="ac-action-group">
        <button type="submit" className="ac-btn primary" disabled={!file || busy || loading || mustRefresh}>{pending === 'upload' ? '正在上传…' : row.image ? '上传并替换' : '上传并发布'}</button>
        {file && <button type="button" className="ac-btn" disabled={busy || loading} onClick={clearFile}>清除选图</button>}
        {row.image && <button type="button" className="ac-btn danger" disabled={busy || loading || mustRefresh} onClick={remove}>{pending === 'remove' ? '正在下架…' : '下架'}</button>}
      </div>
    </form>
    <ErrorBox msg={issue} />
    <p className="ac-section-note" role="status">{issue ? '' : notice}</p>
  </section>;
}

export default function AppDownloadScreenshotsCard() {
  const confirm = useConfirm();
  const [slots, setSlots] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [expired, setExpired] = useState(false);
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(null);
  const [locked, setLocked] = useState({});
  const reader = useRef(null);
  const writer = useRef(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const cancel = () => { alive.current = false; reader.current?.abort(); writer.current?.abort(); };
    const changed = () => { cancel(); setSlots(null); setExpired(true); };
    window.addEventListener('auth-session-changing', changed);
    return () => { window.removeEventListener('auth-session-changing', changed); cancel(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    reader.current = controller;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      if (alive.current && !controller.signal.aborted) { setLoading(false); setError('读取截图配置超时，请重试。'); }
      controller.abort();
    }, 10000);
    getAdminDownloadScreenshots(controller.signal).then(data => {
      if (!controller.signal.aborted && alive.current) { setSlots(data); setLocked({}); setIssues({}); }
    }).catch(cause => {
      if (!controller.signal.aborted && alive.current) setError(cause.message || '读取截图配置失败。');
    }).finally(() => {
      window.clearTimeout(timer);
      if (!controller.signal.aborted && alive.current) setLoading(false);
    });
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [reload]);

  async function save(row, file) {
    if (!alive.current || writer.current || loading || locked[row.slot]) return false;
    const controller = new AbortController();
    writer.current = controller;
    const current = () => alive.current && writer.current === controller;
    const kind = file ? 'upload' : 'remove';
    setBusy({ slot: row.slot, kind });
    let timeout;
    try {
      if (!file && !await confirm({ title: '下架此截图？', message: '两站会停止展示此槽位的图片；其他槽位不受影响。', okText: '确认下架', danger: true })) return false;
      if (!current() || controller.signal.aborted) return false;
      setIssues(value => ({ ...value, [row.slot]: '' }));
      timeout = window.setTimeout(() => controller.abort(), 25000);
      const next = await saveDownloadScreenshot(row.slot, row.revision, file, controller.signal);
      if (!current() || controller.signal.aborted) return false;
      setSlots(value => ({ ...value, [row.slot]: next }));
      return true;
    } catch (cause) {
      if (!current()) return false;
      const uncertain = controller.signal.aborted || !cause.status || cause.status >= 500;
      const refresh = uncertain || [401, 403, 409].includes(cause.status);
      if (refresh) setLocked(value => ({ ...value, [row.slot]: true }));
      setIssues(value => ({ ...value, [row.slot]: uncertain ? '未能确认服务器是否保存成功。请重新读取后再操作。' : (cause.message || '操作未完成。') }));
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (current()) { writer.current = null; setBusy(null); }
    }
  }

  return <Card title="下载页截图" icon="fa-images" description="主站和移动站共用这组深浅色截图；保存一个槽位不会改动其他槽位。"
    action={<button type="button" className="ac-btn" disabled={loading || !!busy || expired} onClick={() => setReload(value => value + 1)}>重新读取配置</button>}>
    <p className="ac-app-note">建议使用竖屏原生截图，支持 PNG、JPEG 和 WebP：最多 3 MiB、最长边 3200 像素、总像素不超过 360 万。上传完成后才替换当前截图。</p>
    {expired ? <ErrorBox msg="管理员会话已变更，请重新打开此页。" /> : <>
      {loading && !slots && <Loading text="正在读取截图配置…" />}
      <ErrorBox msg={error} />
      {slots && <div className="ac-app-shot-groups">{SCREENSHOT_GROUPS.map(group => <section key={group.id} aria-labelledby={`app-download-shots-${group.id}`}>
        <h3 className="ac-app-subtitle" id={`app-download-shots-${group.id}`}>{group.label}</h3>
        <div className="ac-app-shot-grid">{SCREENSHOT_THEMES.map(theme => {
          const slot = `${group.id}-${theme.id}`;
          return <ScreenshotSlot key={slot} row={slots[slot]} label={theme.label} busy={!!busy} pending={busy?.slot === slot ? busy.kind : null}
            loading={loading} issue={issues[slot]} mustRefresh={locked[slot]} onSave={save} />;
        })}</div>
      </section>)}</div>}
    </>}
  </Card>;
}

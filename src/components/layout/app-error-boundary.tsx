import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { clearBrowserStorage, reloadWithFreshPage } from '@/lib/clear-browser-storage';

interface RecoveryLabels {
  title: string;
  description: string;
  reload: string;
  clear: string;
  confirm: string;
  cancel: string;
  clearing: string;
  failed: string;
}

// The recovery UI must work without the translation provider or UI primitives.
export const getRecoveryLabels = (messages: Record<string, Record<string, unknown>> | null): RecoveryLabels => {
  const storage = messages?.settings?.browserStorage as Partial<Record<string, string>> | undefined;
  const common = messages?.common;
  return {
    title: typeof common?.error === 'string' ? common.error : 'Something went wrong',
    description: storage?.description ?? 'Reload the page, or clear this site’s local data and reload.',
    reload: storage?.reload ?? 'Reload',
    clear: storage?.action ?? 'Clear and reload',
    confirm: storage?.confirm ?? 'Clear local drafts, interface state and accessible caches? Server workspaces and files are not affected. Login cookies are kept. Push notifications may need to be enabled again. Some browsers cannot fully clear the HTTP cache.',
    cancel: typeof common?.cancel === 'string' ? common.cancel : 'Cancel',
    clearing: storage?.clearing ?? 'Clearing…',
    failed: storage?.failed ?? 'Some data could not be cleared. Close other tabs and retry, or reload the page.',
  };
};

const buttonStyle: CSSProperties = {
  minHeight: 44, padding: '10px 16px', border: '1px solid #bbb', borderRadius: 8,
  background: '#fff', color: '#111', font: 'inherit', cursor: 'pointer',
};

export function AppRecoveryDialog({ error, labels }: { error: Error; labels: RecoveryLabels }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // A native top-layer dialog stays usable above the Next.js development overlay.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => { if (typeof dialog.close === 'function') dialog.close(); };
  }, []);

  const clear = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await clearBrowserStorage();
      reloadWithFreshPage();
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <dialog
    ref={dialogRef}
    aria-labelledby="app-recovery-title"
    aria-describedby="app-recovery-description"
    onCancel={(event) => event.preventDefault()}
    style={{
      position: 'fixed', inset: 16, margin: 'auto', width: 'calc(100% - 32px)', maxWidth: 520,
      maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 24, border: '1px solid #bbb',
      borderRadius: 12, background: '#fff', color: '#111', fontFamily: 'system-ui, sans-serif',
      zIndex: 2147483647, boxShadow: '0 8px 40px #0004',
    }}
  >
    <h1 id="app-recovery-title" style={{ margin: '0 0 12px', fontSize: 20 }}>{labels.title}</h1>
    <p id="app-recovery-description" style={{ marginBottom: 16 }}>{confirming ? labels.confirm : labels.description}</p>
    <pre style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, marginBottom: 16 }}>{error.message}</pre>
    {failed && <p role="alert" style={{ color: '#b42318', marginBottom: 16 }}>{labels.failed}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" style={buttonStyle} disabled={busy} onClick={reloadWithFreshPage}>{labels.reload}</button>
      {confirming && <button type="button" style={buttonStyle} disabled={busy} onClick={() => setConfirming(false)}>{labels.cancel}</button>}
      <button type="button" style={{ ...buttonStyle, background: '#b42318', color: '#fff' }} disabled={busy}
        onClick={() => { if (confirming) void clear(); else setConfirming(true); }}>
        {busy ? labels.clearing : labels.clear}
      </button>
    </div>
  </dialog>;
}

export default class AppErrorBoundary extends Component<{ children: ReactNode; labels: RecoveryLabels }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    return this.state.error
      ? <AppRecoveryDialog error={this.state.error} labels={this.props.labels} />
      : this.props.children;
  }
}

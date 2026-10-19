import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface IStartupStatus {
  supported: boolean;
  enabled: boolean;
  reason?: 'packagedOnly' | 'stablePathRequired';
}

interface IStartupAPI {
  platform?: string;
  canManageDesktopAutostart?: () => Promise<boolean>;
  getDesktopAutostartStatus?: () => Promise<IStartupStatus>;
  setDesktopAutostartEnabled?: (enabled: boolean) => Promise<IStartupStatus>;
}

const getAPI = (): IStartupAPI | undefined => typeof window === 'undefined'
  ? undefined : (window as unknown as { electronAPI?: IStartupAPI }).electronAPI;

export const LinuxStartupSettings = () => {
  const t = useTranslations('settings.linuxStartup');
  const api = getAPI();
  const hasAPI = api?.platform === 'linux' && !!api.canManageDesktopAutostart
    && !!api.getDesktopAutostartStatus && !!api.setDesktopAutostartEnabled;
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<IStartupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (!hasAPI || busy) return;
    let cancelled = false;
    getAPI()!.canManageDesktopAutostart!().then(async (allowed) => {
      if (cancelled) return;
      setAvailable(allowed);
      if (!allowed) { setStatus(null); setFailed(false); return; }
      try {
        const next = await getAPI()!.getDesktopAutostartStatus!();
        if (!cancelled) { setStatus(next); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }).catch(() => {
      if (!cancelled) { setAvailable(false); setStatus(null); setFailed(false); }
    });
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); };
  }, [hasAPI, busy, refresh, reload]);

  const change = async (enabled: boolean) => {
    if (!available || busy) return;
    setBusy(true);
    try {
      setStatus(await getAPI()!.setDesktopAutostartEnabled!(enabled));
      setFailed(false);
      toast.success(t(enabled ? 'enabled' : 'disabled'));
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!hasAPI || !available) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="linux-desktop-startup">{t('title')}</Label>
          <p id="linux-startup-description" className="text-sm text-muted-foreground">
            {status?.supported === false ? t(status.reason || 'packagedOnly') : t('description')}
          </p>
        </div>
        <Switch id="linux-desktop-startup" aria-describedby="linux-startup-description"
          checked={status?.enabled ?? false} onCheckedChange={change}
          disabled={busy || failed || !status || (!status.supported && !status.enabled)} />
      </div>
      {failed && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {t('loadFailed')}<Button variant="outline" size="sm" onClick={refresh}>{t('retry')}</Button>
      </div>}
      <p className="text-sm text-muted-foreground">{t('serverHint')}</p>
    </div>
  );
};

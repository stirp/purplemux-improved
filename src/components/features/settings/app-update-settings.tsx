import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import useAppUpdate from '@/hooks/use-app-update';
import { isNewerVersion } from '@/lib/app-update-version';

const AppUpdateSettings = ({ compact = false }: { compact?: boolean }) => {
  const t = useTranslations('settings.appUpdate');
  const { state, error, requesting, run, desktop, reconnectTimedOut } = useAppUpdate();
  const [forceVersion, setForceVersion] = useState<string | null>(null);
  const available = !!state?.latestVersion && isNewerVersion(state.latestVersion, state.currentVersion);
  const skipped = available && state?.skippedVersion === state?.latestVersion;
  const busy = requesting || ['checking', 'downloading', 'restarting'].includes(state?.phase || '');
  const installing = state?.installing || ['downloading', 'ready', 'blocked', 'restarting'].includes(state?.phase || '');
  if (compact && skipped && !installing && !state?.error && !error) return null;
  if (compact && !available && !state?.error && !['downloading', 'blocked', 'restarting'].includes(state?.phase || '')) return null;
  return (
    <section aria-label={t('title')} className={compact ? 'shrink-0 border-b bg-muted px-3 py-2' : 'space-y-3'}>
      <div className={compact ? 'flex flex-wrap items-center justify-between gap-3' : 'flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center'}>
        <div className={compact ? 'min-w-0 flex-1 basis-48 space-y-1' : 'min-w-0 flex-1 space-y-1'}>
          <p className="text-sm font-medium">{compact && available ? t('available', { version: state!.latestVersion! }) : t('title')}</p>
          {!compact && <p className="text-sm text-muted-foreground">{t(desktop ? 'desktopDescription' : 'serverDescription')}</p>}
          {state && <p className="text-xs text-muted-foreground" role="status">
            {t('current', { version: state.currentVersion })} · {t(state.phase === 'idle' && !state.checkedAt ? 'notChecked' : state.phase, { version: state.latestVersion || '' })}
            {!compact && available && state.phase !== 'available' && ` · ${t('available', { version: state.latestVersion! })}`}
            {state.progress !== null && state.phase === 'downloading' && ` ${Math.round(state.progress)}%`}
          </p>}
          {!compact && skipped && <p className="text-xs text-muted-foreground">{t('skipped', { version: state!.latestVersion! })}</p>}
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap gap-2">
          {!compact && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run('check')}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t('check')}
          </Button>}
          {available && <Button size="sm" disabled={busy || !state?.supported} onClick={() => void run('install')}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{t('install')}
          </Button>}
          {available && <Button variant="destructive" size="sm" disabled={busy || !state?.supported} onClick={() => setForceVersion(state!.latestVersion!)}>
            {t('forceInstall')}
          </Button>}
          {available && !skipped && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run('skip', state!.latestVersion!)}>
            {t('skip')}
          </Button>}
        </div>
      </div>
      {state?.phase === 'restarting' && <p className="mt-2 text-xs text-muted-foreground">{t(desktop ? 'desktopReconnecting' : 'reconnecting')}</p>}
      {reconnectTimedOut && <div role="alert" className="mt-2 space-y-2">
        <p className="text-xs text-destructive">{t('reconnectFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>{t('reload')}</Button>
      </div>}
      {(state?.error || error) && state?.phase !== 'restarting' && <p role="alert" className="mt-2 break-words text-xs text-destructive">
        {error || (state?.phase === 'blocked' ? t('busyHint') : state?.error)}
      </p>}
      {state && !state.supported && <p className="mt-2 text-xs text-muted-foreground">{t(desktop ? 'desktopUnsupported' : 'serverUnsupported')}</p>}
      <AlertDialog open={forceVersion !== null} onOpenChange={(open) => { if (!open) setForceVersion(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('forceInstall')}</AlertDialogTitle>
            <AlertDialogDescription>{t('forceConfirm', { version: forceVersion || '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={busy || !state?.supported || forceVersion !== state?.latestVersion} onClick={() => {
              if (!forceVersion) return;
              void run('force-install', forceVersion);
              setForceVersion(null);
            }}>{t('forceInstall')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default AppUpdateSettings;

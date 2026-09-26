import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { clearBrowserStorage, reloadWithFreshPage } from '@/lib/clear-browser-storage';

export default function BrowserStorageSettings() {
  const t = useTranslations('settings.browserStorage');
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const clear = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try { await clearBrowserStorage(); reloadWithFreshPage(); }
    catch { setFailed(true); setBusy(false); }
  };
  return <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div>
      <p className="text-sm font-medium">{t('title')}</p>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    <Button variant="outline" className="shrink-0" onClick={() => { setFailed(false); setOpen(true); }}>{t('action')}</Button>
    <AlertDialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && <p role="alert" className="text-sm text-ui-red">{t('failed')}</p>}
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{common('cancel')}</Button>
          {failed && <Button variant="outline" onClick={reloadWithFreshPage}>{t('reload')}</Button>}
          <Button variant="destructive" disabled={busy} onClick={() => void clear()}>{busy ? t('clearing') : t('action')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

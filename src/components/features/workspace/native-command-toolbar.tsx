import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

const NativeCommandToolbar = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslations('terminal');
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-3 py-1 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{t('nativeCommandsHint')}</span>
      <Button size="sm" variant="ghost" onClick={onClose}>{t('nativeCommandsReturn')}</Button>
    </div>
  );
};

export default NativeCommandToolbar;

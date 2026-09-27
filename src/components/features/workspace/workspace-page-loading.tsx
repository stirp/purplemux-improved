import type { DynamicOptionsLoadingProps } from 'next/dynamic';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

const WorkspacePageLoading = ({ error }: DynamicOptionsLoadingProps) => {
  const t = useTranslations('common');

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3" role={error ? 'alert' : 'status'}>
      {error ? (
        <>
          <span className="text-sm text-muted-foreground">{t('error')}</span>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            {t('refresh')}
          </Button>
        </>
      ) : (
        <>
          <Spinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">{t('loading')}</span>
        </>
      )}
    </div>
  );
};

export default WorkspacePageLoading;

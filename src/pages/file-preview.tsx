import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { buildSessionFileUrl, getSessionFileReturnUrl } from '@/lib/session-file-url';
import { requireAuth } from '@/lib/require-auth';
import { loadMessagesServer } from '@/lib/load-messages';

interface IFilePreviewProps {
  name: string;
  src: string | null;
  returnTo: string;
}

const FilePreview = ({ name, src, returnTo }: IFilePreviewProps) => {
  const t = useTranslations('common');
  // Chromium disables its native PDF viewer in sandboxed frames.
  const sandbox = name.toLowerCase().endsWith('.pdf') ? undefined : 'allow-same-origin allow-downloads';
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Head><title>{name || t('error')}</title><meta name="referrer" content="no-referrer" /></Head>
      <header className="flex shrink-0 items-center gap-3 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <a href={returnTo} className={buttonVariants({ variant: 'ghost', className: 'min-h-11 min-w-11 gap-2 px-3' })}>
          <ArrowLeft aria-hidden="true" />{t('back')}
        </a>
        <h1 className="min-w-0 truncate text-sm font-medium" title={name}>{name}</h1>
      </header>
      {src ? (
        <iframe className="min-h-0 w-full flex-1 border-0 pb-[env(safe-area-inset-bottom)]" src={src} title={name}
          sandbox={sandbox} referrerPolicy="no-referrer" />
      ) : <p role="alert" className="p-4">{t('error')}</p>}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<IFilePreviewProps> = async (context) =>
  requireAuth(context, async () => {
    context.res.setHeader('Cache-Control', 'no-store');
    const { file, line, returnTo } = context.query;
    const validFile = typeof file === 'string' && file.startsWith('/') && !/[\x00-\x1f\x7f]/.test(file);
    const lineNumber = typeof line === 'string' && /^[1-9]\d*$/.test(line) && Number.isSafeInteger(Number(line)) ? Number(line) : undefined;
    return { props: {
      name: validFile ? file.split('/').pop() ?? '' : '',
      src: validFile ? buildSessionFileUrl({ path: file, line: lineNumber }) : null,
      returnTo: getSessionFileReturnUrl(returnTo),
      messages: await loadMessagesServer(),
    } };
  }, { skipPreflight: true });

export default FilePreview;

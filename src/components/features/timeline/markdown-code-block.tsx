import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const MarkdownCodeBlock = ({ children, className, node: _node, ...props }: ComponentProps<'pre'> & ExtraProps) => {
  const t = useTranslations('timeline');
  const preRef = useRef<HTMLPreElement>(null);
  const [copyCount, setCopyCount] = useState(0);
  const copied = copyCount > 0;

  useEffect(() => {
    if (copyCount === 0) return;
    const timeout = setTimeout(() => setCopyCount(0), 2000);
    return () => clearTimeout(timeout);
  }, [copyCount]);

  const handleCopy = async () => {
    const success = await copyToClipboard(preRef.current?.textContent ?? '');
    setCopyCount((count) => success ? count + 1 : 0);
    if (!success) toast.error(t('codeCopyFailed'));
  };

  return (
    <div className="my-3 min-w-0 rounded-md bg-muted">
      <div className="not-prose flex justify-end px-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label={t('copyCode')}
          onClick={handleCopy}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span role="status">{t(copied ? 'codeCopied' : 'copyCode')}</span>
        </Button>
      </div>
      <pre {...props} ref={preRef} className={cn('my-0! overflow-x-auto', className)}>{children}</pre>
    </div>
  );
};

export default MarkdownCodeBlock;

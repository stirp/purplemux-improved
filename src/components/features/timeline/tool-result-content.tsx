import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToolResultPresentation } from '@/lib/tool-result-presentation';
import type { ITimelineToolResult } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => <span>{alt}</span>,
};
const PRE_CLASS = 'whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]';

const ToolResultContent = ({ result }: { result: ITimelineToolResult }) => {
  const t = useTranslations('timeline');
  const output = result.output || result.summary;
  const presentation = useMemo(() => getToolResultPresentation(output), [output]);
  if (!output) return null;

  const isError = result.isError || presentation?.isError;
  const containerClass = cn(
    'mt-1 min-w-0 text-xs',
    isError ? 'text-negative' : 'text-muted-foreground',
  );

  if (!presentation) {
    return (
      <pre className={cn(
        containerClass, PRE_CLASS,
        result.output && 'max-h-80 overflow-auto rounded border border-border/40 bg-muted/40 p-2',
      )}>{output}</pre>
    );
  }

  return (
    <div className={containerClass}>
      {isError && <div className="mb-1 font-medium">{t('toolResultError')}</div>}
      <div className="max-h-80 space-y-2 overflow-auto rounded border border-border/40 bg-muted/40 p-2">
        {presentation.blocks.map((block, index) => {
          if (block.kind === 'raw') return <pre key={index} className={PRE_CLASS}>{block.text}</pre>;
          if (block.kind === 'markdown') {
            return (
              <div key={index} className="prose prose-sm dark:prose-invert max-w-none text-xs text-inherit [overflow-wrap:anywhere] [&_h1]:text-base [&_h2]:text-sm [&_p]:whitespace-pre-wrap [&_pre]:overflow-auto [&_pre]:bg-muted [&_pre]:text-foreground [&_pre]:text-xs [&_code]:text-inherit [&_table]:block [&_table]:overflow-auto [&_a]:text-ui-blue">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                  {block.text}
                </ReactMarkdown>
              </div>
            );
          }
          return (
            <div key={index} className="space-y-1.5">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground [overflow-wrap:anywhere]">
                {block.exitCode !== undefined && (
                  <span className={cn(block.exitCode !== 0 && 'text-negative')}>
                    {t('toolResultExitCode', { code: block.exitCode })}
                  </span>
                )}
                {block.duration !== undefined && <span>{t('toolResultDuration', { seconds: block.duration })}</span>}
                {block.sessionId !== undefined && <span>{t('toolResultSession', { id: block.sessionId })}</span>}
              </div>
              {block.output && <pre className={PRE_CLASS}>{block.output}</pre>}
              {block.stderr && (
                <div className="text-negative">
                  <div className="mb-1 font-medium">stderr</div>
                  <pre className={PRE_CLASS}>{block.stderr}</pre>
                </div>
              )}
              {!block.output && !block.stderr && <span>{t('toolResultEmpty')}</span>}
            </div>
          );
        })}
      </div>
      <details className="group mt-1">
        <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2">
          <ChevronRight size={12} aria-hidden className="shrink-0 group-open:rotate-90" />
          {t('toolResultRaw')}
        </summary>
        <pre className={cn(PRE_CLASS, 'max-h-80 overflow-auto rounded border border-border/40 bg-muted/40 p-2')}>{output}</pre>
      </details>
    </div>
  );
};

export default memo(ToolResultContent);

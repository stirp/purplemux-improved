import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TTrustAgent, TTrustAnswer } from '@/lib/trust-prompt-detector';

interface ITrustPromptCardProps {
  folderPath: string;
  agent?: TTrustAgent;
  canRespond?: boolean;
  onRespond: (answer: TTrustAnswer) => void | Promise<void>;
}

const AGENT_LABEL: Record<TTrustAgent, string> = {
  claude: 'Claude',
  codex: 'Codex',
};

const TrustPromptCard = ({ folderPath, agent = 'claude', canRespond = true, onRespond }: ITrustPromptCardProps) => {
  const t = useTranslations('terminal');
  const [sending, setSending] = useState<TTrustAnswer | null>(null);

  const handle = async (answer: TTrustAnswer) => {
    if (sending || !canRespond) return;
    setSending(answer);
    try {
      await onRespond(answer);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="mt-4 w-full max-w-md rounded-lg border border-ui-amber/20 bg-ui-amber/5 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ui-amber">
        <ShieldCheck size={14} />
        <span>{t('trustPromptTitle')}</span>
      </div>
      <div className="mb-3 break-all rounded bg-background/50 px-2 py-1.5 text-xs font-mono text-foreground">
        {folderPath}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t('trustPromptDescription', { agentName: AGENT_LABEL[agent] })}
      </p>
      <div className="flex flex-col gap-1.5">
        <button
          disabled={sending !== null || !canRespond}
          onClick={() => handle('yes')}
          className="flex items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 text-left text-sm transition-colors hover:border-ui-amber/30 hover:bg-ui-amber/5 disabled:opacity-50"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">1</span>
          <span className="font-medium">{t('trustPromptYes')}</span>
        </button>
        <button
          disabled={sending !== null || !canRespond}
          onClick={() => handle('no')}
          className="flex items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 text-left text-sm transition-colors hover:border-ui-amber/30 hover:bg-ui-amber/5 disabled:opacity-50"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">2</span>
          <span className="font-medium">{t('trustPromptNo')}</span>
        </button>
      </div>
    </div>
  );
};

export default TrustPromptCard;

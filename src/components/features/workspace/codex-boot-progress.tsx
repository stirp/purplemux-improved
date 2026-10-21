import { useTranslations } from 'next-intl';
import OpenAIIcon from '@/components/icons/openai-icon';
import AgentBootProgress from '@/components/features/workspace/agent-boot-progress';

const ALMOST_READY_MS = 3_000;

interface ICodexBootProgressProps {
  hasFailed: boolean;
  className?: string;
  onRestart?: () => void;
  onShowTerminal?: () => void;
}

const CodexBootProgress = ({ hasFailed, className, onRestart, onShowTerminal }: ICodexBootProgressProps) => {
  const t = useTranslations('terminal');

  return (
    <AgentBootProgress
      icon={(
        <OpenAIIcon
          size={32}
          className="text-foreground motion-safe:animate-spin motion-reduce:opacity-70 [animation-duration:1.5s]"
        />
      )}
      main={t('codexBootMain')}
      almostReady={t('codexBootAlmostReady')}
      subtitle={t('codexBootSubtitle')}
      failed={t('codexBootFailed')}
      failedHint={t('codexBootFailedHint')}
      restartLabel={t('codexBootRestart')}
      showTerminalLabel={t('codexBootShowTerminal')}
      className={className}
      almostReadyMs={ALMOST_READY_MS}
      hasFailed={hasFailed}
      onRestart={onRestart}
      onShowTerminal={onShowTerminal}
    />
  );
};

export default CodexBootProgress;

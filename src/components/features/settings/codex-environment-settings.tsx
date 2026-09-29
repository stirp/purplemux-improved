import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import useConfigStore from '@/hooks/use-config-store';
import { formatAgentEnvironment, parseAgentEnvironment } from '@/lib/agent-environment';

export const AgentEnvironmentSettings = ({ provider }: { provider: 'claude' | 'codex' }) => {
  const id = `${provider}-environment`;
  const t = useTranslations('settings.claude');
  const tc = useTranslations('common');
  const environment = useConfigStore((state) => state[`${provider}Environment`]);
  const saveEnvironment = useConfigStore((state) => provider === 'codex' ? state.setCodexEnvironment : state.setClaudeEnvironment);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const saved = formatAgentEnvironment(environment);
  const value = draft ?? saved;

  const save = async () => {
    let parsed;
    try {
      parsed = parseAgentEnvironment(value);
    } catch {
      setInvalid(true);
      return;
    }
    setSaving(true);
    try {
      await saveEnvironment(parsed);
      setDraft(null);
      toast.success(tc('saved'));
    } catch (error) {
      toast.error(tc('error'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{t('environmentTitle', { agent: provider === 'codex' ? 'Codex' : 'Claude' })}</Label>
      <p id={`${id}-description`} className="text-sm text-muted-foreground">
        {t('environmentDescription', { agent: provider === 'codex' ? 'Codex' : 'Claude' })}
      </p>
      <textarea
        id={id}
        aria-describedby={`${id}-description${invalid ? ` ${id}-error` : ''}`}
        aria-invalid={invalid}
        className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        value={value}
        onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        placeholder={'HTTP_PROXY=http://127.0.0.1:7890\nHTTPS_PROXY=http://127.0.0.1:7890\nNO_PROXY=localhost,127.0.0.1'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={saving}
      />
      {invalid && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{t('environmentInvalid')}</p>}
      <Button onClick={save} disabled={saving || value === saved}>
        {saving ? tc('loading') : tc('save')}
      </Button>
    </div>
  );
};

const CodexEnvironmentSettings = () => <AgentEnvironmentSettings provider="codex" />;
export default CodexEnvironmentSettings;

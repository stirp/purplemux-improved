import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import useConfigStore from '@/hooks/use-config-store';
import { formatAgentEnvironment, parseAgentEnvironment } from '@/lib/agent-environment';

export default function CodexEnvironmentSettings() {
  const t = useTranslations('settings.claude');
  const tc = useTranslations('common');
  const environment = useConfigStore((state) => state.codexEnvironment);
  const saveEnvironment = useConfigStore((state) => state.setCodexEnvironment);
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
      <Label htmlFor="codex-environment">{t('environmentTitle')}</Label>
      <p id="codex-environment-description" className="text-sm text-muted-foreground">
        {t('environmentDescription')}
      </p>
      <textarea
        id="codex-environment"
        aria-describedby={`codex-environment-description${invalid ? ' codex-environment-error' : ''}`}
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
      {invalid && <p id="codex-environment-error" role="alert" className="text-sm text-destructive">{t('environmentInvalid')}</p>}
      <Button onClick={save} disabled={saving || value === saved}>
        {saving ? tc('loading') : tc('save')}
      </Button>
    </div>
  );
}

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useConfigStore from '@/hooks/use-config-store';
import type { TGitAskProvider } from '@/hooks/use-config-store';
import { BRANCH_NAME_VARIABLES, DEFAULT_BRANCH_NAME_PROMPT, isValidBranchNamePrompt } from '@/lib/branch-name-prompt';

export default function BranchNameSettings() {
  const t = useTranslations('settings.branchName');
  const tc = useTranslations('common');
  const provider = useConfigStore((state) => state.branchNameProvider);
  const prompt = useConfigStore((state) => state.branchNamePrompt);
  const saveSettings = useConfigStore((state) => state.setBranchNameSettings);
  const [draft, setDraft] = useState<{ provider: TGitAskProvider; prompt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? { provider, prompt };
  const valid = isValidBranchNamePrompt(value.prompt);
  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(value.provider, value.prompt);
      setDraft(null);
      toast.success(tc('saved'));
    } catch (error) {
      toast.error(tc('error'), { description: error instanceof Error ? error.message : String(error) });
    } finally { setSaving(false); }
  };
  return <fieldset disabled={saving} className="space-y-3">
    <legend className="text-sm font-medium">{t('title')}</legend>
    <p className="text-sm text-muted-foreground">{t('description')}</p>
    <label className="flex flex-col gap-1 text-sm">{t('agent')}
      <select className="rounded-md border bg-background p-2" value={value.provider} aria-describedby="branch-name-provider-help"
        onChange={(event) => setDraft({ ...value, provider: event.target.value as TGitAskProvider })}>
        <option value="claude">Claude Code</option><option value="codex" disabled>Codex CLI</option>
      </select>
    </label>
    <p id="branch-name-provider-help" className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">{t('codexUnavailable')}</p>
    <label className="flex flex-col gap-1 text-sm">{t('prompt')}
      <textarea className="min-h-48 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        value={value.prompt} maxLength={10000} spellCheck={false} aria-invalid={!valid} aria-describedby="branch-name-variables"
        onChange={(event) => setDraft({ ...value, prompt: event.target.value })} />
    </label>
    <p id="branch-name-variables" className="text-xs text-muted-foreground">{t('variables')}</p>
    <div className="flex flex-wrap gap-2">
      {BRANCH_NAME_VARIABLES.map((name) => <Button key={name} type="button" size="sm" variant="outline"
        onClick={() => setDraft({ ...value, prompt: `${value.prompt}{{${name}}}` })}>{`{{${name}}}`}</Button>)}
    </div>
    {!valid && <p role="alert" className="text-sm text-destructive">{t('invalid')}</p>}
    <div className="flex gap-2">
      <Button type="button" onClick={() => void save()} disabled={saving || value.provider === 'codex' || !valid || (value.provider === provider && value.prompt === prompt)}>{saving ? tc('loading') : tc('save')}</Button>
      <Button type="button" variant="outline" onClick={() => setDraft({ ...value, prompt: DEFAULT_BRANCH_NAME_PROMPT })}>{t('reset')}</Button>
    </div>
  </fieldset>;
}

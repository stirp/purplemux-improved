import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useConfigStore from '@/hooks/use-config-store';
import { GIT_GENERATION_PROMPTS, isValidGitGenerationPrompt, type TGitGenerationPromptKey } from '@/lib/git-generation-prompts';

export default function GitGenerationPromptSettings({ promptKey }: { promptKey: TGitGenerationPromptKey }) {
  const t = useTranslations('settings.gitGenerationPrompts');
  const tc = useTranslations('common');
  const prompt = useConfigStore((state) => state[promptKey]);
  const savePrompt = useConfigStore((state) => state.setGitGenerationPrompt);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? prompt;
  const valid = isValidGitGenerationPrompt(promptKey, value);
  const definition = GIT_GENERATION_PROMPTS[promptKey];
  const save = async () => {
    if (saving || !valid) return;
    setSaving(true);
    try {
      await savePrompt(promptKey, value);
      setDraft(null);
      toast.success(tc('saved'));
    } catch (error) {
      toast.error(tc('error'), { description: error instanceof Error ? error.message : String(error) });
    } finally { setSaving(false); }
  };

  return <fieldset disabled={saving} className="space-y-3">
    <legend className="text-sm font-medium">{t(`${promptKey}.title`)}</legend>
    <p className="text-sm text-muted-foreground">{t(`${promptKey}.description`)}</p>
    <label className="flex flex-col gap-1 text-sm">{t('prompt')}
      <textarea className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        value={value} maxLength={10000} spellCheck={false} aria-invalid={!valid} aria-describedby={`${promptKey}-variables`}
        onChange={(event) => setDraft(event.target.value)} />
    </label>
    <p id={`${promptKey}-variables`} className="text-xs text-muted-foreground">{t('variables')}</p>
    <div className="flex flex-wrap gap-2">
      {definition.variables.map((name) => <Button key={name} type="button" size="sm" variant="outline"
        disabled={value.length + name.length + 4 > 10000} onClick={() => setDraft(`${value}{{${name}}}`)}>{`{{${name}}}`}</Button>)}
    </div>
    <p className="text-xs text-muted-foreground">{t('evidenceHint')}</p>
    {!valid && <p role="alert" className="text-sm text-destructive">{t('invalid')}</p>}
    <div className="flex gap-2">
      <Button type="button" onClick={() => void save()} disabled={saving || !valid || value === prompt}>{saving ? tc('loading') : tc('save')}</Button>
      <Button type="button" variant="outline" onClick={() => setDraft(definition.defaultPrompt)}>{t('reset')}</Button>
    </div>
  </fieldset>;
}

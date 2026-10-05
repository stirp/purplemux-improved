import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useConfigStore from '@/hooks/use-config-store';
import {
  TYPOGRAPHY_REGIONS, MIN_REGION_FONT_SIZE, MAX_REGION_FONT_SIZE,
  isValidRegionTypography, isValidTypographyColor, regionFontFamily, regionTypographyEqual,
  type TRegionTypography, type TTypographyRegion, type IRegionTypography,
} from '@/lib/region-typography';

const RegionTypographySettings = () => {
  const t = useTranslations('settings.typography');
  const saved = useConfigStore((s) => s.regionTypography);
  const save = useConfigStore((s) => s.setRegionTypography);
  const [draft, setDraft] = useState<TRegionTypography | null>(null);
  const [saving, setSaving] = useState(false);
  const settings = draft ?? saved;
  const valid = isValidRegionTypography(settings);
  const dirty = !regionTypographyEqual(settings, saved);

  const update = (region: TTypographyRegion, key: keyof IRegionTypography, value: string | number | undefined) => {
    const next = { ...settings[region], [key]: value };
    if (value === undefined) delete next[key];
    const updated = { ...settings, [region]: next };
    if (Object.keys(next).length === 0) delete updated[region];
    setDraft(updated);
  };

  const apply = async () => {
    setSaving(true);
    try {
      await save(settings);
      setDraft(null);
      toast.success(t('applied'));
    } catch (error) {
      toast.error(t('failed'), { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={saving} className="space-y-4 border-b pb-4">
      <legend className="text-sm font-medium">{t('title')}</legend>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <p className="text-xs text-muted-foreground">{t('fontHelp')}</p>
      {TYPOGRAPHY_REGIONS.map((region) => {
        const style = settings[region] ?? {};
        const preview = isValidRegionTypography({ [region]: style }) ? style : {};
        return (
          <div key={region} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t(`regions.${region}`)}</p>
              <Button type="button" variant="ghost" size="sm" disabled={!settings[region]} onClick={() => {
                const next = { ...settings };
                delete next[region];
                setDraft(next);
              }}>{t('reset')}</Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs sm:col-span-2">
                <span>{t('fontFamily')}</span>
                <Input value={style.fontFamily ?? ''} maxLength={200} placeholder={t('fontPlaceholder')}
                  onChange={(e) => update(region, 'fontFamily', e.target.value || undefined)} />
              </label>
              <label className="space-y-1 text-xs">
                <span>{t('fontSize')}</span>
                <Input type="number" min={MIN_REGION_FONT_SIZE} max={MAX_REGION_FONT_SIZE} step="1"
                  value={style.fontSize ?? ''} placeholder={t('default')}
                  onChange={(e) => update(region, 'fontSize', e.target.value === '' ? undefined : Number(e.target.value))} />
              </label>
              <div className="space-y-1 text-xs">
                <label htmlFor={`typography-color-${region}`}>{t('color')}</label>
                <div className="flex gap-2">
                  {style.color && !isValidTypographyColor(style.color) ? (
                    <span role="img" aria-label={t('invalid')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-destructive text-destructive">!</span>
                  ) : <input type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent"
                    aria-label={`${t(`regions.${region}`)} ${t('color')}`}
                    title={style.color ?? t('default')}
                    value={style.color ?? '#808080'}
                    onChange={(e) => update(region, 'color', e.target.value)} />}
                  <Input id={`typography-color-${region}`} value={style.color ?? ''} maxLength={7} placeholder={t('default')}
                    aria-invalid={!!style.color && !isValidTypographyColor(style.color)}
                    onChange={(e) => update(region, 'color', e.target.value || undefined)} />
                </div>
              </div>
            </div>
            <div className="overflow-auto rounded bg-muted/30 p-2" style={{
              fontFamily: preview.fontFamily ? regionFontFamily(preview.fontFamily) : undefined,
              fontSize: preview.fontSize,
              color: preview.color,
            }}>{t('preview')}</div>
          </div>
        );
      })}
      {!valid && <p role="alert" className="text-xs text-destructive">{t('invalid')}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={Object.keys(settings).length === 0} onClick={() => setDraft({})}>{t('resetAll')}</Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(null)}>{t('cancel')}</Button>
          <Button type="button" size="sm" disabled={!dirty || !valid} onClick={apply}>{t(saving ? 'saving' : 'apply')}</Button>
        </div>
      </div>
    </fieldset>
  );
};

export default RegionTypographySettings;

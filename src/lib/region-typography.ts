export const TYPOGRAPHY_REGIONS = ['sidebar', 'tabs', 'messages', 'input', 'terminal'] as const;
export type TTypographyRegion = typeof TYPOGRAPHY_REGIONS[number];

export interface IRegionTypography {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
}

export type TRegionTypography = Partial<Record<TTypographyRegion, IRegionTypography>>;
export const MIN_REGION_FONT_SIZE = 8;
export const MAX_REGION_FONT_SIZE = 40;

export const isValidTypographyColor = (color: string): boolean => /^#[\da-f]{6}$/i.test(color);

export const regionTypographyEqual = (left: TRegionTypography, right: TRegionTypography): boolean => {
  const ordered = (settings: TRegionTypography) => Object.entries(settings)
    .map(([region, style]) => [region, Object.entries(style ?? {}).filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))] as const)
    .filter(([, entries]) => entries.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
};

export const isValidRegionTypography = (value: unknown): value is TRegionTypography => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([region, style]) => {
    if (!TYPOGRAPHY_REGIONS.includes(region as TTypographyRegion) || !style || typeof style !== 'object' || Array.isArray(style)) return false;
    return Object.entries(style).every(([key, entry]) => {
      if (key === 'fontFamily') return typeof entry === 'string' && entry.length <= 200 &&
        /^[\p{L}\p{N} _.,-]+$/u.test(entry) && entry.split(',').every((name) => name.trim().length > 0);
      if (key === 'fontSize') return typeof entry === 'number' && Number.isFinite(entry) && entry >= MIN_REGION_FONT_SIZE && entry <= MAX_REGION_FONT_SIZE;
      if (key === 'color') return typeof entry === 'string' && isValidTypographyColor(entry);
      return false;
    });
  });
};

export const regionFontFamily = (family: string): string =>
  family.split(',').map((name) => {
    const trimmed = name.trim();
    return ['serif', 'sans-serif', 'monospace', 'system-ui'].includes(trimmed) ? trimmed : `"${trimmed}"`;
  }).join(', ');

export const buildRegionTypographyCSS = (settings: TRegionTypography): string => {
  if (!isValidRegionTypography(settings)) return '';
  const declarations = TYPOGRAPHY_REGIONS.filter((region) => region !== 'terminal').flatMap((region) => {
    const style = settings[region];
    if (!style) return [];
    return [
      style.fontFamily ? `--region-${region}-font-family:${regionFontFamily(style.fontFamily)};` : '',
      style.fontSize ? `--region-${region}-font-size:${style.fontSize}px;` : '',
      style.color ? `--region-${region}-color:${style.color};` : '',
      style.fontSize || style.fontFamily ? `--region-${region}-line-height:normal;` : '',
    ].filter(Boolean);
  });
  return declarations.length ? `:root{${declarations.join('')}}` : '';
};

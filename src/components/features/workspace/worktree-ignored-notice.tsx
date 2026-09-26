import { useTranslations } from 'next-intl';

export default function WorktreeIgnoredNotice({ paths }: { paths: string[] }) {
  const t = useTranslations('workspace.worktreeManager');
  if (!paths.length) return null;
  return <div className="rounded border p-3">
    <p className="text-sm">{t('ignoredDeleteNotice')}</p>
    <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-xs">
      {paths.map((name) => <li key={name} className="whitespace-pre-wrap break-all">{name}</li>)}
    </ul>
  </div>;
}

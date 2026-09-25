import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useEditorFile from '@/hooks/use-editor-file';
import { openEditorTarget } from '@/lib/open-editor';
import { EditorIcon } from '@/components/icons/editor-icons';
import { useTheme } from 'next-themes';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { DiffView, DiffModeEnum, getLang } from '@git-diff-view/react';
import { parseMultiFileDiff, getDisplayName, buildFileDiffString, type IGitDiffFile } from '@/lib/parse-git-diff';
import useConfigStore from '@/hooks/use-config-store';
import useIsMobile from '@/hooks/use-is-mobile';

type TViewMode = 'split' | 'unified';

interface IDiffFileListProps {
  repoRoot: string;
  diff: string;
  viewMode: TViewMode;
  sessionName: string;
  oldRef?: string;
  newRef?: string;
}

const DIFF_FONT_SIZE: Record<string, number> = {
  normal: 11,
  large: 13,
  'x-large': 15,
};

const DiffFileList = ({ diff, viewMode, sessionName, repoRoot, oldRef = 'HEAD', newRef = 'WORKTREE' }: IDiffFileListProps) => {
  const { resolvedTheme } = useTheme();
  const theme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';
  const isMobile = useIsMobile();
  const fontSize = useConfigStore((s) => s.fontSize);
  const diffFontSize = DIFF_FONT_SIZE[fontSize] ?? DIFF_FONT_SIZE.normal;

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const files = useMemo(() => {
    if (!diff) return [];
    return parseMultiFileDiff(diff).map((f, i) => {
      const displayName = getDisplayName(f);
      return {
        key: `${displayName}#${i}`,
        source: f,
        displayName,
      };
    });
  }, [diff]);

  const totals = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const f of files) {
      add += f.source.additions;
      del += f.source.deletions;
    }
    return { files: files.length, add, del };
  }, [files]);

  const effectiveMode: TViewMode = isMobile ? 'unified' : viewMode;

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {totals.files}
        </span>
        {totals.add > 0 && <span className="text-ui-teal">+{totals.add}</span>}
        {totals.del > 0 && <span className="text-ui-red">-{totals.del}</span>}
      </div>

      {files.map((f) => {
        const fingerprint = `${f.source.hunks.length}:${f.source.additions}:${f.source.deletions}`;
        return (
          <FileDiffCard
            key={`${f.key}@${fingerprint}`}
            file={f.source}
            repoRoot={repoRoot}
            displayName={f.displayName}
            isCollapsed={collapsed.has(f.key)}
            onToggle={() => toggle(f.key)}
            sessionName={sessionName}
            oldRef={oldRef}
            newRef={newRef}
            viewMode={effectiveMode}
            theme={theme}
            isMobile={isMobile}
            diffFontSize={diffFontSize}
          />
        );
      })}
    </div>
  );
};

interface IFileDiffCardProps {
  repoRoot: string;
  file: IGitDiffFile;
  displayName: string;
  isCollapsed: boolean;
  onToggle: () => void;
  sessionName: string;
  oldRef: string;
  newRef: string;
  viewMode: TViewMode;
  theme: 'light' | 'dark';
  isMobile: boolean;
  diffFontSize: number;
}

interface IFileContent {
  oldContent: string;
  newContent: string;
}

const FileDiffCard = ({
  file,
  repoRoot,
  displayName,
  isCollapsed,
  onToggle,
  sessionName,
  oldRef,
  newRef,
  viewMode,
  theme,
  isMobile,
  diffFontSize,
}: IFileDiffCardProps) => {
  const t = useTranslations('terminal');
  const preset = useConfigStore((state) => state.editorPreset);
  const editorTarget = useEditorFile(repoRoot && !file.isDeleted
    ? { path: repoRoot.replace(/\/$/, '') + '/' + file.newName } : null);
  const renderable = !file.isBinary && file.hunks.length > 0;
  const lang = getLang(displayName);

  const [content, setContent] = useState<IFileContent | null>(null);
  const [fetched, setFetched] = useState(false);

  const oldPath = file.isNew || file.oldName === '/dev/null' ? '' : file.oldName;
  const newPath = file.isDeleted || file.newName === '/dev/null' ? '' : file.newName;

  useEffect(() => {
    if (isCollapsed || fetched || !renderable) return;
    if (!oldPath && !newPath) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ session: sessionName, oldRef, newRef });
    if (oldPath) params.set('oldPath', oldPath);
    if (newPath) params.set('newPath', newPath);

    fetch(`/api/layout/file-content?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { oldContent: string; newContent: string; truncated: boolean; binary: boolean } | null) => {
        setFetched(true);
        if (!data || data.truncated || data.binary) return;
        setContent({ oldContent: data.oldContent, newContent: data.newContent });
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setFetched(true);
      });

    return () => controller.abort();
  }, [isCollapsed, fetched, renderable, sessionName, oldRef, newRef, oldPath, newPath]);

  const data = useMemo(() => {
    if (!renderable) return null;
    return {
      oldFile: {
        fileName: file.oldName,
        fileLang: lang,
        content: content?.oldContent,
      },
      newFile: {
        fileName: file.newName,
        fileLang: lang,
        content: content?.newContent,
      },
      hunks: [buildFileDiffString(file)],
    };
  }, [renderable, file, lang, content]);

  return (
    <div className="overflow-hidden rounded border border-border bg-card">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-secondary">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
        >
          {isCollapsed
            ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span className="truncate font-mono text-xs text-foreground">{displayName}</span>
          {file.isNew && <span className="rounded bg-ui-teal/15 px-1 text-[10px] text-ui-teal">NEW</span>}
          {file.isDeleted && <span className="rounded bg-ui-red/15 px-1 text-[10px] text-ui-red">DEL</span>}
          {file.isRenamed && <span className="rounded bg-ui-blue/15 px-1 text-[10px] text-ui-blue">RENAME</span>}
          <span className="ml-auto flex items-center gap-2 text-[11px]">
            {file.additions > 0 && <span className="text-ui-teal">+{file.additions}</span>}
            {file.deletions > 0 && <span className="text-ui-red">-{file.deletions}</span>}
          </span>
        </button>
        {editorTarget && (
          <button
            type="button"
            className="shrink-0 p-2 text-muted-foreground hover:text-foreground"
            title={t('openEditor')}
            aria-label={t('openEditor') + ': ' + displayName}
            onClick={() => openEditorTarget(editorTarget)}
          >
            <EditorIcon preset={preset} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!isCollapsed && (
        data ? (
          <DiffView
            data={data}
            diffViewMode={viewMode === 'unified' ? DiffModeEnum.Unified : DiffModeEnum.Split}
            diffViewTheme={theme}
            diffViewHighlight
            diffViewWrap={isMobile}
            diffViewFontSize={diffFontSize}
          />
        ) : (
          <div className="px-3 py-2 text-muted-foreground">
            {file.isBinary ? 'Binary file' : 'No diff content'}
          </div>
        )
      )}
    </div>
  );
};

export default DiffFileList;

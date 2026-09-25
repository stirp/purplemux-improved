import useConfigStore from '@/hooks/use-config-store';
import { buildEditorFileUrl, canOpenEditorTarget, type IEditorFileLocation } from '@/lib/editor-url';

const useEditorFile = (file: IEditorFileLocation | null): string | null => {
  const preset = useConfigStore((state) => state.editorPreset);
  const url = useConfigStore((state) => state.editorUrl);
  const target = file ? buildEditorFileUrl(preset, url, file) : null;
  return target && typeof window !== 'undefined' && canOpenEditorTarget(preset, target, window.location.hostname)
    ? target : null;
};

export default useEditorFile;

import { isSafeEditorTarget, isWebEditorUrl } from '@/lib/editor-url';

export const openEditorTarget = (target: string): void => {
  if (!isSafeEditorTarget(target)) return;
  if (isWebEditorUrl(target)) {
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }
  const api = (window as unknown as { electronAPI?: { openExternal: (url: string) => void } }).electronAPI;
  if (api?.openExternal) {
    api.openExternal(target);
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = target;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 1000);
};

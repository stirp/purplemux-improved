import { createContext, useContext, type AnchorHTMLAttributes } from 'react';
import { defaultUrlTransform, type ExtraProps } from 'react-markdown';
import { useRouter } from 'next/router';
import useEditorFile from '@/hooks/use-editor-file';
import useIsMobile from '@/hooks/use-is-mobile';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import { parseEditorFileLink } from '@/lib/editor-url';
import { openEditorTarget } from '@/lib/open-editor';
import { buildSessionFilePreviewUrl } from '@/lib/session-file-url';

export const EditorCwdContext = createContext<string | undefined>(undefined);

export const editorMarkdownUrlTransform = (url: string, key: string): string =>
  key === 'href' && parseEditorFileLink(url, '/') ? url : defaultUrlTransform(url);

const EditorFileLink = ({ href, children, node: _node, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) => {
  const cwd = useContext(EditorCwdContext);
  const router = useRouter();
  const file = parseEditorFileLink(href ?? '', cwd);
  const target = useEditorFile(file);
  const isMobile = useIsMobile();
  const isMobileDevice = useIsMobileDevice();
  if (file && (isMobile || isMobileDevice || !target)) {
    return <a {...props} href={buildSessionFilePreviewUrl(file, router.asPath)} target="_self">{children}</a>;
  }
  if (!target) {
    return <a {...props} href={href?.startsWith('file:') ? undefined : href} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return (
    <a
      {...props}
      href={target}
      onClick={(event) => {
        event.preventDefault();
        openEditorTarget(target);
      }}
    >
      {children}
    </a>
  );
};

export default EditorFileLink;

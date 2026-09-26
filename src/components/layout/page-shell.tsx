import type { ReactElement, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import useIsMobile from '@/hooks/use-is-mobile';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import useVisualViewport from '@/hooks/use-visual-viewport';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import Sidebar from '@/components/layout/sidebar';
import useSync from '@/hooks/use-sync';
import useGlobalShortcuts from '@/hooks/use-global-shortcuts';
import useWebviewStore from '@/hooks/use-webview-store';

const WebviewLayer = dynamic(() => import('@/components/layout/webview-layer'), { ssr: false });

interface IPageShellProps {
  children: ReactNode;
}

const PageContent = ({ children }: { children: ReactNode }) => {
  const webviewActive = useWebviewStore((s) => s.activeId !== null);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ display: webviewActive ? 'none' : undefined }}
    >
      {children}
    </div>
  );
};

const PageShell = ({ children }: IPageShellProps) => {
  useSync();
  useGlobalShortcuts();

  const isMobile = useIsMobile();
  const isTouchDevice = useIsMobileDevice();
  const viewportStyle = useVisualViewport(isTouchDevice);

  if (isMobile) {
    return (
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background" style={viewportStyle}>
        <MobileLayout>
          {children}
        </MobileLayout>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background max-md:hidden" style={viewportStyle}>
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <PageContent>{children}</PageContent>
        <WebviewLayer />
      </div>
    </div>
  );
};

export const getPageShellLayout = (page: ReactElement) => <PageShell>{page}</PageShell>;

export const getPageShellWithTitlebarLayout = (page: ReactElement) => (
  <PageShell>
    <div className="flex min-h-0 flex-1 flex-col pt-titlebar">{page}</div>
  </PageShell>
);

export default PageShell;

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import useIsMobile from '@/hooks/use-is-mobile';
import useIsMac from '@/hooks/use-is-mac';
import NewTabPicker, { type INewTabPickerProps } from '@/components/features/workspace/new-tab-picker';
import type { TPanelType } from '@/types/terminal';

interface IPaneNewTabMenuProps {
  paneId: string;
  isCreating: boolean;
  activePanelType?: TPanelType;
  onCreateTab: INewTabPickerProps['onCreateTab'];
}

const PaneNewTabMenu = ({ paneId, isCreating, onCreateTab }: IPaneNewTabMenuProps) => {
  const t = useTranslations('terminal');
  const mod = useIsMac() ? '⌘' : 'Ctrl+';
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<{ paneId: string }>).detail?.paneId === paneId) setOpen(true);
    };
    window.addEventListener('open-new-tab-menu', handler);
    return () => window.removeEventListener('open-new-tab-menu', handler);
  }, [paneId]);

  return (
    <div className="flex items-center border-l border-r border-border px-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger render={<PopoverTrigger
            className={cn('flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground', isCreating && 'pointer-events-none opacity-50')}
            disabled={isCreating} aria-label={t('openNewTab')}
          />}>
            {isCreating ? <Spinner className="h-3 w-3" /> : <Plus className="h-3.5 w-3.5" />}
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('newTabTooltip', { shortcut: `${mod}T` })}</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="start"
          className="h-[min(36rem,var(--available-height))] max-h-[80dvh] w-[28rem] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0">
          {open && <NewTabPicker paneId={paneId} mobile={isMobile} onClose={() => setOpen(false)} onCreateTab={onCreateTab} />}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PaneNewTabMenu;

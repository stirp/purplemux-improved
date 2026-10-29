import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import NewTabPicker, { type INewTabPickerProps } from '@/components/features/workspace/new-tab-picker';

interface IMobileNewTabDialogProps {
  paneId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTab: INewTabPickerProps['onCreateTab'];
}

const MobileNewTabDialog = ({ paneId, open, onOpenChange, onCreateTab }: IMobileNewTabDialogProps) => {
  const t = useTranslations('mobile');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(40rem,85dvh)] w-[calc(100%-1rem)] max-w-md flex-col gap-0 overflow-hidden rounded-xl p-0">
        <DialogHeader className="shrink-0 px-4 pt-4 pb-1">
          <DialogTitle className="text-sm font-medium">{t('newTab')}</DialogTitle>
        </DialogHeader>
        {open && <NewTabPicker paneId={paneId} mobile onClose={() => onOpenChange(false)} onCreateTab={onCreateTab} />}
      </DialogContent>
    </Dialog>
  );
};

export default MobileNewTabDialog;

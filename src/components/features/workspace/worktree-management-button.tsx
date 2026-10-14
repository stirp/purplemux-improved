import { GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

const WorktreeManagementButton = ({ name, onClick }: { name: string; onClick: () => void }) => {
  const t = useTranslations('workspace.worktreeTree');
  const label = `${t('manageTitle')}: ${name}`;
  return <Button
    variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
    aria-label={label} title={label}
    draggable
    data-touch-drag-ignore
    onDragStart={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onDoubleClick={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onClick(); }}
  ><GitBranch className="h-4 w-4" /></Button>;
};

export default WorktreeManagementButton;

import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const SortableTagRow = ({ id, label, disabled, children }: {
  id: string; label: string; disabled: boolean; children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return <div ref={setNodeRef} className="relative flex items-center gap-1 border-b bg-popover py-2 last:border-0"
    style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}>
    <Button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" variant="ghost" size="icon-sm"
      className="size-11 shrink-0 touch-none cursor-grab text-muted-foreground active:cursor-grabbing md:size-8"
      aria-label={label} title={label} disabled={disabled}><GripVertical className="size-4" /></Button>
    {children}
  </div>;
};

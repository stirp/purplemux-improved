import { useRef, useState, type DragEvent } from 'react';

export type NavigationDragItem =
  | { kind: 'workspace'; id: string }
  | { kind: 'tab'; id: string; workspaceId: string; paneId: string };

export const canDropNavigationItem = (source: NavigationDragItem, target: NavigationDragItem) =>
  source.id !== target.id && source.kind === target.kind &&
  (source.kind === 'workspace' || (target.kind === 'tab' &&
    source.workspaceId === target.workspaceId && source.paneId === target.paneId));

export const reorderNavigationIds = (ids: string[], source: string, target: string, after: boolean) => {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const result = ids.filter((id) => id !== source);
  result.splice(result.indexOf(target) + Number(after), 0, source);
  return result;
};

export default function useNavigationDrag(onDrop: (source: NavigationDragItem, target: NavigationDragItem, after: boolean) => void, axis: 'x' | 'y' = 'y') {
  const sourceRef = useRef<NavigationDragItem | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);
  const reset = () => { sourceRef.current = null; setSourceId(null); setTarget(null); };
  const isAfter = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return axis === 'x' ? event.clientX >= rect.left + rect.width / 2 : event.clientY >= rect.top + rect.height / 2;
  };
  const props = (item: NavigationDragItem) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      sourceRef.current = item;
      setSourceId(item.id);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!sourceRef.current || !canDropNavigationItem(sourceRef.current, item)) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget({ id: item.id, after: isAfter(event) });
    },
    onDragLeave: () => setTarget((previous) => previous?.id === item.id ? null : previous),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const source = sourceRef.current;
      if (source && canDropNavigationItem(source, item)) onDrop(source, item, isAfter(event));
      reset();
    },
    onDragEnd: reset,
    style: {
      opacity: sourceId === item.id ? 0.4 : undefined,
      boxShadow: target?.id === item.id
        ? `inset ${axis === 'x' ? `${target.after ? '-2px' : '2px'} 0` : `0 ${target.after ? '-2px' : '2px'}`} 0 var(--focus-indicator)` : undefined,
      WebkitTouchCallout: 'none' as const,
    },
  });
  return props;
}

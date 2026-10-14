import type { IWorkspaceTreePosition } from '@/lib/workspace-order';

export const WORKSPACE_TREE_INDENT = 16;

const WorkspaceTreeGuides = ({ position, expanded, mobile = false }: {
  position: IWorkspaceTreePosition;
  expanded?: boolean;
  mobile?: boolean;
}) => {
  const origin = mobile ? 23 : 18;
  const joint = mobile ? 22 : 18;
  return <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 text-muted-foreground/30">
    {position.rails.map((continues, index) => {
      const current = index === position.rails.length - 1;
      return <span key={index} className="absolute top-0 border-l border-current" style={{
        left: origin + index * WORKSPACE_TREE_INDENT,
        bottom: continues ? 0 : undefined,
        height: continues ? undefined : joint,
        display: current || continues ? undefined : 'none',
      }}>
        {current && <span className="absolute left-0 w-2 border-t border-current" style={{ top: joint }} />}
      </span>;
    })}
    {expanded && position.childCount > 0 && <span className="absolute bottom-0 border-l border-current" style={{
      left: origin + position.rails.length * WORKSPACE_TREE_INDENT,
      top: joint + 10,
    }} />}
  </span>;
};

export default WorkspaceTreeGuides;

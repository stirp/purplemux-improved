import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { ISessionWorkflow, TWorkStatus } from '@/lib/session-workflow';

export const useSessionWorkflowMutation = () => {
  const [saving, setSaving] = useState(false);
  const t = useTranslations('notification');
  const save = async (update: { key: string; status: TWorkStatus | null } | { section: TWorkStatus; collapsed: boolean }) => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/session-workflow', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error();
      const sessionWorkflow: ISessionWorkflow = await response.json();
      useWorkspaceStore.setState({ sessionWorkflow });
      await useWorkspaceStore.getState().syncWorkspaces();
    } catch {
      toast.error(t('workStatusSaveFailed'));
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
};

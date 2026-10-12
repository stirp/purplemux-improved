import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { ISessionWorkflow, TWorkStatus } from '@/lib/session-workflow';
import { sessionWorkKey } from '@/lib/session-workflow';
import type { TSessionHistoryProvider } from '@/types/session-history';

export const forgetSessionWorkflow = (provider: TSessionHistoryProvider, sessionId: string | null, historyEntryId?: string) => {
  const key = sessionWorkKey(provider, sessionId, `history:${historyEntryId}`);
  useWorkspaceStore.setState((state) => {
    const workflow = state.sessionWorkflow;
    const statuses = { ...workflow.statuses };
    const sessions = { ...workflow.sessions };
    delete statuses[key];
    delete sessions[key];
    return { sessionWorkflow: { ...workflow, statuses, sessions, deleted: [...new Set([...(workflow.deleted ?? []), key])] } };
  });
};

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

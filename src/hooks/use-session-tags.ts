import { useState } from 'react';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { ISessionWorkflow } from '@/lib/session-workflow';
import type { TSessionTagUpdate, TTagErrorCode } from '@/lib/session-tags';

export const useSessionTagMutation = () => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TTagErrorCode | null>(null);
  const save = async (update: TSessionTagUpdate): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/session-tags', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const codes: TTagErrorCode[] = ['conflict', 'duplicate', 'missing', 'limit', 'invalid'];
        setError(codes.includes(body.code) ? body.code : 'saveFailed');
        if (response.status === 409 || response.status === 404) await useWorkspaceStore.getState().syncWorkspaces().catch(() => {});
        return false;
      }
      const workflow: ISessionWorkflow = await response.json();
      useWorkspaceStore.setState((state) => (workflow.tagsRevision ?? 0) < (state.sessionWorkflow.tagsRevision ?? 0) ? {} : {
        sessionWorkflow: { ...state.sessionWorkflow, tags: workflow.tags, sessionTags: workflow.sessionTags, tagsRevision: workflow.tagsRevision },
      });
      await useWorkspaceStore.getState().syncWorkspaces().catch(() => {});
      return true;
    } catch {
      setError('saveFailed');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, error };
};

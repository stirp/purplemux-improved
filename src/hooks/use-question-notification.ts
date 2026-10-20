import { useEffect } from 'react';
import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { navigateToTab } from '@/hooks/use-layout';
import { showQuestionNativeNotification } from '@/hooks/use-native-notification';

const seen = new Map<string, Set<string>>();
const activeToasts = new Set<string>();

const syncQuestionNotifications = () => {
  const { tabs } = useTabStore.getState();
  const currentToasts = new Set<string>();
  const currentSessions = new Set<string>();

  for (const [tabId, tab] of Object.entries(tabs)) {
    if (!tab.agentSessionId || tab.cliState === 'inactive' || tab.cliState === 'cancelled') continue;
    const sessionKey = JSON.stringify([tabId, tab.agentProviderId, tab.agentSessionId]);
    currentSessions.add(sessionKey);
    const seenQuestions = seen.get(sessionKey) ?? new Set<string>();
    seen.set(sessionKey, seenQuestions);
    for (const question of tab.pendingUserQuestions ?? []) {
      const toastId = `user-question:${sessionKey}:${question.id}`;
      currentToasts.add(toastId);
      if (seenQuestions.has(question.id)) continue;
      seenQuestions.add(question.id);
      activeToasts.add(toastId);
      const workspaceName = useWorkspaceStore.getState().workspaces.find((ws) => ws.id === tab.workspaceId)?.name ?? tab.workspaceId;
      const title = `${t('notification', 'questionRequiredTitle')} · ${workspaceName}`;
      const description = question.question.length > 160 ? `${question.question.slice(0, 160)}…` : question.question;
      toast.warning(title, {
        id: toastId,
        description,
        duration: Infinity,
        closeButton: true,
        classNames: { description: 'line-clamp-3' },
        action: {
          label: t('notification', 'openTab'),
          onClick: () => {
            const current = useTabStore.getState().tabs[tabId];
            if (current?.workspaceId === tab.workspaceId && current.agentSessionId === tab.agentSessionId && current.agentProviderId === tab.agentProviderId
              && current.pendingUserQuestions?.some((q) => q.id === question.id)) {
              void navigateToTab(tab.workspaceId, tabId);
            }
            toast.dismiss(toastId);
          },
        },
      });
      showQuestionNativeNotification(tabId, tab, title, description, question.id);
    }
  }

  for (const id of activeToasts) {
    if (currentToasts.has(id)) continue;
    toast.dismiss(id);
    activeToasts.delete(id);
  }
  for (const key of seen.keys()) if (!currentSessions.has(key)) seen.delete(key);
};

const useQuestionNotification = () => {
  useEffect(() => {
    syncQuestionNotifications();
    return useTabStore.subscribe(syncQuestionNotifications);
  }, []);
};

export default useQuestionNotification;

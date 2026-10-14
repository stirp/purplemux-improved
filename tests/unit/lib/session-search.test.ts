import { describe, expect, it } from 'vitest';
import { searchSessions, type ISessionSearchItem } from '@/lib/session-search';
import { collectWorkSessions } from '@/lib/session-workflow';
import type { ISessionHistoryEntry } from '@/types/session-history';

const entry = (overrides: Partial<ISessionHistoryEntry> = {}): ISessionHistoryEntry => ({
  id: 'latest', workspaceId: 'ws', workspaceName: 'Old project', workspaceDir: '/src/project',
  tabId: 'tab', providerId: 'codex', agentSessionId: 'native-123',
  prompt: 'Fix **login** failure', result: 'Fixed token refresh',
  startedAt: 1, completedAt: 3, duration: 2, dismissedAt: null, toolUsage: {}, touchedFiles: [],
  ...overrides,
});

const items: ISessionSearchItem[] = collectWorkSessions([
  entry(), entry({ id: 'old', completedAt: 2, prompt: 'Investigate billing', result: 'Invoice mismatch' }),
  entry({ id: 'other', providerId: 'claude', agentSessionId: null, prompt: '调整字体', result: null }),
], {}, { statuses: {}, collapsed: {} }).map((session) => ({
  session, title: session.key.startsWith('codex:') ? '用户认证' : undefined, workspaceName: 'Renamed project',
}));

describe('Sessions text search', () => {
  it.each(['用户认证', '  LOGIN failure  ', 'TOKEN REFRESH', 'native-123', '/src/project', 'old project', 'renamed project', '调整字体'])(
    'matches titles, visible markdown text, identity and workspace fields: %s', (query) => {
      expect(searchSessions(items, query).length).toBeGreaterThan(0);
    },
  );

  it('returns each session once for earlier prompts/results without changing the source', () => {
    const snapshot = structuredClone(items);
    for (const query of ['billing', 'invoice mismatch']) {
      const result = searchSessions(items, query);
      expect(result).toHaveLength(1);
      expect(result[0].session.entry?.id).toBe('latest');
      expect(result[0].session.olderEntries.map((older) => older.id)).toEqual(['old']);
    }
    expect(searchSessions(items, 'login')[0].session.olderEntries).toEqual([]);
    expect(items).toEqual(snapshot);
  });

  it('handles empty queries and literal punctuation without regex or token splitting', () => {
    expect(searchSessions(items, '  ')).toBe(items);
    expect(searchSessions(items, '')).toBe(items);
    expect(searchSessions(items, '[.*')).toEqual([]);
    expect(searchSessions(items, 'login token')).toEqual([]);
  });

  it('finds live and indexed sessions without history, excluding deleted identities', () => {
    const sessions = collectWorkSessions([], {
      live: { workspaceId: 'ws', panelType: 'claude-code', lastUserMessage: '新任务' },
      removed: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'removed', lastUserMessage: '已删除' },
    }, {
      statuses: {}, collapsed: {}, deleted: ['codex:removed'], sessions: {
        'codex:saved': {
          workspaceId: 'ws', tabId: 'closed', status: 'pending',
          navigation: { workspaceId: 'ws', workspaceName: 'Archived project', workspaceDir: '/archived', tabId: 'closed', providerId: 'codex', agentSessionId: 'saved' },
        },
      },
    });
    const source = sessions.map((session) => ({ session, workspaceName: 'Workspace' }));
    expect(searchSessions(source, '新任务')[0].session.key).toBe('claude:tab:live');
    expect(searchSessions(source, 'saved')[0].session.key).toBe('codex:saved');
    expect(searchSessions(source, '/archived')[0].session.key).toBe('codex:saved');
    expect(searchSessions(source, '已删除')).toEqual([]);
    expect(searchSessions(source, 'tab:live')).toEqual([]);
  });
});

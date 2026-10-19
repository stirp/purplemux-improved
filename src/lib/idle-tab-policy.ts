import { z } from 'zod';

export const idleTabPolicySchema = z.object({
  enabled: z.boolean(),
  idleMinutes: z.number().int().min(15).max(10080),
}).strict();

export type TIdleTabPolicy = z.infer<typeof idleTabPolicySchema>;
export const DEFAULT_IDLE_TAB_POLICY: TIdleTabPolicy = { enabled: false, idleMinutes: 60 };

export const idleTabTargetSchema = z.object({
  workspaceId: z.string().min(1),
  paneId: z.string().min(1),
  tabId: z.string().min(1),
  sessionId: z.string().min(1),
  lastActivityAt: z.number().finite().positive(),
}).strict();

export type TIdleTabTarget = z.infer<typeof idleTabTargetSchema>;
export interface IIdleTabCandidate extends TIdleTabTarget {
  workspaceName: string;
  tabName: string;
  providerId: 'claude' | 'codex';
  cwd: string;
}
export interface IIdleTabPreview {
  policy: TIdleTabPolicy;
  candidates: IIdleTabCandidate[];
}
export interface IIdleTabResult {
  reclaimed: TIdleTabTarget[];
  skipped: { target: TIdleTabTarget; reason: string }[];
}

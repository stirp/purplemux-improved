export type TLocalAgent = 'claude' | 'codex';

export interface IAgentProcessIdentity {
  pid: number;
  startedAt: string;
}

export interface IAgentProcessSession {
  sessionId: string;
  jsonlPath: string;
}

export interface IAgentProcessTransfer extends IAgentProcessIdentity, IAgentProcessSession {
  providerId: TLocalAgent;
  cwd: string;
  tabId: string;
  tmuxSession: string;
  phase: 'prepared' | 'stopped' | 'dispatching' | 'started';
}

export interface ILocalAgentProcess extends IAgentProcessIdentity {
  providerId: TLocalAgent;
  cwd: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  managed: boolean;
  session: IAgentProcessSession | null;
}

export interface IAgentProcessList {
  processes: ILocalAgentProcess[];
  transfers: (IAgentProcessTransfer & { workspaceId: string; workspaceName: string })[];
}

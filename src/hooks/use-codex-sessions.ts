import useSWR, { useSWRConfig } from 'swr';
import { useCallback } from 'react';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';

interface ICodexSessionsResponse {
  sessions: ICodexSessionEntry[];
  scannedDirs: number;
  scannedFiles: number;
}

const buildKey = (cwd: string | null | undefined): string | null =>
  cwd ? `/api/codex/sessions?cwd=${encodeURIComponent(cwd)}` : null;

const fetcher = async (url: string): Promise<ICodexSessionsResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`request-failed-${res.status}`);
  }
  return (await res.json()) as ICodexSessionsResponse;
};

interface IUseCodexSessionsResult {
  sessions: ICodexSessionEntry[];
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useCodexSessions = (
  cwd: string | null | undefined,
  enabled: boolean,
): IUseCodexSessionsResult => {
  const key = enabled ? buildKey(cwd) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<ICodexSessionsResponse, Error>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    },
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    sessions: data?.sessions ?? [],
    isLoading: !!key && isLoading,
    isValidating,
    error: error ?? null,
    refresh,
  };
};

export const useCodexSessionsPrefetch = () => {
  const { mutate } = useSWRConfig();

  return useCallback(
    (cwd: string | null | undefined) => {
      const key = buildKey(cwd);
      if (!key) return;
      void mutate(key, fetcher(key), { revalidate: false });
    },
    [mutate],
  );
};

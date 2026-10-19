import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import type { IAppUpdateState } from '@/types/app-update';

interface IUpdateBridge {
  isElectron?: boolean;
  getAppUpdate?: () => Promise<IAppUpdateState>;
  appUpdateAction?: (action: 'check' | 'install') => Promise<IAppUpdateState>;
}

export const getUpdateBridge = (): IUpdateBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { electronAPI?: IUpdateBridge }).electronAPI;

export const requestAppUpdate = async (action?: 'check' | 'install'): Promise<IAppUpdateState> => {
  const bridge = getUpdateBridge();
  if (bridge?.isElectron) {
    if (!bridge.getAppUpdate || !bridge.appUpdateAction) throw new Error('This desktop version does not expose update controls. Use the application menu.');
    return action ? bridge.appUpdateAction(action) : bridge.getAppUpdate();
  }
  const response = await fetch('/api/app-update', {
    method: action ? 'POST' : 'GET', cache: 'no-store',
    ...(action ? { headers: { 'Content-Type': 'application/json', 'x-purplemux-update': '1' }, body: JSON.stringify({ action }) } : {}),
  });
  if (!response.ok) throw new Error(`Update service: HTTP ${response.status}`);
  return response.json();
};

const useAppUpdate = () => {
  const desktop = !!getUpdateBridge()?.isElectron;
  const { data, error, mutate } = useSWR<IAppUpdateState>(desktop ? 'app-update:desktop' : 'app-update:server', () => requestAppUpdate(), {
    refreshInterval: (state) => state && ['checking', 'downloading', 'restarting'].includes(state.phase) ? 2000 : 30_000,
    dedupingInterval: 1000, shouldRetryOnError: true, errorRetryInterval: 3000,
  });
  const [requesting, setRequesting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reconnectTimedOut, setReconnectTimedOut] = useState(false);
  useEffect(() => {
    if (data?.phase !== 'restarting') return;
    const timer = setTimeout(() => setReconnectTimedOut(true), 150_000);
    return () => clearTimeout(timer);
  }, [data?.phase]);
  const previousVersion = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (previousVersion.current && previousVersion.current !== data.currentVersion) window.location.reload();
    previousVersion.current = data.currentVersion;
  }, [data]);
  const run = async (action: 'check' | 'install') => {
    setRequesting(true);
    setActionError(null);
    setReconnectTimedOut(false);
    try {
      await mutate(await requestAppUpdate(action), { revalidate: false });
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setRequesting(false);
    }
  };
  return { state: data, error: actionError || (error instanceof Error ? error.message : null), requesting, run, desktop, reconnectTimedOut: data?.phase === 'restarting' && reconnectTimedOut };
};

export default useAppUpdate;

import { useState, useEffect } from 'react';
import type { ISystemResources } from '@/types/system-resources';

interface IResourceState {
  resources: ISystemResources | null;
  error: boolean;
}

const useSystemResources = (enabled: boolean) => {
  const [state, setState] = useState<IResourceState>({ resources: null, error: false });

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 5000);
      requestTimeout = timeout;
      try {
        const response = await fetch('/api/system/resources', { signal: request.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Resource request failed');
        const resources: ISystemResources = await response.json();
        if (!disposed && controller === request && !request.signal.aborted) {
          setState({ resources, error: false });
        }
      } catch {
        if (!disposed && controller === request) setState({ resources: null, error: true });
      } finally {
        clearTimeout(timeout);
        if (!disposed && controller === request) {
          controller = undefined;
          timer = setTimeout(poll, 3000);
        }
      }
    };

    const stop = () => {
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      const pending = controller;
      controller = undefined;
      pending?.abort();
    };
    const onVisibilityChange = () => {
      stop();
      setState({ resources: null, error: false });
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) void poll();
    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  return state;
};

export default useSystemResources;

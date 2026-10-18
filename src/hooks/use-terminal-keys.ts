import useSWR from 'swr';
import { DEFAULT_TERMINAL_KEYS, type ITerminalKeySetting } from '@/lib/terminal-keys';

export const TERMINAL_KEYS_URL = '/api/terminal-keys';

const fetchKeys = async (url: string): Promise<ITerminalKeySetting[]> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load terminal keys');
  return response.json();
};

const useTerminalKeys = () => {
  const { data, error, isLoading, mutate } = useSWR(TERMINAL_KEYS_URL, fetchKeys);

  const save = async (keys: ITerminalKeySetting[]) => {
    await mutate(async () => {
      const response = await fetch(TERMINAL_KEYS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      if (!response.ok) throw new Error('Unable to save terminal keys');
      return response.json() as Promise<ITerminalKeySetting[]>;
    }, { revalidate: true });
  };

  return { keys: data ?? DEFAULT_TERMINAL_KEYS, hasData: !!data, error, isLoading, save, reload: () => mutate() };
};

export default useTerminalKeys;

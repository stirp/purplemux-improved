import useSWR from 'swr';
import type { ITerminalCommand } from '@/lib/terminal-custom-commands';

export const TERMINAL_COMMANDS_URL = '/api/terminal-commands';
const EMPTY_COMMANDS: ITerminalCommand[] = [];

const fetchCommands = async (url: string): Promise<ITerminalCommand[]> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load terminal commands');
  return response.json();
};

const useTerminalCommands = () => {
  const { data, error, isLoading, mutate } = useSWR(TERMINAL_COMMANDS_URL, fetchCommands);

  const save = async (method: 'POST' | 'PATCH' | 'DELETE', command: Partial<ITerminalCommand>) => {
    await mutate(async () => {
      const response = await fetch(TERMINAL_COMMANDS_URL, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error('Unable to save terminal command');
      return response.json() as Promise<ITerminalCommand[]>;
    }, { revalidate: true });
  };

  return { commands: data ?? EMPTY_COMMANDS, error, isLoading, reload: () => mutate(), save };
};

export default useTerminalCommands;

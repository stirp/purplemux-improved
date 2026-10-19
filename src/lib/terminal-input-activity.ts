const g = globalThis as unknown as { __ptTerminalInputActivity?: Map<string, number> };
if (!g.__ptTerminalInputActivity) g.__ptTerminalInputActivity = new Map();

export const recordTerminalInput = (sessionName: string): void => {
  g.__ptTerminalInputActivity!.set(sessionName, Date.now());
};

export const getLastTerminalInput = (sessionName: string): number =>
  g.__ptTerminalInputActivity!.get(sessionName) ?? 0;

export const forgetTerminalInput = (sessionName: string): void => {
  g.__ptTerminalInputActivity!.delete(sessionName);
};

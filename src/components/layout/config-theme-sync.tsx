import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import useConfigStore from '@/hooks/use-config-store';
import { initTerminalTheme } from '@/hooks/use-terminal-theme';

const ConfigThemeSync = () => {
  const { setTheme } = useTheme();
  const appTheme = useConfigStore((s) => s.appTheme);
  const terminalTheme = useConfigStore((s) => s.terminalTheme);
  useEffect(() => { if (appTheme) setTheme(appTheme); }, [appTheme, setTheme]);
  useEffect(() => { initTerminalTheme(terminalTheme ?? undefined); }, [terminalTheme]);
  return null;
};

export default ConfigThemeSync;

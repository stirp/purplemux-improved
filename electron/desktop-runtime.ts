import Module from 'node:module';
import path from 'node:path';
import { capturePristineEnv } from './pristine-env';
import { applyResolvedShellEnv } from './shell-env';

export const prepareDesktopRuntime = async (appDirectory: string): Promise<void> => {
  await applyResolvedShellEnv();
  capturePristineEnv();
  const standaloneModules = path.join(appDirectory, '.next', 'standalone', 'node_modules');
  const paths = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  process.env.NODE_PATH = [standaloneModules, ...paths.filter((entry) => entry !== standaloneModules)].join(path.delimiter);
  (Module as unknown as { _initPaths: () => void })._initPaths();
};

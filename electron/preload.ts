import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getAppUpdate: () => ipcRenderer.invoke('app-update:status'),
  appUpdateAction: (action: import('../src/types/app-update').TAppUpdateAction, version?: string) => ipcRenderer.invoke('app-update:action', action, version),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getSystemResources: () => ipcRenderer.invoke('get-system-resources'),
  showNotification: (title: string, body: string, notificationId?: string) => ipcRenderer.invoke('show-notification', title, body, notificationId),
  openNewWindow: () => ipcRenderer.invoke('open-new-window'),
  setDockBadge: (count: number) => ipcRenderer.invoke('set-dock-badge', count),
  canManageDesktopAutostart: () => ipcRenderer.invoke('desktop-autostart:can-manage'),
  getDesktopAutostartStatus: () => ipcRenderer.invoke('desktop-autostart:get-status'),
  setDesktopAutostartEnabled: (enabled: boolean) => ipcRenderer.invoke('desktop-autostart:set-enabled', enabled),
  getServerLaunchAgentStatus: () => ipcRenderer.invoke('server-launch-agent:get-status'),
  setServerLaunchAgentEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('server-launch-agent:set-enabled', enabled),
  setLocale: (locale: string) => ipcRenderer.invoke('set-locale', locale),
  setNativeTheme: (theme: string) => ipcRenderer.invoke('set-native-theme', theme),
  registerBrowserTab: (tabId: string, webContentsId: number) =>
    ipcRenderer.invoke('browser:register', tabId, webContentsId),
  unregisterBrowserTab: (tabId: string) =>
    ipcRenderer.invoke('browser:unregister', tabId),
  setBrowserDeviceEmulation: (
    tabId: string,
    config: {
      width: number;
      height: number;
      deviceScaleFactor: number;
      mobile: boolean;
      userAgent?: string;
      orientation?: 'portrait' | 'landscape';
    } | null,
  ) => ipcRenderer.invoke('browser:set-device-emulation', tabId, config),
  onNotificationClick: (callback: (notificationId?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, notificationId?: string) => callback(notificationId);
    ipcRenderer.on('notification-click', handler);
    return () => { ipcRenderer.removeListener('notification-click', handler); };
  },
});

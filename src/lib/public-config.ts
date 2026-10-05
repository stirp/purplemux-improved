import type { IConfigData } from '@/lib/config-store';

export type TPublicConfig = Omit<IConfigData, 'authPassword' | 'authSecret'> & { hasAuthPassword: boolean };

export const toPublicConfig = ({ authPassword, authSecret: _, ...config }: IConfigData): TPublicConfig => ({
  ...config,
  hasAuthPassword: !!authPassword,
});

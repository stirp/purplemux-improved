export interface ISystemResources {
  sampledAt: number;
  cpu: number | null;
  memory: {
    used: number;
    total: number;
    available: number;
    basis: 'available' | 'free';
  };
}

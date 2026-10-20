import os from 'node:os';
import { readFile } from 'node:fs/promises';
import type { ISystemResources } from '@/types/system-resources';

interface ICpuSample {
  idle: number;
  total: number;
  cores: number;
  sampledAt: number;
}

interface IResourceSampler {
  previous?: ICpuSample;
  snapshot?: ISystemResources;
  pending?: Promise<ISystemResources>;
}

const g = globalThis as unknown as { __ptResourceSampler?: IResourceSampler };
if (!g.__ptResourceSampler) g.__ptResourceSampler = {};
const sampler = g.__ptResourceSampler;

const sampleCpu = (sampledAt: number): ICpuSample => {
  const cores = os.cpus();
  return cores.reduce((sum, { times }) => ({
    ...sum,
    idle: sum.idle + times.idle,
    total: sum.total + Object.values(times).reduce((a, b) => a + b, 0),
  }), { idle: 0, total: 0, cores: cores.length, sampledAt });
};

const cpuPercent = (previous: ICpuSample | undefined, current: ICpuSample): number | null => {
  if (!previous || current.cores !== previous.cores || current.sampledAt - previous.sampledAt > 15_000) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0 || idle < 0 || idle > total) return null;
  return Math.round((1 - idle / total) * 1000) / 10;
};

const sampleMemory = async (): Promise<ISystemResources['memory']> => {
  const total = os.totalmem();
  let available = os.freemem();
  let basis: ISystemResources['memory']['basis'] = 'free';
  if (os.platform() === 'linux') {
    try {
      const meminfo = await readFile('/proc/meminfo', 'utf8');
      const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(meminfo);
      if (match) {
        available = Number(match[1]) * 1024;
        basis = 'available';
      }
    } catch { /* OS free memory remains available as a fallback. */ }
  }
  available = Math.max(0, Math.min(total, available));
  return { used: total - available, total, available, basis };
};

export const getSystemResources = (): Promise<ISystemResources> => {
  if (sampler.pending) return sampler.pending;
  if (sampler.snapshot && Date.now() - sampler.snapshot.sampledAt < 2000) {
    return Promise.resolve(sampler.snapshot);
  }
  sampler.pending = (async () => {
    const sampledAt = Date.now();
    const current = sampleCpu(sampledAt);
    const memory = await sampleMemory();
    const snapshot = { sampledAt, cpu: cpuPercent(sampler.previous, current), memory };
    sampler.previous = current;
    sampler.snapshot = snapshot;
    return snapshot;
  })().finally(() => { sampler.pending = undefined; });
  return sampler.pending;
};

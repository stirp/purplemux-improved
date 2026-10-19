const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const isStableVersion = (version: unknown): version is string =>
  typeof version === 'string' && STABLE_VERSION.test(version)
  && version.split('.').every((part) => Number.isSafeInteger(Number(part)));

export const isNewerVersion = (latest: string, current: string): boolean => {
  if (!isStableVersion(latest) || !isStableVersion(current)) return false;
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};

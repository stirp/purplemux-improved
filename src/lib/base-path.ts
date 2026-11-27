/**
 * 子路径部署支持：PURPLEMUX_BASE_PATH=/purplemux 时，应用里写死的根绝对路径
 * （fetch('/api/...')、window.location.href='/login'、new WebSocket('.../api/...') 等）
 * 需要统一加前缀；basePath 本身只影响 Next 自己的链接与静态资源。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith('/')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

/** 在浏览器端安装 fetch / WebSocket / EventSource 的前缀 shim（只做一次）。 */
export function installBasePathShim(): void {
  if (!BASE_PATH || typeof window === 'undefined') return;
  const w = window as typeof window & { __pmuxBaseShimmed?: boolean };
  if (w.__pmuxBaseShimmed) return;
  w.__pmuxBaseShimmed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      input = withBase(input);
    } else if (input instanceof URL) {
      const u = new URL(input.toString());
      u.pathname = withBase(u.pathname);
      input = u;
    } else if (input instanceof Request) {
      const u = new URL(input.url);
      const patched = withBase(u.pathname);
      if (patched !== u.pathname) {
        u.pathname = patched;
        input = new Request(u.toString(), input);
      }
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;

  const NativeWS = window.WebSocket;
  const WrappedWS = function (url: string | URL, protocols?: string | string[]) {
    let target = String(url);
    try {
      const u = new URL(target, window.location.href);
      const patched = withBase(u.pathname);
      if (patched !== u.pathname) {
        u.pathname = patched;
        target = u.toString();
      }
    } catch {
      /* 保持原样 */
    }
    return new NativeWS(target, protocols as string | string[] | undefined);
  } as unknown as typeof WebSocket;
  WrappedWS.prototype = NativeWS.prototype;
  Object.assign(WrappedWS, {
    CONNECTING: NativeWS.CONNECTING, OPEN: NativeWS.OPEN,
    CLOSING: NativeWS.CLOSING, CLOSED: NativeWS.CLOSED,
  });
  window.WebSocket = WrappedWS;

  const NativeES = window.EventSource;
  if (NativeES) {
    window.EventSource = function (url: string | URL, init?: EventSourceInit) {
      let target = String(url);
      try {
        const u = new URL(target, window.location.href);
        const patched = withBase(u.pathname);
        if (patched !== u.pathname) {
          u.pathname = patched;
          target = u.toString();
        }
      } catch {
        /* 保持原样 */
      }
      return new NativeES(target, init);
    } as unknown as typeof EventSource;
    window.EventSource.prototype = NativeES.prototype;
  }
}

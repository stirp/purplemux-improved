const deleteDatabase = (name: string): Promise<void> => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(name);
  const timer = setTimeout(() => reject(new Error('Database deletion timed out')), 5000);
  request.onsuccess = () => { clearTimeout(timer); resolve(); };
  request.onerror = () => { clearTimeout(timer); reject(request.error); };
  request.onblocked = () => { clearTimeout(timer); reject(new Error('Database is open in another tab')); };
});

export const clearBrowserStorage = async (): Promise<void> => {
  // Finish independent operations even if a browser denies one storage API.
  const results = await Promise.allSettled([
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch('/api/browser-storage', {
          method: 'POST', cache: 'no-store', headers: { 'X-Purplemux-Clear-Storage': '1' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Cache clearing request failed');
      } finally { clearTimeout(timer); }
    })(),
    (async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    })(),
    (async () => {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
    })(),
    (async () => {
      if ('indexedDB' in window && typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        await Promise.all(databases.flatMap(({ name }) => name ? [deleteDatabase(name)] : []));
      }
    })(),
  ]);
  // Clear these last, immediately before navigation, to reduce writes from the
  // current page repopulating storage while asynchronous cleanup is running.
  for (const clear of [() => localStorage.clear(), () => sessionStorage.clear()]) {
    try { clear(); } catch (reason) { results.push({ status: 'rejected', reason }); }
  }
  if (results.some((result) => result.status === 'rejected')) throw new Error('Some browser data could not be cleared');
};

export const reloadWithFreshPage = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('_refresh', Date.now().toString());
  window.location.replace(url.toString());
};

import { mutate } from 'swr';

export const invalidateSessionLists = async (): Promise<void> => {
  // Clear inactive keys too; revalidation alone leaves closed project lists stale.
  await mutate(
    (key) => typeof key === 'string'
      && (key.startsWith('/api/codex/sessions?') || key.startsWith('/api/timeline/sessions?')),
    undefined,
    { revalidate: true },
  );
};

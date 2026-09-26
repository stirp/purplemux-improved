type TMessages = Record<string, Record<string, unknown>>;

export const loadClientMessages = async (
  locale: string,
  initialLocale: string,
  serverMessages?: TMessages,
): Promise<TMessages> => {
  // The page response reads current translations from disk. Do not replace it
  // with a potentially older compiled JSON chunk for the same locale.
  if (serverMessages && locale === initialLocale) return serverMessages;
  const response = await fetch(`/api/messages?locale=${encodeURIComponent(locale)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load translations');
  return response.json();
};

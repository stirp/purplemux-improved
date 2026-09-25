import { MESSAGE_NAMESPACES } from '@/lib/message-namespaces';

type TMessages = Record<string, Record<string, unknown>>;

export const loadClientMessages = async (
  locale: string,
  initialLocale: string,
  serverMessages?: TMessages,
): Promise<TMessages> => {
  // The page response reads current translations from disk. Do not replace it
  // with a potentially older compiled JSON chunk for the same locale.
  if (serverMessages && locale === initialLocale) return serverMessages;
  const modules = await Promise.all(
    MESSAGE_NAMESPACES.map((namespace) => import(`../../messages/${locale}/${namespace}.json`)),
  );
  return Object.fromEntries(MESSAGE_NAMESPACES.map((namespace, index) => [namespace, modules[index].default]));
};

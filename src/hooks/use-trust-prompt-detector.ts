import { useCallback, useEffect, useRef, useState } from 'react';
import { getTrustResponseKeys, hasNativeCodexTrustPrompt, matchTrustPrompt, type ITrustPromptInfo, type TTrustAnswer } from '@/lib/trust-prompt-detector';

const DEBOUNCE_MS = 200;
const SUBMIT_DELAY_MS = 80;

interface IUseTrustPromptDetectorOptions {
  enabled: boolean;
  nativePromptEnabled?: boolean;
  scopeKey?: string | null;
  getBufferText: () => string;
  sendStdin: (data: string) => void;
}

interface IUseTrustPromptDetectorReturn {
  trustPrompt: ITrustPromptInfo | null;
  nativeTrustPrompt: boolean;
  onTerminalData: () => void;
  onTrustResponse: (answer: TTrustAnswer) => Promise<void>;
}

const useTrustPromptDetector = ({
  enabled,
  nativePromptEnabled = false,
  scopeKey = null,
  getBufferText,
  sendStdin,
}: IUseTrustPromptDetectorOptions): IUseTrustPromptDetectorReturn => {
  const [detected, setDetected] = useState<{
    scopeKey: string | null;
    prompt: ITrustPromptInfo | null;
    nativeTrustPrompt: boolean;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: (ready: boolean) => void } | null>(null);
  const detectorRef = useRef({ enabled, nativePromptEnabled, scopeKey, getBufferText });

  useEffect(() => {
    detectorRef.current = { enabled, nativePromptEnabled, scopeKey, getBufferText };
  }, [enabled, nativePromptEnabled, scopeKey, getBufferText]);

  const onTerminalData = useCallback(() => {
    if (!detectorRef.current.enabled || debounceRef.current) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const current = detectorRef.current;
      if (!current.enabled) return;
      const text = current.getBufferText();
      const nativeTrustPrompt = current.nativePromptEnabled && hasNativeCodexTrustPrompt(text);
      const prompt = nativeTrustPrompt ? null : matchTrustPrompt(text);
      setDetected((prev) => {
        if (!prompt && !nativeTrustPrompt) return null;
        if (prev?.scopeKey === current.scopeKey
          && prev.nativeTrustPrompt === nativeTrustPrompt
          && prev.prompt?.folderPath === prompt?.folderPath
          && prev.prompt?.agent === prompt?.agent
          && prev.prompt?.selection.mode === prompt?.selection.mode) return prev;
        return { scopeKey: current.scopeKey, prompt, nativeTrustPrompt };
      });
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    onTerminalData();
    return () => {
      setDetected(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (submitRef.current) {
        clearTimeout(submitRef.current.timer);
        submitRef.current.resolve(false);
        submitRef.current = null;
      }
    };
  }, [enabled, nativePromptEnabled, scopeKey, onTerminalData]);

  const trustPrompt = enabled && detected?.scopeKey === scopeKey ? detected.prompt : null;
  const nativeTrustPrompt = enabled && nativePromptEnabled && detected?.scopeKey === scopeKey && detected.nativeTrustPrompt;

  const onTrustResponse = useCallback(async (answer: TTrustAnswer) => {
    const current = detectorRef.current;
    if (!trustPrompt || !current.enabled || current.scopeKey !== scopeKey || submitRef.current) return;
    const prompt = matchTrustPrompt(current.getBufferText());
    if (!prompt || prompt.agent !== trustPrompt.agent || prompt.folderPath !== trustPrompt.folderPath) return;
    const keys = getTrustResponseKeys(prompt, answer);
    if (!keys.length) return;
    sendStdin(keys[0]);
    if (keys.length > 1) {
      const ready = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          submitRef.current = null;
          resolve(true);
        }, SUBMIT_DELAY_MS);
        submitRef.current = { timer, resolve };
      });
      const latest = detectorRef.current;
      if (!ready || !latest.enabled || latest.scopeKey !== scopeKey) return;
      const confirmed = matchTrustPrompt(latest.getBufferText());
      if (!confirmed || confirmed.agent !== prompt.agent || confirmed.folderPath !== prompt.folderPath) return;
      if (prompt.selection.mode === 'navigation'
        && (confirmed.selection.mode !== 'navigation' || confirmed.selection.selectedAnswer !== answer)) return;
      sendStdin(keys[1]);
    }
    setDetected(null);
  }, [trustPrompt, scopeKey, sendStdin]);

  return { trustPrompt, nativeTrustPrompt, onTerminalData, onTrustResponse };
};

export default useTrustPromptDetector;

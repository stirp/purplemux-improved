import { useCallback, useEffect, useRef, useState } from 'react';
import { getTrustResponseKeys, matchTrustPrompt, type ITrustPromptInfo, type TTrustAnswer } from '@/lib/trust-prompt-detector';

const DEBOUNCE_MS = 200;
const SUBMIT_DELAY_MS = 80;

interface IUseTrustPromptDetectorOptions {
  enabled: boolean;
  scopeKey?: string | null;
  getBufferText: () => string;
  sendStdin: (data: string) => void;
}

interface IUseTrustPromptDetectorReturn {
  trustPrompt: ITrustPromptInfo | null;
  onTerminalData: () => void;
  onTrustResponse: (answer: TTrustAnswer) => Promise<void>;
}

const useTrustPromptDetector = ({
  enabled,
  scopeKey = null,
  getBufferText,
  sendStdin,
}: IUseTrustPromptDetectorOptions): IUseTrustPromptDetectorReturn => {
  const [detected, setDetected] = useState<{ scopeKey: string | null; prompt: ITrustPromptInfo } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: (ready: boolean) => void } | null>(null);
  const detectorRef = useRef({ enabled, scopeKey, getBufferText });

  useEffect(() => {
    detectorRef.current = { enabled, scopeKey, getBufferText };
  }, [enabled, scopeKey, getBufferText]);

  const onTerminalData = useCallback(() => {
    if (!detectorRef.current.enabled || debounceRef.current) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const current = detectorRef.current;
      if (!current.enabled) return;
      const prompt = matchTrustPrompt(current.getBufferText());
      setDetected((prev) => {
        if (!prompt) return null;
        if (prev?.scopeKey === current.scopeKey
          && prev.prompt.folderPath === prompt.folderPath
          && prev.prompt.agent === prompt.agent
          && prev.prompt.selection.mode === prompt.selection.mode) return prev;
        return { scopeKey: current.scopeKey, prompt };
      });
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    onTerminalData();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (submitRef.current) {
        clearTimeout(submitRef.current.timer);
        submitRef.current.resolve(false);
        submitRef.current = null;
      }
    };
  }, [enabled, scopeKey, onTerminalData]);

  const trustPrompt = enabled && detected?.scopeKey === scopeKey ? detected.prompt : null;

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

  return { trustPrompt, onTerminalData, onTrustResponse };
};

export default useTrustPromptDetector;

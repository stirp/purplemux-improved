import { optionNumber, parsePermissionOptions, stripNumberPrefix } from '@/lib/permission-prompt';

export type TTrustAnswer = 'yes' | 'no';
export type TTrustAgent = 'claude' | 'codex';

type TTrustSelection =
  | { mode: 'numbered'; yesKey: string; noKey: string }
  | { mode: 'navigation'; selectedAnswer: TTrustAnswer; yesIsFirst: boolean }
  | { mode: 'unavailable' };

export interface ITrustPromptInfo {
  agent: TTrustAgent;
  folderPath: string;
  selection: TTrustSelection;
}

const ANCHOR_RE = /Quick safety check|Do you trust the contents of this directory/i;
const ABS_PATH_RE = /(\/[^\s│]+)/;

export const hasNativeCodexTrustPrompt = (text: string): boolean => {
  const lines = text.split('\n').map((line) => line.replace(/^\s*[│┃]/, '').replace(/[│┃]\s*$/, ''));
  let titleIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Folder access\s*$/.test(lines[i])) titleIndex = i;
  }
  if (titleIndex < 0) return false;
  const block = lines.slice(titleIndex + 1).join('\n');
  const hasDisclosure = /Trust\s+this\s+folder\?|Opening\s+will\s+not\s+change\s+saved\s+trust\.|The\s+folder's\s+trust\s+setting\s+will\s+not\s+change\./.test(block);
  return hasDisclosure
    && /^\s*[›❯>]\s+(?:\d+\.\s*)?(?:Trust\s+and\s+continue|Open\s+restricted|Open\s+existing\s+task|Quit|Back\s+to\s+Agent\s+Command\s+Center|Keep\s+current\s+directory)\s*$/m.test(block);
};

const answerFromLabel = (label: string, agent: TTrustAgent): TTrustAnswer | null => {
  const compact = stripNumberPrefix(label).replace(/\s/g, '');
  if ((agent === 'claude' ? /^Yes,Itrustthisfolder/i : /^Yes,continue/i).test(compact)) return 'yes';
  if ((agent === 'claude' ? /^No,exit/i : /^No,quit/i).test(compact)) return 'no';
  return null;
};

export const matchTrustPrompt = (text: string): ITrustPromptInfo | null => {
  if (!ANCHOR_RE.test(text)) return null;
  const lines = text.split('\n').map((line) => line.replace(/^\s*[│┃]/, '').replace(/[│┃]\s*$/, ''));
  let anchor = -1;
  let previousAnchor = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!ANCHOR_RE.test(lines[i])) continue;
    previousAnchor = anchor;
    anchor = i;
  }
  if (anchor < 0) return null;
  const agent: TTrustAgent = /Quick safety check/i.test(lines[anchor]) ? 'claude' : 'codex';
  const context = lines.slice(previousAnchor + 1, anchor);
  let folderPath: string | undefined;
  if (agent === 'claude') {
    folderPath = context.slice(-6).reverse().map((line) => line.match(ABS_PATH_RE)?.[1]).find(Boolean);
  } else {
    folderPath = context.map((line) => line.match(/repository root:\s*(\/\S+)/i)?.[1]).find(Boolean)
      ?? context.map((line) => line.match(/You are in\s+(\/\S+)/i)?.[1]).find(Boolean);
  }
  if (!folderPath) return null;

  const block = lines.slice(anchor).join('\n');
  const parsed = parsePermissionOptions(block);
  const answers = parsed.options.map((label) => answerFromLabel(label, agent));
  const yesIndex = answers.indexOf('yes');
  const noIndex = answers.indexOf('no');
  if (parsed.options.length !== 2 || yesIndex < 0 || noIndex < 0) return null;
  const yesKey = optionNumber(parsed.options[yesIndex]);
  const noKey = optionNumber(parsed.options[noIndex]);
  if (yesKey && noKey) {
    return { agent, folderPath, selection: { mode: 'numbered', yesKey, noKey } };
  }
  const selectedAnswer = answers[parsed.focusedIndex];
  const hasFocus = /^\s*[❯›>]\s+(?:Yes,|No,)/im.test(block);
  return {
    agent,
    folderPath,
    selection: selectedAnswer && hasFocus
      ? { mode: 'navigation', selectedAnswer, yesIsFirst: yesIndex < noIndex }
      : { mode: 'unavailable' },
  };
};

export const getTrustResponseKeys = (prompt: ITrustPromptInfo, answer: TTrustAnswer): string[] => {
  const { selection } = prompt;
  if (selection.mode === 'unavailable') return [];
  if (selection.mode === 'numbered') {
    const digit = answer === 'yes' ? selection.yesKey : selection.noKey;
    return prompt.agent === 'codex' ? [digit] : [digit, '\r'];
  }
  if (answer === selection.selectedAnswer) return ['\r'];
  const isFirst = answer === 'yes' ? selection.yesIsFirst : !selection.yesIsFirst;
  return [isFirst ? '\x1b[A' : '\x1b[B', '\r'];
};

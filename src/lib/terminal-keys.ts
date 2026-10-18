import { z } from 'zod';

export const CTRL_TOGGLE = '__CTRL__';
export const SHIFT_TOGGLE = '__SHIFT__';

export interface IKeyDef {
  id: string;
  label: string;
  name?: string;
  value: string;
  nerd?: boolean;
  rotate?: boolean;
}

export const TERMINAL_KEYS: IKeyDef[] = [
  { id: 'tab', label: 'Tab', value: '\t' },
  { id: 'esc', label: 'Esc', value: '\x1b' },
  { id: 'ctrl', label: 'Ctrl', value: CTRL_TOGGLE },
  { id: 'shift', label: 'Shift', value: SHIFT_TOGGLE },
  { id: 'enter', name: 'Enter ↵', label: '\u{f17a5}', value: '\r', nerd: true },
  { id: 'up', name: '↑', label: '\u{f005d}', value: '\x1b[A', nerd: true },
  { id: 'down', name: '↓', label: '\u{f0045}', value: '\x1b[B', nerd: true },
  { id: 'left', name: '←', label: '\u{f004d}', value: '\x1b[D', nerd: true },
  { id: 'right', name: '→', label: '\u{f0054}', value: '\x1b[C', nerd: true },
  { id: 'pipe', name: '|', label: '\u{f0374}', value: '|', nerd: true, rotate: true },
  { id: 'tilde', name: '~', label: '\u{f0725}', value: '~', nerd: true },
  ...['\x1bOP', '\x1bOQ', '\x1bOR', '\x1bOS', '\x1b[15~', '\x1b[17~',
    '\x1b[18~', '\x1b[19~', '\x1b[20~', '\x1b[21~', '\x1b[23~', '\x1b[24~']
    .map((value, index) => ({ id: `f${index + 1}`, label: `F${index + 1}`, value })),
];

export interface ITerminalKeySetting {
  id: string;
  visible: boolean;
}

export const DEFAULT_TERMINAL_KEYS: ITerminalKeySetting[] = TERMINAL_KEYS.map(({ id }) => ({ id, visible: true }));
const KEY_IDS = new Set(TERMINAL_KEYS.map(({ id }) => id));

export const terminalKeysSchema = z.array(z.object({
  id: z.string().refine((id) => KEY_IDS.has(id)),
  visible: z.boolean(),
})).length(TERMINAL_KEYS.length).refine((keys) => new Set(keys.map(({ id }) => id)).size === keys.length);

export const normalizeTerminalKeys = (value: unknown): ITerminalKeySetting[] => {
  const keys: ITerminalKeySetting[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value)) {
    for (const key of value) {
      if (!key || !KEY_IDS.has(key.id) || seen.has(key.id) || typeof key.visible !== 'boolean') continue;
      seen.add(key.id);
      keys.push({ id: key.id, visible: key.visible });
    }
  }
  return [...keys, ...DEFAULT_TERMINAL_KEYS.filter(({ id }) => !seen.has(id))];
};

/** Convert a typed letter into its Ctrl control code (e.g. "c" → \x03), or null when not applicable. */
export const toCtrlChar = (typed: string): string | null => {
  if (typed.length !== 1) return null;
  const code = typed.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
  return null;
};

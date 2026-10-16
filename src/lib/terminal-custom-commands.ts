import { z } from 'zod';

export const MAX_TERMINAL_COMMANDS = 50;

export const terminalCommandSchema = z.object({
  name: z.string().trim().min(1).max(40),
  command: z.string().min(1).max(4000)
    .refine((value) => value.trim().length > 0)
    .refine((value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value)),
});

export interface ITerminalCommand extends z.infer<typeof terminalCommandSchema> {
  id: string;
}

export const terminalCommandInput = (command: string): string => {
  const text = command.replace(/\r\n|\n/g, '\r');
  return text.endsWith('\r') ? text : `${text}\r`;
};

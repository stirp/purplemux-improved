export const GIT_GENERATION_PROMPTS = {
  commitMessagePrompt: {
    variables: ['locale', 'branch'],
    defaultPrompt: `Generate a Git commit message in {{locale}} for all committable working tree changes on branch {{branch}}, including staged, unstaged, and untracked files.
Use a concise title and a Markdown body describing the concrete changes and their purpose.
The changed file list and code diff are supplied separately as JSON evidence.`,
  },
  reviewDescriptionPrompt: {
    variables: ['locale', 'sourceBranch', 'targetBranch'],
    defaultPrompt: `Write a PR/MR title and Markdown description in {{locale}} for merging {{sourceBranch}} into {{targetBranch}}.
Explain the concrete problem, resulting behavior, and relevant changes.
The commit history, change statistics, and code diff are supplied separately as JSON evidence.`,
  },
} as const;

export type TGitGenerationPromptKey = keyof typeof GIT_GENERATION_PROMPTS;

export function renderGitGenerationPrompt(key: TGitGenerationPromptKey, template: string, variables: Record<string, string>): string {
  const supported: readonly string[] = GIT_GENERATION_PROMPTS[key].variables;
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => {
    const variable = name.trim();
    if (!supported.includes(variable)) throw new Error(`Unknown prompt variable: ${variable}`);
    if (variables[variable] === undefined) throw new Error(`Missing prompt variable: ${variable}`);
    return variables[variable];
  });
}

export function isValidGitGenerationPrompt(key: TGitGenerationPromptKey, value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000 || value.includes('\0')) return false;
  try {
    const remaining = renderGitGenerationPrompt(key, value, Object.fromEntries(GIT_GENERATION_PROMPTS[key].variables.map((name) => [name, ''])));
    return !remaining.includes('{{') && !remaining.includes('}}');
  } catch { return false; }
}

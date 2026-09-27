import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANCH_NAME_PROMPT, isValidBranchNamePrompt, renderBranchNamePrompt } from '@/lib/branch-name-prompt';

describe('branch name prompt variables', () => {
  it('injects repeated named variables without recursively interpreting user input', () => {
    expect(renderBranchNamePrompt('{{title}} / {{ title }} / {{workspaceName}} / {{baseRef}}', {
      title: '修复 {{baseRef}} $&', workspaceName: 'Purplemux', baseRef: 'refs/heads/main',
    })).toBe('修复 {{baseRef}} $& / 修复 {{baseRef}} $& / Purplemux / refs/heads/main');
  });
  it('accepts the default and literal prompts, rejecting unknown variables and invalid input', () => {
    expect(isValidBranchNamePrompt(DEFAULT_BRANCH_NAME_PROMPT)).toBe(true);
    expect(isValidBranchNamePrompt('Always return task/example')).toBe(true);
    for (const value of ['', '  ', null, 42, 'x'.repeat(10001), '{{unknown}}', '{{toString}}']) {
      expect(isValidBranchNamePrompt(value)).toBe(false);
    }
  });
});

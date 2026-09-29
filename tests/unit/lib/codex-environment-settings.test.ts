import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/hooks/use-config-store', () => ({
  default: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import CodexEnvironmentSettings, { AgentEnvironmentSettings } from '@/components/features/settings/codex-environment-settings';

beforeEach(() => {
  mocks.state = { setCodexEnvironment: vi.fn() };
});

describe('Codex environment settings rendering', () => {
  it.each([undefined, null, {}])('renders without crashing when configuration is absent: %j', (environment) => {
    mocks.state.codexEnvironment = environment;
    const html = renderToStaticMarkup(createElement(CodexEnvironmentSettings));
    expect(html).toContain('id="codex-environment"');
    expect(html).toContain('</textarea>');
    expect(html).not.toContain('aria-invalid="true"');
  });

  it('displays previously saved environment values', () => {
    mocks.state.codexEnvironment = { HTTPS_PROXY: 'http://localhost:7890' };
    const html = renderToStaticMarkup(createElement(CodexEnvironmentSettings));
    expect(html).toContain('HTTPS_PROXY=http://localhost:7890</textarea>');
  });
});

it('renders independent accessible editors with the matching values', () => {
  mocks.state.claudeEnvironment = { TOKEN: 'claude-value' };
  mocks.state.codexEnvironment = { TOKEN: 'codex-value' };
  for (const provider of ['claude', 'codex'] as const) {
    const html = renderToStaticMarkup(createElement(AgentEnvironmentSettings, { provider }));
    expect(html).toContain(`id="${provider}-environment"`);
    expect(html).toContain(`TOKEN=${provider}-value</textarea>`);
    expect(html).not.toContain(provider === 'claude' ? 'codex-value' : 'claude-value');
  }
});

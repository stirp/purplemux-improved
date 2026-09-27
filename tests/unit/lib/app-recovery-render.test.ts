import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppRecoveryDialog, getRecoveryLabels } from '@/components/layout/app-error-boundary';
import common from '../../../messages/zh-CN/common.json';
import settings from '../../../messages/zh-CN/settings.json';

describe('application error recovery', () => {
  it('renders recovery controls without any app providers and safely displays the error', () => {
    const html = renderToString(createElement(AppRecoveryDialog, {
      error: new Error('<script>broken component</script>'),
      labels: getRecoveryLabels({ common, settings }),
    }));
    expect(html).toContain('<dialog');
    expect(html).toContain(settings.browserStorage.reload);
    expect(html).toContain(settings.browserStorage.action);
    expect(html).toContain('&lt;script&gt;broken component&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('keeps the recovery controls available when translations are missing', () => {
    const html = renderToString(createElement(AppRecoveryDialog, {
      error: new Error('Failed to render'), labels: getRecoveryLabels(null),
    }));
    expect(html).toContain('Clear and reload');
    expect(html).toContain('Reload');
  });
});

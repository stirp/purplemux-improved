import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tokenizer } from 'acorn';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

const markdown = (children: string) => renderToStaticMarkup(
  createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, children),
);

const require = createRequire(import.meta.url);
const gfmRequire = createRequire(require.resolve('remark-gfm'));
const mdastRequire = createRequire(gfmRequire.resolve('mdast-util-gfm'));
const autolinkEntry = mdastRequire.resolve('mdast-util-gfm-autolink-literal');
const autolinkUrl = pathToFileURL(autolinkEntry).href;

describe('Markdown on Safari before 16.4', () => {
  it('ships an autolink dependency without unparseable lookbehind literals', () => {
    const source = readFileSync(join(dirname(autolinkEntry), 'lib/index.js'), 'utf8');
    for (const token of tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module' })) {
      if (token.type.label === 'regexp') {
        expect(token.value.pattern).not.toMatch(/\(\?<([=!])/);
      }
    }
  });

  it.each([
    ['hello@example.com', ['mailto:hello@example.com']],
    ['联系：(hello@example.com),two@example.org', ['mailto:hello@example.com', 'mailto:two@example.org']],
    ['/hello@example.com', []],
    ['中文hello@example.com', []],
    ['hello@example.123', []],
  ])('preserves text and link boundaries in the patched AST transform: %s', async (input, urls) => {
    const { gfmAutolinkLiteralFromMarkdown } = await import(autolinkUrl);
    type Node = { type: string; value?: string; url?: string; children?: Node[] };
    const paragraph: Node = { type: 'paragraph', children: [{ type: 'text', value: input }] };
    gfmAutolinkLiteralFromMarkdown().transforms[0]({ type: 'root', children: [paragraph] });
    const text = (node: Node): string => node.value ?? (node.children ?? []).map(text).join('');
    expect(text(paragraph)).toBe(input);
    expect(paragraph.children!.filter((node) => node.type === 'link').map((node) => node.url)).toEqual(urls);
  });

  it('does not stall on an email following a surrogate-pair symbol', () => {
    // A rejected Unicode match must not retry forever in the middle of a surrogate pair.
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { gfmAutolinkLiteralFromMarkdown } = await import(process.argv[1]);
      const input = '😀hello@example.com,second@example.org';
      const paragraph = { type: 'paragraph', children: [{ type: 'text', value: input }] };
      gfmAutolinkLiteralFromMarkdown().transforms[0]({ type: 'root', children: [paragraph] });
      console.log(JSON.stringify(paragraph.children));
    `, autolinkUrl], { timeout: 3000, encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual([
      { type: 'text', value: '😀hello@example.com' },
      { type: 'text', value: ',' },
      { type: 'link', title: null, url: 'mailto:second@example.org', children: [{ type: 'text', value: 'second@example.org' }] },
    ]);
  });

  it.each([
    ['hello@example.com', '<a href="mailto:hello@example.com">hello@example.com</a>'],
    ['Contact: hello@example.com', 'Contact: <a href="mailto:hello@example.com">hello@example.com</a>'],
    ['联系：hello@example.com', '联系：<a href="mailto:hello@example.com">hello@example.com</a>'],
    ['中文hello@example.com', '中文<a href="mailto:hello@example.com">hello@example.com</a>'],
    ['(hello@example.com)', '(<a href="mailto:hello@example.com">hello@example.com</a>)'],
    ['one@example.com,two@example.org', '<a href="mailto:one@example.com">one@example.com</a>,<a href="mailto:two@example.org">two@example.org</a>'],
    ['first.last+tag@example.co.uk', '<a href="mailto:first.last+tag@example.co.uk">first.last+tag@example.co.uk</a>'],
  ])('preserves email boundaries and surrounding text: %s', (input, expected) => {
    expect(markdown(input)).toBe(`<p>${expected}</p>`);
  });

  it.each(['/hello@example.com', 'hello@example.123'])('does not create an invalid link: %s', (input) => {
    expect(markdown(input)).toBe(`<p>${input}</p>`);
  });

  it('retains GFM tables, task lists, strikethrough, code, and existing links', () => {
    const html = markdown('| Name | Value |\n| --- | --- |\n| key | ~~old~~ |\n\n- [x] Done\n\n`hello@example.com`\n\n[hello@example.com](https://example.org)\n\nhttps://example.com');
    expect(html).toContain('<table>');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<code>hello@example.com</code>');
    expect(html).toContain('<a href="https://example.org">hello@example.com</a>');
    expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    expect(html).not.toContain('mailto:');
  });
});

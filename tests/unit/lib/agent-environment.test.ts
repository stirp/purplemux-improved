import { describe, expect, it } from 'vitest';
import { formatAgentEnvironment, isValidAgentEnvironment, parseAgentEnvironment } from '@/lib/agent-environment';

describe('agent environment', () => {
  it.each([undefined, null, {}])('formats missing or empty configuration as an empty editor: %j', (env) => {
    expect(formatAgentEnvironment(env)).toBe('');
  });

  it('preserves literal values, equals signs and empty values', () => {
    const text = 'HTTPS_PROXY=http://localhost:7890\r\n\nTOKEN=a=b\nEMPTY=\nLITERAL= $HOME; $(echo test) ';
    const env = parseAgentEnvironment(text);
    expect(env).toEqual({ HTTPS_PROXY: 'http://localhost:7890', TOKEN: 'a=b', EMPTY: '', LITERAL: ' $HOME; $(echo test) ' });
    expect(parseAgentEnvironment(formatAgentEnvironment(env))).toEqual(env);
    expect(parseAgentEnvironment(' \n')).toEqual({});
  });

  it.each(['export ', '  export ', '\texport\t'])('accepts the optional prefix %j', (prefix) => {
    const env = parseAgentEnvironment(`${prefix}HTTPS_PROXY=http://localhost:7890\r\nPLAIN=yes\n${prefix}EMPTY=\n${prefix}TOKEN= a=b; $HOME 'quoted' `);
    expect(env).toEqual({ HTTPS_PROXY: 'http://localhost:7890', PLAIN: 'yes', EMPTY: '', TOKEN: " a=b; $HOME 'quoted' " });
    expect(parseAgentEnvironment(formatAgentEnvironment(env))).toEqual(env);
  });

  it('only removes a standalone export prefix before the name', () => {
    expect(parseAgentEnvironment('export=value\nexported=value\nNAME=export VALUE=test')).toEqual({
      export: 'value', exported: 'value', NAME: 'export VALUE=test',
    });
  });

  it.each(['NO_EQUALS', '=value', '1BAD=value', 'BAD-NAME=value', 'export', 'export =value', 'export export NAME=value', 'export 1BAD=value', 'export NAME=a\0b', 'NAME=one\nexport NAME=two', 'export NAME=one\nNAME=two', 'NAME=one\nNAME=two', 'NAME=a\0b'])(
    'rejects invalid input without including its value in the error: %s', (text) => {
      expect(() => parseAgentEnvironment(text)).toThrow();
    },
  );

  it.each([null, [], 'NAME=value', { NAME: 1 }, { 'BAD=NAME': 'value' }, { NAME: '\0' }])(
    'rejects malformed API values: %j', (value) => expect(isValidAgentEnvironment(value)).toBe(false),
  );
});

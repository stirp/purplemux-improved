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

  it.each(['NO_EQUALS', '=value', '1BAD=value', 'BAD-NAME=value', 'export NAME=value', 'NAME=one\nNAME=two', 'NAME=a\0b'])(
    'rejects invalid input without including its value in the error: %s', (text) => {
      expect(() => parseAgentEnvironment(text)).toThrow();
    },
  );

  it.each([null, [], 'NAME=value', { NAME: 1 }, { 'BAD=NAME': 'value' }, { NAME: '\0' }])(
    'rejects malformed API values: %j', (value) => expect(isValidAgentEnvironment(value)).toBe(false),
  );
});

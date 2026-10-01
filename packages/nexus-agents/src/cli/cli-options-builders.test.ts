import { parseArgs } from 'node:util';
import { describe, expect, it } from 'vitest';
import { PARSE_ARGS_CONFIG } from '../cli-types.js';
import { buildOptions } from './cli-options-builders.js';

describe('setup custom API option builder (#5129)', () => {
  const flags = [
    ['custom-api', 'customApi', 'https://gateway.example/v1'],
    ['custom-api-key', 'customApiKey', 'TEST_FAKE_API_KEY'],
    ['custom-model', 'customModel', 'test-model'],
  ] as const;

  it.each(flags)('copies --%s independently when present', (flag, option, value) => {
    const { values } = parseArgs({ ...PARSE_ARGS_CONFIG, args: [] });

    const options = buildOptions({ ...values, [flag]: value });

    expect(options).toHaveProperty(option, value);
    for (const [otherFlag, otherOption] of flags) {
      if (otherFlag !== flag) expect(options).not.toHaveProperty(otherOption);
    }
  });

  it.each(flags)('preserves an explicitly empty --%s value', (flag, option) => {
    const { values } = parseArgs({ ...PARSE_ARGS_CONFIG, args: [] });

    expect(buildOptions({ ...values, [flag]: '' })).toHaveProperty(option, '');
  });

  it('omits all three keys when their flags are absent', () => {
    const { values } = parseArgs({ ...PARSE_ARGS_CONFIG, args: [] });

    const options = buildOptions(values);

    expect(options).not.toHaveProperty('customApi');
    expect(options).not.toHaveProperty('customApiKey');
    expect(options).not.toHaveProperty('customModel');
  });

  it('continues mapping neighbouring setup flags', () => {
    const { values } = parseArgs({
      ...PARSE_ARGS_CONFIG,
      args: ['setup', '--non-interactive', '--skip-mcp', '--scope', 'project'],
    });

    expect(buildOptions(values)).toMatchObject({
      nonInteractive: true,
      skipMcp: true,
      scope: 'project',
    });
  });
});

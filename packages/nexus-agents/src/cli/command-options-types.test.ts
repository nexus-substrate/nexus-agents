/**
 * Tests for per-command CLI options split and CustomApiConfig (#5129 Item 2).
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from 'node:util';
import { PARSE_ARGS_CONFIG } from '../cli-types.js';
import { buildOptions } from './cli-options-builders.js';
import type {
  CustomApiConfig,
  CommandArgs,
  SetupCliOptions,
  VoteCliOptions,
  HealthCliOptions,
  SetupCommandArgs,
  HealthCommandArgs,
} from './command-options-types.js';

describe('per-command CLI options and CustomApiConfig (#5129 Item 2)', () => {
  describe('CustomApiConfig encapsulation in buildOptions', () => {
    it('constructs a unified customApiConfig when --custom-api is provided', () => {
      const { values } = parseArgs({
        ...PARSE_ARGS_CONFIG,
        args: [
          'setup',
          '--custom-api',
          'https://gw.example.com/v1',
          '--custom-api-key',
          'sk-test-key-123',
          '--custom-model',
          'llama-3.3-70b',
        ],
      });

      const options = buildOptions(values);
      const config = options.customApiConfig;

      expect(config).toBeDefined();
      expect(config).toEqual({
        baseUrl: 'https://gw.example.com/v1',
        apiKey: 'sk-test-key-123',
        model: 'llama-3.3-70b',
      });
      // Legacy backwards-compatible fields remain accessible
      expect(options.customApi).toBe('https://gw.example.com/v1');
      expect(options.customApiKey).toBe('sk-test-key-123');
      expect(options.customModel).toBe('llama-3.3-70b');
    });

    it('omits optional apiKey and model in customApiConfig when only --custom-api is provided', () => {
      const { values } = parseArgs({
        ...PARSE_ARGS_CONFIG,
        args: ['setup', '--custom-api', 'https://gw.example.com/v1'],
      });

      const options = buildOptions(values);
      const config = options.customApiConfig;

      expect(config).toBeDefined();
      expect(config).toEqual({
        baseUrl: 'https://gw.example.com/v1',
      });
      expect(config?.apiKey).toBeUndefined();
      expect(config?.model).toBeUndefined();
    });

    it('does not produce customApiConfig when --custom-api is absent even if key or model are passed', () => {
      const { values } = parseArgs({
        ...PARSE_ARGS_CONFIG,
        args: ['setup', '--custom-api-key', 'orphan-key', '--custom-model', 'orphan-model'],
      });

      const options = buildOptions(values);

      expect(options.customApiConfig).toBeUndefined();
      // Backwards-compatible raw properties still preserved
      expect(options.customApiKey).toBe('orphan-key');
      expect(options.customModel).toBe('orphan-model');
    });

    it('does not produce customApiConfig when --custom-api is an empty string', () => {
      const { values } = parseArgs({
        ...PARSE_ARGS_CONFIG,
        args: ['setup', '--custom-api', ''],
      });

      const options = buildOptions(values);

      expect(options.customApiConfig).toBeUndefined();
      expect(options.customApi).toBe('');
    });
  });

  describe('CommandArgs type contracts', () => {
    it('allows clean instantiation of HealthCommandArgs without type casting', () => {
      const healthArgs: HealthCommandArgs = {
        command: 'health',
        options: { verbose: true },
        positionals: [],
      };

      expect(healthArgs.command).toBe('health');
      expect(healthArgs.options.verbose).toBe(true);
    });

    it('allows clean instantiation of SetupCommandArgs with CustomApiConfig', () => {
      const customApiConfig: CustomApiConfig = {
        baseUrl: 'https://gateway.example.com',
        apiKey: 'sk-xyz',
        model: 'custom-model',
      };

      const setupArgs: SetupCommandArgs = {
        command: 'setup',
        options: {
          nonInteractive: true,
          skipMcp: false,
          skipRules: false,
          skipHooks: false,
          skipConfig: false,
          skipOpencode: false,
          skipGemini: false,
          skipCodex: false,
          customApiConfig,
        },
        positionals: ['setup'],
      };

      expect(setupArgs.command).toBe('setup');
      expect(setupArgs.options.customApiConfig?.baseUrl).toBe('https://gateway.example.com');
    });

    it('validates VoteCliOptions and CommandArgs contracts', () => {
      const voteOptions: VoteCliOptions = {
        proposal: 'Test Proposal',
        quick: true,
        strategy: 'supermajority',
      };
      const voteArgs: CommandArgs<'vote', VoteCliOptions> = {
        command: 'vote',
        options: voteOptions,
        positionals: ['vote'],
      };

      expect(voteArgs.command).toBe('vote');
      expect(voteArgs.options.strategy).toBe('supermajority');
    });

    it('validates SetupCliOptions and HealthCliOptions contracts', () => {
      const setupOpts: SetupCliOptions = {
        nonInteractive: true,
        scope: 'project',
      };
      const healthOpts: HealthCliOptions = {
        format: 'json',
      };

      expect(setupOpts.scope).toBe('project');
      expect(healthOpts.format).toBe('json');
    });
  });
});

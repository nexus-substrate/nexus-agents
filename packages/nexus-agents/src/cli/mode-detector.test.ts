/**
 * Tests for Mode Detector
 *
 * Verifies automatic mode detection logic for various environments.
 */

import { describe, it, expect } from 'vitest';
import {
  detectMode,
  formatModeDetection,
  isValidServerMode,
  type ServerMode,
  type DetectModeOptions,
} from './mode-detector.js';

describe('Mode Detector', () => {
  describe('isValidServerMode()', () => {
    it('should return true for valid server modes', () => {
      expect(isValidServerMode('server')).toBe(true);
      expect(isValidServerMode('orchestrator')).toBe(true);
      expect(isValidServerMode('mesh')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isValidServerMode('invalid')).toBe(false);
      expect(isValidServerMode('')).toBe(false);
      expect(isValidServerMode(null)).toBe(false);
      expect(isValidServerMode(undefined)).toBe(false);
      expect(isValidServerMode(123)).toBe(false);
      expect(isValidServerMode({})).toBe(false);
    });
  });

  describe('detectMode()', () => {
    describe('explicit mode flag', () => {
      it('should return explicit mode when --mode flag is provided', () => {
        const modes: ServerMode[] = ['server', 'orchestrator', 'mesh'];

        for (const mode of modes) {
          const result = detectMode({ explicitMode: mode });

          expect(result.mode).toBe(mode);
          expect(result.source).toBe('explicit');
          expect(result.reason).toContain(`--mode=${mode}`);
        }
      });

      it('should override auto-detection when explicit mode provided', () => {
        // Even with interactive TTY, explicit flag wins
        const result = detectMode({
          explicitMode: 'server',
          stdinIsTty: true,
          stdoutIsTty: true,
          env: {},
        });

        expect(result.mode).toBe('server');
        expect(result.source).toBe('explicit');
      });
    });

    describe('MCP client detection', () => {
      it('should detect server mode when MCP_CLIENT_NAME is set', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { MCP_CLIENT_NAME: 'claude-code' },
        });

        expect(result.mode).toBe('server');
        expect(result.source).toBe('auto');
        expect(result.reason).toContain('MCP client detected');
        expect(result.reason).toContain('claude-code');
        expect(result.signals.mcpClientName).toBe('claude-code');
      });

      it('should ignore empty MCP_CLIENT_NAME', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { MCP_CLIENT_NAME: '' },
        });

        expect(result.mode).toBe('mesh');
        expect(result.signals.mcpClientName).toBe('');
      });
    });

    describe('TTY detection', () => {
      it('should detect server mode when stdin is not a TTY', () => {
        const result = detectMode({
          stdinIsTty: false,
          stdoutIsTty: true,
          env: {},
        });

        expect(result.mode).toBe('server');
        expect(result.source).toBe('auto');
        expect(result.reason).toContain('stdin is not a TTY');
        expect(result.signals.stdinIsTty).toBe(false);
      });

      it('should detect mesh mode when stdin is a TTY (interactive)', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: {},
        });

        expect(result.mode).toBe('mesh');
        expect(result.source).toBe('auto');
        expect(result.reason).toContain('Interactive terminal');
        expect(result.signals.stdinIsTty).toBe(true);
      });
    });

    describe('CI environment detection', () => {
      const ciEnvironments: Array<{ envVar: string; platform: string }> = [
        { envVar: 'CI', platform: 'generic' },
        { envVar: 'GITHUB_ACTIONS', platform: 'GitHub Actions' },
        { envVar: 'GITLAB_CI', platform: 'GitLab CI' },
        { envVar: 'CIRCLECI', platform: 'CircleCI' },
        { envVar: 'TRAVIS', platform: 'Travis CI' },
        { envVar: 'JENKINS_URL', platform: 'Jenkins' },
        { envVar: 'BUILDKITE', platform: 'Buildkite' },
        { envVar: 'DRONE', platform: 'Drone CI' },
        { envVar: 'AZURE_PIPELINES', platform: 'Azure Pipelines' },
        { envVar: 'TF_BUILD', platform: 'Azure Pipelines' },
        { envVar: 'TEAMCITY_VERSION', platform: 'TeamCity' },
        { envVar: 'BITBUCKET_BUILD_NUMBER', platform: 'Bitbucket Pipelines' },
      ];

      for (const { envVar, platform } of ciEnvironments) {
        it(`should detect orchestrator mode for ${platform} (${envVar})`, () => {
          const result = detectMode({
            stdinIsTty: true,
            stdoutIsTty: true,
            env: { [envVar]: 'true' },
          });

          expect(result.mode).toBe('orchestrator');
          expect(result.source).toBe('auto');
          expect(result.reason).toContain('CI environment detected');
          expect(result.signals.isCI).toBe(true);
          expect(result.signals.ciPlatform).toBe(platform);
        });
      }

      it('should ignore CI=false', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { CI: 'false' },
        });

        expect(result.mode).toBe('mesh');
        expect(result.signals.isCI).toBe(false);
      });

      it('should ignore empty CI variable', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { CI: '' },
        });

        expect(result.mode).toBe('mesh');
        expect(result.signals.isCI).toBe(false);
      });
    });

    describe('container detection', () => {
      it('should detect orchestrator mode in container with non-TTY output', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: false,
          env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
        });

        expect(result.mode).toBe('orchestrator');
        expect(result.source).toBe('auto');
        expect(result.reason).toContain('Container environment');
        expect(result.signals.isContainer).toBe(true);
      });

      it('should detect mesh mode in container with TTY output', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
        });

        // Container with TTY is still interactive
        expect(result.mode).toBe('mesh');
        expect(result.signals.isContainer).toBe(true);
      });

      it('should detect Docker container environment', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: false,
          env: { DOCKER_CONTAINER: '1' },
        });

        expect(result.mode).toBe('orchestrator');
        expect(result.signals.isContainer).toBe(true);
      });
    });

    describe('priority ordering', () => {
      it('should prioritize MCP client over TTY state', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { MCP_CLIENT_NAME: 'test-client' },
        });

        expect(result.mode).toBe('server');
        expect(result.reason).toContain('MCP client');
      });

      it('should prioritize non-TTY over CI environment', () => {
        const result = detectMode({
          stdinIsTty: false,
          stdoutIsTty: true,
          env: { CI: 'true' },
        });

        // Non-TTY stdin indicates MCP server usage, takes priority
        expect(result.mode).toBe('server');
        expect(result.reason).toContain('stdin is not a TTY');
      });

      it('should prioritize CI over container detection', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: false,
          env: {
            CI: 'true',
            KUBERNETES_SERVICE_HOST: '10.0.0.1',
          },
        });

        expect(result.mode).toBe('orchestrator');
        expect(result.reason).toContain('CI environment');
      });
    });

    describe('detection performance', () => {
      it('should complete detection in under 100ms', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: {},
        });

        expect(result.detectionTimeMs).toBeLessThan(100);
      });

      it('should complete detection in under 10ms typically', () => {
        // Run multiple times to get a better measurement
        const times: number[] = [];
        for (let i = 0; i < 10; i++) {
          const result = detectMode({
            stdinIsTty: true,
            stdoutIsTty: true,
            env: {},
          });
          times.push(result.detectionTimeMs);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        expect(avgTime).toBeLessThan(10);
      });
    });

    describe('signals collection', () => {
      it('should collect all signals correctly', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: false,
          env: {
            MCP_CLIENT_NAME: 'test',
            GITHUB_ACTIONS: 'true',
            KUBERNETES_SERVICE_HOST: '10.0.0.1',
          },
        });

        expect(result.signals.stdinIsTty).toBe(true);
        expect(result.signals.stdoutIsTty).toBe(false);
        expect(result.signals.mcpClientName).toBe('test');
        expect(result.signals.isCI).toBe(true);
        expect(result.signals.ciPlatform).toBe('GitHub Actions');
        expect(result.signals.isContainer).toBe(true);
      });
    });

    describe('default behavior', () => {
      it('should use process values when no overrides provided', () => {
        // This test verifies it doesn't throw when using real process
        const result = detectMode();

        expect(result.mode).toBeDefined();
        expect(result.source).toBeDefined();
        expect(result.reason).toBeDefined();
        expect(result.detectionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.signals).toBeDefined();
      });
    });
  });

  describe('formatModeDetection()', () => {
    it('should format detection result for logging', () => {
      const result = detectMode({
        explicitMode: 'mesh',
        stdinIsTty: true,
        stdoutIsTty: true,
        env: {},
      });

      const formatted = formatModeDetection(result);

      expect(formatted).toContain('mode=mesh');
      expect(formatted).toContain('source=explicit');
      expect(formatted).toContain('reason=');
      expect(formatted).toContain('time=');
      expect(formatted).toContain('ms');
    });

    it('should format auto-detected result', () => {
      const result = detectMode({
        stdinIsTty: true,
        stdoutIsTty: true,
        env: { GITHUB_ACTIONS: 'true' },
      });

      const formatted = formatModeDetection(result);

      expect(formatted).toContain('mode=orchestrator');
      expect(formatted).toContain('source=auto');
      expect(formatted).toContain('CI environment');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined env values gracefully', () => {
      const result = detectMode({
        stdinIsTty: true,
        stdoutIsTty: true,
        env: {
          MCP_CLIENT_NAME: undefined,
          CI: undefined,
        },
      });

      expect(result.mode).toBe('mesh');
      expect(result.signals.mcpClientName).toBeUndefined();
      expect(result.signals.isCI).toBe(false);
    });

    it('should handle empty options object', () => {
      const options: DetectModeOptions = {};
      const result = detectMode(options);

      expect(result.mode).toBeDefined();
      expect(result.source).toBe('auto');
    });
  });
});

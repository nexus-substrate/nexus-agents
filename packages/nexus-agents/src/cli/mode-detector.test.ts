/**
 * Tests for Mode Detector
 *
 * Verifies automatic mode detection logic for various environments.
 */

import { describe, it, expect } from 'vitest';
import {
  detectMode,
  formatModeDetection,
  formatModeInspection,
  describeSignals,
  isValidServerMode,
  type ServerMode,
  type DetectModeOptions,
  type DetectionSignals,
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

        expect(result.mode).toBe('orchestrator');
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

      it('should detect orchestrator mode when stdin is a TTY (interactive)', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: {},
        });

        expect(result.mode).toBe('orchestrator');
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

        expect(result.mode).toBe('orchestrator');
        expect(result.signals.isCI).toBe(false);
      });

      it('should ignore empty CI variable', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { CI: '' },
        });

        expect(result.mode).toBe('orchestrator');
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

      it('should detect orchestrator mode in container with TTY output', () => {
        const result = detectMode({
          stdinIsTty: true,
          stdoutIsTty: true,
          env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
        });

        // Container with TTY is still interactive → orchestrator
        expect(result.mode).toBe('orchestrator');
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

  describe('describeSignals()', () => {
    function signals(overrides: Partial<DetectionSignals> = {}): DetectionSignals {
      return {
        stdinIsTty: true,
        stdoutIsTty: true,
        mcpClientName: undefined,
        isCI: false,
        ciPlatform: undefined,
        isContainer: false,
        ...overrides,
      };
    }

    it('renders an MCP client name when present', () => {
      const rows = describeSignals(signals({ mcpClientName: 'claude-code' }));
      const mcpRow = rows.find((r) => r.label === 'MCP client');
      expect(mcpRow?.value).toBe('claude-code');
    });

    it('renders "(none)" for an absent or empty MCP client', () => {
      expect(describeSignals(signals()).find((r) => r.label === 'MCP client')?.value).toBe(
        '(none)'
      );
      expect(
        describeSignals(signals({ mcpClientName: '' })).find((r) => r.label === 'MCP client')?.value
      ).toBe('(none)');
    });

    it('renders TTY booleans as yes/no', () => {
      const rows = describeSignals(signals({ stdinIsTty: false, stdoutIsTty: true }));
      expect(rows.find((r) => r.label === 'stdin is TTY')?.value).toBe('no');
      expect(rows.find((r) => r.label === 'stdout is TTY')?.value).toBe('yes');
    });

    it('renders the CI platform when CI is detected', () => {
      const rows = describeSignals(signals({ isCI: true, ciPlatform: 'GitHub Actions' }));
      expect(rows.find((r) => r.label === 'CI environment')?.value).toBe('yes (GitHub Actions)');
    });

    it('renders CI as "no" when not in CI', () => {
      expect(describeSignals(signals()).find((r) => r.label === 'CI environment')?.value).toBe(
        'no'
      );
    });
  });

  describe('formatModeInspection()', () => {
    // Build a result from fabricated signals — never touches process.env so the
    // formatter's behavior is asserted in isolation from the host environment.
    function fakeSignals(overrides: Partial<DetectionSignals> = {}): DetectionSignals {
      return {
        stdinIsTty: true,
        stdoutIsTty: true,
        mcpClientName: undefined,
        isCI: false,
        ciPlatform: undefined,
        isContainer: false,
        ...overrides,
      };
    }

    it('reports server mode + reasoning when an MCP client is detected', () => {
      const result = detectMode({
        stdinIsTty: true,
        stdoutIsTty: true,
        env: { MCP_CLIENT_NAME: 'claude-code' },
      });
      const out = formatModeInspection(result);

      expect(out).toContain('Detected mode: server (auto)');
      expect(out).toContain('Reasoning:');
      expect(out).toContain('MCP client detected: claude-code');
      expect(out).toContain('Signals:');
      expect(out).toContain('MCP client');
    });

    it('reports server mode for piped (non-TTY) stdin', () => {
      const result = detectMode({ stdinIsTty: false, stdoutIsTty: true, env: {} });
      const out = formatModeInspection(result);

      expect(out).toContain('Detected mode: server (auto)');
      expect(out).toContain('stdin is not a TTY');
      expect(out).toContain('stdin is TTY    no');
    });

    it('reports orchestrator mode for an interactive terminal', () => {
      const result = detectMode({ stdinIsTty: true, stdoutIsTty: true, env: {} });
      const out = formatModeInspection(result);

      expect(out).toContain('Detected mode: orchestrator (auto)');
      expect(out).toContain('Interactive terminal');
    });

    it('reports orchestrator mode + CI platform in a CI environment', () => {
      const result = detectMode({
        stdinIsTty: true,
        stdoutIsTty: true,
        env: { GITHUB_ACTIONS: 'true' },
      });
      const out = formatModeInspection(result);

      expect(out).toContain('Detected mode: orchestrator (auto)');
      expect(out).toContain('CI environment detected (GitHub Actions)');
      expect(out).toContain('yes (GitHub Actions)');
    });

    it('marks the source as explicit when --mode is overridden', () => {
      const result = detectMode({
        explicitMode: 'mesh',
        stdinIsTty: true,
        stdoutIsTty: true,
        env: {},
      });
      const out = formatModeInspection(result);

      expect(out).toContain('Detected mode: mesh (explicit)');
      expect(out).toContain('--mode=mesh');
    });

    it('renders one signal line per signal and no secrets', () => {
      const result = detectMode({
        stdinIsTty: false,
        stdoutIsTty: false,
        env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
      });
      const out = formatModeInspection(result);

      // Each describeSignals row appears as a labeled line.
      for (const row of describeSignals(fakeSignals())) {
        expect(out).toContain(row.label);
      }
      // The container IP (a host detail) is a value we never surface.
      expect(out).not.toContain('10.0.0.1');
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

      expect(result.mode).toBe('orchestrator');
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

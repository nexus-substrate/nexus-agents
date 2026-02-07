import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  initializeSica,
  isSicaEnabled,
  getSicaConfig,
  wrapAgentWithSica,
  resetSica,
} from './cli-server-sica.js';
import type { ILogger, IAgent } from './core/index.js';
import type { SicaAgent } from './agents/self-improving/sica-agent.js';

vi.mock('./agents/self-improving/sica-agent.js', () => ({
  createSicaAgent: vi.fn(),
  SicaAgent: vi.fn(),
}));

describe('cli-server-sica', () => {
  function createMockLogger(): ILogger {
    const mock = { info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
    return mock;
  }

  afterEach(() => {
    resetSica();
    vi.clearAllMocks();
  });

  describe('initializeSica', () => {
    it('should initialize when enabled', () => {
      initializeSica({ sicaConfig: { enabled: true }, logger: createMockLogger() });
      expect(isSicaEnabled()).toBe(true);
    });

    it('should not initialize when disabled', () => {
      initializeSica({ sicaConfig: { enabled: false }, logger: createMockLogger() });
      expect(isSicaEnabled()).toBe(false);
    });

    it('should not initialize when config missing', () => {
      initializeSica({ logger: createMockLogger() });
      expect(isSicaEnabled()).toBe(false);
    });

    it('should store config when enabled', () => {
      const config = { enabled: true, threshold: 0.8 };
      initializeSica({ sicaConfig: config, logger: createMockLogger() });
      expect(getSicaConfig()).toEqual(config);
    });
  });

  describe('getSicaConfig', () => {
    it('should return undefined when not initialized', () => {
      expect(getSicaConfig()).toBeUndefined();
    });

    it('should return config when initialized', () => {
      const config = { enabled: true };
      initializeSica({ sicaConfig: config, logger: createMockLogger() });
      expect(getSicaConfig()).toEqual(config);
    });
  });

  describe('wrapAgentWithSica', () => {
    function createMockAgent(): IAgent {
      const mock = { id: 'test' } as unknown as IAgent;
      return mock;
    }

    it('should return undefined when disabled', () => {
      initializeSica({ sicaConfig: { enabled: false }, logger: createMockLogger() });
      const result = wrapAgentWithSica(createMockAgent(), 'prompt', createMockLogger());
      expect(result).toBeUndefined();
    });

    it('should return undefined when not initialized', () => {
      const result = wrapAgentWithSica(createMockAgent(), 'prompt', createMockLogger());
      expect(result).toBeUndefined();
    });

    it('should create SicaAgent when enabled', async () => {
      const { createSicaAgent } = await import('./agents/self-improving/sica-agent.js');
      const mockAgent = { id: 'sica-agent' };
      vi.mocked(createSicaAgent).mockReturnValue(mockAgent as unknown as SicaAgent);

      initializeSica({ sicaConfig: { enabled: true }, logger: createMockLogger() });
      const result = wrapAgentWithSica(createMockAgent(), 'prompt', createMockLogger());

      expect(createSicaAgent).toHaveBeenCalled();
      expect(result).toBe(mockAgent);
    });
  });

  describe('resetSica', () => {
    it('should clear initialized state', () => {
      initializeSica({ sicaConfig: { enabled: true }, logger: createMockLogger() });
      expect(isSicaEnabled()).toBe(true);

      resetSica();
      expect(isSicaEnabled()).toBe(false);
      expect(getSicaConfig()).toBeUndefined();
    });
  });
});

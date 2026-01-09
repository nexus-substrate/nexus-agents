/**
 * nexus-agents/agents - SICA Version Manager Tests
 *
 * @module agents/self-improving/sica-version-manager.test
 * (Source: Issue #151)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SicaVersionManager, createVersionManager } from './sica-version-manager.js';
import type { AgentConfiguration } from './sica-types.js';

describe('SicaVersionManager', () => {
  let manager: SicaVersionManager;

  const sampleConfig: AgentConfiguration = {
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 2000,
    parameters: {},
  };

  beforeEach(() => {
    manager = new SicaVersionManager();
  });

  describe('createInitialVersion', () => {
    it('should create initial version with correct properties', () => {
      const version = manager.createInitialVersion(sampleConfig);

      expect(version.id).toBeDefined();
      expect(version.version).toBe('1.0.0');
      expect(version.parentVersion).toBeNull();
      expect(version.configuration).toEqual(sampleConfig);
      expect(version.status).toBe('active');
    });

    it('should set initial version as active', () => {
      manager.createInitialVersion(sampleConfig);
      const active = manager.getActiveVersion();

      expect(active).not.toBeNull();
      expect(active?.version).toBe('1.0.0');
    });

    it('should emit version_created and version_activated events', () => {
      manager.createInitialVersion(sampleConfig);
      const events = manager.getEvents();

      expect(events.length).toBe(2);
      expect(events[0]?.type).toBe('version_created');
      expect(events[1]?.type).toBe('version_activated');
    });
  });

  describe('createDerivedVersion', () => {
    it('should create derived version from parent', () => {
      const initial = manager.createInitialVersion(sampleConfig);
      const newConfig: AgentConfiguration = {
        ...sampleConfig,
        temperature: 0.5,
      };

      const derived = manager.createDerivedVersion(initial.id, newConfig, 'Lower temperature');

      expect(derived).not.toBeNull();
      expect(derived?.parentVersion).toBe(initial.id);
      expect(derived?.version).toBe('1.0.1');
      expect(derived?.configuration.temperature).toBe(0.5);
    });

    it('should return null for non-existent parent', () => {
      manager.createInitialVersion(sampleConfig);
      const derived = manager.createDerivedVersion('non-existent', sampleConfig, 'Test');

      expect(derived).toBeNull();
    });

    it('should deprecate worst performing when at max versions', () => {
      const smallManager = new SicaVersionManager({ maxActiveVersions: 2 });
      const v1 = smallManager.createInitialVersion(sampleConfig);

      smallManager.recordExecution(v1.id, { durationMs: 100, tokensUsed: 50, success: false });

      const v2 = smallManager.createDerivedVersion(v1.id, sampleConfig, 'v2');
      expect(v2).not.toBeNull();

      const v3 = smallManager.createDerivedVersion(v1.id, sampleConfig, 'v3');
      expect(v3).not.toBeNull();

      const active = smallManager.getActiveVersions();
      expect(active.length).toBeLessThanOrEqual(2);
    });
  });

  describe('recordExecution', () => {
    it('should update metrics after execution', () => {
      const version = manager.createInitialVersion(sampleConfig);

      manager.recordExecution(version.id, {
        durationMs: 1000,
        tokensUsed: 500,
        success: true,
        qualityScore: 0.8,
      });

      const metrics = manager.getMetrics(version.id);

      expect(metrics).not.toBeNull();
      expect(metrics?.executionCount).toBe(1);
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.successRate).toBe(1);
      expect(metrics?.avgDurationMs).toBe(1000);
    });

    it('should calculate correct success rate over multiple executions', () => {
      const version = manager.createInitialVersion(sampleConfig);

      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: true });
      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: true });
      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: false });
      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: true });

      const metrics = manager.getMetrics(version.id);

      expect(metrics?.executionCount).toBe(4);
      expect(metrics?.successRate).toBe(0.75);
    });

    it('should emit execution_completed event', () => {
      const version = manager.createInitialVersion(sampleConfig);
      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: true });

      const events = manager.getEventsByType('execution_completed');
      expect(events.length).toBe(1);
    });
  });

  describe('selectBestVersion', () => {
    it('should select version with best performance', () => {
      const v1 = manager.createInitialVersion(sampleConfig);
      const v2 = manager.createDerivedVersion(v1.id, sampleConfig, 'v2');

      for (let i = 0; i < 5; i++) {
        manager.recordExecution(v1.id, { durationMs: 1000, tokensUsed: 500, success: i < 2 });
      }

      if (v2 !== null) {
        for (let i = 0; i < 5; i++) {
          manager.recordExecution(v2.id, { durationMs: 800, tokensUsed: 400, success: true });
        }
      }

      const best = manager.selectBestVersion();

      expect(best?.id).toBe(v2?.id);
    });

    it('should emit best_version_selected when version changes', () => {
      const v1 = manager.createInitialVersion(sampleConfig);
      const v2 = manager.createDerivedVersion(v1.id, sampleConfig, 'v2');

      for (let i = 0; i < 3; i++) {
        manager.recordExecution(v1.id, { durationMs: 1000, tokensUsed: 500, success: false });
      }

      if (v2 !== null) {
        for (let i = 0; i < 3; i++) {
          manager.recordExecution(v2.id, { durationMs: 800, tokensUsed: 400, success: true });
        }
      }

      manager.selectBestVersion();

      const events = manager.getEventsByType('best_version_selected');
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('shouldTriggerImprovement', () => {
    it('should not trigger before minimum executions', () => {
      const version = manager.createInitialVersion(sampleConfig);

      manager.recordExecution(version.id, { durationMs: 100, tokensUsed: 50, success: false });

      expect(manager.shouldTriggerImprovement(version.id)).toBe(false);
    });

    it('should trigger when below improvement threshold', () => {
      const lowThresholdManager = new SicaVersionManager({
        minExecutionsForImprovement: 3,
        improvementThreshold: 0.8,
      });

      const version = lowThresholdManager.createInitialVersion(sampleConfig);

      for (let i = 0; i < 4; i++) {
        lowThresholdManager.recordExecution(version.id, {
          durationMs: 100,
          tokensUsed: 50,
          success: i === 0,
        });
      }

      expect(lowThresholdManager.shouldTriggerImprovement(version.id)).toBe(true);
    });

    it('should not trigger when above improvement threshold', () => {
      const lowThresholdManager = new SicaVersionManager({
        minExecutionsForImprovement: 3,
        improvementThreshold: 0.5,
      });

      const version = lowThresholdManager.createInitialVersion(sampleConfig);

      for (let i = 0; i < 4; i++) {
        lowThresholdManager.recordExecution(version.id, {
          durationMs: 100,
          tokensUsed: 50,
          success: true,
        });
      }

      expect(lowThresholdManager.shouldTriggerImprovement(version.id)).toBe(false);
    });
  });

  describe('deprecateVersion', () => {
    it('should mark version as deprecated', () => {
      const version = manager.createInitialVersion(sampleConfig);
      manager.deprecateVersion(version.id, 'Test deprecation');

      const retrieved = manager.getVersion(version.id);
      expect(retrieved?.status).toBe('deprecated');
    });

    it('should select new best when active version is deprecated', () => {
      const v1 = manager.createInitialVersion(sampleConfig);
      const v2 = manager.createDerivedVersion(v1.id, sampleConfig, 'v2');

      if (v2 !== null) {
        for (let i = 0; i < 3; i++) {
          manager.recordExecution(v2.id, { durationMs: 100, tokensUsed: 50, success: true });
        }
      }

      manager.deprecateVersion(v1.id, 'Test');

      const active = manager.getActiveVersion();
      expect(active?.id).toBe(v2?.id);
    });
  });

  describe('createVersionManager factory', () => {
    it('should create manager with custom config', () => {
      const customManager = createVersionManager({
        maxActiveVersions: 5,
        improvementThreshold: 0.9,
      });

      expect(customManager.getConfig().maxActiveVersions).toBe(5);
      expect(customManager.getConfig().improvementThreshold).toBe(0.9);
    });
  });
});

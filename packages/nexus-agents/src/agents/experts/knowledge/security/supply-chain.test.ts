/**
 * Supply Chain Security Knowledge Module Tests
 *
 * Validates the supply chain security knowledge module structure,
 * content quality, and integration with the knowledge registry.
 */

import { describe, it, expect } from 'vitest';
import { SUPPLY_CHAIN_MODULE } from './supply-chain.js';
import { SECURITY_KNOWLEDGE_MODULES, getSecurityKnowledgePrompt } from './index.js';
import { KnowledgeRegistry } from '../types.js';

describe('SUPPLY_CHAIN_MODULE', () => {
  it('has correct metadata', () => {
    expect(SUPPLY_CHAIN_MODULE.id).toBe('security-supply-chain');
    expect(SUPPLY_CHAIN_MODULE.domain).toBe('security');
    expect(SUPPLY_CHAIN_MODULE.title).toBe('Supply Chain Security');
  });

  it('has required sections', () => {
    expect(SUPPLY_CHAIN_MODULE.sections.length).toBeGreaterThanOrEqual(4);
    const titles = SUPPLY_CHAIN_MODULE.sections.map((s) => s.title);
    expect(titles).toContain('Dependency Pinning');
    expect(titles).toContain('CI/CD Token Scoping');
    expect(titles).toContain('Supply Chain Attack Indicators');
    expect(titles).toContain('AI-Assisted Attack Awareness');
  });

  it('sections have priority values', () => {
    for (const section of SUPPLY_CHAIN_MODULE.sections) {
      expect(section.priority).toBeGreaterThan(0);
      expect(section.content.length).toBeGreaterThan(50);
    }
  });

  it('has NIST control references', () => {
    expect(SUPPLY_CHAIN_MODULE.nistControls).toBeDefined();
    expect(SUPPLY_CHAIN_MODULE.nistControls?.length).toBeGreaterThan(0);
  });

  it('has tags for categorization', () => {
    expect(SUPPLY_CHAIN_MODULE.tags).toContain('supply-chain');
    expect(SUPPLY_CHAIN_MODULE.tags).toContain('ci-cd');
  });

  it('is included in SECURITY_KNOWLEDGE_MODULES', () => {
    const ids = SECURITY_KNOWLEDGE_MODULES.map((m) => m.id);
    expect(ids).toContain('security-supply-chain');
  });

  it('content is injected into security expert prompt', () => {
    const prompt = getSecurityKnowledgePrompt();
    // At least one supply chain section should appear in the top 20 by priority
    expect(prompt).toContain('Dependency Pinning');
  });

  it('can be registered in KnowledgeRegistry', () => {
    const registry = new KnowledgeRegistry();
    registry.register(SUPPLY_CHAIN_MODULE);
    const result = registry.getById('security-supply-chain');
    expect(result).toBeDefined();
    expect(result?.title).toBe('Supply Chain Security');
  });

  it('domain lookup returns supply chain module', () => {
    const registry = new KnowledgeRegistry();
    registry.register(SUPPLY_CHAIN_MODULE);
    const securityModules = registry.getByDomain('security');
    expect(securityModules.some((m) => m.id === 'security-supply-chain')).toBe(true);
  });
});

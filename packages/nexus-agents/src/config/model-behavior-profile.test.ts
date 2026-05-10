/**
 * Tests for the model behaviour profile lookup (#2529).
 */
import { describe, it, expect } from 'vitest';

import { resolveModelIdentitySync } from './model-identity.js';
import {
  DEFAULT_PROFILE,
  lookupModelProfile,
  lookupProfileFromModelId,
} from './model-behavior-profile.js';

describe('lookupModelProfile — vendor inheritance', () => {
  it('claude-sonnet inherits anthropic-default + claude-sonnet family is identity', () => {
    const profile = lookupProfileFromModelId('claude-sonnet-4-6');
    // Anthropic: parallel tools on, ephemeral caching, anthropic format
    expect(profile.parallelToolCalls).toBe(true);
    expect(profile.promptCaching).toBe('ephemeral');
    expect(profile.toolDefinitionFormat).toBe('anthropic');
  });

  it('claude-opus uses opus family override (higher turn budget)', () => {
    const profile = lookupProfileFromModelId('claude-opus-4-1');
    expect(profile.profileId).toBe('claude-opus');
    expect(profile.maxRecommendedTurnBudget).toBe(20);
  });

  it('claude-haiku uses haiku family override (lower turn budget)', () => {
    const profile = lookupProfileFromModelId('claude-haiku-4');
    expect(profile.profileId).toBe('claude-haiku');
    expect(profile.maxRecommendedTurnBudget).toBe(8);
  });

  it('gpt-4o uses openai-default profile', () => {
    const profile = lookupProfileFromModelId('gpt-4o');
    expect(profile.profileId).toBe('openai-default');
    expect(profile.parallelToolCalls).toBe(true);
    expect(profile.toolDefinitionFormat).toBe('openai');
  });

  it('o1-preview uses o-reasoning profile (higher turn budget)', () => {
    const profile = lookupProfileFromModelId('o1-preview');
    expect(profile.profileId).toBe('openai-o-reasoning');
    expect(profile.maxRecommendedTurnBudget).toBe(25);
  });

  it('gemini-flash uses gemini-flash profile (lower budget, gemini format)', () => {
    const profile = lookupProfileFromModelId('gemini-2.0-flash');
    expect(profile.profileId).toBe('gemini-flash');
    expect(profile.toolDefinitionFormat).toBe('gemini');
    expect(profile.maxRecommendedTurnBudget).toBe(8);
  });

  it('llama uses meta-default with sequential tools', () => {
    const profile = lookupProfileFromModelId('meta-llama/llama-3.3-70b-instruct');
    expect(profile.profileId).toBe('meta-default');
    expect(profile.parallelToolCalls).toBe(false);
    expect(profile.toolDefinitionFormat).toBe('openai');
  });

  it('nemotron uses nvidia-nemotron-default', () => {
    const profile = lookupProfileFromModelId('nemotron-70b');
    expect(profile.profileId).toBe('nvidia-nemotron-default');
    expect(profile.parallelToolCalls).toBe(false);
  });

  it('unknown vendor falls back to default profile', () => {
    const profile = lookupProfileFromModelId('mystery-fast-model');
    expect(profile.profileId).toBe('default');
    expect(profile).toEqual(DEFAULT_PROFILE);
  });
});

describe('lookupModelProfile — quirk overlay', () => {
  it('thinking quirk bumps turn budget by 1.5x', () => {
    const identity = resolveModelIdentitySync('claude-opus-4-1-thinking');
    const profile = lookupModelProfile(identity);
    // Base claude-opus is 20; thinking → ceil(20 * 1.5) = 30
    expect(profile.maxRecommendedTurnBudget).toBe(30);
    expect(profile.quirks).toContain('thinking');
  });

  it('embedding quirk propagates so AgenticAdapter can refuse', () => {
    const identity = resolveModelIdentitySync('text-embedding-3-large');
    const profile = lookupModelProfile(identity);
    expect(profile.quirks).toContain('embedding');
  });

  it('quirks merge across identity + profile', () => {
    const identity = resolveModelIdentitySync('gpt-4o-mini');
    const profile = lookupModelProfile(identity);
    // gpt-4o family has no extra quirks; identity quirks are 'small'
    expect(profile.quirks).toContain('small');
  });
});

describe('lookupModelProfile — hint-driven', () => {
  it('hints can force a profile (e.g., gateway-renamed model)', () => {
    const identity = resolveModelIdentitySync('workspace-prod-1', {
      vendor: 'anthropic',
      family: 'claude-opus',
    });
    const profile = lookupModelProfile(identity);
    expect(profile.profileId).toBe('claude-opus');
  });
});

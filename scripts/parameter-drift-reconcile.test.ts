/**
 * Tests for the pure parameter-drift reconciliation (#4121, epic #4066).
 *
 * Covers the diff logic only — the IO (catalog fetch, `gh issue create`) lives in
 * scripts/check-parameter-drift.ts and is deliberately NOT exercised here.
 */
import { describe, it, expect } from 'vitest';

import {
  reconcileParameterDrift,
  DEFAULT_RECONCILABLE_PARAMS,
  type ProviderParamView,
  type RegistryParamView,
} from './parameter-drift-reconcile.js';

describe('reconcileParameterDrift (#4121)', () => {
  it('flags drift: provider omits temperature but the registry declares it supported', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/model-x', supportedParameters: ['top_p', 'max_tokens'] }, // no temperature
    ];
    const registry: RegistryParamView[] = [
      { modelId: 'model-x', providerIds: ['vendor/model-x'], unsupportedParameters: [] }, // registry: supported
    ];
    const findings = reconcileParameterDrift(provider, registry);
    expect(findings).toEqual([
      {
        modelId: 'model-x',
        providerId: 'vendor/model-x',
        param: 'temperature',
        registrySupported: true,
        providerSupported: false,
      },
    ]);
  });

  it('flags drift: registry declares temperature unsupported but the provider now lists it', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/model-y', supportedParameters: ['temperature', 'top_p'] },
    ];
    const registry: RegistryParamView[] = [
      {
        modelId: 'model-y',
        providerIds: ['vendor/model-y'],
        unsupportedParameters: ['temperature'],
      },
    ];
    const findings = reconcileParameterDrift(provider, registry);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      modelId: 'model-y',
      param: 'temperature',
      registrySupported: false,
      providerSupported: true,
    });
  });

  it('no finding when the two sources agree (both support temperature)', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/model-z', supportedParameters: ['temperature', 'top_p'] },
    ];
    const registry: RegistryParamView[] = [
      { modelId: 'model-z', providerIds: ['vendor/model-z'], unsupportedParameters: [] },
    ];
    expect(reconcileParameterDrift(provider, registry)).toEqual([]);
  });

  it('no finding when the two sources agree (both reject temperature)', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/reasoner', supportedParameters: ['top_p', 'max_tokens'] }, // no temperature
    ];
    const registry: RegistryParamView[] = [
      {
        modelId: 'reasoner',
        providerIds: ['vendor/reasoner'],
        unsupportedParameters: ['temperature'],
      },
    ];
    expect(reconcileParameterDrift(provider, registry)).toEqual([]);
  });

  it('no false finding for a model present only in the registry', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/other', supportedParameters: ['temperature'] },
    ];
    const registry: RegistryParamView[] = [
      {
        modelId: 'registry-only',
        providerIds: ['vendor/registry-only'],
        unsupportedParameters: ['temperature'],
      },
    ];
    expect(reconcileParameterDrift(provider, registry)).toEqual([]);
  });

  it('no false finding for a model present only in the provider catalog', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/provider-only', supportedParameters: ['temperature'] },
    ];
    const registry: RegistryParamView[] = [];
    expect(reconcileParameterDrift(provider, registry)).toEqual([]);
  });

  it('skips a provider model that reports no capability list (cannot reconcile)', () => {
    const provider: ProviderParamView[] = [
      { id: 'vendor/no-caps' }, // supportedParameters undefined
    ];
    const registry: RegistryParamView[] = [
      {
        modelId: 'no-caps',
        providerIds: ['vendor/no-caps'],
        unsupportedParameters: ['temperature'],
      },
    ];
    expect(reconcileParameterDrift(provider, registry)).toEqual([]);
  });

  it('matches on the first providerId candidate present in the catalog', () => {
    const provider: ProviderParamView[] = [{ id: 'gpt-5.4', supportedParameters: ['temperature'] }];
    const registry: RegistryParamView[] = [
      // canonical id absent from catalog; cliModelName present → still joins.
      {
        modelId: 'codex-5.4',
        providerIds: ['codex-5.4', 'gpt-5.4'],
        unsupportedParameters: ['temperature'],
      },
    ];
    const findings = reconcileParameterDrift(provider, registry);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      modelId: 'codex-5.4',
      providerId: 'gpt-5.4',
      param: 'temperature',
    });
  });

  it('does not mutate its inputs', () => {
    const provider: ProviderParamView[] = [{ id: 'm', supportedParameters: ['top_p'] }];
    const registry: RegistryParamView[] = [
      { modelId: 'm', providerIds: ['m'], unsupportedParameters: [] },
    ];
    reconcileParameterDrift(provider, registry);
    expect(provider[0]?.supportedParameters).toEqual(['top_p']);
    expect(registry[0]?.unsupportedParameters).toEqual([]);
  });

  it('DEFAULT_RECONCILABLE_PARAMS covers the temperature incidents', () => {
    expect(DEFAULT_RECONCILABLE_PARAMS).toContain('temperature');
  });
});

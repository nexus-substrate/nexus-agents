/**
 * Regression test: codex must appear in the model-discovery probe (#4318).
 *
 * `list_available_models` reported `claude`, `gemini` and `opencode` but never
 * `codex`, despite the CLI being installed and authenticated. The cause was a
 * silent capability gap, not a registration bug: `buildDefaultModelSources`
 * includes an adapter only when `hasListModels(adapter)` is true, and
 * `createAllAdapters` defaults codex to the **mcp** transport
 * (`codexTransport: CliTransport = 'mcp'`). `CodexMcpAdapter` had no
 * `listModels()`, so codex was filtered out of the source list with no error
 * anywhere — the probe simply reported one fewer transport than it had.
 *
 * @module config/codex-probe-registration.test
 */

import { describe, it, expect } from 'vitest';
import { createAllAdapters } from '../cli-adapters/factory.js';
import { buildDefaultModelSources } from './register-model-sources.js';

function probedTransports(codexTransport: 'mcp' | 'subprocess'): string[] {
  const adapters = createAllAdapters(undefined, codexTransport);
  return buildDefaultModelSources(adapters, { includeOpenRouter: false }).map((s) => s.name);
}

describe('model-discovery probe registration (#4318)', () => {
  it('includes codex under the default (mcp) transport', () => {
    // The default is what the MCP tool actually runs, so this is the case that
    // produced the missing transport in the field.
    expect(probedTransports('mcp')).toContain('codex');
  });

  it('includes codex under the subprocess transport', () => {
    expect(probedTransports('subprocess')).toContain('codex');
  });

  it('still includes the other CLI transports', () => {
    const names = probedTransports('mcp');

    expect(names).toEqual(expect.arrayContaining(['claude', 'gemini', 'opencode']));
  });

  it('reports the same transport set on either codex transport', () => {
    // Which transport codex uses is a routing detail; it must not change which
    // transports are discoverable.
    expect([...probedTransports('mcp')].sort()).toEqual([...probedTransports('subprocess')].sort());
  });
});

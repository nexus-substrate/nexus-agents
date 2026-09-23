/**
 * createAllAdapters family slots in gateway mode (#6604). "No CLIs installed"
 * is a PATH holding no executables; the gateway models are fakes at the
 * adapter boundary, so nothing reaches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./codex-mcp-server-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./codex-mcp-server-probe.js')>();
  return { ...actual, codexMcpServerAvailable: vi.fn(() => false) };
});

import { createAllAdapters } from './factory.js';
import { createCompositeRouter } from './composite-router.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { ModelToCliAdapter } from './model-to-cli-adapter.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

const THREE_FAMILY = ['gpt-5.5', 'claude-sonnet-4-6', 'gemini-2.5-pro'];

describe('createAllAdapters gateway family slots (#6604)', () => {
  let emptyBin: string;
  let savedPath: string | undefined;

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    emptyBin = mkdtempSync(join(tmpdir(), 'nexus-no-clis-'));
    savedPath = process.env['PATH'];
    process.env['PATH'] = emptyBin;
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    if (savedPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = savedPath;
    rmSync(emptyBin, { recursive: true, force: true });
  });

  it('serves each vendor slot from its family under the slot key', async () => {
    const models = THREE_FAMILY.map((id) => fakeGatewayModel(id));
    setGatewaySlotCatalog(models);
    const arms = createAllAdapters(undefined, 'subprocess');

    expect([...arms.keys()]).toEqual(['claude', 'gemini', 'codex', 'opencode']);
    expect(arms.get('opencode')).toBeInstanceOf(OpenCodeCliAdapter);
    const served: Record<string, string | undefined> = {};
    for (const cli of ['claude', 'codex', 'gemini'] as const) {
      const arm = arms.get(cli);
      expect(arm).toBeInstanceOf(ModelToCliAdapter);
      expect(arm?.name).toBe(cli);
      const res = await arm?.execute({ content: 'hi' });
      served[cli] = res?.ok === true ? res.value.model : undefined;
    }
    expect(served).toEqual({
      claude: 'claude-sonnet-4-6',
      codex: 'gpt-5.5',
      gemini: 'gemini-2.5-pro',
    });
  });

  it('gives the slot of a missing family no arm, so the router never selects it', async () => {
    setGatewaySlotCatalog(['gpt-5.5', 'claude-sonnet-4-6'].map((id) => fakeGatewayModel(id)));
    const arms = createAllAdapters(undefined, 'subprocess');
    expect(arms.has('gemini')).toBe(false);

    const router = createCompositeRouter(arms);
    const tasks = [
      'research the latest Gemini multimodal papers and summarize them',
      'implement a function that parses CSV',
      'review this design for security issues',
      'write documentation for the API',
    ];
    const chosen = new Set<string>();
    for (const content of tasks) {
      const decision = await router.route({ content });
      if (decision.ok) chosen.add(decision.value.cliName);
    }
    expect(chosen.size).toBeGreaterThan(0);
    expect(chosen.has('gemini')).toBe(false);
  });

  it('keeps an installed CLI binary as its subprocess arm in gateway mode', () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    const fakeClaude = join(emptyBin, 'claude');
    writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n');
    chmodSync(fakeClaude, 0o755);
    const arms = createAllAdapters(undefined, 'subprocess');
    expect(arms.get('claude')).toBeInstanceOf(ClaudeCliAdapter);
    expect(arms.get('codex')).toBeInstanceOf(ModelToCliAdapter);
  });

  it('is unchanged with no gateway catalogue: every slot is its subprocess arm', () => {
    const arms = createAllAdapters(undefined, 'subprocess');
    expect([...arms.keys()]).toEqual(['claude', 'gemini', 'codex', 'opencode']);
    expect(arms.get('claude')).toBeInstanceOf(ClaudeCliAdapter);
    expect(arms.get('gemini')).toBeInstanceOf(GeminiCliAdapter);
    expect(arms.get('codex')).toBeInstanceOf(CodexCliAdapter);
    expect(arms.get('opencode')).toBeInstanceOf(OpenCodeCliAdapter);
  });
});

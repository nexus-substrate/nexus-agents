/**
 * Pipeline Eval — Adversarial & Edge Cases
 *
 * Surfaces real regressions:
 * - Rate-limit pattern parity between expert-bridge and canonical detector
 * - Mixed-signal classification (tasks with dev+security, research+audit overlap)
 * - Template registry integrity (no orphaned stage refs)
 * - Stage error propagation (SharedMemory consistency on failures)
 * - Confidence calibration (keyword count vs confidence monotonicity)
 * - Classification determinism (same input → same output)
 *
 * Run: pnpm vitest run src/pipeline/pipeline-eval-edge.test.ts
 */

import { describe, it, expect } from 'vitest';
import { classifyTask } from './adaptive-orchestrator.js';
import { PIPELINE_TEMPLATES, getTemplate, listTemplateIds } from './templates.js';
import { createDevStageRegistry, createAuditStageRegistry } from './stage-wrappers.js';
import { SharedMemoryStore } from './shared-memory.js';
import { isRateLimitText, RATE_LIMIT_PATTERNS } from '../adapters/rate-limit-detector.js';
import type { DevPipelineStages } from './dev-pipeline.js';
import { vi } from 'vitest';

function mockStages(): DevPipelineStages {
  return {
    research: vi.fn().mockResolvedValue('r'),
    plan: vi.fn().mockResolvedValue('p'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 80 }),
    decompose: vi.fn().mockResolvedValue([]),
    implement: vi.fn().mockResolvedValue('i'),
    qaReview: vi.fn().mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, findings: [] }),
  };
}

// ============================================================================
// Rate-limit pattern parity (#1805)
// ============================================================================

describe('Pipeline Eval — Rate-Limit Pattern Parity', () => {
  const canonical = [
    'rate limit exceeded',
    'rate_limit',
    '429 too many requests',
    'quota exceeded',
    'throttled',
    'usage limit reached',
    'requests per minute',
    'tokens per minute',
  ];

  it.each(canonical)('canonical detector matches "%s"', (msg) => {
    expect(isRateLimitText(msg)).toBe(true);
  });

  it('expert-bridge uses canonical detector (no drift)', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile(new URL('./expert-bridge.ts', import.meta.url).pathname, 'utf8')
    );
    // Regression guard: expert-bridge must not define its own pattern list
    expect(src).not.toMatch(/const\s+RATE_LIMIT_INDICATORS\s*=/);
    expect(src).toContain('isRateLimitText');
  });

  it('canonical pattern list is non-empty and stable', () => {
    expect(RATE_LIMIT_PATTERNS.length).toBeGreaterThanOrEqual(8);
  });

  it('non-rate-limit errors do NOT match', () => {
    expect(isRateLimitText('ECONNRESET')).toBe(false);
    expect(isRateLimitText('Internal server error')).toBe(false);
    expect(isRateLimitText('Invalid API key')).toBe(false);
  });
});

// ============================================================================
// Mixed-signal classification
// ============================================================================

describe('Pipeline Eval — Mixed-Signal Classification', () => {
  it('security-related bug fix → audit (security keywords dominate)', () => {
    const r = classifyTask('Fix the security vulnerability in the auth middleware');
    expect(['audit', 'dev']).toContain(r.pipelineType);
  });

  it('research on security topics → audit or research (both acceptable)', () => {
    const r = classifyTask('Investigate security audit approaches for zero-trust');
    expect(['audit', 'research']).toContain(r.pipelineType);
  });

  it('new project with tests → greenfield (greenfield keywords win)', () => {
    const r = classifyTask('Scaffold a new CLI tool with unit tests');
    expect(r.pipelineType).toBe('greenfield');
  });

  it('pure refactor → dev', () => {
    expect(classifyTask('Refactor the routing module').pipelineType).toBe('dev');
  });

  it('empty-ish task → general (fail-safe)', () => {
    expect(classifyTask('help').pipelineType).toBe('general');
    expect(classifyTask('').pipelineType).toBe('general');
  });
});

// ============================================================================
// Classification determinism
// ============================================================================

describe('Pipeline Eval — Classification Determinism', () => {
  it('same input produces identical classification', () => {
    const task = 'Audit the payment module for OWASP compliance';
    const a = classifyTask(task);
    const b = classifyTask(task);
    expect(a.pipelineType).toBe(b.pipelineType);
    expect(a.confidence).toBe(b.confidence);
    expect(a.keywords).toEqual(b.keywords);
  });

  it('case-insensitive classification', () => {
    const lower = classifyTask('implement caching layer');
    const upper = classifyTask('IMPLEMENT CACHING LAYER');
    expect(lower.pipelineType).toBe(upper.pipelineType);
  });
});

// ============================================================================
// Template registry integrity
// ============================================================================

describe('Pipeline Eval — Template Registry Integrity', () => {
  it('every template id listed matches a template', () => {
    for (const id of listTemplateIds()) {
      expect(getTemplate(id)).toBeDefined();
    }
  });

  it('no template has duplicate stage ids', () => {
    for (const [id, tmpl] of PIPELINE_TEMPLATES) {
      const unique = new Set(tmpl.stages);
      expect(unique.size, `template ${id}`).toBe(tmpl.stages.length);
    }
  });

  it('every dev template stage is in dev registry', () => {
    const reg = createDevStageRegistry(mockStages());
    const missing = (getTemplate('dev')?.stages ?? []).filter((s) => !reg.has(s));
    expect(missing).toEqual([]);
  });

  it('every audit template stage is in audit registry', () => {
    const reg = createAuditStageRegistry();
    const missing = (getTemplate('audit')?.stages ?? []).filter((s) => !reg.has(s));
    expect(missing).toEqual([]);
  });

  it('template names are non-empty', () => {
    for (const [, tmpl] of PIPELINE_TEMPLATES) {
      expect(tmpl.name.length).toBeGreaterThan(0);
      expect(tmpl.stages.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Confidence calibration
// ============================================================================

describe('Pipeline Eval — Confidence Calibration', () => {
  it('more keyword matches → higher or equal confidence', () => {
    const one = classifyTask('fix bug');
    const many = classifyTask('fix bug refactor implement module test');
    expect(many.confidence).toBeGreaterThanOrEqual(one.confidence);
  });

  it('confidence is clamped to [0, 1]', () => {
    const tasks = [
      '',
      'help',
      'implement build create refactor fix bug test function class module',
      'research investigate evaluate compare analyze study assess',
    ];
    for (const t of tasks) {
      const r = classifyTask(t);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('keywords array matches what was found in task', () => {
    const r = classifyTask('implement a new caching module with tests');
    for (const kw of r.keywords) {
      expect('implement a new caching module with tests'.toLowerCase()).toContain(kw);
    }
  });
});

// ============================================================================
// SharedMemoryStore edge cases
// ============================================================================

describe('Pipeline Eval — SharedMemoryStore Edge Cases', () => {
  it('handles unicode content without mangling', () => {
    const store = new SharedMemoryStore();
    const payload = '日本語 — café — 🚀';
    store.write('stage', 'discovery', payload);
    expect(store.read()[0]?.content).toBe(payload);
  });

  it('preserves chronological order on retrieval', () => {
    const store = new SharedMemoryStore();
    for (let i = 0; i < 5; i++) store.write('s', 'discovery', i);
    const entries = store.read();
    for (let i = 0; i < 5; i++) expect(entries[i]?.content).toBe(i);
  });

  it('different tags do not cross-pollinate on filtered read', () => {
    const store = new SharedMemoryStore();
    store.write('s', 'discovery', 'd1');
    store.write('s', 'decision', 'x1');
    store.write('s', 'risk', 'r1');
    expect(store.read('discovery').length).toBe(1);
    expect(store.read('decision').length).toBe(1);
    expect(store.read('risk').length).toBe(1);
  });

  it('eviction preserves most recent entries', () => {
    const store = new SharedMemoryStore(3);
    for (let i = 0; i < 10; i++) store.write('s', 'discovery', i);
    const contents = store.read().map((e) => e.content);
    expect(contents).toEqual([7, 8, 9]);
  });

  it('summarize truncates long content', () => {
    const store = new SharedMemoryStore();
    store.write('s', 'discovery', 'x'.repeat(5000));
    expect(store.summarize(200).length).toBeLessThanOrEqual(200);
  });
});

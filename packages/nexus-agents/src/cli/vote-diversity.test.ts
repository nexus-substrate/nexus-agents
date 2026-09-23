/**
 * Panel model diversity (#6115): how many distinct models answered, how many
 * seats answered somewhere other than where they were assigned, and the one
 * line that renders both.
 */
import { describe, it, expect } from 'vitest';

import type { AgentVoteResult, VoterRole } from './vote-types.js';
import {
  panelDiversityOf,
  singleFamilyPanelWarning,
  singleModelPanelWarning,
} from './vote-diversity.js';
import { modelsLine, panelShapeLines } from './vote-summary-lines.js';

const SEVEN: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

function seat(role: VoterRole, over: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role,
    vote: { decision: 'approve', reasoning: 'ok', confidence: 0.8 },
    processingTimeMs: 10,
    source: 'llm',
    cli: 'cli-gemini',
    model: 'gemini-3.1-pro-preview',
    assignedCli: 'gemini',
    ...over,
  };
}

/** The three 2026-09-13 panels: 3 claude and 2 codex seats fell over to gemini. */
function collapsedPanel(): AgentVoteResult[] {
  return [
    seat('architect', {
      assignedCli: 'claude',
      fallback: { fromCli: 'claude', fromModel: 'claude-fable-5', reason: 'capacity' },
    }),
    seat('security', {
      assignedCli: 'codex',
      fallback: { fromCli: 'codex', reason: 'unknown' },
    }),
    seat('devex'),
    seat('ai_ml', {
      assignedCli: 'claude',
      fallback: { fromCli: 'claude', fromModel: 'claude-fable-5', reason: 'capacity' },
    }),
    seat('pm', { assignedCli: 'codex', fallback: { fromCli: 'codex', reason: 'unknown' } }),
    seat('catfish'),
    seat('scope_steward', {
      assignedCli: 'claude',
      fallback: { fromCli: 'claude', fromModel: 'claude-fable-5', reason: 'capacity' },
    }),
  ];
}

function diversePanel(): AgentVoteResult[] {
  return [
    seat('architect', { cli: 'cli-claude', model: 'claude-opus', assignedCli: 'claude' }),
    seat('security', { cli: 'cli-codex', model: 'codex-5.3', assignedCli: 'codex' }),
    seat('scope_steward'),
  ];
}

/** Three answering seats, three models, one vendor (#6606). */
function anthropicPanel(): AgentVoteResult[] {
  return [
    seat('architect', { cli: 'cli-claude', model: 'claude-opus', assignedCli: 'claude' }),
    seat('security', { cli: 'cli-claude', model: 'claude-sonnet', assignedCli: 'claude' }),
    seat('scope_steward', { cli: 'cli-claude', model: 'claude-haiku', assignedCli: 'claude' }),
  ];
}

describe('panelDiversityOf — families (#6606)', () => {
  it('counts distinct vendor families over the answering seats', () => {
    expect(panelDiversityOf(anthropicPanel())).toMatchObject({
      distinctModels: 3,
      distinctFamilies: 1,
      unclassifiedSeats: 0,
    });
    const threeFamilies = [
      ...anthropicPanel().slice(0, 1),
      seat('devex', { model: 'openai/o3' }),
      seat('pm'),
    ];
    expect(panelDiversityOf(threeFamilies).distinctFamilies).toBe(3);
  });

  it('an errored seat contributes no family, whatever it was assigned', () => {
    const panel = [
      ...anthropicPanel(),
      seat('pm', { source: 'error', model: undefined, error: 'boom' }),
      seat('devex', { source: 'error', model: 'openai/o3', error: 'boom' }),
    ];
    expect(panelDiversityOf(panel).distinctFamilies).toBe(1);
  });
});

describe('singleFamilyPanelWarning (#6606)', () => {
  it('fires when a 3+ panel answered on several models of one family', () => {
    expect(singleFamilyPanelWarning(anthropicPanel())).toBe(
      'All 3 answering seats ran anthropic models (3 distinct); independence is weaker than assigned.'
    );
  });

  it('is silent on a multi-family panel, a single-model panel, a small panel and an empty one', () => {
    expect(singleFamilyPanelWarning([...anthropicPanel(), seat('pm')])).toBeUndefined();
    // One model: singleModelPanelWarning already names it.
    expect(singleFamilyPanelWarning(collapsedPanel())).toBeUndefined();
    expect(singleFamilyPanelWarning(anthropicPanel().slice(0, 2))).toBeUndefined();
    expect(singleFamilyPanelWarning([])).toBeUndefined();
  });

  it('makes no claim when an answering seat is unclassified or unresolved', () => {
    expect(
      singleFamilyPanelWarning([...anthropicPanel(), seat('pm', { model: 'mystery-model' })])
    ).toBeUndefined();
    expect(
      singleFamilyPanelWarning([...anthropicPanel(), seat('pm', { model: 'pending-detection' })])
    ).toBeUndefined();
  });
});

describe('panelDiversityOf (#6115)', () => {
  it('counts distinct models over the seats that answered, and seats that answered elsewhere', () => {
    expect(panelDiversityOf(collapsedPanel())).toEqual({
      distinctModels: 1,
      distinctFamilies: 1,
      unclassifiedSeats: 0,
      fallbacks: 5,
    });
    // `codex-5.3` names no recognised vendor: counted as unclassified, never as a family.
    expect(panelDiversityOf(diversePanel())).toEqual({
      distinctModels: 3,
      distinctFamilies: 2,
      unclassifiedSeats: 1,
      fallbacks: 0,
    });
  });

  it('names the empty case: no seat answered → explicit zeros, never absent', () => {
    const errored = SEVEN.map((role) =>
      seat(role, { source: 'error', model: undefined, error: 'boom' })
    );
    const zeros = { distinctModels: 0, distinctFamilies: 0, unclassifiedSeats: 0, fallbacks: 0 };
    expect(panelDiversityOf(errored)).toEqual(zeros);
    expect(panelDiversityOf([])).toEqual(zeros);
  });

  it('an errored seat is not an answering seat, whatever it was assigned', () => {
    const panel = [
      ...diversePanel(),
      seat('pm', { source: 'error', model: undefined, assignedCli: 'claude', error: 'boom' }),
    ];
    expect(panelDiversityOf(panel)).toEqual({
      distinctModels: 3,
      distinctFamilies: 2,
      unclassifiedSeats: 1,
      fallbacks: 0,
    });
  });

  it('the placeholder model id is not a model', () => {
    const panel = [seat('architect', { model: 'pending-detection' }), seat('security')];
    expect(panelDiversityOf(panel).distinctModels).toBe(1);
  });
});

describe('singleModelPanelWarning (#6115)', () => {
  it('fires when every answering seat of a 3+ panel ran on one model', () => {
    expect(singleModelPanelWarning(collapsedPanel())).toBe(
      'All 7 seats answered on gemini-3.1-pro-preview; independence is weaker than assigned.'
    );
  });

  it('says how many seats did not answer when the single model covers a partial panel', () => {
    const panel = [
      ...collapsedPanel().slice(0, 5),
      seat('catfish', { source: 'error', model: undefined, error: 'boom' }),
      seat('scope_steward', { source: 'error', model: undefined, error: 'boom' }),
    ];
    expect(singleModelPanelWarning(panel)).toBe(
      'All 5 seats answered on gemini-3.1-pro-preview (2 did not answer); independence is weaker than assigned.'
    );
  });

  it('is silent on a diverse panel, on a panel under 3 seats, and on a panel nobody answered', () => {
    expect(singleModelPanelWarning(diversePanel())).toBeUndefined();
    expect(singleModelPanelWarning(collapsedPanel().slice(0, 2))).toBeUndefined();
    expect(singleModelPanelWarning([])).toBeUndefined();
    expect(
      singleModelPanelWarning(
        SEVEN.map((role) => seat(role, { source: 'error', model: undefined, error: 'boom' }))
      )
    ).toBeUndefined();
  });
});

describe('modelsLine (#6115)', () => {
  it('renders the count, the fallback count and each fallback as role: from→to, reason', () => {
    const panel = [
      seat('architect', { cli: 'cli-claude', model: 'claude-opus', assignedCli: 'claude' }),
      seat('devex', {
        assignedCli: 'codex',
        fallback: { fromCli: 'codex', fromModel: 'codex-5.3', reason: 'capacity' },
      }),
      seat('pm', {
        cli: 'cli-claude',
        model: 'claude-opus',
        assignedCli: 'claude',
        fallback: { fromCli: 'claude', fromModel: 'claude-fable-5', reason: 'capacity' },
      }),
      seat('security', { cli: 'cli-codex', model: 'codex-5.3', assignedCli: 'codex' }),
    ];
    expect(modelsLine(panel)).toBe(
      'Models: 3 distinct, 2 families (1 seat unclassified), 2 fallbacks (devex: codex→gemini, capacity; pm: claude-fable-5→claude-opus, capacity)'
    );
  });

  it('renders explicit zeros for a clean panel and for a panel nobody answered', () => {
    expect(modelsLine(diversePanel())).toBe(
      'Models: 3 distinct, 2 families (1 seat unclassified), 0 fallbacks'
    );
    expect(modelsLine(anthropicPanel())).toBe('Models: 3 distinct, 1 family, 0 fallbacks');
    expect(modelsLine([])).toBe('Models: 0 distinct, 0 families, 0 fallbacks');
  });
});

describe('seat timing line (#6103) — the third panel-shape line', () => {
  const seatTimingLine = (votes: readonly AgentVoteResult[]): string =>
    panelShapeLines(undefined, votes, undefined)[2] ?? '';
  it("attributes each seat's wall-clock to queueing versus running, per attempt, and totals the queue wait", () => {
    const panel = [
      seat('architect', {
        timing: { attempts: [{ cli: 'claude', queuedMs: 0, ranMs: 118_000, fallback: false }] },
      }),
      seat('security', {
        timing: {
          attempts: [{ cli: 'claude', queuedMs: 118_400, ranMs: 95_000, fallback: false }],
        },
      }),
      seat('devex', {
        timing: {
          attempts: [
            { cli: 'gemini', queuedMs: 0, ranMs: 2_000, fallback: false },
            { cli: 'claude', queuedMs: 213_000, ranMs: 40_000, fallback: true },
          ],
        },
      }),
    ];
    expect(seatTimingLine(panel)).toBe(
      'Seat timing (queued→ran): architect claude 0s→118s; security claude 118s→95s; ' +
        'devex gemini 0s→2s, fallback claude 213s→40s; queued total 331s'
    );
  });

  it('names a seat with no recorded timing and a panel with none, never a zero that reads as measured', () => {
    expect(
      seatTimingLine([seat('architect'), seat('security', { timing: { attempts: [] } })])
    ).toBe('Seat timing (queued→ran): architect unmeasured; security no attempt; queued total 0s');
    expect(seatTimingLine([])).toBe('Seat timing (queued→ran): no seats');
  });
});

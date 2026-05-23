/**
 * `nexus-agents tour` — a guided walkthrough of the four headline tools
 * using cached, deterministic fixtures so it runs with **zero API quota**.
 *
 * Educational by design — the fixtures are clearly labeled as illustrative
 * representative output, not live runs. The tour pauses between steps in
 * interactive mode; `--non-interactive` runs straight through without
 * prompting (suitable for CI / scripted demos).
 *
 * Architecture: `runTour(opts, io: TourIO)` is pure — all I/O goes through
 * the injected `TourIO`, so tests pass a fake IO that captures `write`
 * calls and scripts `prompt` answers (no readline, no stdout spying).
 * `node:readline` lives only in the {@link interactiveIO} factory.
 *
 * (Source: Issue #2851 — approved feature build)
 *
 * @module cli/tour-command
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

// ============================================================================
// Types
// ============================================================================

/**
 * Injected I/O surface so `runTour` can be tested without touching
 * `process.stdin`/`process.stdout` or spawning a readline interface.
 */
export interface TourIO {
  /** Emit a chunk of text. No newline added — the tour formats its own. */
  write(text: string): void;
  /** Prompt the user and resolve with their trimmed input. Scripted impls return immediately. */
  prompt(question: string): Promise<string>;
  /** Release any underlying resources (e.g. the readline interface). */
  close(): void;
}

/** One step in the tour script. */
export interface TourStep {
  readonly title: string;
  /** What this tool is and why it exists, in 1–3 short paragraphs. */
  readonly intro: string;
  /**
   * Representative fixture output for this tool. Hand-authored to match
   * the real output shape — illustrative, not a recorded run.
   */
  readonly demo: string;
  /** One-line takeaway shown after the demo. */
  readonly takeaway: string;
  /** Local `~/.nexus-agents/` paths to surface for this step. */
  readonly paths?: readonly string[];
}

/** CLI-facing options for the tour. */
export interface TourOptions {
  /** Skip "press Enter to continue" prompts. */
  readonly nonInteractive: boolean;
}

// ============================================================================
// Tour Script — 5 deterministic, illustrative steps
// ============================================================================

const STEP_WELCOME: TourStep = {
  title: 'Welcome',
  intro: [
    'nexus-agents is a governance substrate for AI coding agents — Claude,',
    'Codex, Gemini, OpenCode. The agents do the engineering; this project',
    'routes tasks, runs adversarial review, takes consensus votes, and keeps',
    'an immutable audit trail of everything those agents touch.',
    '',
    'This tour walks four headline tools using cached fixtures, so it costs',
    'nothing to run and needs no API keys configured.',
  ].join('\n'),
  demo: '',
  takeaway: 'No live API calls in this tour — everything you see is a representative fixture.',
  paths: ['~/.nexus-agents/                (data root — overridable via NEXUS_DATA_DIR)'],
};

const STEP_ORCHESTRATE: TourStep = {
  title: 'orchestrate — route a task to the right model',
  intro: [
    'The `orchestrate` MCP tool takes a task description, classifies it,',
    'picks the best-fit CLI and pattern (sequential / graph / consensus),',
    'and dispatches. Routing uses real outcome history — earlier successes',
    'and failures bias the next pick.',
  ].join('\n'),
  demo: [
    'Task: "implement a /healthz endpoint with structured logging"',
    '  Classifier:    task_type=implementation  complexity=4/10',
    '  Router picked: claude-sonnet           (capability=code_generation, score=0.91)',
    '  Pattern:       graph                    (2 sequential subtasks detected)',
    '  Pre-flight:    rate-limit budget OK   |  outcome history: 14 runs, 92% success',
    '  -> dispatched',
  ].join('\n'),
  takeaway: 'The router learns from outcomes — bad runs lower a CLI/category score next time.',
};

const STEP_VOTE: TourStep = {
  title: 'vote --quick — 3-agent consensus on a proposal',
  intro: [
    '`nexus-agents vote --quick` runs a 3-voter panel (architect / security /',
    'scope_steward) on a proposal and aggregates their decisions. Each voter is',
    'a real LLM call, runs in parallel, and returns a structured rationale.',
    '`--quick` is for fast tie-breaks; the full 7-voter panel uses higher-order',
    'Bayesian aggregation.',
  ].join('\n'),
  demo: [
    'Proposal: "Adopt Bun as the dev-time test runner alongside Vitest"',
    '  Software Architect   APPROVE  (conf 0.82)  Keeps deps slim; vitest API parity',
    '  Security Engineer    REJECT   (conf 0.74)  New supply-chain surface, unproven',
    '  Scope Steward        REJECT   (conf 0.71)  Two runners = sprawl; pick one',
    '  Result: 1/3 approve (33%)  ->  REJECTED  (simple_majority, threshold 50%)',
  ].join('\n'),
  takeaway: 'Decisions get recorded — same proposal voted twice gets the same panel rationale.',
};

const STEP_RESEARCH: TourStep = {
  title: 'research_synthesize — cluster + align literature',
  intro: [
    '`research_synthesize` walks the registered research catalog, clusters',
    'sources by topic, and maps techniques back to where they live in this',
    "codebase. Useful for asking 'what do we know about X, and what have",
    "we already implemented?'",
  ].join('\n'),
  demo: [
    'Synthesis: 12 sources, 4 clusters',
    '',
    '  agent prompting        7 sources   evidence-tier: strong',
    '    Top techniques:      ToT (5/7), self-critique (4/7)',
    '    Implementations:     SimpleAgent.buildPrompt, agents/agentic-adapter',
    '',
    '  memory architectures   3 sources   evidence-tier: emerging',
    '    Gap:                 cross-process episodic store',
    '    Tracked at:          open issue #2921',
  ].join('\n'),
  takeaway: 'Maps "what the literature says" onto "what we built" — drift surfaces as gaps.',
};

const STEP_AUDIT: TourStep = {
  title: 'verify_audit_chain — tamper-evident history',
  intro: [
    'Every governance-relevant action — routing decisions, votes, expert',
    'invocations, policy denials — is appended to a Merkle-linked audit log.',
    '`verify_audit_chain` re-walks the chain and confirms every entry hashes',
    'back to its predecessor. If any entry was tampered with, the verification',
    'fails at the first broken link.',
  ].join('\n'),
  demo: [
    'Audit chain: ~/.nexus-agents/audit/chain.jsonl',
    '  Entries:    4,217',
    '  Span:       2026-04-18T09:14Z  ->  2026-05-22T03:51Z',
    '  Merkle:     OK   (every entry hashes back to its predecessor)',
    '  Result:     VERIFIED  - chain is intact',
  ].join('\n'),
  takeaway: 'The chain is append-only and hash-linked — any historical edit breaks verification.',
  paths: [
    '~/.nexus-agents/audit/chain.jsonl     (immutable audit log)',
    '~/.nexus-agents/learning/outcomes.db  (routing outcome history)',
  ],
};

export const TOUR_STEPS: readonly TourStep[] = [
  STEP_WELCOME,
  STEP_ORCHESTRATE,
  STEP_VOTE,
  STEP_RESEARCH,
  STEP_AUDIT,
];

// ============================================================================
// Runner
// ============================================================================

/**
 * Runs the tour against the injected I/O. Returns an exit code (0 on
 * normal completion). Behavior is pure given the same `io` — the only
 * non-determinism is whatever the IO's `prompt` resolves to.
 */
export async function runTour(opts: TourOptions, io: TourIO): Promise<number> {
  io.write('═══ nexus-agents tour ═══\n');
  io.write(
    `A no-API-keys walkthrough of the four headline tools. ${opts.nonInteractive ? 'Non-interactive mode.' : 'Press Enter to advance.'}\n`
  );

  for (let i = 0; i < TOUR_STEPS.length; i++) {
    const step = TOUR_STEPS[i];
    if (step === undefined) continue;
    renderStep(io, step, i + 1, TOUR_STEPS.length);
    if (!opts.nonInteractive && i < TOUR_STEPS.length - 1) {
      await io.prompt('\nPress Enter to continue (Ctrl-C to exit) ... ');
    }
  }

  io.write('\n═══ Tour complete ═══\n');
  io.write('Next steps:\n');
  io.write('  nexus-agents doctor              -- check your install\n');
  io.write('  nexus-agents setup               -- configure MCP + .rules + data dirs\n');
  io.write('  nexus-agents --help --all        -- see every command\n');
  io.close();
  return 0;
}

function renderStep(io: TourIO, step: TourStep, n: number, total: number): void {
  io.write(`\n─── Step ${String(n)}/${String(total)}: ${step.title} ───\n\n`);
  io.write(`${step.intro}\n`);
  if (step.demo !== '') {
    io.write('\n--- representative output ---\n');
    io.write(`${step.demo}\n`);
    io.write('--- end output ---\n');
  }
  io.write(`\nTakeaway: ${step.takeaway}\n`);
  if (step.paths !== undefined && step.paths.length > 0) {
    io.write('\nFiles on your machine:\n');
    for (const p of step.paths) io.write(`  - ${p}\n`);
  }
}

// ============================================================================
// IO factories
// ============================================================================

/** I/O bound to the real terminal — uses `node:readline` for the pauses. */
export function interactiveIO(): TourIO {
  const rl: ReadlineInterface = createInterface({ input: process.stdin, output: process.stdout });
  return {
    write: (text: string): void => {
      process.stdout.write(text);
    },
    prompt: (question: string): Promise<string> =>
      new Promise((resolve) => {
        rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      }),
    close: (): void => {
      rl.close();
    },
  };
}

/** I/O that writes to stdout but never prompts — for `--non-interactive`. */
export function scriptedIO(): TourIO {
  return {
    write: (text: string): void => {
      process.stdout.write(text);
    },
    prompt: (): Promise<string> => Promise.resolve(''),
    close: (): void => {
      // nothing to release
    },
  };
}

/** Tour-level help text. */
export function printTourUsage(): void {
  process.stdout.write('Usage: nexus-agents tour [--non-interactive]\n');
  process.stdout.write('\nA no-API-keys walkthrough of the four headline tools.\n');
  process.stdout.write('\nOptions:\n');
  process.stdout.write(
    '  --non-interactive   Run straight through without pausing between steps\n'
  );
}

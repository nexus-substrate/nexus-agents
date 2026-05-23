/**
 * Tests for `nexus-agents tour` (#2851).
 *
 * `runTour` takes an injected `TourIO`, so tests pass a fake IO that
 * captures `write` calls and scripts `prompt` answers — no readline,
 * no stdout spying.
 */

import { describe, it, expect, vi } from 'vitest';
import { runTour, TOUR_STEPS, type TourIO } from './tour-command.js';

interface FakeIO extends TourIO {
  /** Concatenated writes — useful for substring assertions. */
  output(): string;
  promptCalls: string[];
}

function makeFakeIO(scriptedAnswers: string[] = []): FakeIO {
  const writes: string[] = [];
  const promptCalls: string[] = [];
  let answerIdx = 0;
  return {
    write(text: string): void {
      writes.push(text);
    },
    prompt(question: string): Promise<string> {
      promptCalls.push(question);
      return Promise.resolve(scriptedAnswers[answerIdx++] ?? '');
    },
    close(): void {
      // no-op
    },
    output(): string {
      return writes.join('');
    },
    promptCalls,
  };
}

describe('runTour', () => {
  it('returns 0 on normal completion', async () => {
    const io = makeFakeIO();
    const exit = await runTour({ nonInteractive: true }, io);
    expect(exit).toBe(0);
  });

  it('renders every step title and takeaway', async () => {
    const io = makeFakeIO();
    await runTour({ nonInteractive: true }, io);
    const out = io.output();
    for (const step of TOUR_STEPS) {
      expect(out).toContain(step.title);
      expect(out).toContain(step.takeaway);
    }
  });

  it('non-interactive mode never prompts', async () => {
    const io = makeFakeIO();
    await runTour({ nonInteractive: true }, io);
    expect(io.promptCalls).toHaveLength(0);
  });

  it('interactive mode prompts between steps (steps - 1 times)', async () => {
    const io = makeFakeIO();
    await runTour({ nonInteractive: false }, io);
    expect(io.promptCalls).toHaveLength(TOUR_STEPS.length - 1);
  });

  it('closes the IO when done', async () => {
    const io = makeFakeIO();
    const closeSpy = vi.spyOn(io, 'close');
    await runTour({ nonInteractive: true }, io);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the next-steps pointers at the end', async () => {
    const io = makeFakeIO();
    await runTour({ nonInteractive: true }, io);
    const out = io.output();
    expect(out).toContain('nexus-agents doctor');
    expect(out).toContain('nexus-agents setup');
    expect(out).toContain('--help --all');
  });

  it('frames the audit step with the audit + learning paths', async () => {
    const io = makeFakeIO();
    await runTour({ nonInteractive: true }, io);
    const out = io.output();
    expect(out).toContain('~/.nexus-agents/audit/chain.jsonl');
    expect(out).toContain('~/.nexus-agents/learning/outcomes.db');
  });
});

describe('TOUR_STEPS', () => {
  it('covers the four headline tools (orchestrate, vote, research, audit) plus the welcome', () => {
    expect(TOUR_STEPS.length).toBe(5);
    const titles = TOUR_STEPS.map((s) => s.title.toLowerCase()).join(' | ');
    expect(titles).toContain('welcome');
    expect(titles).toContain('orchestrate');
    expect(titles).toContain('vote');
    expect(titles).toContain('research');
    expect(titles).toContain('audit');
  });

  it('every non-welcome step ships a representative demo block', () => {
    const nonWelcome = TOUR_STEPS.filter((s) => !s.title.toLowerCase().includes('welcome'));
    for (const step of nonWelcome) {
      expect(step.demo.length).toBeGreaterThan(0);
    }
  });
});

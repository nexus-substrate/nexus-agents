import { describe, expect, it } from 'vitest';
import {
  COPIED_ANNOUNCEMENT,
  COPIED_LABEL,
  COPIED_RESET_MS,
  COPY_LABEL,
  COPY_SELECTOR,
  FAILED_ANNOUNCEMENT,
  INITIAL_COPY_STATE,
  buttonAttributes,
  copyReduce,
  extractCodeText,
  liveAnnouncement,
  type CopyButtonState,
} from './code-copy.ts';

describe('code-copy constants', () => {
  it('defines the matching selector for code blocks', () => {
    expect(COPY_SELECTOR).toBe('pre.code-block, pre.astro-code, pre[data-copy]');
  });

  it('defines 1500ms reset delay', () => {
    expect(COPIED_RESET_MS).toBe(1500);
  });

  it('defines accessible labels and announcements', () => {
    expect(COPY_LABEL).toBe('Copy code');
    expect(COPIED_LABEL).toBe('Copied');
    expect(COPIED_ANNOUNCEMENT).toBe('Code copied to clipboard');
    expect(FAILED_ANNOUNCEMENT).toBe('Failed to copy code');
  });
});

describe('extractCodeText', () => {
  it('prefers code element text when present', () => {
    expect(extractCodeText('npm install', 'npm install\nCopy')).toBe('npm install');
  });

  it('falls back to pre text when code element is absent', () => {
    expect(extractCodeText(null, 'nexus-agents doctor')).toBe('nexus-agents doctor');
    expect(extractCodeText(undefined, 'nexus-agents doctor')).toBe('nexus-agents doctor');
  });

  it('returns empty string when both are null or undefined', () => {
    expect(extractCodeText(null, null)).toBe('');
    expect(extractCodeText(undefined, undefined)).toBe('');
  });
});

describe('copyReduce', () => {
  it('starts in idle state', () => {
    expect(INITIAL_COPY_STATE).toEqual({ status: 'idle' });
  });

  it('transitions from idle to copied on copied event', () => {
    const next = copyReduce(INITIAL_COPY_STATE, { type: 'copied' });
    expect(next).toEqual({ status: 'copied' });
  });

  it('transitions from copied to idle on reset event', () => {
    const state: CopyButtonState = { status: 'copied' };
    const next = copyReduce(state, { type: 'reset' });
    expect(next).toEqual({ status: 'idle' });
  });

  it('transitions to error on failed event', () => {
    const next = copyReduce(INITIAL_COPY_STATE, { type: 'failed' });
    expect(next).toEqual({ status: 'error' });
  });
});

describe('buttonAttributes', () => {
  it('returns idle button attributes with accessible label', () => {
    const attrs = buttonAttributes('idle');
    expect(attrs.type).toBe('button');
    expect(attrs.className).toBe('copy-btn');
    expect(attrs['aria-label']).toBe('Copy code');
    expect(attrs.text).toBe('Copy');
    expect(attrs['aria-label'].toLowerCase()).toContain(attrs.text.toLowerCase());
  });

  it('returns copied button attributes with copied class and label', () => {
    const attrs = buttonAttributes('copied');
    expect(attrs.type).toBe('button');
    expect(attrs.className).toBe('copy-btn copied');
    expect(attrs['aria-label']).toBe('Copied');
    expect(attrs.text).toBe('Copied');
    expect(attrs['aria-label'].toLowerCase()).toContain(attrs.text.toLowerCase());
  });

  it('returns error button attributes satisfying WCAG 2.5.3 Label in Name', () => {
    const attrs = buttonAttributes('error');
    expect(attrs.type).toBe('button');
    expect(attrs.className).toBe('copy-btn error');
    expect(attrs['aria-label']).toBe('Failed to copy');
    expect(attrs.text).toBe('Failed');
    // WCAG 2.5.3: Accessible name must contain the visible label text
    expect(attrs['aria-label'].toLowerCase()).toContain(attrs.text.toLowerCase());
  });
});

describe('liveAnnouncement', () => {
  it('returns polite announcement when copied', () => {
    expect(liveAnnouncement('copied')).toBe('Code copied to clipboard');
  });

  it('returns empty string when idle', () => {
    expect(liveAnnouncement('idle')).toBe('');
  });

  it('returns failure message when error occurs', () => {
    expect(liveAnnouncement('error')).toBe('Failed to copy code');
  });
});

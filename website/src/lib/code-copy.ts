/**
 * code-copy.ts — pure logic and DOM helpers for code block copy buttons (#7320).
 *
 * Part of Epic #7203 (Diátaxis docs and website revamp). Converted from the
 * inline script in PageScripts.astro to a Svelte island architecture (#7313).
 *
 * Requirements (#7320):
 * - Always visible
 * - Accessible label ("Copy code")
 * - Copied-state announcement via aria-live
 * - 48px touch target (styled in docs.css)
 *
 * @module website/src/lib/code-copy
 */

/** Selector for all code blocks that receive copy buttons. */
export const COPY_SELECTOR = 'pre.code-block, pre.astro-code, pre[data-copy]';

/** How long the "Copied" visual state and live message persist before reset (ms). */
export const COPIED_RESET_MS = 1500;

export const COPY_LABEL = 'Copy code';
export const COPIED_LABEL = 'Copied';
export const COPIED_ANNOUNCEMENT = 'Code copied to clipboard';
export const FAILED_ANNOUNCEMENT = 'Failed to copy code';

export type CopyStatus = 'idle' | 'copied' | 'error';

export interface CopyButtonState {
  status: CopyStatus;
}

export type CopyEvent =
  | { type: 'copied' }
  | { type: 'reset' }
  | { type: 'failed' };

export const INITIAL_COPY_STATE: CopyButtonState = {
  status: 'idle',
};

/**
 * Pure state reducer for copy button transitions.
 */
export function copyReduce(state: CopyButtonState, event: CopyEvent): CopyButtonState {
  switch (event.type) {
    case 'copied':
      return { status: 'copied' };
    case 'reset':
      return { status: 'idle' };
    case 'failed':
      return { status: 'error' };
    default:
      return state;
  }
}

/**
 * Extracts clean code text from code/pre elements.
 * Prefers <code> element text if present, falling back to <pre> text.
 */
export function extractCodeText(
  codeText?: string | null,
  preText?: string | null
): string {
  if (codeText !== undefined && codeText !== null) return codeText;
  if (preText !== undefined && preText !== null) return preText;
  return '';
}

/**
 * Attributes for the copy button based on current status.
 */
export function buttonAttributes(status: CopyStatus): {
  type: 'button';
  className: string;
  'aria-label': string;
  text: string;
} {
  switch (status) {
    case 'copied':
      return {
        type: 'button',
        className: 'copy-btn copied',
        'aria-label': COPIED_LABEL,
        text: COPIED_LABEL,
      };
    case 'error':
      return {
        type: 'button',
        className: 'copy-btn error',
        'aria-label': 'Failed to copy',
        text: 'Failed',
      };
    case 'idle':
    default:
      return {
        type: 'button',
        className: 'copy-btn',
        'aria-label': COPY_LABEL,
        text: 'Copy',
      };
  }
}

/**
 * Polite screen-reader announcement string for status changes.
 */
export function liveAnnouncement(status: CopyStatus): string {
  switch (status) {
    case 'copied':
      return COPIED_ANNOUNCEMENT;
    case 'error':
      return FAILED_ANNOUNCEMENT;
    case 'idle':
    default:
      return '';
  }
}

/**
 * Attaches accessible copy buttons to code blocks under `root`.
 * Idempotent: elements with `data-copy-attached="1"` are skipped.
 * Returns a cleanup function that detaches buttons and listeners.
 */
export function attachCopyButtons(
  root: ParentNode = document,
  onAnnounce?: (message: string) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return () => {};
  }

  const pres = [...root.querySelectorAll<HTMLElement>(COPY_SELECTOR)];
  const attachedButtons: HTMLButtonElement[] = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  for (const pre of pres) {
    if (pre.dataset.copyAttached === '1') continue;
    pre.dataset.copyAttached = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', COPY_LABEL);
    btn.textContent = 'Copy';

    const onClick = async (): Promise<void> => {
      const code = pre.querySelector('code');
      const text = extractCodeText(code?.textContent, pre.textContent);

      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = COPIED_LABEL;
        btn.classList.add('copied');
        btn.setAttribute('aria-label', COPIED_LABEL);
        onAnnounce?.(COPIED_ANNOUNCEMENT);

        const timer = setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
          btn.setAttribute('aria-label', COPY_LABEL);
          onAnnounce?.('');
        }, COPIED_RESET_MS);
        timeouts.push(timer);
      } catch {
        btn.textContent = 'Failed';
        btn.classList.add('error');
        onAnnounce?.(FAILED_ANNOUNCEMENT);

        const timer = setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('error');
          btn.setAttribute('aria-label', COPY_LABEL);
          onAnnounce?.('');
        }, COPIED_RESET_MS);
        timeouts.push(timer);
      }
    };

    btn.addEventListener('click', onClick);

    if (pre.style.position === '' || pre.style.position === 'static') {
      pre.style.position = 'relative';
    }
    pre.appendChild(btn);
    attachedButtons.push(btn);
  }

  return () => {
    timeouts.forEach((t) => clearTimeout(t));
    for (const btn of attachedButtons) {
      const parent = btn.parentElement;
      if (parent) {
        delete parent.dataset.copyAttached;
        btn.remove();
      }
    }
  };
}

/**
 * nexus-tui — Input parser
 *
 * Parses raw REPL input into structured command, args, and flags.
 *
 * @module parse-input
 */

import type { ParsedInput } from './types.js';

/**
 * Parse a raw input line into command, positional args, and flags.
 *
 * Supports:
 * - Simple commands: `weather`
 * - Commands with args: `orchestrate "build auth module"`
 * - Flags: `weather --cli=claude --json`
 * - Quoted strings: `vote "Should we use Ink?"`
 */
export function parseInput(raw: string): ParsedInput {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0) {
    return { command: '', args: [], flags: new Map() };
  }

  const first = tokens[0];
  const command = first !== undefined ? first.toLowerCase() : '';
  const args: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx > 0) {
        flags.set(token.slice(2, eqIdx), token.slice(eqIdx + 1));
      } else {
        flags.set(token.slice(2), 'true');
      }
    } else {
      args.push(token);
    }
  }

  return { command, args, flags };
}

/** Tokenize input respecting quoted strings. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const ch of input) {
    if (inQuote !== null) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

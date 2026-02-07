/**
 * nexus-agents/security/firewall - Agent Trust Labels (ATL)
 *
 * Generates and parses structured trust labels that travel with
 * processed inputs through the agent pipeline. Format:
 *   [ATL:tier=3,source=github-comment,user=octocat,sanitized=true,rep=0.45]
 *
 * @module security/firewall/agent-trust-labels
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 */

import type { ATLData } from './firewall-types.js';
import { ATLDataSchema } from './firewall-types.js';

/** ATL prefix and suffix markers. */
const ATL_PREFIX = '[ATL:';
const ATL_SUFFIX = ']';

/** Pattern to match and extract ATL strings. */
const ATL_PATTERN = /^\[ATL:(.+)\]$/;

/**
 * Generates an Agent Trust Label string from structured data.
 *
 * @example
 * generateATL({ tier: '3', source: 'github-comment', user: 'octocat', sanitized: true })
 * // => "[ATL:tier=3,source=github-comment,user=octocat,sanitized=true]"
 */
export function generateATL(data: ATLData): string {
  const validated = ATLDataSchema.parse(data);
  const parts: string[] = [
    `tier=${validated.tier}`,
    `source=${encodeATLValue(validated.source)}`,
    `user=${encodeATLValue(validated.user)}`,
    `sanitized=${String(validated.sanitized)}`,
  ];

  if (validated.rep !== undefined) {
    parts.push(`rep=${validated.rep.toFixed(2)}`);
  }

  return `${ATL_PREFIX}${parts.join(',')}${ATL_SUFFIX}`;
}

/**
 * Parses an ATL string back into structured data.
 * Returns undefined if the string is not a valid ATL.
 */
export function parseATL(atl: string): ATLData | undefined {
  const match = ATL_PATTERN.exec(atl.trim());
  if (match === null) return undefined;

  const body = match[1];
  if (body === undefined) return undefined;

  const raw = parseKeyValuePairs(body);
  if (raw === undefined) return undefined;

  return validateParsedATL(raw);
}

/** Parses comma-separated key=value pairs into a record. */
function parseKeyValuePairs(body: string): Record<string, string> | undefined {
  const pairs = body.split(',');
  const raw: Record<string, string> = {};
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex < 1) return undefined;
    raw[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
  }
  return raw;
}

/** Validates and converts raw key-value pairs to ATLData. */
function validateParsedATL(raw: Record<string, string>): ATLData | undefined {
  const tier = raw['tier'];
  const source = raw['source'];
  const user = raw['user'];
  const sanitized = raw['sanitized'];
  if (tier === undefined || source === undefined || user === undefined || sanitized === undefined) {
    return undefined;
  }

  const parsed: ATLData = {
    tier: tier as ATLData['tier'],
    source: decodeATLValue(source),
    user: decodeATLValue(user),
    sanitized: sanitized === 'true',
    ...(raw['rep'] !== undefined ? { rep: parseFloat(raw['rep']) } : {}),
  };

  const result = ATLDataSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/** Encodes special characters in ATL values. */
function encodeATLValue(value: string): string {
  return value.replace(/,/g, '%2C').replace(/=/g, '%3D').replace(/\]/g, '%5D');
}

/** Decodes special characters in ATL values. */
function decodeATLValue(value: string): string {
  return value.replace(/%2C/g, ',').replace(/%3D/g, '=').replace(/%5D/g, ']');
}

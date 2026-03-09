/**
 * nexus-agents/security - Input Sanitizer
 *
 * Sanitizes untrusted GitHub input by stripping dangerous HTML/XML tags,
 * detecting injection patterns, and producing a SanitizedInput result
 * with full audit trail.
 *
 * Defense layer 1 of the three-layer hardening architecture.
 * See: docs/architecture/UNTRUSTED_INPUT_HARDENING.md
 *
 * @module security/input-sanitizer
 * (Source: Issue #818, #819 — Phase 1: Input Sanitization)
 */

import type {
  InjectionFlag,
  SanitizedInput,
  SanitizerConfig,
  StrippedElement,
  TrustTier,
  GitHubUserRole,
} from './trust-types.js';
import { ROLE_DEFAULT_TRUST, SanitizerConfigSchema } from './trust-types.js';

// ============================================================================
// Dangerous HTML Patterns (Trail of Bits / GitHub Copilot vectors)
// ============================================================================

/**
 * HTML tags to strip. These are known injection vectors:
 * - `<picture>` / `<source>`: Trail of Bits GitHub Copilot injection
 * - `<img>`: Can carry injection via alt text or onerror
 */
const DANGEROUS_HTML_PATTERN =
  /<(picture|source|img)\b[^>]*>[\s\S]*?<\/\1>|<(picture|source|img)\b[^>]*\/?>/gi;

// ============================================================================
// XML-like Tags (Conversation History Injection)
// ============================================================================

/**
 * XML-like tags that mimic conversation structure or system prompts.
 */
const XML_INJECTION_PATTERN =
  /<\/?(system|human|assistant|instructions|user|prompt|context|tool_use|tool_result)\b[^>]*>/gi;

// ============================================================================
// HTML Comments with Instructions
// ============================================================================

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

// ============================================================================
// Injection Pattern Detectors
// ============================================================================

interface PatternMatch {
  flag: InjectionFlag;
  pattern: RegExp;
}

const INJECTION_PATTERNS: readonly PatternMatch[] = [
  {
    flag: 'authority_claim',
    pattern: /\b(as (?:a|the) (?:maintainer|admin|owner|security lead|repo owner|developer))\b/i,
  },
  {
    flag: 'authority_claim',
    pattern: /\b(i(?:'m| am) the (?:repo |project )?(?:owner|maintainer|admin))\b/i,
  },
  {
    flag: 'instruction_pattern',
    pattern: /\b(please (?:close|merge|label|mark|apply|delete|remove|approve|reject))\b/i,
  },
  {
    flag: 'instruction_pattern',
    pattern: /\b(you (?:should|must|need to) (?:close|merge|label|apply|delete))\b/i,
  },
  {
    flag: 'system_prompt_manipulation',
    pattern: /\b(ignore (?:all )?previous (?:instructions|rules|prompts))\b/i,
  },
  {
    flag: 'system_prompt_manipulation',
    pattern: /\b(forget (?:your |all )?(?:instructions|rules|safety))\b/i,
  },
  {
    flag: 'system_prompt_manipulation',
    pattern: /\b(new (?:instructions|rules|system prompt|directives))\b/i,
  },
  {
    flag: 'urgency_manipulation',
    pattern: /\b(critical|emergency|urgent|must act now|immediately|time[- ]?sensitive)\b/i,
  },
  {
    flag: 'fake_conversation',
    pattern: /<(?:assistant|human|user|system)>/i,
  },
  {
    flag: 'base64_encoded',
    pattern: /(?:[A-Za-z0-9+/]{40,}={0,2})/,
  },
  {
    flag: 'external_link_instruction',
    pattern: /(?:apply|run|execute|install)\s+(?:this\s+)?(?:from\s+)?https?:\/\//i,
  },
];

// ============================================================================
// Core Sanitization Functions
// ============================================================================

/** Strips dangerous HTML tags and records what was removed.
 * Loops until stable to prevent reconstructed patterns after removal (#1496). */
function stripDangerousHtml(content: string): {
  cleaned: string;
  stripped: StrippedElement[];
} {
  const stripped: StrippedElement[] = [];
  let cleaned = content;
  const MAX_PASSES = 5;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    DANGEROUS_HTML_PATTERN.lastIndex = 0;
    if (!DANGEROUS_HTML_PATTERN.test(cleaned)) break;
    cleaned = cleaned.replace(DANGEROUS_HTML_PATTERN, (match, _g1, _g2, offset: number) => {
      stripped.push({
        tag: match.slice(0, 30) + (match.length > 30 ? '...' : ''),
        reason: 'Dangerous HTML tag (Trail of Bits injection vector)',
        startIndex: offset,
        length: match.length,
      });
      return '';
    });
  }
  return { cleaned, stripped };
}

/** Strips XML-like tags that mimic conversation structure.
 * Loops until stable to prevent reconstructed patterns after removal (#1496). */
function stripXmlTags(content: string): {
  cleaned: string;
  stripped: StrippedElement[];
} {
  const stripped: StrippedElement[] = [];
  let cleaned = content;
  const MAX_PASSES = 5;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    XML_INJECTION_PATTERN.lastIndex = 0;
    if (!XML_INJECTION_PATTERN.test(cleaned)) break;
    cleaned = cleaned.replace(XML_INJECTION_PATTERN, (match, _g1, offset: number) => {
      stripped.push({
        tag: match,
        reason: 'XML-like conversation injection tag',
        startIndex: offset,
        length: match.length,
      });
      return '';
    });
  }
  return { cleaned, stripped };
}

/** Strips HTML comments that may contain hidden instructions. */
function stripHtmlComments(content: string): {
  cleaned: string;
  stripped: StrippedElement[];
} {
  const stripped: StrippedElement[] = [];
  // First pass: strip matched HTML comments with instruction-like content
  let cleaned = content.replace(HTML_COMMENT_PATTERN, (match, offset: number) => {
    const hasInstruction = /\b(ignore|execute|close|merge|delete|apply)\b/i.test(match);
    if (!hasInstruction) return match;

    stripped.push({
      tag: '<!-- ... -->',
      reason: 'HTML comment with instruction-like content',
      startIndex: offset,
      length: match.length,
    });
    return '';
  });
  // Second pass: strip unclosed <!-- tags (incomplete comment injection)
  let searchFrom = 0;
  while (searchFrom < cleaned.length) {
    const openIdx = cleaned.indexOf('<!--', searchFrom);
    if (openIdx === -1) break;
    const closeIdx = cleaned.indexOf('-->', openIdx + 4);
    if (closeIdx === -1) {
      stripped.push({
        tag: '<!--',
        reason: 'Unclosed HTML comment (potential injection vector)',
        startIndex: openIdx,
        length: cleaned.length - openIdx,
      });
      cleaned = cleaned.slice(0, openIdx);
      break;
    }
    searchFrom = closeIdx + 3;
  }
  return { cleaned, stripped };
}

/** Detects injection patterns in content without modifying it. */
function detectInjectionPatterns(content: string): InjectionFlag[] {
  const flags = new Set<InjectionFlag>();
  for (const { flag, pattern } of INJECTION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      flags.add(flag);
    }
  }
  return Array.from(flags);
}

/**
 * Assigns trust tier based on user role and injection analysis.
 * Injection patterns can only DOWNGRADE trust, never upgrade.
 */
function assignTrustTier(
  userRole: GitHubUserRole,
  injectionFlags: readonly InjectionFlag[],
  allowlisted: boolean
): TrustTier {
  if (allowlisted) return '1';

  const baseTier = ROLE_DEFAULT_TRUST[userRole];

  // Content with injection patterns is downgraded to Tier 4 (hostile)
  const hostileFlags: InjectionFlag[] = ['system_prompt_manipulation', 'fake_conversation'];
  if (injectionFlags.some((f) => hostileFlags.includes(f))) return '4';

  // Content with authority claims from non-maintainers is suspicious
  if (
    injectionFlags.includes('authority_claim') &&
    userRole !== 'owner' &&
    userRole !== 'maintainer'
  ) {
    return '4';
  }

  return baseTier;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sanitizes untrusted GitHub input through the full Layer 1 pipeline:
 * 1. HTML stripping (picture/source/img tags)
 * 2. XML tag stripping (system/human/assistant)
 * 3. HTML comment stripping (instruction-bearing comments only)
 * 4. Injection pattern detection
 * 5. Trust tier assignment
 *
 * @param content - Raw untrusted content from GitHub
 * @param userRole - GitHub user's relationship to the repository
 * @param username - GitHub username (for allowlist check)
 * @param config - Optional sanitizer configuration
 * @returns SanitizedInput with cleaned content and audit data
 */
export function sanitizeInput(
  content: string,
  userRole: GitHubUserRole,
  username: string,
  config?: Partial<SanitizerConfig>
): SanitizedInput {
  const cfg = SanitizerConfigSchema.parse(config ?? {});
  const truncated = content.slice(0, cfg.maxInputLength);
  const allowlisted = cfg.allowlistedMaintainers.includes(username);

  // Pipeline: strip dangerous content
  const html = stripDangerousHtml(truncated);
  const xml = stripXmlTags(html.cleaned);
  const comments = stripHtmlComments(xml.cleaned);
  const allStripped = [...html.stripped, ...xml.stripped, ...comments.stripped];

  // Detect injection patterns on ORIGINAL content (before stripping)
  const injectionFlags = detectInjectionPatterns(truncated);

  // Assign trust tier
  const trustTier = assignTrustTier(userRole, injectionFlags, allowlisted);

  return {
    content: comments.cleaned,
    originalLength: content.length,
    trustTier,
    userRole,
    injectionFlags,
    strippedElements: allStripped,
    wasModified: allStripped.length > 0,
    sanitizedAt: new Date().toISOString(),
  };
}

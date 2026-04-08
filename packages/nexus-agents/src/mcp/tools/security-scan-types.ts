/**
 * Security Scan Tool Types (#1683)
 *
 * Input/output schemas for the security_scan MCP tool.
 *
 * @module mcp/tools/security-scan-types
 */

import { z } from 'zod';

/** Supported scanners. */
export const ScannerSchema = z.enum(['semgrep', 'auto']);

/** Input schema for security_scan tool. */
export const SecurityScanInputSchema = z.object({
  /** Path to scan (local directory). */
  target: z.string().min(1).max(500).describe('Local directory path to scan'),
  /** Scanner to use (default: auto). */
  scanner: ScannerSchema.default('auto').describe('Scanner to use'),
  /** Semgrep rulesets (default: p/default). */
  rulesets: z.array(z.string().max(100)).default(['p/default']).describe('Semgrep rulesets to run'),
  /** Max findings to return (default: 50). */
  maxFindings: z.number().int().min(1).max(200).default(50).describe('Maximum findings to return'),
});

export type SecurityScanInput = z.infer<typeof SecurityScanInputSchema>;

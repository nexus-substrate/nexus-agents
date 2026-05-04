/**
 * nexus-agents/mcp - Vendor Publishing Audit Tool
 *
 * Given a vendor name (e.g., "ubuntu", "debian", "fedora"), returns the
 * vendor's published-artifact signing infrastructure: GPG key fingerprints,
 * SHA256SUMS URL pattern, signature shape (clearsigned vs detached vs
 * detached-on-iso), release cadence, key rotation notes, and the vendor doc
 * citation.
 *
 * Use case: aegis-boot's image catalog needs to know HOW to verify each
 * vendor's published images. The truth lives in vendor docs, not in
 * auto-discoverable metadata, so this tool surfaces a curated seed dataset
 * (`vendor-publishing-seed.ts`).
 *
 * v1 is a static lookup. Live cross-checks (e.g., fetching `keyserver.
 * ubuntu.com` to verify a fingerprint hasn't rotated) are deferred — they
 * add network attack surface for marginal value when the vendor doc URL
 * is the authoritative source anyway.
 *
 * @module mcp/tools/vendor-publishing-audit
 * (Source: Issue #2296, child of #2293)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import {
  VENDOR_PUBLISHING_SEED,
  isKnownVendor,
  listKnownVendors,
  type VendorPublishingEntry,
} from './vendor-publishing-seed.js';

// =============================================================================
// Schemas
// =============================================================================

export const VendorPublishingAuditInputSchema = z.object({
  vendor: z
    .string()
    .min(1)
    .max(50)
    .toLowerCase()
    .describe('Vendor identifier, lowercase. e.g. "ubuntu", "debian", "fedora"'),
});

export type VendorPublishingAuditInput = z.infer<typeof VendorPublishingAuditInputSchema>;

/** Either we know this vendor (with the full seed entry) or we don't. */
export type VendorPublishingAuditResponse =
  | (VendorPublishingEntry & { readonly known: true })
  | {
      readonly vendor: string;
      readonly known: false;
      readonly message: string;
      readonly knownVendors: readonly string[];
    };

export type VendorPublishingAuditDeps = BaseMcpToolDeps;

// =============================================================================
// Handler
// =============================================================================

function lookupVendor(vendor: string): VendorPublishingAuditResponse {
  if (isKnownVendor(vendor)) {
    return { ...VENDOR_PUBLISHING_SEED[vendor], known: true };
  }
  const knownVendors = listKnownVendors();
  return {
    vendor,
    known: false,
    message:
      `No seed entry for vendor "${vendor}". Known vendors: ${knownVendors.join(', ')}. ` +
      `Adding a vendor is data-only — see packages/nexus-agents/src/mcp/tools/vendor-publishing-seed.ts.`,
    knownVendors,
  };
}

function createVendorPublishingAuditHandler(deps: VendorPublishingAuditDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validation = VendorPublishingAuditInputSchema.safeParse(args);
    if (!validation.success) {
      return toolError(`Validation error: ${formatZodError(validation.error)}`);
    }
    const logger = deps.logger ?? createLogger({ tool: 'vendor_publishing_audit' });
    ctx.logger.debug('Vendor publishing audit', { vendor: validation.data.vendor });
    return withToolError('Vendor publishing audit failed', logger, () => {
      const result = lookupVendor(validation.data.vendor);
      return Promise.resolve(toolSuccessStructured(result as unknown as Record<string, unknown>));
    });
  };
}

// =============================================================================
// Registration
// =============================================================================

const VENDOR_PUBLISHING_OUTPUT_SCHEMA = {
  vendor: z.string(),
  known: z.boolean(),
  // Fields below populate when known=true; permissive optional for known=false.
  sha256SumsUrlPattern: z.string().optional(),
  sha256SumsSignatureUrlPattern: z.string().optional(),
  signaturePattern: z.string().optional(),
  gpgKeys: z.array(z.unknown()).optional(),
  releaseCadence: z.string().optional(),
  keyRotationNotes: z.string().optional(),
  vendorDocUrl: z.string().optional(),
  citedAt: z.string().optional(),
  // Fields below populate when known=false.
  message: z.string().optional(),
  knownVendors: z.array(z.string()).optional(),
};

const VENDOR_PUBLISHING_DESCRIPTION =
  "Look up a vendor's published-artifact signing infrastructure: GPG key " +
  'fingerprints, SHA256SUMS URL pattern, signature shape (clearsigned / detached / ' +
  'detached-on-iso), release cadence, key rotation notes, and the vendor doc ' +
  'citation. Static lookup against a curated seed dataset; the vendor doc URL ' +
  'is the authoritative source. Returns `{known: false, knownVendors: [...]}` ' +
  'for vendors without a seed entry. v1 covers ubuntu, debian, fedora.';

export function registerVendorPublishingAuditTool(
  server: McpServer,
  deps: VendorPublishingAuditDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'vendor_publishing_audit' });
  const secureHandler = createSecureHandler(createVendorPublishingAuditHandler(deps), {
    toolName: 'vendor_publishing_audit',
    rateLimiter: deps.rateLimiter,
    logger,
  });
  const timeoutMs = getToolTimeout('vendor_publishing_audit', deps.security);
  const wrappedHandler = wrapToolWithTimeout('vendor_publishing_audit', secureHandler, {
    timeoutMs,
    logger,
  });
  server.registerTool(
    'vendor_publishing_audit',
    {
      description: VENDOR_PUBLISHING_DESCRIPTION,
      inputSchema: VendorPublishingAuditInputSchema.shape,
      outputSchema: VENDOR_PUBLISHING_OUTPUT_SCHEMA,
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered vendor_publishing_audit tool');
}

// Test-only exports.
/** @internal */
export const _internal = { lookupVendor };

/**
 * nexus-agents/security/firewall - Passthrough defaults for disabled stages
 *
 * Split out of the pipeline so it stays under the file-size lint (#4992).
 *
 * @module security/firewall/firewall-passthrough
 */

import { mapAuthorAssociation } from '../trust-classifier.js';
import type { ClassifyResult } from '../trust-classifier.js';
import { ROLE_DEFAULT_TRUST } from '../trust-types.js';
import type { SanitizedInput } from '../trust-types.js';
import type { SourceMetadata } from './firewall-types.js';

export function createPassthroughSanitized(meta: SourceMetadata): SanitizedInput {
  const userRole = mapAuthorAssociation(meta.authorAssociation);
  return {
    content: meta.content,
    originalLength: meta.content.length,
    trustTier: ROLE_DEFAULT_TRUST[userRole],
    contentTierMeasured: false,
    userRole,
    injectionFlags: [],
    strippedElements: [],
    truncated: false,
    wasModified: false,
    sanitizedAt: new Date().toISOString(),
  };
}

export function createPassthroughClassification(meta: SourceMetadata): ClassifyResult {
  return {
    trustTier: '3',
    userRole: mapAuthorAssociation(meta.authorAssociation),
    isAllowlisted: false,
    wasDowngraded: false,
    reason: 'Trust classification disabled — default Tier 3',
  };
}

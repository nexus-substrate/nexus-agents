/**
 * Tests for the vendor_publishing_audit MCP tool.
 *
 * (Source: Issue #2296, child of #2293)
 *
 * Pins the interface, not the contents, so the seed dataset can grow without
 * test changes. Specific seed entries are spot-checked (Ubuntu, Debian, Fedora).
 */

import { describe, it, expect } from 'vitest';
import {
  VendorPublishingAuditInputSchema,
  _internal,
  type VendorPublishingAuditInput,
} from './vendor-publishing-audit.js';
import {
  VENDOR_PUBLISHING_SEED,
  isKnownVendor,
  listKnownVendors,
} from './vendor-publishing-seed.js';

// ============================================================================
// Input schema
// ============================================================================

describe('VendorPublishingAuditInputSchema', () => {
  it('accepts a valid vendor', () => {
    const result = VendorPublishingAuditInputSchema.safeParse({ vendor: 'ubuntu' });
    expect(result.success).toBe(true);
  });

  it('lowercases the vendor name (so "Ubuntu" works)', () => {
    const result = VendorPublishingAuditInputSchema.parse({ vendor: 'Ubuntu' });
    expect(result.vendor).toBe('ubuntu');
  });

  it('rejects empty vendor', () => {
    const result = VendorPublishingAuditInputSchema.safeParse({ vendor: '' });
    expect(result.success).toBe(false);
  });

  it('rejects vendor longer than 50 chars', () => {
    const result = VendorPublishingAuditInputSchema.safeParse({ vendor: 'x'.repeat(51) });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Seed dataset contracts
// ============================================================================

describe('VENDOR_PUBLISHING_SEED', () => {
  it('contains at least the v1 vendors (ubuntu, debian, fedora)', () => {
    expect(isKnownVendor('ubuntu')).toBe(true);
    expect(isKnownVendor('debian')).toBe(true);
    expect(isKnownVendor('fedora')).toBe(true);
  });

  it('every entry has the required fields', () => {
    for (const [id, entry] of Object.entries(VENDOR_PUBLISHING_SEED)) {
      expect(entry.vendor, `${id}: vendor field`).toBe(id);
      expect(entry.sha256SumsUrlPattern, `${id}: sha256SumsUrlPattern`).toMatch(/^https:\/\//);
      expect(entry.signaturePattern, `${id}: signaturePattern`).toMatch(
        /^(clearsigned|detached|detached-on-iso)$/
      );
      expect(entry.gpgKeys.length, `${id}: at least one gpgKey`).toBeGreaterThan(0);
      expect(entry.vendorDocUrl, `${id}: vendorDocUrl`).toMatch(/^https:\/\//);
      // citedAt: ISO date YYYY-MM-DD
      expect(entry.citedAt, `${id}: citedAt is ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.releaseCadence.length, `${id}: releaseCadence non-empty`).toBeGreaterThan(0);
      expect(entry.keyRotationNotes.length, `${id}: keyRotationNotes non-empty`).toBeGreaterThan(0);
    }
  });

  it('detached pattern entries have a sha256SumsSignatureUrlPattern', () => {
    for (const [id, entry] of Object.entries(VENDOR_PUBLISHING_SEED)) {
      if (entry.signaturePattern === 'detached') {
        expect(
          entry.sha256SumsSignatureUrlPattern,
          `${id}: detached pattern needs signature URL`
        ).toBeDefined();
      }
    }
  });

  it('clearsigned pattern entries omit sha256SumsSignatureUrlPattern', () => {
    for (const [id, entry] of Object.entries(VENDOR_PUBLISHING_SEED)) {
      if (entry.signaturePattern === 'clearsigned') {
        expect(
          entry.sha256SumsSignatureUrlPattern,
          `${id}: clearsigned should not have separate signature URL`
        ).toBeUndefined();
      }
    }
  });

  it('every gpgKey has source, name, fingerprint, role', () => {
    for (const [id, entry] of Object.entries(VENDOR_PUBLISHING_SEED)) {
      for (const key of entry.gpgKeys) {
        expect(key.source, `${id}: key source`).toMatch(/^https:\/\//);
        expect(key.name.length, `${id}: key name non-empty`).toBeGreaterThan(0);
        expect(key.fingerprint.length, `${id}: key fingerprint non-empty`).toBeGreaterThan(0);
        expect(key.role, `${id}: valid role`).toMatch(/^(release-signing|archive-signing|sbat)$/);
      }
    }
  });

  it('listKnownVendors returns sorted ids', () => {
    const result = listKnownVendors();
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });
});

// ============================================================================
// Lookup behavior
// ============================================================================

describe('vendor_publishing_audit lookupVendor', () => {
  it('returns known=true with the full entry for a known vendor', () => {
    const result = _internal.lookupVendor('ubuntu');
    expect(result.known).toBe(true);
    if (result.known) {
      expect(result.vendor).toBe('ubuntu');
      expect(result.gpgKeys.length).toBeGreaterThan(0);
      expect(result.sha256SumsUrlPattern).toContain('releases.ubuntu.com');
    }
  });

  it('returns known=false with knownVendors[] for an unknown vendor', () => {
    const result = _internal.lookupVendor('nonexistent-vendor');
    expect(result.known).toBe(false);
    if (!result.known) {
      expect(result.vendor).toBe('nonexistent-vendor');
      expect(result.knownVendors).toContain('ubuntu');
      expect(result.message).toContain('No seed entry');
    }
  });

  it('uses the lowercased vendor (downstream of the schema transform)', () => {
    // The schema lowercases input; the lookup itself is case-sensitive.
    const input: VendorPublishingAuditInput = VendorPublishingAuditInputSchema.parse({
      vendor: 'UBUNTU',
    });
    const result = _internal.lookupVendor(input.vendor);
    expect(result.known).toBe(true);
  });
});

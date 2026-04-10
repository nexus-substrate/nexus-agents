/**
 * Data integrity tests for repo-security-plan-fallback.ts.
 *
 * Verifies the embedded fallback scanner data has valid structure,
 * no duplicates, and covers expected categories and languages.
 *
 * @module mcp/tools/repo-security-plan-fallback.test
 * (Issue #1340)
 */

import { describe, it, expect } from 'vitest';
import { FALLBACK_SCANNER_DATA } from './repo-security-plan-fallback.js';

describe('FALLBACK_SCANNER_DATA', () => {
  it('has source set to fallback', () => {
    expect(FALLBACK_SCANNER_DATA.source).toBe('fallback');
  });

  describe('scanners', () => {
    it('has at least 20 scanners', () => {
      expect(FALLBACK_SCANNER_DATA.scanners.length).toBeGreaterThanOrEqual(20);
    });

    it('every scanner has required fields', () => {
      for (const scanner of FALLBACK_SCANNER_DATA.scanners) {
        expect(scanner.name).toBeTruthy();
        expect(scanner.displayName).toBeTruthy();
        expect(scanner.categories.length).toBeGreaterThan(0);
        expect(scanner.license).toBeTruthy();
        expect(scanner.pricingModel).toBeTruthy();
      }
    });

    it('scanner names are unique', () => {
      const names = FALLBACK_SCANNER_DATA.scanners.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('categories are from known set', () => {
      const knownCategories = new Set([
        'sast',
        'sca',
        'secrets',
        'container',
        'iac',
        'dast',
        'license',
        'sbom',
        'api',
        'image-currency',
      ]);
      for (const scanner of FALLBACK_SCANNER_DATA.scanners) {
        for (const cat of scanner.categories) {
          expect(knownCategories.has(cat)).toBe(true);
        }
      }
    });

    it('includes key scanners: semgrep, grype, osv-scanner, gitleaks', () => {
      const names = new Set(FALLBACK_SCANNER_DATA.scanners.map((s) => s.name));
      expect(names.has('semgrep')).toBe(true);
      expect(names.has('grype')).toBe(true);
      expect(names.has('osv-scanner')).toBe(true);
      expect(names.has('gitleaks')).toBe(true);
    });

    it('pricing models are from known set', () => {
      const knownPricing = new Set(['free', 'freemium', 'commercial']);
      for (const scanner of FALLBACK_SCANNER_DATA.scanners) {
        expect(knownPricing.has(scanner.pricingModel)).toBe(true);
      }
    });
  });

  describe('languageMap', () => {
    it('has at least 10 languages', () => {
      expect(Object.keys(FALLBACK_SCANNER_DATA.languageMap).length).toBeGreaterThanOrEqual(10);
    });

    it('includes major languages', () => {
      const langs = Object.keys(FALLBACK_SCANNER_DATA.languageMap);
      expect(langs).toContain('TypeScript');
      expect(langs).toContain('Python');
      expect(langs).toContain('Go');
      expect(langs).toContain('Java');
      expect(langs).toContain('Rust');
    });

    it('every language entry has sast, sca, and secrets arrays', () => {
      for (const [lang, entry] of Object.entries(FALLBACK_SCANNER_DATA.languageMap)) {
        expect(Array.isArray(entry.sast)).toBe(true);
        expect(Array.isArray(entry.sca)).toBe(true);
        expect(Array.isArray(entry.secrets)).toBe(true);
        // SAST should have at least one scanner for every language
        expect(entry.sast.length).toBeGreaterThan(0);
        // Secrets should have at least gitleaks
        if (lang !== 'Shell') {
          expect(entry.secrets.length).toBeGreaterThan(0);
        }
      }
    });

    it('referenced scanners exist in the scanners list', () => {
      const knownScanners = new Set(FALLBACK_SCANNER_DATA.scanners.map((s) => s.name));
      for (const entry of Object.values(FALLBACK_SCANNER_DATA.languageMap)) {
        for (const name of [...entry.sast, ...entry.sca, ...entry.secrets]) {
          expect(knownScanners.has(name)).toBe(true);
        }
      }
    });
  });
});

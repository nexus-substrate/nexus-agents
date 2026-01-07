/**
 * Path Traversal Prevention Tests
 *
 * Verifies that all file operation entry points properly prevent
 * path traversal attacks (e.g., ../../../etc/passwd).
 *
 * (Source: OWASP Path Traversal, Issue #108)
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

// Import path validation functions from various modules
import { loadTemplateFile } from '../../workflows/template-loader.js';
import { SecurityError } from '../../core/index.js';

describe('Path Traversal Prevention', () => {
  // These paths attempt to escape the allowed root directory
  const MALICIOUS_PATHS = [
    '../../../etc/passwd',
    '../../../../../../../etc/passwd',
    'foo/../../../etc/passwd',
    './foo/../../../etc/passwd',
    'templates/../../etc/passwd',
    'workflows/../../../etc/passwd',
  ];

  // Paths that should be blocked but aren't relative traversals
  const ABSOLUTE_PATHS = ['/etc/passwd', 'C:\\Windows\\System32\\config\\SAM'];

  describe('Template Loader - loadTemplateFile', () => {
    const templatesDir = '/tmp/test-templates';

    MALICIOUS_PATHS.forEach((maliciousPath) => {
      it(`should reject path traversal: ${maliciousPath}`, async () => {
        const result = await loadTemplateFile(maliciousPath, templatesDir);

        // Should fail with SecurityError for traversal attempts
        expect(result.ok).toBe(false);
        if (!result.ok) {
          // Path traversal should be caught with SecurityError
          const isSecurityError = result.error instanceof SecurityError;
          const errorMessage = result.error.message.toLowerCase();
          const isPathTraversalCaught =
            errorMessage.includes('traversal') || errorMessage.includes('escape');

          // Either it's a SecurityError or mentions traversal
          expect(isSecurityError || isPathTraversalCaught).toBe(true);
        }
      });
    });

    it('should reject absolute paths when allowedRoot is specified', async () => {
      for (const absolutePath of ABSOLUTE_PATHS) {
        const result = await loadTemplateFile(absolutePath, templatesDir);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          // Should be blocked for being outside allowed root
          const isSecurityError = result.error instanceof SecurityError;
          const errorMessage = result.error.message.toLowerCase();
          const isBlocked =
            isSecurityError ||
            errorMessage.includes('escape') ||
            errorMessage.includes('traversal') ||
            errorMessage.includes('enoent'); // May fail to find if path doesn't exist

          expect(isBlocked).toBe(true);
        }
      }
    });

    it('should allow valid paths within templates directory', async () => {
      const validPath = 'code-review.yaml';
      // This will fail because file doesn't exist, but NOT due to path traversal
      const result = await loadTemplateFile(validPath, templatesDir);

      if (!result.ok) {
        // Should fail due to file not found, NOT security error
        expect(result.error).not.toBeInstanceOf(SecurityError);
        expect(result.error.message.toLowerCase()).not.toContain('traversal');
      }
    });

    it('should allow nested valid paths', async () => {
      const validPath = 'subdir/workflow.yaml';
      const result = await loadTemplateFile(validPath, templatesDir);

      if (!result.ok) {
        // Should fail due to file not found, NOT security error
        expect(result.error).not.toBeInstanceOf(SecurityError);
      }
    });
  });

  describe('Path Normalization Edge Cases', () => {
    it('should handle extremely long paths', () => {
      const longPath = 'a'.repeat(1000) + '.yaml';
      expect(() => path.resolve('/tmp/templates', longPath)).not.toThrow();
    });

    it('should handle unicode in paths', () => {
      const unicodePath = 'workflow-日本語.yaml';
      const resolved = path.resolve('/tmp/templates', unicodePath);
      expect(resolved.includes('日本語')).toBe(true);
    });

    it('should handle double slashes in paths', () => {
      const doublePath = 'templates//workflow.yaml';
      const resolved = path.resolve('/tmp/templates', doublePath);
      // Double slashes should be normalized
      expect(resolved).toBe('/tmp/templates/templates/workflow.yaml');
    });

    it('should handle dot segments correctly', () => {
      // Single dot should stay in same directory
      const dotPath = './workflow.yaml';
      const resolved = path.resolve('/tmp/templates', dotPath);
      expect(resolved).toBe('/tmp/templates/workflow.yaml');
    });
  });

  describe('Symlink Following (Documentation)', () => {
    it('should document symlink behavior - path.resolve does not follow symlinks', () => {
      // Note: path.resolve does not follow symlinks, it just resolves the path
      // If symlink protection is needed, use fs.realpath before validation
      const symlinkedPath = 'safe-link';
      const resolved = path.resolve('/tmp/templates', symlinkedPath);
      expect(resolved).toBe('/tmp/templates/safe-link');
    });
  });

  describe('Path Resolution Security', () => {
    it('should demonstrate how validatePath works', () => {
      const allowedRoot = '/tmp/templates';

      // Safe path
      const safePath = path.resolve(allowedRoot, 'workflow.yaml');
      expect(safePath.startsWith(allowedRoot)).toBe(true);

      // Dangerous path gets normalized
      const dangerousPath = path.resolve(allowedRoot, '../../../etc/passwd');
      // This resolves to something like /etc/passwd
      expect(dangerousPath.startsWith(allowedRoot)).toBe(false);
    });

    it('should show that path.resolve normalizes traversal attempts', () => {
      const root = '/app/data';

      // Standard traversal patterns that escape root
      const escapingAttacks = ['../../../etc/passwd', 'subdir/../../../etc/passwd'];

      for (const attack of escapingAttacks) {
        const resolved = path.resolve(root, attack);
        // These should resolve outside the root
        expect(resolved.startsWith(root)).toBe(false);
      }

      // URL encoded patterns are NOT normalized by path.resolve
      // They remain as literal filenames
      const encodedAttack = '..%2f..%2f..%2fetc/passwd';
      const resolvedEncoded = path.resolve(root, encodedAttack);
      // URL encoded stays within root as literal directory name
      expect(resolvedEncoded.startsWith(root)).toBe(true);
    });
  });
});

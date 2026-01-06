/**
 * nexus-agents/context - Memory Markdown Helper
 *
 * Handles Markdown file export for high-importance memories.
 *
 * @module context/memory-markdown
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import type { MemoryMetadata } from './memory-backend-types.js';

/**
 * Helper class for Markdown memory file operations.
 */
export class MemoryMarkdownHelper {
  constructor(
    private readonly markdownDir: string,
    private readonly logger: ILogger
  ) {}

  /**
   * Ensure the Markdown export directory exists.
   */
  ensureDir(): void {
    if (!fs.existsSync(this.markdownDir)) {
      fs.mkdirSync(this.markdownDir, { recursive: true });
      this.logger.debug('Created Markdown directory', { path: this.markdownDir });
    }
  }

  /**
   * Write a memory entry to Markdown file.
   */
  async write(
    key: string,
    value: unknown,
    metadata: MemoryMetadata,
    createdAt: Date
  ): Promise<void> {
    const filename = this.keyToFilename(key);
    const filepath = path.join(this.markdownDir, filename);

    const content = this.format(key, value, metadata, createdAt);

    try {
      await fs.promises.writeFile(filepath, content, 'utf-8');
      this.logger.debug('Wrote Markdown file', { key, filepath });
    } catch (error) {
      this.logger.warn('Failed to write Markdown file', { key, filepath, error });
      // Don't throw - Markdown export is secondary to SQLite storage
    }
  }

  /**
   * Delete a Markdown file for a memory.
   */
  delete(key: string): void {
    const filename = this.keyToFilename(key);
    const filepath = path.join(this.markdownDir, filename);

    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        this.logger.debug('Deleted Markdown file', { key, filepath });
      }
    } catch (error) {
      this.logger.warn('Failed to delete Markdown file', { key, filepath, error });
    }
  }

  /**
   * Convert a memory key to a safe filename.
   */
  private keyToFilename(key: string): string {
    // Replace unsafe characters with underscores
    const safeKey = key
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 200); // Limit filename length

    return `${safeKey}.md`;
  }

  /**
   * Format a memory entry as Markdown.
   */
  private format(key: string, value: unknown, metadata: MemoryMetadata, createdAt: Date): string {
    const lines: string[] = [
      `# Memory: ${key}`,
      '',
      '## Metadata',
      '',
      `- **Importance:** ${metadata.importance}`,
      `- **Created:** ${createdAt.toISOString()}`,
    ];

    if (metadata.tags !== undefined && metadata.tags.length > 0) {
      lines.push(`- **Tags:** ${metadata.tags.join(', ')}`);
    }

    if (metadata.ttl !== undefined) {
      const expiresAt = new Date(createdAt.getTime() + metadata.ttl);
      lines.push(`- **Expires:** ${expiresAt.toISOString()}`);
    }

    lines.push('', '## Value', '');

    // Format value based on type
    if (typeof value === 'string') {
      lines.push(value);
    } else if (value === null) {
      lines.push('`null`');
    } else if (typeof value === 'object') {
      lines.push('```json', JSON.stringify(value, null, 2), '```');
    } else {
      // For primitives (number, boolean, etc.), convert to string representation
      const stringValue =
        typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
      lines.push(`\`${stringValue}\``);
    }

    lines.push('');

    return lines.join('\n');
  }
}

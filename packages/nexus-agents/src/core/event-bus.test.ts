/**
 * Tests for core/event-bus.ts (Issue #5129 Item 1).
 *
 * Verifies that the bottom-layer event bus implementation lives in core/
 * with zero upward imports into agents/, and that singleton identity and
 * event routing contracts are preserved.
 *
 * @module core/event-bus.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CollaborationEventBus,
  createEvent,
  getGlobalEventBus,
  resetGlobalEventBus,
  generateCorrelationId,
  createChildCorrelationId,
  EventTopics,
} from './event-bus.js';
import {
  CollaborationEventBus as CollaborationBusFromAgents,
  getGlobalEventBus as getGlobalEventBusFromAgents,
  resetGlobalEventBus as resetGlobalEventBusFromAgents,
} from '../agents/collaboration/event-bus.js';

describe('core/event-bus', () => {
  beforeEach(() => {
    resetGlobalEventBus();
    resetGlobalEventBusFromAgents();
  });

  afterEach(() => {
    resetGlobalEventBus();
    resetGlobalEventBusFromAgents();
  });

  it('exports all expected runtime constructors and helpers from core', () => {
    expect(typeof CollaborationEventBus).toBe('function');
    expect(typeof createEvent).toBe('function');
    expect(typeof getGlobalEventBus).toBe('function');
    expect(typeof resetGlobalEventBus).toBe('function');
    expect(typeof generateCorrelationId).toBe('function');
    expect(typeof createChildCorrelationId).toBe('function');
    expect(typeof EventTopics).toBe('object');
    expect(EventTopics.SESSION_CREATED).toBe('session.created');
  });

  it('provides singleton identity across core and agents entry points', () => {
    const coreBus = getGlobalEventBus();
    const agentsBus = getGlobalEventBusFromAgents();
    expect(coreBus).toBe(agentsBus);
    expect(coreBus).toBeInstanceOf(CollaborationEventBus);
    expect(agentsBus).toBeInstanceOf(CollaborationBusFromAgents);
  });

  it('subscribes and emits events through the core bus implementation', () => {
    const bus = new CollaborationEventBus();
    const received: string[] = [];

    bus.subscribe('task.*', (event) => {
      received.push(event.topic);
    });

    const event = createEvent('task.completed', { taskId: 'task-123' });
    bus.emit(event);

    expect(received).toEqual(['task.completed']);
    const history = bus.getHistory({ topic: 'task.*' });
    expect(history).toHaveLength(1);
    expect(history[0]?.eventId).toBe(event.eventId);
  });

  it('enforces layer separation: no file in src/core imports from ../agents/', () => {
    const coreDir = path.resolve(__dirname);
    const files = fs
      .readdirSync(coreDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    const upwardViolations: Array<{ file: string; line: string }> = [];
    const agentImportPattern = /from\s+['"][^'"]*\/agents\//;

    for (const file of files) {
      const content = fs.readFileSync(path.join(coreDir, file), 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (agentImportPattern.test(line)) {
          upwardViolations.push({ file, line: `L${String(i + 1)}: ${line.trim()}` });
        }
      }
    }

    expect(
      upwardViolations,
      `Found upward layer breach(es) from core into agents: ${JSON.stringify(upwardViolations, null, 2)}`
    ).toEqual([]);
  });
});

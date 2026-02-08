/**
 * useEventBus — Hook for subscribing to pipeline events.
 *
 * Subscribes to the nexus-agents EventBus and accumulates matching
 * events. Automatically unsubscribes on unmount.
 *
 * @module tui/hooks/use-event-bus
 */

import { useState, useEffect, useRef } from 'react';

/** Minimal event shape matching PipelineEvent. */
interface BusEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly [key: string]: unknown;
}

/** Minimal filter shape matching EventFilter. */
interface BusFilter {
  readonly type?: string | readonly string[];
}

/** Minimal bus interface matching IEventBus. */
interface EventBusLike {
  subscribe(filter: BusFilter, handler: (event: BusEvent) => void): () => void;
}

interface UseEventBusOptions {
  readonly bus: EventBusLike | null;
  readonly filter: BusFilter;
  readonly maxEvents?: number;
}

/** Subscribe to EventBus events, returning accumulated events. */
export function useEventBus(options: UseEventBusOptions): readonly BusEvent[] {
  const { bus, filter, maxEvents = 50 } = options;
  const [events, setEvents] = useState<readonly BusEvent[]>([]);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    if (bus === null) return;

    const unsubscribe = bus.subscribe(filterRef.current, (event: BusEvent) => {
      setEvents((prev) => [...prev.slice(-(maxEvents - 1)), event]);
    });

    return unsubscribe;
  }, [bus, maxEvents]);

  return events;
}

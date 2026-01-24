/**
 * Circular Buffer
 *
 * O(1) push and eviction for bounded collections.
 * Used by EventBus history to avoid O(n) array.shift() operations.
 *
 * @module agents/collaboration/circular-buffer
 * @see Issue #407
 */

/**
 * A fixed-capacity circular buffer with O(1) push and O(1) oldest-eviction.
 *
 * When the buffer is full, new items overwrite the oldest items.
 * Items are always returned in insertion order (oldest to newest).
 */
export class CircularBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0; // Points to oldest item (or next write position when empty)
  private tail = 0; // Points to next write position
  private _size = 0;

  /**
   * Creates a new circular buffer with the specified capacity.
   *
   * @param capacity - Maximum number of items to store
   * @throws Error if capacity is less than 1
   */
  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('CircularBuffer capacity must be at least 1');
    }
    this.buffer = new Array<T | undefined>(capacity);
  }

  /**
   * Returns the number of items currently in the buffer.
   */
  get size(): number {
    return this._size;
  }

  /**
   * Returns true if the buffer is empty.
   */
  get isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Returns true if the buffer is at capacity.
   */
  get isFull(): boolean {
    return this._size === this.capacity;
  }

  /**
   * Adds an item to the buffer.
   *
   * If the buffer is full, the oldest item is overwritten.
   * This operation is O(1).
   *
   * @param item - Item to add
   */
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this._size < this.capacity) {
      this._size++;
    } else {
      // Buffer was full, oldest item was overwritten
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Removes all items from the buffer.
   * This operation is O(n) to allow garbage collection of items.
   */
  clear(): void {
    // Clear references to allow GC
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = undefined;
    }
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }

  /**
   * Returns all items in insertion order (oldest to newest).
   * This operation is O(n) where n is the number of items.
   *
   * @returns Array of items in insertion order
   */
  toArray(): T[] {
    if (this._size === 0) {
      return [];
    }

    const result: T[] = [];
    let readIndex = this.head;

    for (let i = 0; i < this._size; i++) {
      result.push(this.buffer[readIndex] as T);
      readIndex = (readIndex + 1) % this.capacity;
    }

    return result;
  }

  /**
   * Iterates over items in insertion order (oldest to newest).
   */
  *[Symbol.iterator](): Iterator<T> {
    let readIndex = this.head;
    for (let i = 0; i < this._size; i++) {
      yield this.buffer[readIndex] as T;
      readIndex = (readIndex + 1) % this.capacity;
    }
  }

  /**
   * Returns the most recently added item, or undefined if empty.
   * This operation is O(1).
   */
  peekNewest(): T | undefined {
    if (this._size === 0) {
      return undefined;
    }
    const newestIndex = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[newestIndex];
  }

  /**
   * Returns the oldest item in the buffer, or undefined if empty.
   * This operation is O(1).
   */
  peekOldest(): T | undefined {
    if (this._size === 0) {
      return undefined;
    }
    return this.buffer[this.head];
  }
}

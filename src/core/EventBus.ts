/**
 * EventBus — The nervous system of Mindcore.
 * All systems communicate by emitting and listening to typed events.
 * This is the backbone of modularity: systems never reference each other directly.
 */

export type EventHandler<T = any> = (payload: T) => void;

export interface GameEvent {
  type: string;
  timestamp: number;
  [key: string]: any;
}

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private history: GameEvent[] = [];
  private historyLimit = 1000;

  /**
   * Subscribe to an event type. Returns an unsubscribe function.
   */
  on<T = any>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event type, but only fire once.
   */
  once<T = any>(eventType: string, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = (payload) => {
      unsub();
      handler(payload);
    };
    const unsub = this.on(eventType, wrapper);
    return unsub;
  }

  /**
   * Emit an event. All registered handlers fire synchronously.
   */
  emit(eventType: string, payload: Record<string, any> = {}): void {
    const event: GameEvent = {
      type: eventType,
      timestamp: performance.now(),
      ...payload,
    };

    // Record history (for replay, debugging, AI context)
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Error in handler for "${eventType}":`, err);
        }
      }
    }
  }

  /**
   * Get recent event history (useful for AI context, debugging, save states)
   */
  getHistory(limit?: number): GameEvent[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Clear all handlers (used on world reset)
   */
  clear(): void {
    this.handlers.clear();
    this.history = [];
  }
}

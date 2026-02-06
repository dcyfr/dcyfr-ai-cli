/**
 * Daemon Event Bus — pub/sub event system for daemon components
 *
 * Provides typed event emission and subscription for coordinating
 * the daemon's internal components (scheduler, watcher, queue, process).
 *
 * @module @dcyfr/ai-cli/daemon/events
 */

import type { DaemonEventType, DaemonEvent, DaemonEventListener } from './types.js';

/**
 * Simple in-process event bus for daemon component coordination
 */
export class EventBus {
  private listeners = new Map<DaemonEventType, Set<DaemonEventListener>>();
  private globalListeners = new Set<DaemonEventListener>();

  /**
   * Subscribe to a specific event type
   */
  on(type: DaemonEventType, listener: DaemonEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events
   */
  onAny(listener: DaemonEventListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  emit(type: DaemonEventType, data: Record<string, unknown> = {}): void {
    const event: DaemonEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
          // Don't let a listener error crash the bus
        }
      }
    }

    // Notify global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch {
        // Don't let a listener error crash the bus
      }
    }
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }

  /**
   * Get count of listeners for a specific event type
   */
  listenerCount(type: DaemonEventType): number {
    return (this.listeners.get(type)?.size ?? 0) + this.globalListeners.size;
  }
}

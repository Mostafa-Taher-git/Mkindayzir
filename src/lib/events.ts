type EventMap = {
  'work_item.created': { workItem: unknown; userId: string };
  'work_item.updated': { workItem: unknown; changes: Record<string, any>; userId: string };
  'work_item.deleted': { workItemId: string; userId: string };
  'card.moved': { card: unknown; fromColumn: string; toColumn: string; userId: string };
  'vault_note.published': { note: unknown; userId: string };
  'comment.created': { comment: unknown; userId: string };
  'user.presence': { userId: string; entityType: string; entityId: string; action: 'join' | 'leave' };
};

type EventCallback<T> = (data: T) => void;

class EventBus {
  private listeners = new Map<string, Set<EventCallback<any>>>();

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)!.delete(callback);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
export type { EventMap };

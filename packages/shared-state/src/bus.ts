import type { DomainEvent } from "@platform/contracts";

type EventType = DomainEvent["type"];
type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;
type Handler<T extends EventType> = (event: EventOf<T>) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends EventType>(type: T, handler: Handler<T>): () => void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Set<Handler<EventType>>>();

  async publish(event: DomainEvent): Promise<void> {
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe<T extends EventType>(type: T, handler: Handler<T>): () => void {
    const existing = this.handlers.get(type) ?? new Set<Handler<EventType>>();
    const wrapped = handler as unknown as Handler<EventType>;
    existing.add(wrapped);
    this.handlers.set(type, existing);
    return () => {
      existing.delete(wrapped);
    };
  }
}

export type Type = "subscribe" | "next" | "error" | "unsubscribe" | "completed";
export type Source = { fileName: string; lineNumber: number; columnNumber: number };
type TypedEvent<T extends Type> = { type: T };

export type SubscribeEvent = Source & TypedEvent<"subscribe">;
export type NextEvent = Source & TypedEvent<"next"> & { value: string };
export type ErrorEvent = Source & TypedEvent<"error"> & { error: string };
export type UnsubscribeEvent = Source & TypedEvent<"unsubscribe">;
export type CompletedEvent = Source & TypedEvent<"completed">;
export type Event = SubscribeEvent | NextEvent | ErrorEvent | UnsubscribeEvent | CompletedEvent;

interface EventPattern<T> {
  Subscribe: (e: SubscribeEvent) => T;
  Next: (e: NextEvent) => T;
  Error: (e: ErrorEvent) => T;
  Unsubscribe: (e: UnsubscribeEvent) => T;
  Completed: (e: CompletedEvent) => T;
}

export function match(e: Event): <T>(p: EventPattern<T>) => T {
  return (p) => {
    switch (e.type) {
      case "subscribe":
        return p.Subscribe(e);
      case "next":
        return p.Next(e);
      case "error":
        return p.Error(e);
      case "unsubscribe":
        return p.Unsubscribe(e);
      case "completed":
        return p.Completed(e);
    }
  };
}

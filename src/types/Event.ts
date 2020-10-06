export type EventType = "subscribe" | "emit" | "error" | "unsubscribe" | "completed";
export type EventSource = { source: string };
type TypedEvent<T extends EventType> = { type: T };

export type SubscribeEvent = EventSource & TypedEvent<"subscribe">;
export type EmitEvent = EventSource & TypedEvent<"emit"> & { value: string };
export type ErrorEvent = EventSource & TypedEvent<"error"> & { error: string };
export type UnsubscribeEvent = EventSource & TypedEvent<"unsubscribe">;
export type CompletedEvent = EventSource & TypedEvent<"completed">;
export type Event = SubscribeEvent | EmitEvent | ErrorEvent | UnsubscribeEvent | CompletedEvent;

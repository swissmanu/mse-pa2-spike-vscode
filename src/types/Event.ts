export type EventType = "subscribe" | "next" | "error" | "unsubscribe" | "completed";
export type EventSource = { fileName: string; lineNumber: number; columnNumber: number };
type TypedEvent<T extends EventType> = { type: T };

export type SubscribeEvent = EventSource & TypedEvent<"subscribe">;
export type NextEvent = EventSource & TypedEvent<"next"> & { value: string };
export type ErrorEvent = EventSource & TypedEvent<"error"> & { error: string };
export type UnsubscribeEvent = EventSource & TypedEvent<"unsubscribe">;
export type CompletedEvent = EventSource & TypedEvent<"completed">;
export type Event = SubscribeEvent | NextEvent | ErrorEvent | UnsubscribeEvent | CompletedEvent;

import { MonoTypeOperatorFunction, Observable, OperatorFunction, Subject } from "rxjs";
import * as RxOps from "rxjs/operators";
import * as WebSocket from "isomorphic-ws";

declare global {
  namespace NodeJS {
    interface Global {
      hook: Observable<any>;
    }
  }
  interface Window {
    hook: Observable<any>;
  }
}

const sendTelemetry = (() => {
  const hook = new Subject();
  if (typeof window !== "undefined") {
    window.hook = hook.asObservable();
  }
  if (typeof global !== "undefined") {
    global.hook = hook.asObservable();
  }

  const webSocket = new WebSocket("ws://localhost:9230");
  webSocket.onopen = () => {
    console.log("open");
    hook.subscribe((v) => webSocket.send(JSON.stringify(v)));
  };

  type EventType = "subscribe" | "emit" | "error" | "unsubscribe" | "completed";
  type EventSource = { source: string };
  type TypedEvent<T extends EventType> = { type: T };
  type SubscribeEvent = EventSource & TypedEvent<"subscribe">;
  type EmitEvent = EventSource & TypedEvent<"emit"> & { value: string };
  type ErrorEvent = EventSource & TypedEvent<"error"> & { error: string };
  type UnsubscribeEvent = EventSource & TypedEvent<"unsubscribe">;
  type CompletedEvent = EventSource & TypedEvent<"completed">;
  type Event = SubscribeEvent | EmitEvent | ErrorEvent | UnsubscribeEvent | CompletedEvent;

  return (event: Event) => {
    hook.next(event);
  };
})();

export function map<T, R>(project: (value: T, index: number) => R): OperatorFunction<T, R> {
  return (o) => {
    sendTelemetry({ type: "subscribe", source: "map" });

    return o.pipe(
      RxOps.tap((value) => sendTelemetry({ type: "emit", source: "map", value: JSON.stringify(value) })),
      RxOps.map(project),
      RxOps.finalize(() => sendTelemetry({ type: "unsubscribe", source: "map" }))
    );
  };
}

export function take<T>(n: number): MonoTypeOperatorFunction<T> {
  return (o) => {
    sendTelemetry({ type: "subscribe", source: "take" });

    return o.pipe(
      RxOps.tap((value) => sendTelemetry({ type: "emit", source: "take", value: JSON.stringify(value) })),
      RxOps.take(n),
      RxOps.finalize(() => sendTelemetry({ type: "unsubscribe", source: "take" }))
    );
  };
}

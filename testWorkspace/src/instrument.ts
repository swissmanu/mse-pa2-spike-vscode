import { Observable, OperatorFunction, Subject } from "rxjs";
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

export function map<T, R>(project: (value: T, index: number) => R): OperatorFunction<T, R> {
  return (o) => {
    hook.next({ event: "subscribe" });

    return o.pipe(
      RxOps.tap((value) => hook.next({ event: "emit", value })),
      RxOps.map(project),
      RxOps.finalize(() => hook.next({ event: "unsubscribe" }))
    );
  };
}

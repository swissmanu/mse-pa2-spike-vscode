const { Subject } = require("rxjs");
const RxOps = require("rxjs/operators");
const WebSocket = require("ws");

const hook = new Subject();
global.hook = hook.asObservable();

module.exports.map = function map(project) {
  return (o) => {
    hook.next({ event: "subscribe" });

    return o.pipe(
      RxOps.tap((value) => hook.next({ event: "emit", value })),
      RxOps.map(project),
      RxOps.finalize(() => hook.next({ event: "unsubscribe" }))
    );
  };
};

const webSocket = new WebSocket("ws://localhost:9230");
webSocket.on("open", () => {
  console.log("open");
  webSocket.send("test");
  hook.subscribe((v) => webSocket.send(JSON.stringify(v)));
});
webSocket.on("error", (e) => {
  console.error(e);
});

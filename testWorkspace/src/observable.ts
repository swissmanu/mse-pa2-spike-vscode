import { interval } from "rxjs";
import { take } from "rxjs/operators";
import { map } from "./instrument";

export function exampleObservable() {
  return interval(500).pipe(
    take(4),
    map((i) => i * 2)
  );
}

const { interval } = require("rxjs");
const { take } = require("rxjs/operators");
const { map } = require("./instrument");

interval(500)
  .pipe(
    take(4),
    map((i) => i * 2)
  )
  .subscribe(console.log);

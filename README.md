# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Mzikky/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Mzikky/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every case's `{text, header}` with exactly the reference's `{columns, rows, errors}` — same broken-row policy (BOM, stray CRs, unterminated quotes, quote junk, short and long rows), read with native `indexOf` scans and `slice` instead of one character at a time. On the practice set (6 files, 10.2M characters) it reads at ~120 MB/s, about 7× the reference's CPU time.

## Run it

```sh
MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
```

`main.ts` reads `cases.json` from the input dir, answers each case with `run()` from `solve.js`, and writes `answers.json` to the output dir. Node 22 or later, no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=webf24xb&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

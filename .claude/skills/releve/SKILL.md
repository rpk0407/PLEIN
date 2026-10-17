---
name: releve
description: Read the dashboard and the lights. Takes one on-chain and fuel reading, compares it to live.json, proposes light changes from evidence, and writes the Sunday report against the thesis metrics. Use on launch day after the opening, every Sunday, and when a number looks wrong.
argument-hint: "[--audit to include the launch self-audit]"
---

# /releve: read the meter

Options: $ARGUMENTS

## 1. Take the readings (read-only)
Run and keep the raw output:
- `npm run releve -- --json` (one `/api/chain` reading: supply, burned, authorities, curve, réservoir,
  creator vault, holders, market, `errors`)
- `npm run prix -- --json` (the latest official diesel price; it does not write unless `--write`)
- Read `public/config.js` (`official`), `public/live.json` (contract, wallets, lights, `asOf`),
  `public/tickets/index.json` if it exists.
- With `--audit`, also `npm run audit -- --markdown` (creation slot, same-slot buyers, early buyers,
  top 10, authorities, suggested light states).
If a command fails or Node is missing, say so and stop that branch; do not fill the gap.

## 2. Interpret (releveur)
Call `releveur` with the raw output. It must:
- list every figure with source and `asOf`, flag stale and partial readings (`errors`), keep `null`
  as "not read";
- compare the readings with `live.json`: the lights it may set from the chain are `mint` (creation
  authority revoked), `freeze` (freeze authority revoked) and `top10` (30 percent line), per the table
  in `docs/interfaces.md`; `team`, `lp`, `bundles` and the stamp stay a human's call after the audit;
- check `official` in `config.js` is the latest weekly survey (ask `enqueteur` if unsure);
- propose the exact `live.json` edit for any light that changed, with the evidence.

## 3. Sunday report (on Sundays, or when asked)
`releveur` fills the thesis table (metric, target by 7 November, value or "no data", verdict, falsifier
hit?). Cookie-free analytics are an open decision: without them, the visit-based rows say "no data".
`releveur` saves it as `docs/releves/YYYY-MM-DD.md` (the Paris date of the Sunday) on a branch, so
next week's session can read it; the other founder approves the PR. It holds readings only. Then
`chef-de-station` reads it and updates `docs/objectifs.md`; `vigie` gets any anomaly.

## 4. Gate and hand-off
A light is a public claim ("Création révoquée" is a statement about the chain). Before a founder
opens the PR, run skill `critique --quick` on the proposed `live.json` diff and the raw readings:
`controleur-technique` (does the evidence say what the label will say) and `ligne-continue` (is the
wording a fact, not a promise). A NO-GO from either stands.

Show the founders the report, the critics' verdicts and the proposed `live.json` edits. Light changes
go through a branch and a PR the other founder approves (the page shows them to the public). Never
edit a number in `live.json` to look better than the reading.

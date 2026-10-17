---
name: critique
description: Run the six Opus critics in parallel on a target (a diff, a file, a PR number, a text, an idea) and merge their verdicts. Use before anything ships. Add --quick to run only the critics the target needs.
argument-hint: "<PR number | file | branch | text | idea> [--quick]"
---

# /critique: the Opus critics, in parallel

Target: $ARGUMENTS

## 1. Make the target concrete
Resolve it to text the critics can read, and write a five-line brief: what it is, what it is for,
which files, what changed, what the founders are about to do with it.
- A PR number: `gh pr view <n>` and `gh pr diff <n>`.
- A branch or "my changes": `git diff main...HEAD` and `git status`.
- A file: read it. A text or an idea: use it as given.
Do not paraphrase the content when you brief; give them the content itself.

## 2. Pick the critics
Default: all six, in one message, as parallel Agent calls with the same brief:
`controleur-technique`, `ligne-continue`, `economiste`, `critique-degen`, `atelier-idees`,
`chef-de-station`.

With `--quick`, run only the ones the target touches:
- code, `api/`, workflows, addresses, live.json: `controleur-technique` and `ligne-continue`
- anything the public reads (copy, posts, images, pages): `ligne-continue` and `critique-degen`
- the formula, fees, order, execution, new engines: `economiste` and `ligne-continue`
- an idea or a plan: `atelier-idees`, `economiste`, `ligne-continue`, then `chef-de-station`
Say which you skipped and why. Skip only critics that cannot have an opinion.

Ask each for its own format (VERDICT / blockers / evidence / what would change my mind). Their angle:
- `controleur-technique`: can it be broken, does it touch non-negotiable 1
- `ligne-continue`: does it cross a French legal or honesty line
- `economiste`: do the numbers and incentives hold, who pays, what if volume is a tenth
- `critique-degen`: will the scene respect it, what is the FUD, what is cringe
- `atelier-idees`: is there a bolder, cleaner way to get the same result, what is missing
- `chef-de-station`: does it move a metric in `docs/objectifs.md`, is it worth the founders' time

## 3. Merge
One table: critic, verdict, blockers, top risk. Then the merged verdict:
- Any NO-GO from `controleur-technique`, `ligne-continue` or `economiste` makes the merged verdict
  NO-GO. Only the founders, in writing, can override it. A `ligne-continue` override is recorded in
  the founders' private document (date, text, both names): the public issue says only "overridden
  by both founders", because that critic's reasoning is legal screening and stays out of the repo.
- `critique-degen` and `atelier-idees` are advisory, except a severe cringe or FUD finding, which
  makes it GO-IF.
- `chef-de-station` composes the final line: GO, GO-IF (the exact conditions), or NO-GO (the exact
  blockers and who fixes them). Its step 2 pass is its own angle on the target; for the final line
  call it once more with the table, so it sees every verdict. It cannot lift a NO-GO.
List disagreements between critics openly; do not average them.

## 4. Hand-off
Send each blocker to its owner agent. After the fix, re-run only the critics that blocked.

**The repo is public, and so is every PR description and `@claude` reply.** Attach to the PR only
the verdict table: critic, verdict, and the technical or copy blockers in a line each. Keep out of
it `ligne-continue`'s reasoning and its questions for the lawyer, `economiste`'s attack analysis,
`atelier-idees`' strategy and anything about keys, wallets or funds: show those to the founders in
the conversation and keep them in the private document. Run the full critique in a local Claude Code
session, not through `@claude`, which would post it. Do not merge, post or sign anything yourself.

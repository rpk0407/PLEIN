---
name: station
description: The dispatcher. Reads the goal tree, git state, open PRs, issues and workflow runs, decides the next actions, and runs the right agents in parallel where their files do not overlap. Use at the start of a session ("what now?"), after a merge, or when a founder says "run the station".
argument-hint: "[optional focus, e.g. launch, plein, site, security]"
---

# /station: what do we do now

Focus requested: $ARGUMENTS (empty means everything).

## 1. Read the state (cheap, read-only, do it yourself)
Run, in parallel where you can:
- `git status --short`, `git log --oneline -15`, `git branch --show-current`
- `gh pr list --state open`, `gh issue list --state open --limit 30`, `gh run list --limit 10`
  (if `gh` is not logged in, say so and continue without)
- `npm test` (needs Node 20+ on PATH; report the real result)
- Read `docs/objectifs.md` (the goal tree). If it is missing, the first action is to have
  chef-de-station draft it.
- Note the time in Paris and the phase: before launch (Saturday 17 October 2026, 15:30), launch day,
  or the weekly cycle (next plein Saturday 18:00; price frozen 17:45).

## 2. Decide
Call `chef-de-station` (Opus) with the digest above. Ask for the board: now / next / blocked on a
founder / waiting for the second key, with for each task the owner agent, the files it touches, its
dependencies, the critic gate, and the metric it moves. Reject any task that moves no metric.

## 3. Run
- Group the "now" tasks by the files they touch. Tasks with disjoint files run in parallel: issue
  all their Agent calls in one message. Tasks that share a file run one after the other.
- Owners: `mecano-chaine` (api, readers, and the scripts `plein.mjs`, `official-price.mjs`,
  `_gate.mjs`, `vigie.mjs`, plus `mcp/`; economiste and controleur-technique gate them),
  `carrossier` (site; not `formula.js` or `fees.js`, which change only through `economiste`),
  `automaticien` (workflows, Telegram), `imprimeur` (tickets, totems, `scripts/templates/`),
  `releveur` (readings, `docs/releves/`), `vigie` (watch), `enqueteur` (fact-checks; hands back
  `docs/registre-tier2.md`), `pompiste` (words, and `docs/culture.md` through `critique-degen` and
  `ligne-continue`), `tresorier` (Saturday), `chef-de-station` (`docs/objectifs.md`,
  `docs/interfaces.md`, `docs/registre-tier2.md`), `economiste` (`docs/moteur.md`).
- Anything user-facing, money-adjacent, or touching `api/`, workflows, addresses, the formula or
  public copy goes through skill `critique` (or its `--quick` form) before it is proposed as a PR.
- `/lancement`, `/plein` and `/post` can only be started by a founder typing them (they touch money
  and public words, so Claude cannot load them on its own). Name them in the report with the step
  to type; do not try to run them yourself, and do the underlying reads with the agents instead.

## 4. Report
Give the founders: what ran, what changed (files, branch), what the critics said (verdict per
critic), what is blocked, and the exact things they must do by hand (approve a PR, sign, claim,
post, set a secret), with the time. Open a branch and a PR for any change; never push to `main`,
never merge, never sign, send or post anything.

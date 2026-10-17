---
name: lancement
description: Launch day on pump.fun, Saturday 17 October 2026 at 15:30 Paris. Settings to check, who does what each minute, which checks and workflows to run, with the Opus critics before anything ships. The founders create the coin by hand; agents prepare, verify and draft.
argument-hint: "[preflight | gonogo | open | after]  (empty = where are we in the day)"
disable-model-invocation: true
---

# /lancement: launch day

Phase requested: $ARGUMENTS. If empty, read the Paris time and run the phase we are in. Nothing here
creates the coin, signs, sends or posts: founder A and founder B do, in their own wallets and
accounts. Agents verify and draft.

**Reconcile first.** Read `docs/lancement.md` if it exists (the minute-by-minute run sheet, written
by another part of the team) and the README's "Launch day" checklist, and compare each with this
procedure. Where they differ on a time, a setting, a wallet or who merges, stop and have
`chef-de-station` reconcile them before anyone acts on either. Known today: the README's "At 15:30"
block says to create the coin "in their own wallet" and to "commit, push" the contract. This
procedure wins on both until the README is corrected: the coin is created from the station creator
wallet (non-negotiable 5: otherwise the creator fee accrues to a personal address), and the
contract goes in by a branch, a PR and the other founder's approval.

## Preflight, until 14:30 (phase `preflight`)
1. `npm test` (it includes `test/no-signing.test.mjs`) and `npm run check:feed`. Report real output.
2. `enqueteur` re-checks the Tier 2 list in CLAUDE.md that matters today: pump.fun fee tiers
   (`public/js/fees.js` against pump.fun's fee page), the creator-fee claim path, the official price
   in `config.js`. Anything CONTRADICTED goes to the founders before 15:00.
3. Check the settings by reading them, not by trusting them:
   - `public/config.js`: `launchAt` = `2026-10-17T15:30:00+02:00`, `firstPleinAt` =
     `2026-10-24T18:00:00+02:00`, `launchpad` = pump.fun with the quote asset the founders will pick
     (USDC), `official` = latest survey, `links.xHandle` and `links.telegram` set to station accounts.
   - `public/live.json`: `contract` EMPTY, wallets (creator wallet, réservoir multisig) either
     verified addresses or empty, dashboard `null`. **Under D3-a the creator wallet must already be
     there, checked by both founders**: the contract PR below is proved by the curve's creator
     matching it. With it empty, the audit's "Créateur" row reads "non publié" and a wrong mint
     passes unseen. Under D3-b it is empty on purpose until PR3 (see "The gate and D3" below), and
     both founders hold it in the private record instead.
   - The production site is deployed with the empty contract and shows the countdown to 15:30; the
     preview was checked on a phone; no stale claim (18:00 opening, Jupiter Studio, anti-snipe, airdrop).
4. **Hard conditions on GitHub. Any one false is a NO-GO at 14:30**; the contract PR at 15:30 is
   the most sensitive change of the day, and these are what make "the other founder approves" true:
   - `main` is protected. `curl -s https://api.github.com/repos/<owner>/PLEIN/branches/main` must
     show `"protected": true` (a public read; Claude Code asks before it runs `curl`). The flag is
     necessary, not sufficient; if a ruleset shows `false`, the merge attempt below decides.
   - The second founder has Write access or owns the organization, `.github/CODEOWNERS` lists both
     handles with no placeholder left, and "Require review from Code Owners" is on.
   - Smoke test 5 of docs/salle-de-controle.md was done today: a founder opened a PR and GitHub
     refused to let them merge it themselves.
   - Secrets set (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_OPS_CHAT_ID`,
     `CLAUDE_CODE_OAUTH_TOKEN`, optional `SOLANA_RPC_URL`). Dry-run the Telegram ops chat by pressing
     the `releve` button: with the secrets set it sends its report to the ops chat; without them it
     only prints in the run summary.
5. **Switch the Saturday plein off for today.** The `plein` workflow's schedule fires at 15:52 UTC
   (17:52 Paris) every Saturday, and neither `plein.yml` nor `scripts/_gate.mjs` knows about
   `firstPleinAt`: tested on 17 October, the gate lets it through. It would fail ("no réservoir
   wallet") and tell the ops chat to re-run it by hand with a réservoir figure, which invites a
   Plein #1 a week early. Unless `plein.yml` already skips scheduled runs more than 36 hours before
   `firstPleinAt`, a founder runs `gh workflow disable plein` today (Claude Code asks first), and
   `gh workflow enable plein` on Friday 23 October; skill `plein`, step `friday`, checks it.
6. Run skill `critique` on the launch package: the diff since the last release, the launch post
   (skill `post`), the pump widget, the first-day FUD forecast. Fix every blocker.

## 14:30 go/no-go (phase `gonogo`)
`chef-de-station` gives GO / GO-IF / NO-GO with the conditions written down, citing each critic and
reading the hard conditions of preflight step 4 from the sources, not from memory. Both founders say
yes in the issue. Launch accounts used: the station's, not personal ones.

## 15:30 open (phase `open`)
Who does what:
- **Founder A:** creates the coin on pump.fun from the station creator wallet itself, not a personal
  one, with the settings of docs/moteur.md section 3: quote asset USDC; Holder Rewards, charity,
  cashback and Mayhem mode off; **creator fee rate: the default schedule, no custom rate, editing
  off** (the form may offer up to 3 %); the whole creator fee to that one wallet (no fee sharing);
  the buy field at 0 (no dev buy); name Le Plein, ticker PLEIN, the image. Agents do not touch
  pump.fun. Note the exact UTC time.
- **Founder B:** reads the mint from pump.fun and from Solscan independently and says it aloud to A
  (two people check, per CLAUDE.md). Mismatch: stop, tell nobody the address.
- **15:31, before the mint goes anywhere:** `mecano-chaine` runs
  `npm run audit -- --mint <mint> --markdown`. Its "Réglages de la courbe" rows must read: quote USDC, creator
  equal to the creator wallet in `live.json` (the private record under D3-b), Holder Rewards, Cashback, Mayhem and editable creator
  fee all "non", and a supply no larger than the curve's. Any row false means the coin was created
  wrong: do not publish that mint, and the founders decide in the open whether to create again.
  A row "non lu" is not a pass: read the curve account by hand with the other founder.
- **The one-call version of the two checks around here** (`pump_verify_launch`, `docs/mcp.md`): with
  the station MCP server connected (`/mcp` shows `station`), `mecano-chaine` (or `chef-de-station`,
  or `controleur-technique`), in B's session on B's laptop, calls `mcp__station__pump_verify_launch`
  with the mint B types from Solscan (`docs/lancement.md` rule 1 and the 15:31 row). It returns one
  `pass`, `fail`, `unread` or `info` line per setting, each with its account and slot, and a
  `verdict`. A `fail` stops everything. Read its `warnings` out loud too (for instance a metadata
  update authority that can still rename the coin). It does not replace B's three checks below. The
  mint comes from B's own reading of Solscan, never from PLEIN Control, a chat message, an agent's
  output, a page or a comment (`docs/lancement.md` rule 1).
- **The gate and D3 (the creator wallet).** The tool compares the curve's creator with
  `wallets.creator` in the `live.json` it reads, which is the working tree of the machine it runs
  on. Under **D3-a** (the creator published in an earlier PR) that line is `pass` at 15:31 and the
  gate is `pass` only when every line is. Under **D3-b** (recommended in `docs/lancement.md`: the
  creator address is recorded privately by both founders and committed in PR3), `wallets.creator`
  is empty at 15:31, the `creator` line is `unread` by design and the verdict is `incomplete`. That
  is not a pass and not a failure. Then: at 15:31 B reads the curve's creator on Solscan against the
  private record, by hand, and A may open PR3 only if `creator` is the single `unread` line and
  every other line is `pass` (a `fail` or any other `unread` line stops it). The gate that counts
  runs again at check 2 below, after `gh pr checkout <PR3>`, when the working tree's `live.json`
  holds the creator: the verdict must then be `pass`, "Créateur" included, before B approves.
- **Also at 15:31, by hand, until the audit prints them** (the audit does not read these yet; the
  tool above does): `creatorFeeBps` reads exactly 0 (`docs/lancement.md` and `docs/moteur.md`
  section 3; any other value may be a custom flat rate); no account exists at `sharingConfigAddress(mint)` (Solscan, or a
  one-off read-only `getAccountInfo` by `mecano-chaine`); `initialVirtualQuoteReserves` reads 4,292
  USDC (docs/moteur.md section 3). A custom creator rate or a fee-sharing recipient would make every
  fee figure on the site wrong from the first trade. Any one wrong: same decision as above.
- **15:31 to 15:35, the Jupiter route (does not delay the contract):** `mecano-chaine` asks Jupiter
  for a 1 USDC quote into the mint (one GET to `QUOTE_URL` in `scripts/plein.mjs`, `amount=1000000`).
  The site's pump and Plein #1 hang on it (docs/moteur.md section 3). No route: `carrossier` opens a
  PR that closes the pump and links to the coin's pump.fun page, and the check is repeated at +1 h.
- **Founder A, by hand** (`docs/lancement.md`, the 15:33 row; rules 1 and 5): branch `ouverture`,
  the `contract` line of `public/live.json` (and `wallets.creator` under D3-b), commit, push, open
  PR3. A types the mint from Solscan and pump.fun, not from a chat, from PLEIN Control or from an
  agent's output, and no agent writes the branch or opens the PR. Anyone who wants the console to do
  this must first have both founders reword `docs/lancement.md` rules 1 and 5 and its 15:33 row
  and CLAUDE.md non-negotiable 2 in one PR (`docs/salle-de-controle.md`, "Publishing the contract");
  until then there is one procedure and it is this one.
- **Before Founder B approves, three checks, in this order. B approves only when all three hold.**
  1. **B reads the committed string.** B opens the PR's Files tab and compares the mint there,
     character by character, with Solscan and pump.fun. Not with what A said aloud, and not by
     copy-paste from A: a swapped clipboard or an agent's copy error passes `mint.js`, which only
     checks the shape.
  2. **The audit reads the PR's own file.** `mecano-chaine` checks out the PR branch (`gh pr checkout
     <n>`, Claude Code asks first) and runs `npm run audit -- --markdown` with no `--mint`, so it
     reads the `live.json` of the PR (and then `pump_verify_launch` on the same checkout, with the mint B
     types again, which under D3-b is the first run that can reach `pass`). The mint it prints equals the one in check 1, and
     every "Réglages de la courbe" row passes, "Créateur" included: a mint that is not the coin A
     created has a different creator and fails that row.
  3. **The diff and CI.** `controleur-technique` gives GO on the diff (only the contract line, and
     the creator wallet if it was empty, changed) and the CI `test` check is green.
  Only then B approves and merges. Vercel deploys in about a minute (README); open pages poll
  `live.json` every 15 seconds around the opening (CLAUDE.md), so the contract appears without a reload.
- Agents in parallel once the PR is merged: `mecano-chaine` runs `npm run releve` against the new
  mint, `vigie` runs `npm run vigie -- --markdown` (clone window starts now), `carrossier` checks the
  home page, the copy button, the fiche link and the Solscan link at 1440 and 390 px.

## After the opening (phase `after`)
- +10 min: `npm run audit -- --markdown` or the `audit` button (creation slot, same-slot buyers,
  early buyers, top 10, authorities, suggested lights); the `audit` workflow also runs once by
  itself at 16:30 Paris. `releveur` proposes light changes from the evidence; a founder sets them
  in `live.json` by PR. The `vigie` workflow already runs every 15 minutes today; use its button
  or `npm run vigie` for an immediate pass.
- +15 min: launch post through skill `post`: pompiste drafts, ligne-continue gates, critique-degen
  checks taste, a founder posts from the station account and pastes it into the Telegram channel as its admin.
- +1 h: ask Jupiter for the 1 USDC quote again (aggregators often index a new market within
  minutes). If there is still no route, `economiste` and `controleur-technique` write what Plein #1
  would do instead (docs/moteur.md section 3), and the founders decide in writing, in their private
  document, before Friday 23 October. Whatever that route needs built is done in the multisig's own
  interface or in a separately reviewed tool, never by an agent in this repo.
- +1 h, +3 h, end of day: skill `releve`; `vigie` watch; `chef-de-station` writes the day's note.
- Confirm `plein` is switched off for today (preflight step 5) and write "re-enable on Friday 23
  October" in `docs/objectifs.md`, in the Board.
- If anything looks like an incident (wrong contract on the site, a hijacked account, funds or keys
  at risk), `vigie` follows its playbook: the record is private until containment.
- Test the creator-fee claim path with a small amount when fees exist (Tier 2 until a claim is seen).
- Write wallets into `live.json` only as they are created and verified; never an unverified address.

Not today: the Saturday contest, any airdrop, any paid promotion, any message from a personal account.

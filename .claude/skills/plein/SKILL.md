---
name: plein
description: The Saturday routine end to end, from the official price on Tuesday to the ticket at 19:05 and the Sunday report. Agents prepare, check and draft; the two founders claim, sign and post. Use all week, and run it as a rehearsal before the first plein on Saturday 24 October 2026.
argument-hint: "[rehearsal | price | midweek | friday | go | claim | run | ticket | sunday]  (empty = where are we in the week)"
disable-model-invocation: true
---

# /plein: the Saturday routine

Step requested: $ARGUMENTS. If empty, read the Paris time and the day, say which step we are in,
and run that one. The agents never claim, sign, send or post. Rehearsal mode runs the whole chain
with `--reservoir <amount>` on made-up numbers, and says so on every output. There is no plein on
launch day: Plein #1 is Saturday 24 October at 18:00.

## Tuesday to Thursday: the price (step `price`)
1. `npm run prix -- --json` finds the latest weekly national average (DGEC). Without `--write` it
   changes nothing. The `prix-officiel` workflow runs it on weekdays and Saturday morning and pushes a
   `prix/...` branch that edits `official` in `public/config.js` only. A founder opens the PR from the
   link in the run summary or the ops chat (a person opening it starts CI); nothing merges by itself.
2. `enqueteur` confirms the survey week against the ministry's own table. A newspaper figure is not
   a confirmation. Mismatch: stop and tell the founders.
3. `npm test`, then the other founder approves and merges the price PR before Saturday 17:45. The
   formula uses the latest weekly average published before Saturday 17:45.

## Any day: the midweek claim (step `midweek`)
The creator wallet is one key, and the fees wait in a pump.fun account until someone claims them
(docs/moteur.md sections 3 and 8). Whenever a reading (`npm run releve -- --json`, step `friday`,
the Sunday `releve`) shows `creatorVault.unclaimed` above $1,000 (a judgement call the founders
may change), `tresorier` says so at once. The founders claim and move the fees into the réservoir
back to back, so the single-key wallet holds them for minutes, and `tresorier` compares before and
after. Every claim belongs on that week's ticket, and the ticket holds one claim signature today:
`chef-de-station` takes the change of shape to `imprimeur` and `economiste` before it happens.
Saturday's 17:50 check is then against the claims of the whole week.

## Friday: prepare (step `friday`), the plein's fees are not claimed yet
1. `releveur`: `npm run releve -- --json`; report `creatorVault.unclaimed`, the réservoir balance, supply.
2. `tresorier` runs a rehearsal order, `npm run plein -- --reservoir <made-up amount>`, and labels it.
3. The claim path is Tier 2 until a first claim has been seen. Ask the founders to try it once
   earlier in the week with whatever small amount the vault holds, so that Saturday 17:48 is not the
   first time.
4. `economiste`: the execution plan for the 12 slices (timing, slippage cap, thin-pool abort rule,
   front-running exposure), and where the founders stand on the hour cap of docs/moteur.md section 4
   (a proposal: the fiche has to say what the order does before 24 October).
5. Run skill `critique --quick` on the plan: `economiste`, `controleur-technique`, `ligne-continue`.
6. **Before Plein #1 only, rehearse the multisig itself.** Both founders, each on their own device:
   the claim of step 3 (if it has not been done), one tiny real swap (a dollar or two of
   USDC into $PLEIN, built as the order's slices are) and one tiny real burn of what it bought,
   each signed by both, each signature kept. It proves the multisig can do the claim, the swap and
   the burn, which is Tier 2 today (the multisig tool, signers and threshold are still open
   decisions in CLAUDE.md). It costs a few dollars and Saturday 18:00 must not be its first run.
   If the burn needs a transaction nobody can build in the multisig's own interface, the founders
   decide how before Saturday; an agent does not build it.
7. **Before Plein #1 only, rehearse the ticket against the guard.** In a scratch copy of the repo
   (never in the working tree), put signature-shaped values built at run time into a draft, run
   `npm run ticket -- <draft> --write`, then `npm test`. It must stay green: today it does not
   (the guard flags any 86 to 90 character base58 run, and a real signature is 87 or 88). The
   one reviewed amendment that fixes it is described in `controleur-technique.md`; it has to be
   merged by now, or the 19:05 ticket cannot pass the required `test` check. No amendment, no
   Plein #1 ticket PR: tell the founders on Friday, not at 19:05.
8. `gh workflow list` shows `plein` enabled again (skill `lancement`, preflight step 5 switched it
   off on 17 October). If it is not, a founder runs `gh workflow enable plein`.

## Saturday 17:30: go/no-go (step `go`)
1. A preview: `npm run plein -- --from-chain --allow-unclaimed --markdown`. It prints the split from
   `public/js/formula.js` on the official price in `config.js`, 12 slices (18:00, 18:05 ... 18:55), a
   Jupiter quote and an impact check per slice, the advisories (`fewer-slices`, `smaller-slices`,
   `hold`, `hour-cap-needed`) and the checklist for the multisig. Until the fees are claimed the
   split is too little: it is a preview, a sanity check and nothing more.
2. `tresorier` checks: `official.weekLabel` is the latest survey; the slices add up to the order's
   "To buy this Saturday" figure (the week's buyback plus any buyback carried from earlier weeks,
   not the week's buyback alone) and their number is the order's number (12, or fewer when the
   script says so); quotes fresh; impact inside the cap; the curve is not about to complete. The
   advisories are the founders' to decide with `economiste`: `tresorier` reports them and what each
   would change, and a correct order with an advisory is not a NO-GO by itself.
3. `chef-de-station` gives GO, GO-IF or NO-GO. A NO-GO from `controleur-technique`, `economiste` or
   `ligne-continue` stands until the founders override it in writing (a `ligne-continue` BLOCK in the
   private document, as `chef-de-station.md` says). 17:45: the price is frozen.

## Saturday before 17:50: the claim (step `claim`)
The founders claim the week's creator fees from the creator wallet and move them into the réservoir
by hand, then paste the claim signature into the ticket draft (`claim.sig`, or `null` and a note if
there was nothing to claim). `tresorier` compares the vault and the réservoir before and after.
At 17:50 the réservoir balance, on the multisig screen and in `npm run releve`, must equal this
week's claimed fees plus the amounts carried in from earlier weeks (the last published ticket's
`carried`; nothing for Plein #1). The order that follows already counts the carried money: its
`reservoir` is the whole balance and its "This week's fees" line is the balance minus what was
carried. So the check is against the screen, never "the order plus the carry". If anything differs,
stop and find out why, then re-run `npm run plein -- --reservoir <balance>`; never edit the figures.

## Saturday 17:52 to 19:00: the order and the run (step `run`)
1. 17:52: the `plein` workflow prints the final order in its summary and the ops chat and keeps the
   ticket draft as an artifact. It is best effort, so run `npm run plein -- --from-chain --markdown`
   by hand too (it refuses while fees are unclaimed: claim first). The draft is
   `out/plein-NNN-draft.json`. The order's Réservoir line equals the balance of step `claim`.
2. 18:00 to 18:55: founders execute the slices in the multisig, by hand, one every five minutes.
   `tresorier` hands out one slice at a time. **Each signer reads destination, mint, amount and
   slippage on their own wallet or multisig screen, against the order in the ops chat, before
   signing, and says so in the chat.** When a founder pastes a proposal as decoded text, `tresorier`
   answers MATCH or STOP against the order, and `controleur-technique` re-checks anything unusual.
   That MATCH is a third check, never a substitute for the second founder's own reading: the text
   one founder pasted may not be what the other founder's screen shows. Any STOP halts the run; what
   is not bought goes in `unspent` with a note and is carried to next week, never split again. An
   agent never approves or executes a proposal.
3. 19:00: the burn, read by each signer the same way. After it, last: the aid and team transfers, as
   the checklist says. The hour cap and weekday slices of docs/moteur.md section 4 are applied only
   if the founders adopted them; the agents report the script's advisory and decide nothing.

## Saturday 19:05: the ticket (step `ticket`)
1. Founders paste the transaction signatures into the draft in `out/` (never into any other file,
   a chat or an issue; `out/` is not in git, though until the guard amendment is merged a local
   `npm test` flags them there too).
2. `npm run ticket -- out/plein-NNN-draft.json` validates (split to the cent, slices add up, every
   signature a real 64-byte value and not a key pair); then `npm run verify:ticket -- <ticket.json>`
   re-reads every signature on Solana.
3. `npm run ticket -- out/plein-NNN-draft.json --write` adds it to `public/tickets/`; `imprimeur`
   renders the PNG; open a PR; the other founder approves and merges. This PR must pass the
   required `test` check, which holds only if the guard amendment of step `friday` 7 is in. If
   `npm test` is red on a signature here, do not loosen the guard and do not hide the signatures:
   tell the founders, publish the ticket as soon as the reviewed amendment is merged, and say why
   it is late. A late ticket is acceptable, a loosened guard is not.
4. Skill `post` for X and Telegram (pompiste, ligne-continue, founders post). The ticket prints
   even for an almost empty réservoir.

## Sunday (step `sunday`)
Skill `releve`: the report against the thesis table, saved as `docs/releves/YYYY-MM-DD.md` by
`releveur`, `docs/objectifs.md` updated by `chef-de-station`. Anything that went wrong is written up
with a UTC timeline: in an issue if it is harmless, in the private record if it touches keys, funds
or a wallet (`vigie`'s playbook).

If Solana or Jupiter is down on a Saturday, the founders have not yet written the procedure (an open
decision in CLAUDE.md). Until they do: stop the run, write what was not bought in `unspent`, print the
ticket anyway with the reason in `notes`, and tell the ops chat.

Never: sign, send, claim, round in the team's favour, skip the ticket, change a number to make it
reconcile.

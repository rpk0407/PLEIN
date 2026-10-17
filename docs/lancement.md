# Lancement: the run sheet for Saturday 17 October 2026

Written at about 05:00 Paris by `chef-de-station`. The minute for each step, from now to 23:00
Paris. The checks behind each step are in the `/lancement` skill; the money reasoning in
[`moteur.md`](moteur.md); the posts in [`culture.md`](culture.md) §5 and §10; the goals and
open decisions in [`objectifs.md`](objectifs.md). Where this sheet and another file disagree, the
[reconciliation](#reconciled-with-lancement-culturemd-and-the-readme) at the end says which wins
until that file is fixed.

## Who

- **A**: holds the creator wallet's hardware device, creates the coin, writes PR1, PR3 and PR4.
  Taken here to be `@rpk0407`, the repo owner, on whose laptop the working tree sits.
- **B**: the other founder. Reads the mint on their own, approves A's PRs, owns the Vercel
  account (D6), runs the station's X and Telegram.
- **Agents**: read, compute, draft. A line marked "founder" is typed by a founder; Claude Code asks
  first before anything that pushes, merges, posts or runs `gh workflow`.

If D6 gives the creator device to B, swap A and B on every coin and PR3 line; nothing else changes.

## Rules for the day

1. The contract comes from the deployed site, nowhere else. Nobody passes a mint by chat, by a
   handed-over clipboard or from an agent's output into a post or a PR.
2. Every change to `main` is a PR the other founder approves. No merge from 14:30 until PR3.
3. No seed phrase, keypair file or wallet browser profile on a machine that runs agents. A creates
   from a phone wallet app paired with the device, or from a computer that runs no agents.
4. This file is public once pushed. The throwaway coin's name, mint and wallets, who holds which
   device, and (under D3-b) the creator address before 15:30 go in the private document only.
5. Agents never open pump.fun, never post, never merge, never hold a key.
6. No post quotes 46,6 % before `enqueteur` has CONFIRMED 2.3283 against the ministry's table.
7. Whoever creates the coin at 15:30 has slept.

## Decisions due today

Each is written in the private document with both names. Recommendations are `chef-de-station`'s.

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D1 | Hour cap on the fiche: A, A′ or B (`moteur.md` §4) | A′, with the sentence of §4 | no new code; nothing to farm; its cost is visible (at $300k of curve volume Plein #1 buys $68 of $419 and carries the rest) and the team waits while the carry is above a week's buyback |
| D2 | The founders' rule: hold no $PLEIN, buy none (`moteur.md` §5) | adopt it; it goes in the "Aucun achat à la création" line; the two personal-wallet rows leave the page | at 15:30 those rows switch to "pas encore publié" by themselves |
| D3 | Creator wallet: (a) published in PR2, or (b) recorded privately by both at 13:30 and committed in PR3 | (b), once `economiste` agrees | a published creator lets bots wait on its creation and skip the clones; "publié à l'ouverture" on the page stays true; the audit still proves the curve's creator equals it |
| D4 | Domain now, or the vercel.app address today | buy one now if a name is agreed in five minutes | pump.fun's links are set at creation and probably permanent (Tier 2) |
| D5 | The organization now, or deferred to Fri 23 with the limit written | now, before any install | about 15 minutes; a transfer later breaks Vercel, the Claude App and the secrets |
| D6 | Who holds which single key | A the creator device, B the Vercel account, GitHub shared through the organization | no founder holds two of the three alone |
| D7 | `moteur.md` §4 and §8 in the public repo | keep both if D1 is A′ or B; move §4 to the private document if D1 is A | under the cap, the trade §4 describes loses money; without it, §4 is a how-to |
| D8 | The publisher in the mentions légales while no company exists | the founders choose; `ligne-continue` drafts (Tier 2, not legal advice) | the publisher and the host must be identified (LCEN art. 6 III) |
| D9 | The Telegram group "L'aire de repos" today | closed | nobody can moderate it during the opening |
| D10 | The pump at the opening if the Plugin is untested or Jupiter has no route | closed, with a link to the coin's pump.fun page | the founders cannot test it on $PLEIN itself, since they buy none |
| D11 | What the fees of a coin created wrong would become | never to the team, never traded; the post says where they go, with the transaction | the trigger post needs the answer before the failure |
| D12 | Open without the lawyer's answer | written with both names and the date | the offeror and paid-promotion questions are unanswered |

## Minute by minute (Paris)

### 05:00 to 07:30: night shift

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 05:00 | agents | Finish today's code in the working tree: the `plein` skip (`automaticien`), the fiche's creation link and funding line (`carrossier`), the three audit rows (`mecano-chaine`), these two docs | edits only, no git | `npm test` green |
| 05:00 | A | Private document: move `docs/innovations.md` §3 and §4 into it and out of the file; start the decision page | | the file has no §3 or §4 |
| 05:30 | `enqueteur` | 2.3283 against the ministry table (row 46304) and note NPG-2026.10.09 | a read | CONFIRMED or CONTRADICTED, handed to `chef-de-station` |
| 05:30 | `mecano-chaine` | A 1 USDC quote into an existing USDC-quoted pump.fun curve | one GET to `QUOTE_URL` in `scripts/plein.mjs`, `amount=1000000` | route or none, noted |
| 06:00 | `ligne-continue`, `controleur-technique` | Read the full diff and every new file as a competitor would | `/critique`, locally, never through `@claude` | verdicts; blockers fixed |
| 07:00 | A, B | Call: D1 to D6 | the table above | each written down |

### 07:30 to 08:45: wallet, accounts, organization

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 07:30 | A | On the hardware device: a creator account and a separate throwaway account. One exchange withdrawal of SOL to the creator account, its only deposit ever. Fund the throwaway from any other source with SOL and 5 USDC | exchange app, device | the withdrawal is the creator account's first transaction on Solscan. A hold on new addresses (Tier 2): switch exchange at once |
| 07:30 | A | The organization (D5): create it, B as Owner, transfer the repo | github.com | B can open Settings, Branches |
| 07:45 | B | X: station e-mail, passkey, name and bio (culture §11), the prebunk pinned (culture §5, first row) | | pinned |
| 08:00 | B | Telegram: bot via @BotFather, public channel with the bot as admin, ops group with both founders and the bot, the two chat ids (`salle-de-controle.md`, secrets). The group stays closed (D9) | | ids in hand |
| 08:00 | B | A free Helius key; the domain if D4 says so | | in hand |
| 08:00 | A | `.github/CODEOWNERS`: one line `* @<A> @<B>`, the placeholder deleted; B's handle in `include_comments_by_actor` in `claude.yml` | edit in the working tree | no `SECOND_FOUNDER_HANDLE` left |
| 08:15 | A | Branch rule on `main`: PR required, 1 approval, stale approvals dismissed, `test` required, conversations resolved, no force push, no bypass; Actions may not create or approve PRs. Code-owner review waits for PR1 (CODEOWNERS is read from the base branch, Tier 2) | Settings, Branches; Settings, Actions, General | `curl -s https://api.github.com/repos/<owner>/PLEIN/branches/main` shows `"protected": true` |
| 08:30 | agents | `npm test` and `npm run check:feed` at push time | | real numbers recorded |

### 08:45 to 11:00: PR1, the working tree

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 08:45 | A (founder) | Branch `station`, commit the working tree, push, open PR1 | git | CI `test` green |
| 08:50 | `controleur-technique` | GO on PR1's workflows, `.claude/settings.json`, CODEOWNERS, `claude.yml`, `live.json`, `config.js` | local | GO |
| 09:00 | B | Read PR1: the critics' verdicts; `live.json` (contract empty); `config.js` (`launchAt` 15:30, `firstPleinAt` 24 October 18:00, quote USDC); the eight workflows' triggers; `settings.json`. Approve | GitHub | approved |
| 10:30 | B (founder) | Merge PR1 (14:30 at the latest) | GitHub | Actions lists 8 workflows |
| 10:35 | A (founder) | `gh workflow disable totem` until its caption says "Publication automatique." and is gated. `plein`: if PR1 carries the 36 h skip, leave it; if not, `gh workflow disable plein` | `gh` | `gh workflow list` shows it |
| 10:40 | A | "Require review from Code Owners" on; smoke test 5: a PR of A's own refuses to merge | | refused |
| 10:45 | B | Vercel: import, preset Other, no build command, production branch `main`; `SOLANA_RPC_URL` for Production only | vercel.com | production counts down to 15:30 with an empty contract |
| 10:45 | A | GitHub secrets: the three Telegram ones, `SOLANA_RPC_URL`, `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`); the Claude GitHub App | Settings, Secrets | the `releve` button puts a report in the ops chat |
| 11:00 | `vigie` workflow | First 15-minute run | | the `vigie` issue exists |
| 11:00 | `carrossier` | Production at 1440 and 390; `/api/diesel`, `/api/stations?cp=75011`, `/api/chain` | browser | no sideways scroll; the countdown right |
| 11:00 | B | Second laptop: clone, `/agents` lists 15, `/mcp` shows 18 tools, `npm test` | | all pass |

### 11:00 to 13:30: rehearsal, PR2

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 11:00–12:30 | `carrossier`, with the founders' answers | PR2, "le jour J": the fiche (the D1 sentence; "Aucun achat à la création" with D2; the funding line with the exchange's name; the creation as an account link; the USDC issuer risk; no custom fee; the team's share); the mentions légales (D8, the host); in `index.html` the personal-wallet rows (D2) and line 392 (D1); `plein.ics` (D1); `links` and `siteUrl` in `config.js` (D4); an absolute `og:image` and `og:url`; the README's "At 15:30" and "Every week"; CLAUDE.md non-negotiable 2 | branch, PR | CI green by 12:30 |
| 11:00 | A | Dress rehearsal from the throwaway account, on the device and the app that will create at 15:30: a USDC coin, an unrelated name and image, description "Test technique, sans valeur.", no dev buy. Note whether USDC is offered, which switches exist (Holder Rewards, charity, cashback, Mayhem, custom fee, fee sharing) and the description's length limit | pump.fun | created; the device approved the whole flow |
| 11:10 | `mecano-chaine` | Read the throwaway: `npm run audit -- --mint <throwaway> --markdown` | output stays local, never in an issue | `creatorFeeBps`, `canEditCreatorFee`, the fee-sharing account and 4,292 USDC read |
| 11:15 | B, then A | B, from a second throwaway wallet, buys 2 USDC of it and sells at once; A claims the creator fee from the throwaway account. Nothing more is traded; the throwaway is never mentioned in public | pump.fun | a claim on Solscan, its unit noted (Tier 2) |
| 11:30 | `mecano-chaine` | A 1 USDC quote into the throwaway | GET | route or none |
| 11:30 | B | Plugin test: a preview from a scratch copy with `vercel deploy` (Tier 2), never a pushed branch (a public branch with a mint in `live.json` is a gift to scammers); `launchAt` in the past; `contract` an existing USDC pump.fun coin, not the throwaway. Swap 1 USDC from a phone wallet; note Jupiter's fee before approving; remove the preview | Vercel CLI | the swap landed, or why not |
| 11:30 | `pompiste`, `ligne-continue`, B | Post 1 (culture §10), only if PR1 is merged, production counts down and the price is CONFIRMED; otherwise post 3 announces the opening | `/post` | posted, or skipped on purpose |
| 12:30 | `ligne-continue`, `economiste`, `critique-degen` | `/critique` on PR2 | local | GO |
| 13:00 | the founder who did not write PR2 | Approve and merge | GitHub | Vercel redeploys |
| 13:00 | `pompiste`, `ligne-continue`, B | Post 2 (Mon Plein), now that the mentions légales are live; else on Sunday | `/post` | |
| 13:30 | A, B | Under D3-b: the creator address read from the device by both, character by character, into the private document | | both readings match |

### 13:30 to 14:30: preflight and go/no-go

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 13:30 | agents (a founder types `/lancement preflight`) | `npm test`, `npm run check:feed`; `config.js`, `live.json` and production read from the source; the GitHub conditions; the state of `plein` and `totem` | | every line read, none assumed |
| 13:45 | A, B | Smoke tests 1 to 5, 7 and 8, on both laptops | `salle-de-controle.md` | pass |
| 14:00 | B | Production on a phone: countdown to 15:30, copy buttons disabled, pump closed, fiche and mentions légales open | | as listed |
| 14:15 | A | Ready: the device charged; the creating app on a device that runs no agents; the pump.fun form open and empty; the token text of `moteur.md` §3 copied as is; `brand/logo.png`; the three links | | ready |
| 14:30 | `chef-de-station`, A, B | GO, GO-IF or NO-GO (below); both founders say yes in writing | `/lancement gonogo` | written |

**GO only if all of these hold.** `main` protected and smoke test 5 refused a self-merge · PR1 and
PR2 merged, `npm test` green on `main` · production counts down with an empty contract, the
mentions légales name the publisher and the host · the creator account funded by one exchange
withdrawal and recorded by both · the device completed pump.fun's create flow today · no `plein`
at 17:52, `totem` disabled · D1, D2 and D3 on the site and the fiche · the X account and the
Telegram channel exist with the prebunk pinned · D11 and D12 written.

**GO-IF, each written down.** The Plugin untested or no route: the pump closed at the opening
(D10) · no claim seen: by Wed 21 · the organization deferred (D5) · no Helius key: the top 10 is a
dash at 16:30 and post 6 says so · `@claude` not answering · the price not CONFIRMED: no post
quotes the rate.

**NO-GO.** At 15:00 the delay post (culture §10, triggers) replaces post 3; a new time only once it
is certain.

### 15:00 to 15:50: the opening

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 15:00 | B | Post 3, the 30-minute warning, on X and the channel | | posted |
| 15:15 | A, B | A fills the form; B reads every setting on A's screen against [the settings](#the-creation-settings); nothing submitted | | both say it matches |
| 15:30 | A | Create; approve on the device; note the UTC time | pump.fun | the coin page exists |
| 15:30 | B | Read the mint independently: Solscan, the creator account's page, its newest transaction, the mint; then pump.fun from the creator's profile, never its search. Say it aloud to A | | A's and B's readings match |
| 15:31 | `mecano-chaine`, on B's laptop | `npm run audit -- --mint <mint> --markdown`, B typing the mint from Solscan | | every row of [the 15:31 check](#the-1531-check) |
| 15:32 | `mecano-chaine` | A 1 USDC quote into the mint | GET | route or none (D10) |
| 15:33 | A (founder) | Branch `ouverture`: `contract` (and `wallets.creator` under D3-b) in `public/live.json`; commit, push, PR3 | git | CI starts |
| 15:34 | B | Check 1: PR3's Files tab against Solscan and pump.fun, character by character; under D3-b, the creator line against the private record | | match |
| 15:35 | `mecano-chaine`, on B's laptop | Check 2: `gh pr checkout <n>`, then `npm run audit -- --markdown` with no `--mint` | | the same mint; every row passes, "Créateur" included |
| 15:36 | `controleur-technique` | Check 3: the diff changes only those lines; CI `test` green | | GO |
| 15:38 | B (founder) | Approve and merge PR3 | GitHub | Vercel deploys in about a minute |
| 15:40 | B, `carrossier` | The contract shows without a reload; copy button, fiche, Solscan and pump.fun links; 1440 and 390 | phone, browser | as listed |
| 15:42 | B | Post 4, the contract, copied from the deployed site with its copy button; pinned in place of the prebunk | X, channel | pinned |
| 15:50 | B | If the contract is not on the site yet: the delay post, pinned, every 30 minutes | culture §10, triggers | |

### 15:50 to 17:00: the first hour

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 15:50 | `mecano-chaine` | `npm run releve -- --markdown`; `/api/chain` on production | | the `token` and `curve` blocks are not null |
| 15:50 | `vigie` | `npm run vigie -- --markdown` | | clones listed; the "fausse pompe" post if one spreads |
| 15:55 | `pompiste`, `ligne-continue`, B | Post 5: the creator wallet and the team's tokens as the 15:31 audit read them | `/post` | posted |
| 16:30 | `audit` workflow | Reads `main`'s contract; report in the ops chat | | arrived; if not, press the button with an empty `mint` |
| 16:30 | `mecano-chaine`, `releveur` | The same audit by hand; `releveur` proposes the team, bundles and inspection lights from it | `npm run audit -- --markdown`, `/releve` | a proposal |
| 16:30 | `mecano-chaine` | The quote again. Still no route: the pump stays closed, and `economiste` and `controleur-technique` write Plein #1's route for the founders by Fri 23 | GET | |
| 16:40 | `pompiste`, `ligne-continue`, B | Post 6, le contrôle technique, defects included | `/post` | out by 16:50 |
| 16:45 | A, then B | PR4: the lights in `live.json`; B approves | | merged |

### 17:00 to 23:00: the evening

| Time | Who | What | How | Done when |
| --- | --- | --- | --- | --- |
| 17:52 | A | `gh run list --workflow plein` | | no run, or a skipped one |
| 18:00 | nobody | No plein tonight; the countdown points at Saturday 24 October | | |
| 18:30 | `releveur` | A reading, three hours in | `/releve` | report in the ops chat |
| 19:00 | `pompiste`, `ligne-continue`, B | Post 7, le péage (its pool form if the curve has completed) | `/post` | posted |
| 19:30 | `vigie` | A pass; every pin checked | | |
| 20:00 | A | The device offline and stored; no claim tonight | | |
| 21:00 | `pompiste`, B | Post 8, "Pas de plein ce soir" | `/post` | posted |
| 21:30 | `releveur` | End-of-day reading; light changes proposed for tomorrow | `/releve` | |
| 22:00 | `chef-de-station` | The day's note; the Board of `objectifs.md` refreshed, on a branch for B to approve tomorrow | | branch pushed |
| 22:45 | `vigie` workflow | The last 15-minute run; every 3 hours after | | |
| 23:00 | A, B | Who watches the ops chat tonight; carnet de bord #0 tomorrow at 11:00 | | agreed |

## The creation settings

From `moteur.md` §3. B reads each one on A's screen at 15:15.

| Setting | Value |
| --- | --- |
| Creating wallet | the station creator account on the hardware device; not a personal wallet, not the throwaway |
| Name, ticker | Le Plein, PLEIN |
| Image | `brand/logo.png` |
| Description | the token page text of `moteur.md` §3, pasted as is (its spaces are U+00A0). Too long: cut "règle et horaires sur le site", then the bracketed example; never the team's share, the 18+ line or the last sentence |
| Links | website `siteUrl` (D4), X, Telegram; probably not editable later (Tier 2) |
| Quote | USDC. If the form does not offer it, stop: `moteur.md` §3 says SOL and a change of `quote` in PR3, but the site's copy is written for USDC, so the founders decide in the open. The 11:00 rehearsal should already have shown it |
| Holder Rewards, charity, cashback, Mayhem mode | all off |
| Creator fee | the default schedule; no custom rate; editing off |
| Fee sharing | none: 100 % to the creating wallet |
| Dev buy | 0, the buy field empty |
| Supply, team allocation | 1,000,000,000 by default; 0 % |

## The 15:31 check

Any other value means the coin was created wrong. A row "non lu" is not a pass: A and B read it
by hand on Solscan. Until `scripts/audit.mjs` prints the three rows marked *, they are read by hand
or by a one-off read-only account read by `mecano-chaine`.

| Row | Expected |
| --- | --- |
| `quoteMint` | USDC |
| `creator` | the creator wallet (the private record under D3-b) |
| `isHolderReward`, `isCashbackCoin`, `isMayhemMode`, `canEditCreatorFee` | false |
| `creatorFeeBps` * | 0, and nothing else |
| account at `sharingConfigAddress(mint)` * | none |
| `initialVirtualQuoteReserves` * | 4,292 USDC |
| supply | no more than the curve's 1,000,000,000 |
| the creator's buy in the creation slot | 0 |
| mint and freeze authorities | as read (Tier 2); written as a fact on the lights only once `ok` |

## If it goes wrong

| What | Then |
| --- | --- |
| The device cannot complete pump.fun's flow at 11:00 | decide by 12:30: another device, a fresh wallet on a phone that runs no agents (weaker, written in the private document), or NO-GO |
| The exchange holds the withdrawal | another exchange at once; nothing in by 13:00: NO-GO |
| CI red on PR1 | the owners of the red files fix them; the guard is never loosened; 14:30 is the last merge |
| PR1 not merged by 14:30 | NO-GO: `main` still has the 18:00 Jupiter Studio `launchAt` |
| A wrong row at 15:31 | the mint is never published; the founders apply D11 and post "coin raté" (culture §10, triggers); creating again leaves two coins from one wallet, and the post says so first |
| A's and B's readings differ | stop; nobody says an address; read again from Solscan |
| The contract not on the site by 15:50 | the delay post, pinned, every 30 minutes |
| No Jupiter route | the pump stays closed with a link to the coin's pump.fun page; quote again at 16:30 |
| A wrong contract on the site | roll back to the last good Vercel deployment (no commit); `vigie`'s playbook, private until contained; the fix by PR, approved from the phone |
| A station account taken over | `vigie`'s playbook; warn from the other channel; report it to the platform |
| The 16:30 audit does not arrive | the `audit` button with an empty `mint` |
| A clone spreads | the "fausse pompe" post (culture §10, triggers); never a person's name |
| The day turns: violence, political capture | culture §5, "If the day turns" |
| `plein` runs at 17:52 anyway | there is no plein today: ignore its message, disable it, tell B |

## Reconciled with /lancement, culture.md and the README

Where this sheet differs from them, and which wins until the other file is fixed:

- **Creator wallet.** The skill wants it in `live.json` by 14:30. Under D3-b it is recorded by both
  founders at 13:30 and committed in PR3; B checks it against the record, and check 2 still proves
  the curve's creator equals it. Under D3-a the skill stands as written.
- **`creatorFeeBps`.** The skill accepts "0 or 30"; this sheet and `moteur.md` §3 accept 0 only.
- **Post 1.** culture.md puts it at 08:30 after the totem. The totem cannot run today (PR1 lands
  after 08:17, and it stays off), and an opening is announced only once the site can serve it:
  11:30 at the earliest.
- **Post 4.** culture.md says 15:30; with B's three checks the contract reaches the site at about
  15:40. The prebunk and post 3 say "sur le site", which stays true; the delay post starts at 15:50.
- **Post 5** says "Nos wallets sont publics" while only the creator wallet will be; its wording has
  to match what is published.
- **README, "At 15:30".** "In their own wallet" and "commit, push" are wrong: this sheet and the
  skill win, and PR2 fixes the README.

## Sunday 18 October

- 08:17: no totem (disabled until its caption is fixed and gated).
- 11:00: carnet de bord #0 (post 9); the first report, `docs/releves/2026-10-18.md`; the Board
  refreshed.
- If no claim was seen on the throwaway, repeat that test by Wed 21. The real coin's fees are
  claimed only once the réservoir exists, so that the claim and the move to it are back to back.

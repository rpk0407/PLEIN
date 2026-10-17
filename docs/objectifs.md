# Objectifs: the goal tree

17 October 2026, about 05:00 Paris, before the 15:30 opening. Owner: `chef-de-station`. The tree the
agents run on: what is always true (level 0), today's opening (1), Plein #1 (2), the first month
(3), the engines beyond the fees and the culture (4), the long game (5). Every line has a done
criterion someone can check, an owner agent, what moves it, its status today and what blocks it.
The [Board](#board) at the end is the live part: refreshed at the 14:30 go/no-go, every Sunday and
after each plein. Today's minute-by-minute is [`lancement.md`](lancement.md).

**Status words.** `done`: true and checked here. `built-unverified`: built, never run for real
(Tier 2 until it has). `todo`: not built or not done. `founders-only`: only the founders can do
it (create, sign, claim, merge, post, set a secret, decide). Facts come from the files named;
the gaps from the completeness check of about 05:00 today.

**This file is public once pushed.** It names goals and checks. Who holds which device, wallet
holders, legal reasoning and attack analysis stay in the founders' private document.

## Level 0: always true

Broken once, the station stops until it is fixed. No goal below outranks these.

| # | Always true | Checked by | Test or tripwire | Today | Gap |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Nothing in the repo signs, broadcasts or holds a key | `controleur-technique` | `test/no-signing.test.mjs`; deny rules in `.claude/settings.json`; `test/mcp.test.mjs` (no tool that creates, swaps, claims, burns or transfers) | done (a tripwire, not a proof) | misses a generic Anchor `.rpc()`; fails on the first real ticket until the narrow amendment (2.6) |
| 0.2 | Only verified addresses reach the page; the contract only from `launchAt`; two people check the mint | `controleur-technique`, `carrossier` | `mint.test`, `config.test` (live.json shapes), `fiche.test` (coin link); B's three checks on the contract PR | built-unverified (the two-person check has never run) | CLAUDE.md non-negotiable 2 still says "Jupiter Studio and Solscan": should be pump.fun and Solscan |
| 0.3 | No invented number; `null` shows as a dash | `releveur`, `mecano-chaine` | `config.test` (honest dashboard), `chain.test`, `readings.test`, `ticket.test` (split to the cent) | done | the human lights in `live.json` are set by hand, by PR |
| 0.4 | No paid promotion in any form | `ligne-continue` | the `/post` gate; culture §13 | built-unverified | no code check; the banned-term filter in `telegram.mjs` is not built |
| 0.5 | Every communication fair, clear, consistent with the fiche | `ligne-continue` | `fiche.test` (fiche tables = `fees.js`), `config.test` (no claim known to be false) | built-unverified | the fiche has placeholders; the hour-cap choice must change fiche, site, `plein.ics` and culture together (2.8) |
| 0.6 | No raffle, nothing tied to buying or holding; the contest off; `reglement-concours.html` linked from nowhere | `ligne-continue` | none | todo | add a test: no page links the contest rules (`carrossier`) |
| 0.7 | No airdrops; Holder Rewards off; the loyalty card worth nothing and tied to nothing | `ligne-continue`, `carrossier` | `carte.test`; the audit's Holder Rewards row at 15:31 | built-unverified | |
| 0.8 | No political symbol, party, union or movement; no fuel brand; no real face | `critique-degen`, `ligne-continue` | none | built-unverified (the gate) | today is a protest day: culture §5 |
| 0.9 | Aid partner named only once signed; 18+; no cookies, no trackers | `ligne-continue` | none | todo | add a test: no cookie write, no third-party script but the Jupiter Plugin, the 18+ line on the page and the fiche (`carrossier`) |
| 0.10 | The formula changes only with four weeks' public notice | `economiste` | `formula.test` pins every price from €1.50 to €3.20 | done | the founders' rule (D2) takes the same notice once it is on the fiche |
| 0.11 | The coin stays off personal accounts and wallets; it is created from the station creator wallet | `ligne-continue`, `pompiste` | the audit's "Créateur" row at 15:31 | founders-only | |
| 0.12 | French typography | `pompiste`, `carrossier` | `typo.test` | done | |
| 0.13 | Two keys on every change to `main` | `chef-de-station` reads it | branch rule with code-owner review; smoke test 5 | todo | `main` reads `"protected": false`; CODEOWNERS and `claude.yml` hold one handle; the repo sits on a personal account (1.2) |
| 0.14 | Nothing private in the public repo | `ligne-continue`, `controleur-technique` | none: read the diff before every push | todo | `docs/innovations.md` §3 and §4 are still in the tree (1.1) |

## Level 1: launch today, 15:30, on pump.fun

**Done when** the coin exists with the settings of `moteur.md` §3, its mint is on the live site
through a reviewed PR within 20 minutes of creation, the self-audit is published by 16:50, and no
agent touched pump.fun, a key or a post. Run sheet: [`lancement.md`](lancement.md). Procedure:
`/lancement`.

| # | Outcome | Done when | Owner | Moved by | Today | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Nothing private is published | `innovations.md` §3 and §4 moved to the private document and gone from the tree; the full diff read by `ligne-continue` and `controleur-technique`; D7 decided | founders-only; the two critics | `/critique` on `git diff`, locally, before the first push | todo | the first push publishes everything |
| 1.2 | The two-key rule is in force | `main` protected; B has Write or owns the organization; CODEOWNERS and `include_comments_by_actor` hold both handles; code-owner review on; a founder's own PR refuses to merge (smoke test 5) | founders-only; `chef-de-station` reads it | `salle-de-controle.md`, the two-key rule, steps 0 to 9 | todo | B's handle; the organization or its written deferral (D5) |
| 1.3 | The working tree is on `main` | PR1 approved by the other founder; `npm test` and CI `test` green at merge time; Actions lists 8 workflows | founders-only | branch, PR, approval | todo | 1.1, 1.2; target 11:00, last 14:30 |
| 1.4 | No plein today | no `plein` run at 17:52, or a skipped one | `automaticien` | `plein.yml` skips scheduled runs more than 36 h before `firstPleinAt`, with a test; else `gh workflow disable plein` | todo | |
| 1.5 | The site is in production | Vercel (preset Other) serves `main` with an empty contract and counts down to 15:30 on a phone; `/api/diesel`, `/api/stations?cp=75011`, `/api/chain` answer; no sideways scroll at 390 | founders-only; `carrossier` checks | Vercel import after 1.3 | todo | 1.3; `vercel.json` Tier 2 until the first deploy |
| 1.6 | The legal minimum | the mentions légales name a publisher and the host; `noindex` kept; the decision to open without the lawyer's answer written in the private document with both names (D12) | founders-only; `ligne-continue` | PR2 | todo | no company; D8 |
| 1.7 | The fiche holds for 15:30 | no placeholder a visitor could read as a promise; the creation linked as an account or token page, never a transaction; the funding line; "Aucun achat à la création" with the founders' rule (D2); the hour rule (D1); the USDC issuer risk; no custom creator fee | `carrossier`; `ligne-continue`, `economiste` | PR2 | todo | D1, D2, D3; the exchange's name |
| 1.8 | Station accounts and secrets | X account with bio and pinned prebunk; Telegram bot, channel and ops group; the three Telegram secrets, `SOLANA_RPC_URL` (GitHub, and Vercel Production only), `CLAUDE_CODE_OAUTH_TOKEN`; `links`, `siteUrl`, absolute `og:image` and `og:url` merged; the `releve` button reaches the ops chat | founders-only; `automaticien` | `salle-de-controle.md`, secrets | todo | 1.2 first (a transfer breaks App installs); D4 |
| 1.9 | The creator wallet | a fresh account on a hardware device, funded by one exchange withdrawal and nothing else, a little SOL, no USDC; the address recorded by both founders by 13:30 | founders-only | `moteur.md` §3 | todo | a device in hand; an exchange hold on new addresses (Tier 2) |
| 1.10 | Dress rehearsal on a throwaway | from a separate account on the same device: a USDC coin with an unrelated name created and signed; the form's switches seen; its `creatorFeeBps` and `canEditCreatorFee` read; a creator-fee claim seen (may slip to Wed 21) | founders-only; `mecano-chaine` and `enqueteur` read | `infrastructure.md` step 14 | todo | 1.9 |
| 1.11 | Jupiter can route | a 1 USDC quote into an existing USDC pump.fun curve this morning, into the mint at 15:32 and at 16:30; the Plugin swaps on a preview with a real wallet | `mecano-chaine` (quote); founders-only (Plugin) | GET to `QUOTE_URL` in `scripts/plein.mjs`; a CLI preview | todo | no route: pump closed at the opening (D10), Plein #1 needs another route (2.5) |
| 1.12 | Both laptops ready | Node 20+, `gh auth`, Claude Code; `/agents` lists 15; `/mcp` shows 18 tools; smoke tests 1 to 5, 7 and 8 pass | founders-only | `salle-de-controle.md` | todo | 1.3 for the second laptop |
| 1.13 | The official price confirmed | `enqueteur` reads 2.3283 in the ministry table (row 46304); the claims register records it; nothing quotes 46,6 % before | `enqueteur`; `chef-de-station` writes the register | `/plein price` | todo | `docs/registre-tier2.md` does not exist |
| 1.14 | The 15:31 check reads everything | `npm run audit` prints `creatorFeeBps`, whether an account exists at `sharingConfigAddress(mint)`, and `initialVirtualQuoteReserves` | `mecano-chaine` | `scripts/audit.mjs` and its test | todo | until then, by hand at 15:31 |
| 1.15 | GO at 14:30 | GO, GO-IF or NO-GO written from the sources, conditions listed; both founders say yes | `chef-de-station` | `/lancement gonogo` | todo | 1.1 to 1.14 |
| 1.16 | The coin is created right | at 15:31 every curve row passes ([`lancement.md`](lancement.md#the-1531-check)) | founders-only; `mecano-chaine` reads | `/lancement open` | todo | one wrong row: the mint is never published |
| 1.17 | The contract on the site | PR3 changes the contract (and the creator wallet under D3-b) only; B's three checks; merged by 15:50; open pages show it without a reload | founders-only; `controleur-technique`, `mecano-chaine` | `/lancement open` | built-unverified (polling simulated, Tier 1; the PR path never run) | 1.2, 1.5, 1.16 |
| 1.18 | The self-audit published | the 16:30 `audit` run (or its button) reaches the ops chat; post 6 out with the defects by 16:50; the lights merged by PR | `mecano-chaine`, `releveur`; founders post and approve | `audit` workflow, `/releve` | built-unverified (never ran on GitHub) | 1.3; PR3 merged by 16:25 |
| 1.19 | The day's posts | the prebunk pinned; posts 3 to 8 of culture §10 out or skipped on purpose; each gated by `ligne-continue` | `pompiste` drafts; founders-only post | `/post` | todo | 1.8 |
| 1.20 | No loss to a fake contract | `vigie` every 15 min from 11:00 to 22:45; each clone answered with the trigger post; zero losses reported | `vigie` | `vigie` workflow, `npm run vigie` | built-unverified | 1.3 |

## Level 2: Plein #1, Saturday 24 October, 18:00

**Done when** the ticket of Plein #1 is on the site by 19:05 (or later, with the reason posted),
every line has its Solscan transaction, `npm run verify:ticket` passes, and the split equals
`splitWeek(fees, price)` to the cent.

| # | Outcome | Done when | Owner | Moved by | Today | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 | The réservoir multisig | tool, signers, threshold and lost-key procedure decided and on the fiche; `wallets.reservoir` published by PR, checked by two people | founders-only; `controleur-technique` | | todo | D14, by Wed 21; 2.3 before the address goes public |
| 2.2 | Aid and team wallets | `wallets.aid` (an escrow both founders control until an agreement is signed) and `wallets.team` published; D13 and D16 decided | founders-only | | todo | |
| 2.3 | Unsolicited money kept out of the split | an `apports` field in `interfaces.md`, then `plein.mjs` and `ticket.mjs`; or the interim rule of `moteur.md` §6 on the fiche | `chef-de-station` (shape), `mecano-chaine`, `imprimeur`; `economiste` | | todo | blocks publishing `wallets.reservoir` |
| 2.4 | The money path proved | a creator-fee claim seen; one tiny vault swap and one tiny vault burn, each approved by both founders | founders-only; `tresorier` compares | `/plein friday`, step 6 | todo | 2.1 |
| 2.5 | A route for the buyback | Jupiter's Swap API routes USDC into the curve or pool inside a vault transaction; or pump.fun's own buy, reviewed by both founders | `economiste`, `controleur-technique`; founders decide | `/plein friday` | todo | 1.11 |
| 2.6 | Tickets pass the guard | the narrow amendment merged: `sig` fields of `public/tickets/*.json` only, a planted key pair still fails, `out/` skipped; `controleur-technique` GO; both founders in writing | `imprimeur`; `controleur-technique` | | todo | by Thu 22 |
| 2.7 | Every ticket line verified | `verify-ticket.mjs` checks `teamTransfer`, and the aid against `aid + carried.aid` | `mecano-chaine` | test | todo | |
| 2.8 | One hour rule everywhere | D1 applied to the fiche, `index.html`, `plein.ics`, culture posts 18, 20, 24; under A′ the order prints the cap's arithmetic | `carrossier`, `mecano-chaine`, `pompiste`; `economiste` | | todo (`hourCheck()` built) | D1 |
| 2.9 | Bad-day procedures | Solana or Jupiter down, a founder unreachable: written into the fiche and `/plein` | founders-only; `economiste` | | todo | D15, by Wed 21 |
| 2.10 | The price of Plein #1 | the survey published before Sat 24, 17:45 (Tier 2: early in the week), confirmed by `enqueteur`, merged by the other founder | `enqueteur`; founders-only merge | `prix-officiel`, `/plein price` | built-unverified | |
| 2.11 | Saturday automation | `plein` enabled again on Fri 23 if disabled today; `/plein` says "no order in the ops chat by 17:55: run `npm run plein` by hand"; `ops_notify` on the ask list or the exception written (D19) | `automaticien`; founders | `/plein friday`, step 8 | todo | |
| 2.12 | The totem caption | it ends "Publication automatique." and `ligne-continue` has gated it; only then is `totem` enabled | `imprimeur`, `automaticien`; `ligne-continue` | `totem` workflow | todo | it posts to the public channel by itself |
| 2.13 | The single keys covered | the organization (if deferred today); `vigie` compares `<siteUrl>/live.json` with `main`; a chain-reader light on the fee-sharing account and `canEditCreatorFee` | founders; `automaticien`; `mecano-chaine` | | todo | |
| 2.14 | Rehearsals | `/plein rehearsal`, local only, labelled end to end; the ticket-against-the-guard rehearsal green | `tresorier`, `imprimeur` | `/plein rehearsal` | todo | 2.6 |
| 2.15 | The run | 17:30 GO; the claim before 17:50 and the balance check; the slices; the burn at 19:00; the transfers; the ticket at 19:05; the post | founders sign; `tresorier`, `imprimeur`, `pompiste` | `/plein go`, `claim`, `run`, `ticket` | built-unverified | 2.1 to 2.14 |

## Level 3: the first month, Pleins #1 to #4 (24 Oct, 31 Oct, 7 Nov, 14 Nov)

**Done when** four Saturdays print four tickets, the 25 October clock change and the 1 November
drop pass without a wrong time or a hidden effect, and the thesis metrics are read on Sunday
8 November against their targets.

| # | Outcome | Done when | Owner | Moved by | Today | Rethink if |
| --- | --- | --- | --- | --- | --- | --- |
| 3.1 | Four pleins, four tickets | 4 of 4 tickets, each clean under `verify:ticket` | `tresorier`, `imprimeur`; founders | `/plein` | todo | a Saturday without a ticket |
| 3.2 | The clock change, Sun 25 Oct | the countdown reads right across it (`clock.test`, Tier 1); `totem` and `plein` use their winter cron line (Plein #2's order at 17:52 CET); post 22 out | `automaticien`; `pompiste` | the gate test in `automation.test` | built-unverified (the switch has never run) | any run at the wrong hour |
| 3.3 | The 1 November drop | post 26 on Wed 28 explains it in points; the rate follows at the first survey that includes it; the formula unchanged; the team's share rising said in the same post | `pompiste`, `economiste`; `ligne-continue` | `/post` | todo (the drop is an announcement, Tier 2) | a post that promises a plein number or hides the team effect |
| 3.4 | The weekly price loop | four surveys in a row confirmed by `enqueteur` and merged by the other founder before Saturday 17:45 | `enqueteur`; founders | `prix-officiel` | built-unverified | a plein on a stale price |
| 3.5 | The metrics can be read | D17 decided by Sun 25 Oct; if no analytics, the Trigger, Utility, Bridge, Ritual and Play rows read "no data" and the Sunday report says so | founders-only; `releveur` | `/releve` | todo | |
| 3.6 | Sunday rituals | carnet de bord #0 to #3 (18 Oct, 25 Oct, 1 Nov, 8 Nov) at 11:00; `docs/releves/YYYY-MM-DD.md` each Sunday; the Board refreshed | `releveur`, `pompiste`, `chef-de-station` | `/releve` | todo (`docs/releves/` does not exist) | a skipped Sunday |
| 3.7 | The claims register | `docs/registre-tier2.md` exists; the fee schedule moves to Tier 1 from the first ticket's trades | `enqueteur`, `chef-de-station` | | todo | |
| 3.8 | Graduation, if it comes | one "Rodage terminé" post; the toll's new split the same day; "locked" never written before it is seen on-chain | `pompiste`, `mecano-chaine`, `carrossier` | | built-unverified | |
| 3.9 | Weekday slices if the carry grows | option B adopted once the carry passes one week's buyback two Saturdays running (`moteur.md` §4) | `economiste`; founders | a weekday order in `plein.mjs` (not built) | todo | |
| 3.10 | Midweek claims | above $1,000 unclaimed, claimed and moved back to back; the ticket shape for several claims changed in `interfaces.md` first (D21) | `tresorier`; founders; `chef-de-station` | `/plein midweek` | todo | |
| 3.11 | Hygiene | `/api/diesel` and `/api/stations` normalise query strings; actions pinned to SHAs; `.gitattributes`; D18; a Content-Security-Policy once the Plugin's domains are known | `mecano-chaine`, `automaticien`, `carrossier`; founders | | todo | |

**The thesis metrics** (`thesis.md`, "How we'll know it works"). Proposed targets for Plein #3,
read on Sunday 8 November. None can be read before D17.

| Engine | Metric | Target by 7 Nov | Rethink if | Source | Today |
| --- | --- | --- | --- | --- | --- |
| Trigger | next-day visits against the day's change in the national diesel price | a visible positive link | no link after three weeks | analytics, `/api/diesel` | no data |
| Utility | share of sessions that run a Mon Plein search | 30 % or more | under 10 %: off the main path | analytics | no data |
| Bridge | share of Mon Plein users who scroll on to Le Péage | 15 % or more | under 5 %: the copy between them fails | analytics | no data |
| Ritual | visitors 18:00 to 19:05 on Saturday against an average weekday hour | 3× or more | under 1.5× at Plein #3 | analytics | no data |
| Play | totems exported per week | rising every week | flat for two weeks: new templates | analytics | no data |
| Trust | contract-checker uses; losses to fake contracts reported to us | used, zero losses | any loss: pinned warning everywhere, checker in the hero | analytics; reports | no data; 0 reported |

## Level 4: the engines beyond the fees, and the culture

**Done when** one outside revenue line is paid through the company, cleared by the lawyer and on a
ticket as "apport externe", the food aid is paid in euros with its receipt, and every ritual has
run every week it was due. Rules for outside money (`moteur.md` §6): nothing is announced before
it is invoiced and paid; it goes through the company only; 100 % of it goes to the buyback, never
through `splitWeek`.

| # | Outcome | Done when | Owner | Moved by | Today | Rethink if |
| --- | --- | --- | --- | --- | --- | --- |
| 4.1 | The company | a legal person exists: the site's publisher, the offeror if the lawyer says so, an exchange account for the aid and the team | founders-only | | todo | |
| 4.2 | The lawyer's answers | the private question list answered | founders-only; `ligne-continue` prepares | the private document | todo | |
| 4.3 | Outside money in the shape | `apports` (2.3) also carries "apport externe" from a published company wallet | `chef-de-station`, `economiste` | `interfaces.md` | todo | |
| 4.4 | A first outside revenue line | one line live, cleared, paid, on a ticket. In order: merch through the company; a neutral launch-audit report (raw measurements, no grade), not before December; a totem-card licence only if a buyer asks | `atelier-idees` proposes; `economiste`, `ligne-continue` gate; founders | | todo | no paying customer by the end of December: drop the engine, the ritual stands alone |
| 4.5 | Food aid paid | an agreement signed; the first payout in euros with its receipt; the partner named only then | founders-only | | todo | the partner pulls out: 10 % to a published escrow until a new one signs, never to the team |
| 4.6 | Team pay | the company and its tax treatment in place before the first `teamTransfer`, or the team waits and the ticket says so (D13) | founders-only | | todo | |
| 4.7 | The rituals hold | totem, relevé, J-1, plein, ticket, carnet: none skipped without its reason posted | `pompiste`, `imprimeur`, `automaticien` | `totem`, `/post` | built-unverified | a silent skip |
| 4.8 | Regulars verify | "tranche vérifiée" replies counted on each ticket (post 23) | `pompiste`, `releveur` | | todo | target set on Sun 1 Nov from two pleins; no baseline today |
| 4.9 | The group | "L'aire de repos" opens only with named, unpaid moderators (D9); rules and anti-scam pinned | founders-only; `pompiste` | | todo | |
| 4.10 | Play | the next Atelier template ("le compteur"); the card prints that it will never be converted into tokens; the FIN DU MOIS, LOYER and BAGUETTE presets gone | `carrossier`, `imprimeur`; `critique-degen` | | todo | Play flat for two weeks |

Refused for good: a swap referral fee, fee sharing or a referral code, yield on the réservoir,
paid listings, boosts, trending slots and paid calls, station-made volume.

## Level 5: the long game

| # | Outcome | Done when | Owner | Today | Rethink if |
| --- | --- | --- | --- | --- | --- |
| 5.1 | A ticket every Saturday | no Saturday without one, near-empty réservoir included, for as long as the station runs | everyone; `/plein` | todo | the kill criteria below |
| 5.2 | Trust compounds | zero losses to fakes; no Tier 2 claim in public copy; every published number on-chain or sourced | `vigie`, `ligne-continue`, `enqueteur` | built-unverified | any loss: the thesis kill switch |
| 5.3 | Legal standing | the company, the lawyer engaged, a white paper if required | founders-only | todo | any AMF or DGCCRF contact: stop all marketing at once |
| 5.4 | The formula and the founders' rule hold | changed only with four weeks' notice on the fiche, the site and the channels | `economiste`, `ligne-continue` | done (`formula.test`) | |
| 5.5 | No single key | an organization with both founders as owners; passkeys or hardware keys on GitHub and Vercel; a recovery path for a lost creator or multisig key; the Vercel/`main` compare | founders; `automaticien` | todo | |
| 5.6 | Honest about size | no chase of market cap: above about $10M the buyback is cosmetic (`moteur.md` §2, §7); no station-made volume, ever | `economiste` | done (written) | |
| 5.7 | Mon Plein outlives the coin | free and unsponsored for at least four weeks; maybe its own domain later | `carrossier` | built-unverified | Utility under 10 % |
| 5.8 | An orderly end, if it comes | four weeks' notice, a final plein under the same formula, the site kept as an archive | founders | done (written, `moteur.md` §8) | |

## Kill and keep, every Sunday

From `npm run releve -- --markdown` and the latest ticket; the full table is `moteur.md` §8.
"Veille": the ritual continues, no new spending, no new features.

| Signal | Act when | Action |
| --- | --- | --- |
| Creator fees of the week | under $100 four pleins running; under $25 for eight | veille; then wind-down |
| Curve flags, fee configuration | a flag true, `creatorFeeBps` not 0, a fee row unlike `fees.js` | stop and publish; a PR to `fees.js` the same day |
| Creator fee recipient | anything but the published creator wallet | stop, publish, rotate |
| Canonical share of volume | under 80 % for two weeks | post where fees are paid; the order uses `f` = 0.30 %; never seed another pool |
| Reliquat | above one week's buyback | the team waits; under A′, two Saturdays running: option B |
| Top 10 wallets | above 30 % (warn); above 50 % | name the wallets in the self-audit; the buyback is unchanged |
| Founders' $PLEIN | a founder holds or buys, or an undisclosed founder wallet is found | disclosed within 24 h; a second breach ends the project |
| Fake contracts | any loss reported | warning pinned everywhere, the checker in the hero |
| Legal | AMF or DGCCRF contact, or the lawyer says "offeror" | stop all marketing at once |
| Security | a transaction nobody approved knowingly | pause the plein, publish, rotate |
| Political capture | adopted as a protest symbol, or attacked as profiting from one | the neutrality line once, no engagement |

## Board

Refreshed 17 October, about 05:00 Paris. Next refresh: the 14:30 go/no-go, then Sunday 18 October.

**Now** (agents, in the working tree, before the first push)

| Task | Owner | Files | Depends on | Gate | Moves |
| --- | --- | --- | --- | --- | --- |
| `plein.yml` skips scheduled runs more than 36 h before `firstPleinAt`, with a test | `automaticien` | `.github/workflows/plein.yml`, `scripts/_gate.mjs`, `test/automation.test.mjs` | | `controleur-technique` | 1.4 |
| The fiche's creation link as an account or token page; the funding line; the lines that do not wait on D1 to D3 | `carrossier` | `public/fiche-plein.html`, `public/js/fiche.js`, tests | D1 to D3 for the rest | `ligne-continue`, `economiste` | 1.7 |
| Three audit rows: `creatorFeeBps`, the fee-sharing account, `initialVirtualQuoteReserves` | `mecano-chaine` | `scripts/audit.mjs`, its test | | `controleur-technique`, `economiste` | 1.14 |
| This file and `lancement.md` | `chef-de-station` | these two | | `ligne-continue` (both are public) | 1.15 |
| 2.3283 against the ministry table, row 46304 | `enqueteur` | none (a read) | | | 1.13 |
| A 1 USDC quote into an existing USDC pump.fun curve | `mecano-chaine` | none (a read) | | | 1.11 |
| The full diff read as a competitor would | `ligne-continue`, `controleur-technique` | none | the rows above | | 1.1 |

**Blocked on a founder** (times are Paris, today)

| What | By |
| --- | --- |
| Private document: `innovations.md` §3 and §4 out of the tree; D7 | 08:30, before the first push |
| D1 to D6 decided and written | 07:30 |
| The organization (or the deferral written here), B's handle in CODEOWNERS and `claude.yml`, the branch rule | 08:30 |
| Hardware device in hand; creator and throwaway accounts; the exchange withdrawal | 08:00 |
| X account, Telegram bot, channel and ops group, the secrets, a Helius key, the Claude token | 12:00 |
| Vercel import | right after PR1 |
| The throwaway rehearsal and the Plugin test | 12:00 |
| D8, D9, D10, D11 | 10:00 to 14:30 (see `lancement.md`) |
| README "At 15:30" and "Every week"; CLAUDE.md non-negotiable 2 | in PR2 |
| D12: open without the lawyer's answer, both names in the private document | 14:30 |

**Waiting for the second key**

| PR | Written by | Approved by | By |
| --- | --- | --- | --- |
| PR1: the working tree | A | B | 11:00 (14:30 at the latest) |
| PR2: le jour J (fiche, mentions légales, links, og tags, wording, README, CLAUDE.md) | either | the other | 13:00 |
| PR3: the contract | A | B, after the three checks | about 15:40 |
| PR4: the lights after the audit | A | B | about 17:00 |

**Next**

- **Re-enable `plein` on Friday 23 October** (`gh workflow enable plein`) if it was disabled today;
  `/plein friday` step 8 checks it.
- `totem` stays disabled until 2.12 is done.
- If D5 deferred the organization: done by Friday 23 October.
- Sunday 18: carnet de bord #0 at 11:00, the first report in `docs/releves/`, this Board refreshed.
- Level 2 by its dates: the multisig and both procedures by Wed 21, the guard amendment by Thu 22,
  the rehearsals on Fri 23.

**Open decisions**

Today's (D1 to D12) carry a recommendation in [`lancement.md`](lancement.md#decisions-due-today).

| # | Decision | By |
| --- | --- | --- |
| D1 | Hour cap on the fiche: A, A′ or B (`moteur.md` §4) | today 07:30 |
| D2 | The founders' rule (hold no $PLEIN, buy none) on the fiche; the personal-wallet rows on the page | today 07:30 |
| D3 | Creator wallet: published in PR2, or recorded privately and committed in PR3 | today 07:30 |
| D4 | Domain now, or the vercel.app address today | today 07:30 |
| D5 | The organization now, or deferred to Fri 23 with the limit written | today 07:30 |
| D6 | Who holds which single key (creator device, Vercel, GitHub) | today 07:30 |
| D7 | `moteur.md` §4 and §8 in the public repo | today 08:30 |
| D8 | The publisher named in the mentions légales while no company exists | today 10:00 |
| D9 | The Telegram group open today, or closed | today 12:00 |
| D10 | The pump at the opening if the Plugin is untested or Jupiter has no route | today 14:30 |
| D11 | What the fees of a coin created wrong would become | today 14:30 |
| D12 | Open without the lawyer's answer: both names in the private document | today 14:30 |
| D13 | Team share at Plein #1: paid to `wallets.team`, or held until the company exists | Fri 23 |
| D14 | Multisig tool, signers, threshold, lost-key recovery | Wed 21 |
| D15 | Solana or Jupiter down; a founder unreachable | Wed 21 |
| D16 | How the 10 % is held until an aid agreement | Fri 23 |
| D17 | Cookie-free analytics, or "no data" for five of six metrics | Sun 25 |
| D18 | Vercel Hobby or Pro | Sun 25 |
| D19 | `ops_notify`: on the ask list, or the exception accepted in writing | Fri 23 |
| D20 | Option B (weekday slices) | when the carry passes one week's buyback twice running |
| D21 | A list of claims in the ticket shape | before the first midweek claim |

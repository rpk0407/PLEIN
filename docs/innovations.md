# Innovations: the ranked plan

17 October 2026, 02:00 Paris, 13 h 30 before the 15:30 opening. atelier-idees with chef-de-station,
for the two founders. It ranks what to build next. It changes no file but this one, and nothing in
it signs: every build path reads, computes or prints, and the founders sign by hand.

> **How it was scored.** Three judges scored each idea out of 10: legal (the lines in `CLAUDE.md`),
> impact (the metrics in `thesis.md`, "How we'll know it works") and taste (would the French scene
> share it). Total = legal + 1.5 × impact + 1.5 × taste, out of 40. A legal score under 6 sinks the
> idea. Scores are written `31.5 · L9 I9 T6`, and `#n` is the judges' idea number. The judges' wording
> fixes are applied in place. Facts follow the tiers in `CLAUDE.md`; a figure here is a score, a
> number from the repo's docs, or marked Tier 2. `docs/objectifs.md` is linked from `CLAUDE.md`
> but does not exist yet, so this plan ranks against the thesis metrics.

**Where chef-de-station overrules the scores, and why:**

1. **T5 (#5, 27.5) replaces #10 (28) in today's five.** #10 has no deadline today: every draft
   already passes ligne-continue, and the fix takes one hour on Sunday. T5's failure lands at 15:30
   on the site's only call to action, and whether Jupiter routes a curve coin is Tier 2.
2. **Six blockers sit outside the ranking** (#2, #12, #13, #22, #23, #29). The 1.5× taste weight
   buries plumbing, and each one is the condition for a promise already published (a ticket every
   Saturday, a guard that is never loosened, no personal account near the coin). They take no slot
   and they come first (section 0).
3. **Two of the Plein #1 five ship cut down,** as the impact judge asked: P3 server-polled only, P4
   the late-ticket sign only. At full scope neither fits the week.

**Checked in the working tree at 02:00, not taken on trust:**

- `scripts/audit.mjs` already has `checkCurveSettings` (quote, creator, the four flags, supply) and
  the creator's own buy, so T1 is smaller than pitched. #1's claim that audit.mjs "never reads" the
  flags is out of date.
- `public/plein.ics` already reads 15:30 with `SEQUENCE:1`, but it is not committed.
- `live.json` `wallets.creator` and `config.js` `siteUrl` are both empty.
- `api/stations.js` filters on price sanity only, not on age.
- `stamp()` in `public/app.js` writes the card on a Saturday visit, a Mon Plein search, an Atelier
  export and a ticket-link click (lines 129, 748, 982, 1089), before anyone asked for a card.
- `.claude/agents/pompiste.md` has Bash. `CURVE_SPEC` in `api/_pump.js` is not exported.

## 0. Blockers first (conditions, not ideas)

**Today.**

| By | What | Who | Why it cannot wait |
| --- | --- | --- | --- |
| 11:30 | T3 deployed, or post #2 (12:00, Mon Plein) is held | carrossier, a founder merges | Don't send holiday drivers to stale prices |
| 14:30 | GO or NO-GO on the two launch-day page changes (T2, T5); NO-GO means their fallbacks | controleur-technique | Page freeze on launch day |
| 15:00 | `wallets.creator` published in `live.json` | founders | T1 has nothing to pre-register without it; moteur §3 compares against it at 15:31 |
| 15:00 | `plein.ics` committed and deployed, plus a test in `test/config.test.mjs` that ties its two DTSTARTs to `launchAt` and `firstPleinAt` (#2) | carrossier | A calendar that still said 18:00 would make the real 15:30 contract look fake |
| Before the creation click | `siteUrl` decided, then typed into the website field of pump.fun's form (#4). Whether it can be edited later is Tier 2, so assume today or never | founders | The token's metadata pointing back to the site is the one witness a clone cannot copy |
| Today, free | **Repo visibility** (#23): the repo is under a founder's personal GitHub account (non-negotiable 5). Decide public or private now; if it moves to a station organisation later, keep the history or say openly that it moved (culture §5: « Le plan et sa correction sont publics. ») | founders | It ties a personal account to the coin today |
| Today, free | **Team share held** (#22): no team transfer before the company exists and an expert-comptable has answered who is taxed on fees that get burned | founders, tresorier | Taxed on 100 % while keeping 43,4 %, the team keeps about 18,4 % at an assumed 25 % rate with no deduction (assumptions, not advice) |
| Today, free | **Host terms** (#29): read Vercel's Hobby fair-use page (non-commercial use, Tier 2). Pay for Pro from the team line and publish the cost, or accept the risk knowingly | a founder | A commercial site on Hobby can be cut off on a Saturday |

**Before Plein #1.**

| By | What | Who |
| --- | --- | --- |
| Wed 21 | Adopt the execution rule of moteur §4, or not. P3, P4, `plein.ics` and posts 19–20 depend on it | founders, economiste |
| Thu 22 | **Guard fix** (#12). `test/no-signing.test.mjs` flags any 86–90-character base58 string, and a transaction signature is one, so CI turns red when `plein-001.json` is committed at 19:05 on the 24th. Under `public/tickets/**` only, set a string aside when it sits under a `sig` key or in a `solscan.io/tx/` URL **and** `looksLikeKeypair()` (`scripts/ticket.mjs`, RFC 8032) is false. New cases: a planted key pair in a `sig` field fails; a signature in `public/index.html` fails. Both founders approve in writing and quote « never loosen it » | imprimeur builds, controleur-technique reviews |
| Thu 22 | **Ticket v2, reserved slots only** (#13). Ticket #1 is permanent and `validateTicket` rejects unknown keys, so reserve now, all nullable: `prev`, `seal`, `formula`, `diesel.evidence`, `bridge`, `teamTransfer`, `sorties`, `aideComplement`, `horsService`, `kind` (for the migration ticket), and the §4 fields if adopted. Skip the full rétroviseur shape. A dress-rehearsal ticket validates with every field present, as a value or as null | imprimeur, review controleur-technique and economiste |
| Fri 23, 18:00 | Proposed: no page change until the Plein #1 ticket has printed | chef-de-station |

**Review budget.** Two founders approve every merge, so the week is limited by their reviews, not
by agents. Proposed order: Sun the T2/T5 follow-ups, #10, #8's text hint · Mon guard fix, P5 ·
Tue ticket v2 · Wed P1, P4 · Thu P2, P3, dress rehearsal. What is not merged by Thursday 22:00
waits for Plein #2.

## 1. Build now

### Today, before 15:30

**T1 · Le ticket d'ouverture** · #1 · 31.5 · L9 I9 T6 · hours
At 15:00 the station commits the creation settings it is about to choose. At 15:31 it reads each
one back from pump.fun's accounts and prints ✓, ✗ or « non lu », before the mint goes into
`live.json`. It doubles as the go/no-go moteur §3 asks for.

- **Build.** (1) `scripts/ouverture.declared.json`: quote USDC, creator buy 0, `isHolderReward`,
  `isCashbackCoin`, `isMayhemMode` and `canEditCreatorFee` false, creator = `live.wallets.creator`,
  fee sharing none. Merged before 15:00: the commit time is the pre-registration. (2) `audit.mjs
  --preflight` at 14:45: `parseGlobal(globalAddress())` lists USDC in `whitelistedQuoteMints`.
  (3) After creation, `checkCurveSettings` compares against the declared file, and each row ends
  « lu dans [compte] au slot [n], d'après l'IDL ». For fee sharing, a missing
  `sharingConfigAddress(mint)` account prints « aucun compte de partage au slot [n] » and a present
  one prints « présent, non décodé » (Tier 2: that no account means no sharing). An unread field is
  never ✓. (4) Output: markdown for the ops chat; a PNG plate « TICKET D'OUVERTURE » through
  `_render.mjs` (never « Plein #0 »); `public/tickets/ouverture.json` with addresses and slots only,
  no signature (the guard), kept out of `tickets/index.json`. (5) `test/ouverture.test.mjs` on a
  curve fixture built at run time (export `CURVE_SPEC`).
- **Who signs.** One founder creates the coin by hand from the station creator wallet, with the buy
  field at 0. Both check the mint on Solscan. One runs the script and opens the `live.json` PR only
  if every line is ✓; the other approves. A ✗ means the mint is not published (moteur §3).
- **Owner.** mecano-chaine, with imprimeur for the plate · review controleur-technique · the 15:00
  post through ligne-continue (settings only: no contract, no call to buy).
- **Metric.** 7 of 7 declared settings read with value and slot before the contract enters
  `live.json`; at most 60 min from the creation transaction to the published ticket, before the
  16:30 contrôle technique. Falsifier: an outsider finds a setting the ticket got wrong.
- **Cheapest test, tonight.** `node scripts/audit.mjs --mint <a live USDC pump.fun curve>
  --markdown`, then read every line.

**T2 · La carte qu'on prend au comptoir** · #7 · 31 · L10 I7 T7 · hours
The card exists only once the visitor taps « Prendre une carte », « Rendre la carte » erases it, and
it prints the promise culture §9 makes only in replies.

- **Build.** `public/js/carte.js` gains `hasCard`, `takeCard` and `returnCard` (removeItem).
  `stamp()` in `app.js` returns early unless `hasCard()`. In `index.html` `#carte`: « Prendre une
  carte » (sodium, shown when there is no card), « Rendre la carte », and « Elle ne vaut rien et ne
  sera jamais convertie en jetons. » `test/carte.test.mjs` asserts that nothing is written before the
  tap. The portable card (`#carte=` fragment, Web Share, the « 7/10 · Gagné : rien » export) comes
  next week; see the table.
- **Fallback on a NO-GO at 14:30.** A one-line early return in `stamp()` (no write at all) plus the
  never-converted line; the opt-in ships Sunday.
- **Owner.** carrossier · copy through ligne-continue · GO controleur-technique.
- **Metric.** Storage writes before the tap: 0, asserted by a test. « La carte, c'est un snapshot ? »
  answered at most once in the carnet.
- **Cheapest test.** In a private window, run a Mon Plein search and an Atelier export; DevTools
  shows `localStorage` empty.
- **Why it matters.** Under the CNIL's reading of art. 82, an unasked write to localStorage is
  treated like a cookie, and the site says « no cookies ». The tap makes it a service the visitor
  asked for (lawyer question 3).

**T3 · Mon Plein, à jour ou rien** · #3 · 30 · L9 I8 T6 · hours
Before the 12:00 post sends holiday drivers to Mon Plein, list only prices updated in the last
72 hours and drop obvious typos.

- **Build.** In `api/stations.js`, `cheapest()` and `areaStats()` add
  `${FIELDS[fuel].updated} >= now(days=-3)`, per fuel. They drop a price more than 0,25 €/L under
  the area average and count it (`outlierCount`, never silently), and return `freshCount` and
  `staleCount`. The existing département widening runs when fewer than 3 fresh stations remain.
  `api/diesel.js` uses the same freshness, so the ticker and later the totem agree. Stub tests in
  `test/api.test.mjs`: a stale cheaper station is skipped, the outlier is skipped, the fallback
  fires. `scripts/check-feed.mjs` asserts the feed accepts `now(days=-3)`.
- **Later** (in the table): the detour estimate labelled « estimation », the night toggle, the
  per-station motorway label.
- **Owner.** carrossier · review controleur-technique (api/ diff) · releveur re-reads the
  lens's 02:00 counts (58 of the 100 cheapest diesel prices more than a week old, one Ain price
  81 c under the next) before anyone quotes them.
- **Metric.** Top-3 results older than 72 h: 0. Reports of a wrong price at the pump: 0. Sessions
  running a search: 30 % or more by Plein #3 (thesis Utility row).
- **Cheapest test.** `npm run check:feed`, then 75011, 13001 and 69003 with and without the clause;
  count the rows dropped.

**T4 · Les mots de l'arnaque, occupés d'avance** · #6 · 29 · L8 I6 T8 · hours
Take the scam vocabulary first: each path serves one static page saying it does not exist, so a
regular answers a fake claim link with a link.

- **Build.** `public/pas-d-airdrop.html` (page.css): « Il n'y a pas d'airdrop $PLEIN. Il n'y en
  aura pas. Un lien qui t'en promet un veut vider ton wallet. » `vercel.json` **rewrites** (not
  redirects, so the scammer's path stays visible) `/airdrop`, `/claim`, `/presale`, `/bonus`,
  `/remboursement`, `/v2` and `/migration`, with the same routes in `scripts/dev.mjs`. `/v2` and
  `/migration` add « Le plein est fait tout seul : la migration sur pump.fun ne te demande rien. Le
  seul contrat est celui du site. » `public/llms.txt` in French and English links `/live.json`,
  `/fiche-plein.html`, `/tickets/index.json` and `/api/chain`, holds no address, served as
  `text/plain`. Preview PNGs from `scripts/templates/reponse.html` through `_render.mjs`, with no
  address in any image. A test checks the rewrites exist and that no page holds a base58 address.
- **Later.** `api/fausses-pompes.js` without `pairUrl`; the referrer notice.
- **Owner.** carrossier (pages, rewrites, llms.txt) · imprimeur (previews) · vigie (the vocabulary)
  · copy pompiste, then ligne-continue.
- **Holds only if.** No address anywhere but `live.json` (non-negotiable 2). Link previews need
  `siteUrl` and an absolute `og:image` (roadmap 1); the pages work without them.
- **Metric.** Requests on the scam paths per week (plain server logs); pastes counted by hand in
  the carnet; losses to fake airdrop, claim or V2 links: 0.
- **Cheapest test.** On a preview, `curl -i` each path: 200, the page, the path unchanged.

**T5 · La pompe s'auto-teste avant de s'ouvrir** · #5 · 27.5 · L8 I7 T6 · hours · *overrule, see above*
If Jupiter has no route for a curve coin at 15:30, the main button should open on an honest plate,
not a broken widget.

- **Build, plate first.** A `data-if='pumpWaiting'` plate inside `#pump`, shown only after the
  visitor pressed the button, linking `COIN_URL` + contract: « Jupiter ne dessert pas encore $PLEIN.
  Sur la page pump.fun du jeton, l'app ajoute 0,45 % de frais de plateforme (d'après pump.fun). La
  part de la station est la même. » No referral code. **Then, only if CORS passes on the preview by
  14:30:** `openPump()` asks `lite-api.jup.ag/swap/v1/quote` (USDC to the mint, 10 USDC, 100 bps,
  6 s timeout; `config.jupiter.quoteUrl` overrides). A route calls `mountPlugin()` and adds the route
  line from `fees.js`, attributed « d'après pump.fun » until the first ticket; no route shows the
  plate and retries every 60 s while the panel is open. `public/js/route.js` + `test/route.test.mjs`
  on recorded quote JSON.
- **Owner.** carrossier · enqueteur reads CORS and the route on the preview with another live curve
  mint · GO controleur-technique.
- **Metric.** Minutes from 15:30 to the first successful quote in production, watched by a founder;
  0 « la pompe est cassée » threads on launch afternoon.
- **Cheapest test.** From the preview's console, fetch the quote URL for a live USDC curve mint and
  read the CORS headers and `routePlan`.

**Today's clock.** ≤ 11:30 T3 deployed · 14:30 GO/NO-GO on T2 and T5, CORS reading · 14:45 T1
preflight · 15:00 T1 declared file merged, T4 live, `plein.ics` deployed · 15:30 creation by hand ·
15:31 T1 read-back, then the `live.json` PR · 16:30 contrôle technique.

### Before Plein #1, Saturday 24 October

**P1 · La contre-visite: ton navigateur re-vérifie le ticket** · #15 · 31.5 · L9 I7 T8 · days
Beside every ticket line, « Vérifier » has the visitor's own browser fetch the transaction from a
node they choose and check it, in words. « Tout vérifier » prints a PV card. The station's server
is not in the path.

- **Build.** Move the pure core of `scripts/verify-ticket.mjs` (`checkSlice`, `checkBurn`,
  `checkAid`, `checkClaim`, `verifyTicket({ fetchTx })`) and the pure logic of `tokenDeltas`
  (`api/_solana.js`) into `public/js/verify.js`; the CLI imports it and keeps files and flags.
  `fillTicket()` in `app.js`: « Vérifier » per line, « Tout vérifier », an optional « Ton nœud RPC »
  field (the public mainnet node by default, two alternatives listed), one request at a time, and a
  notice before the click (« ton navigateur va interroger … »). Per-line states: « retrouvée »,
  « en attente », « différente », « non lue ». The card reads « Contre-visite du Plein #1 · [n]/[n]
  lignes retrouvées sur la chaîne », never « conformes », through a `'pv'` format in `drawCard()`.
  Deep links like `#plein-1-tranche-4`. The `ticket` stamp moves to a completed check (with T2's
  card). `plein.yml` runs `npm run verify:ticket` at 19:10 every Saturday. `test/verify.test.mjs` on
  recorded transactions, including a valid signature from another vault.
- **Holds only if.** A transaction not found yet shows « en attente », never a defect, so RPC lag
  cannot print false FUD. A real mismatch prints « différente » and the next ticket answers it.
  Verifiers are counted, never named. The future CSP lists the RPC hosts in `connect-src`.
- **Owner.** mecano-chaine (verify.js) · carrossier (UI, card) · automaticien (19:10 job) · review
  controleur-technique.
- **Metric.** PV cards posted publicly under the Plein #1 ticket by 22:00, counted by hand (target
  12; falsifier: fewer than 3 by Plein #3). Every line passes both the browser check and the 19:10
  CI run.
- **Cheapest test.** On a preview, check one recorded mainnet swap from the browser through the
  public node: CORS, rate limit, and the time for 14 sequential reads (Tier 2 until then).

**P2 · Le pistolet fait clac: « ARRÊT AUTOMATIQUE · COURBE TERMINÉE »** · #27 · 30.5 · L8 I6 T9 · hours
When the curve completes, the gauge snaps full, the nozzle gives the one jolt every driver knows,
and the station prints one unnumbered ticket with no price on it. Renamed from « RÉSERVOIR PLEIN »,
which reads as a full treasury (legal judge).

- **Build.** `api/chain.js`: `curve.migrationSig`, the earliest signature on the curve address after
  which `complete` is set (null if not found); `interfaces.md` and `readings.js` (`isTxId`) updated.
  The releve workflow pings the ops chat (`telegram.mjs --ops`) when `complete` flips.
  `ticket.mjs --migration <sig>` renders a `kind: 'migration'` variant of the ticket template:
  opening time, completion time, duration, the Solscan link; no market cap, no price, no « LP
  lockée ». `public/tickets/migration.json` needs the guard fix and v2's `kind`. `renderCurve()`: a
  600 ms nozzle shake and the gauge snap when `complete` flips during the page's life (not under
  reduced motion); a `data-if='pleinFait'` banner for 24 h with the link; a « Son » toggle, off by
  default, with a 150 ms click made with Web Audio (no audio file). Founders post culture's
  one-liner by hand; the toll switches to the pool tiers the same minute.
- **If the curve completes first** (about $12,2k of net buying, moteur §2: it can happen today):
  post the one-liner, and print the ticket the next morning with its date.
- **Owner.** mecano-chaine (migrationSig) · imprimeur (ticket) · carrossier (banner, motion) ·
  automaticien (ping).
- **Metric.** From `curve.complete` on-chain to the banner on open pages: 2 min or less. Shares of
  the post against the median station post that week.
- **Cheapest test.** Run the migrationSig method on a recently graduated USDC pump.fun coin and
  check it finds the right transaction (Tier 2: the shape of a USDC migration).

**P3 · Le plein en direct, lu sur la chaîne** · #21 · 30 · L9 I6 T8 · days · *server-polled only*
The thesis promised a broadcast from 18:00 to 19:05. Slots fill as each réservoir swap lands
on-chain, read by an endpoint, never typed, with the 17:45 plan beside what landed.

- **Build.** `api/plein.js` (GET `/api/plein`): the réservoir (and executor) from `live.json` only,
  so it is no RPC proxy; signatures since 17:45 Paris (`clock.js`); `getTransaction` +
  `tokenDeltas` keep slices (vault USDC down, $PLEIN up) and the burn (supply down); anything else
  touching the réservoir is listed as « mouvement hors plan ». Returns `{ asOf, slices: [{ sig, at,
  spent, bought }], burn, other }` with `s-maxage=15`. `public/plein/ordre-NNN.json` from
  `plein.mjs --json` at 17:45. While `pleinInProgress()`, `app.js` polls every 15 s and renders
  `[data-plein-live]` in `#samedi` and a strip on the totem in LED green, with `aria-live` lines
  (« Tranche 7 sur 12 lue sur la chaîne à 18:30 »), the tab title « Tranche 7/12 », and « Suivre le
  plein » in place of « Faire le plein » for the hour. Reduced motion shows final states.
  `test/plein-live.test.mjs` on stubbed RPC.
- **Deferred.** The opt-in browser WebSocket feed, wakeLock, the pump-display skin.
- **Holds only if.** A slot fills only from a confirmed transaction; an empty slot is a dash with
  its planned time; a failed slice prints « hors service ». No price, no chart, no buy prompt in the
  hour. « Le reste s'achète dans la semaine » only if §4 is adopted, and weekday slice times are
  never shown in advance.
- **Owner.** mecano-chaine (endpoint) · carrossier (UI) · tresorier (the 17:45 order file).
- **Metric.** Saturday 18:00–19:05 visitors at 3× an average weekday hour or more by Plein #3
  (thesis Ritual row), counted from `/api/plein` invocations per minute, with no trackers. At Pleins
  #1 and #2, every slice visible in a founder's browser before the channel post.
- **Cheapest test.** Locally (`npm run dev`, never a deployed preview), point a scratch `live.json`
  at a wallet that swaps USDC often, run for 20 min, and check that slots fill and nothing else
  shows as a slice.

**P4 · Le panneau qui se signale en retard** · #24 · 28.5 · L9 I5 T8 · hours · *late-ticket sign only*
One motorway sign nobody sets by hand: if there is no ticket for this Saturday by 19:35, the totem
reads « PLEIN #N · TICKET EN RETARD » until it prints, so no sceptic has to be the first to notice.

- **Build.** `public/js/pmv.js` `pmvMessage({ now, chain, live })` walks a fixed priority list:
  « PRIX FIGÉ » from 17:45; « PLEIN EN COURS · TRANCHE n/12 » (from P3); « TICKET EN RETARD » when
  `tickets/index.json` has no ticket for the last Saturday on or after `firstPleinAt` by 19:35;
  by default « AUCUN DM, JAMAIS ». Labelled « message automatique », with the rules copied into the
  fiche. `plein.yml` gets a 19:35 Paris check (two UTC crons and a Paris gate, as `totem.mjs`
  does) running `ticket.mjs --check-due`, which pings the ops chat. A late ticket prints « Imprimé à
  [heure], [n] min de retard ». Tests: `test/pmv.test.mjs`, and clock cases across 25 October,
  31 October included.
- **Deferred.** The `panneaux` kinds in `live.json` (préavis, fausses pompes, sobre). **Cut:** the
  « FORTE VARIATION » sign, which makes $PLEIN's price the news.
- **Owner.** carrossier (pmv.js) · automaticien (19:35 check) · copy pompiste, then ligne-continue.
- **Metric.** Minutes between 19:05 and the ticket going live each Saturday (target 0 late; any
  lateness printed on the next ticket). Improvised incident copy: 0, checked in the carnet.
- **Cheapest test.** A unit test with `now` = Saturday 24 October 19:36 and an empty index gives
  « TICKET EN RETARD »; 19:34 gives the default.

**P5 · Pas un centime extérieur dans le rachat** · #28 · 28.5 · L9 I8 T5 · hours
Reverse moteur §6 rule 2: the réservoir takes only creator fees (and unsolicited deposits,
quarantined if flagged); no company revenue ever buys $PLEIN. Company money funding the burn is what
turns a meme into a claim on the company, the biggest legal risk moteur itself names.

- **Build.** External revenue pays costs first, then tops the weekly food aid up to a published
  euro floor, paid by the company by bank transfer straight to the association and printed
  « Complément de la société, hors formule ». Edit moteur §6: rule 2 and every « To the réservoir »
  cell become « costs, then the aid floor ». The fiche's commitments get the line. `interfaces.md`
  keeps `apports` outside `reservoir` and reserves `aideComplement: { eur, transferRef } | null` in
  v2. `test/ticket.test.mjs` asserts that `apports` and `aideComplement` never feed `buyback` and
  that `splitWeek(reservoir)` still validates.
- **Holds only if.** The floor is never pre-announced: only once its weeks are funded in the company
  account and the partner agreement is signed. The formula is untouched, so no four weeks' notice,
  but the fiche states the rule before it applies.
- **Owner.** economiste decides (it reverses its own §6) · chef-de-station edits `moteur.md` ·
  carrossier the fiche line · imprimeur the test · ligne-continue gates.
- **Metric.** Share of each ticket's buyback funded by anything but fees: 0,00 %, checkable by
  anyone. Later: weeks at the floor, euros to food aid per month.
- **Cheapest test.** One session of economiste and ligne-continue on the reversed §6 text. It
  survives both, or it does not ship.

## 2. Everything else, by deadline

`L I T` = legal, impact, taste. Owner is the builder; every public word still goes through
ligne-continue.

| # | Idea | Score | When | Effort | Owner | Ships as, or only if |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | Le pompiste ne connaît pas le cours | 28 · 7 6 8 | Sun 18 | 1 h | chef-de-station, mecano-chaine | pompiste loses Bash; `releve.mjs --no-market` nulls price and market cap; the `post` skill uses it; `automation.test.mjs` asserts both. Public line only as « L'agent qui rédige nos brouillons ne reçoit pas le cours de $PLEIN », or nothing |
| 8 | Le code-barres du contrat | 27 · 9 5 7 | Sun 18 (text), later (barcode) | hours | carrossier | Address in groups of four, suffix dimmed, « Les jetons créés sur pump.fun finissent en général par « pump » : compare le milieu. » only when the suffix is there. Barcode later, as « une aide visuelle » |
| 7b | La carte qu'on emporte | (with T2) | before #1 | hours | carrossier | `#carte=` fragment through `parseCard`, dropped by `replaceState`; Web Share; « 7/10 · Gagné : rien » export; « on ne peut pas récompenser ce qu'on ne peut pas vérifier » |
| 4 | Le contrat à trois témoins | 27 · 9 7 5 | today (metadata, DNS), before #1 (code) | hours | carrossier, vigie | Fail-closed pin replaces the `location.reload()` at `app.js` 187; update the reload rule in `CLAUDE.md` in the same PR; `temoins.mjs` in `vigie.yml`; staged drill « Exercice incendie #1 ». The pin in localStorage waits on lawyer question 3 |
| 19 | Le relevé notarié | 26.5 · 10 7 4 | before #1 | hours | automaticien, enqueteur | `official-price.mjs` hashes the table and note and asks the Wayback Machine for snapshots; `official.evidence` in `config.js`; `null` and « en attente » if the archive fails. First in line if a slot frees: it also closes the Tier 2 item on the 9 October figure |
| 20 | Le garde du préavis | 27 · 9 6 6 | before #1 (fingerprint) | hours | carrossier, review economiste | Print `formulaPrint()` on v2 tickets now; the CI gate is optional; any notice also goes on the fiche, the site and the channels, not only in a JSON field |
| 18 | Le rouleau scellé | 27 · 9 5 7 | before #1 (chain), month 1 (memos) | days | imprimeur, tresorier | `prev` and `seal` in v2 from #1. Memos inside Squads transactions and the Code 128 barcode wait: Tier 2 signing complexity on the first plein |
| 16 | Le grand livre | 27 · 9 6 6 | month 1 | days | mecano-chaine | `teamTransfer` and `sorties` reserved in v2 now; « $PLEIN envoyés par la station : 0, hors burn » once the reader runs. Wallets named by role only; it states what it cannot see |
| 9 | Le garde de la parole | 26 · 8 7 5 | before #1 | hours | automaticien | `telegram.mjs --channel` refuses a caption with a banned term (culture §13). The public « détecteur » waits for the lawyer and never says « conforme » |
| 11 | Le registre des refus | 25.5 · 6 6 7 | from 15:30 today | hours | carrossier; founders log | Empty `public/refus.json` and a shape test that refuses any @handle, URL or address. Counts by category only, no dollar sum. Legal 6: on the edge |
| 14 | La station dans ton IA (MCP) | 24.5 · 8 5 6 | stdio before #1, public door after | days | mecano-chaine | Agents' stdio subset first; `api/mcp.js` pinned to `live.json`; no claim about other pump.fun kits until surveyed |
| 25 | Le péage mesuré | 24.5 · 8 5 6 | after the first trades | days | mecano-chaine | Weekly sample of up to 200 trades with method and sample printed; moves the fee claims from Tier 2 to Tier 1. Never « trade here » |
| 17 | Le rétroviseur | 22.5 · 6 4 7 | if §4 is adopted | hours (gate), days (rest) | economiste, tresorier | Only `bestFrontRun()` gating `H` for #1. Aggregates only, slippage in bps; see section 3 on the three prices |
| 30 | Le dossier juridique | 22.5 · 6 6 5 | now, private | hours | founders | The question list stays private; publishing it is the founders' call after the lawyer |
| 26 | Le relevé contre-vérifié | 20.5 · 7 5 4 | month 1 | hours | automaticien | The gap check in the price PR body only; the station's own estimate stays internal |
| 39 | Effet gazole, effet volume | 29.5 · 10 6 7 | from Plein #2, 31 Oct | hours | imprimeur, economiste | `bridge(prev, cur)` in integer cents in `formula.js`; « Dont gazole : [g] » kills the fuel-hedge reading. Highest-scored month-1 idea; `bridge` reserved in v2 now |
| 40 | La carte du sceptique | 27.5 · 8 7 6 | by Wed 28 Oct | hours | carrossier, pompiste | Share the toll slider as « simulation »; the −8 c and −18 c presets cite their source; « la baisse annoncée »; no plein number promised |
| 36 | L'heure juste | 25 · 10 4 6 | by Sat 31 Oct | hours | carrossier | Totem glow follows the computed sunset; « semaine de 169 h »; almanac test values copied from a reference, never invented |
| 44 | Le ticket papier | 29 · 8 6 8 | month 1 | hours + a printer (Tier 2, about €30–60) | imprimeur | Prints only a validated ticket; clearly a $PLEIN ticket, not a lookalike fuel receipt; no face, hands or room in the video |
| 41 | Le compteur qui tourne | 28.5 · 9 5 8 | month 1, after the « compteur » template | days | carrossier | Six-second loop; no ticker, price or call to action; personal lines, no slogans |
| 35 | Les tickets de réponse | 27 · 9 6 6 | month 1 | days | pompiste, imprimeur | Append-only « RÉPONSE Q-007 » wall, a source per line; answers state facts and limits, never an assurance |
| 32 | Mon Plein partout | 24.5 · 8 6 5 | month 1, needs `siteUrl` | days | carrossier | `/prix/:cp` and `/d/:dep` as a lookup, never a league table; overseas départements absent with the reason; the 18+ risk line on every page |
| 34 | Le pompiste de poche (inline bot) | 24.5 · 8 5 6 | after the MCP registry | days | automaticien | Founders approve a second automation; user IDs never logged; no $PLEIN price |
| 31 | Le contre-dossier | 23.5 · 7 5 6 | month 1 | days | carrossier | « 0,14 $ vont au rachat et au brûlage », not « back »; the weekly column signed as an agent's, never a regular's |
| 33 | Le totem bouge | 23 · 8 5 5 | month 1, opt-in | hours | automaticien | `TOTEM_BOUGE=on` set by the founders; « environ 0,2 point »; a fall worded like a rise |
| 38 | La main courante | 22.5 · 6 4 7 | after the multisig choice | days | mecano-chaine | On-chain signers only; no public register of legal vetoes |
| 37 | Contrôle technique de poche | 21.5 · 8 4 5 | later | days | mecano-chaine | Keyless, any mint, on the user's RPC; never a grade; the station never publishes another coin's result |
| 43 | La vigie et la marque | 20 · 8 4 4 | once the company exists | days | vigie, founders | INPI figurative mark in the company's name; a takedown column in the vigie issue now (free) |
| 45 | Le mois de ton permis | 26 · 8 4 8 | later | days | carrossier | The pre-2020 series is Tier 2; rate only, no returns; drop « adult by construction » (permis B at 17 since 2024) |

## 3. Killed

**Killed outright.**

| Idea | Why, in one line |
| --- | --- |
| **Airdrops**, in any form, and pump.fun's Holder Rewards | Tokens sent to holders are a reward tied to holding, and tokens for posts or tasks are paid promotion (loi 2023-451 art. 4 V); Holder Rewards also pays the biggest wallets first (snipers) and drains the réservoir the formula splits. **The carte de fidélité replaces them:** it lives in the visitor's browser, is worth nothing, is tied to no purchase, and can never be converted because the station cannot see it. With T2 it becomes opt-in and prints « ne sera jamais convertie en jetons ». The answer to « how will the airdrops be done » is everywhere a scam would put one: `/airdrop`, `llms.txt`, the pins, and later the grand livre's « jetons envoyés : 0 » |
| MCP tools that create the token, create or seed a pool, swap, claim or airdrop | Non-negotiable 1; the coin is created by hand; a second pool pays the station 0 % (moteur §1). `pump_pools` and the grand livre detect and prove instead |
| Le cimetière des brouillons (#42) | Legal 4: printing refused hype « as a joke » still delivers the hype (« le réservoir déborde »); misleading by implication, MiCA art. 7 |
| Le plein en litres | Puts fills next to the coin (culture §6, §13) and invites the fuel-hedge reading |
| Le classement des départements | Fuel geography maps onto the 2018 divide; salvaged as lookup-only `/d/:dep` |
| Devine le totem | The cut « Devine le relevé » with regional rivalry added |
| L'Observatoire du plein | Grades a government measure and takes a side between drivers and station owners |
| La sortie qui paie (a national motorway premium) | Motorway concessions are political; salvaged as a per-station label in Mon Plein |
| Le constat amiable | An official-form template (culture §8), and a crash-triggered post makes the price news |
| Commit-reveal of the 12 slice times | Theatre: moteur §4 shows hiding the times protects nothing |
| Brent in the diesel estimate | An unverifiable forecast that leads straight to fuel taxes |

**Cut from ideas that live.**

- « RÉSERVOIR PLEIN » on the graduation ticket (P2): reads as a full treasury.
- « conformes » on the PV card (P1): a compliance claim. Use « retrouvées sur la chaîne ».
- `pairUrl` in the clone feed (T4): sends traffic to the clones' trading pages.
- « Il n'y aura jamais de V2, jamais de nouveau contrat » (T4): a binding promise forever, unless
  both founders choose to make it.
- The dollar total of refused offers (#11): sender-stated, unverifiable, social proof by proxy.
- The « FORTE VARIATION » sign (P4): the price of $PLEIN is never news.
- **The three $PLEIN prices on the ticket** (17:45, 19:05, Sunday 18:00) and per-wallet round-trip
  results (#17). moteur §4 asks for the prices, the legal judge reads them as « le rachat fait
  monter le cours ». Conflict between two files: the founders decide, with ligne-continue. Until
  then, aggregates and slippage in bps.
- A public register of the legal vetoes the founders overrode (#38): a written admission.
- A public Friday estimate of the relevé and a « taux estimé » line (#26): close to the cut « Si le
  plein était maintenant ».
- « $0,14 back » (#31): reads as yield.
- « Celui qui écrit nos posts ne connaît pas le cours » (#10): false whenever a founder edits a post.
- « Adult by construction » (#45): false since the permis B at 17.
- A single-commit mirror with the old repo made private (#23): it hides a record culture §5 says to
  own.
- A git snapshot branch committed every 10 minutes (#29): overbuilt; the edge cache is enough.

## 4. Questions for the French crypto lawyer

Kept out of the public repository on purpose: they live in `docs/private/questions-avocat.md`,
which `.gitignore` excludes. Each founder keeps a copy; publishing them is the founders' call after
the lawyer has answered.

# Station $PLEIN

Website and data API for **$PLEIN**, a Solana memecoin whose weekly buyback share follows the
official French diesel price. The site is a night petrol station ("La Station"): a lit totem with the
diesel price, the buyback rate and the countdown to Saturday 18:00; a toll that shows where every
centime of the 1 % fee goes; a dashboard; the Saturday ticket; *Mon Plein* (cheapest stations near a
postcode, no wallet needed); *L'Atelier* (make and share totem cards); and the pump (Jupiter swap).

Static site in `public/`, two serverless endpoints in `api/`, no framework, no build step, **no
dependencies** (Node ≥ 20 built-ins only). Site copy is French; code, comments and docs are English.

Read [`docs/thesis.md`](docs/thesis.md) before changing what the site says or how it looks: it holds
the reasoning (psychology, copy deck, visual system, the lines we don't cross), not just the layout.

## Non-negotiables

1. **Never sign, never broadcast, never hold a key.** This repo reads, computes, simulates and
   publishes. Visitors sign their own swaps in their own wallet, inside the Jupiter Plugin. The team
   signs the weekly buyback by hand in the multisig. `test/no-signing.test.mjs` fails the build on any
   signing or sending call and on anything shaped like key material; never loosen it. If an
   automation ever needs a key, it belongs in a separate, separately reviewed service, not here.
2. **Only verified addresses reach the page.** The contract and wallets live in `public/live.json`
   and nowhere else (never in a URL parameter, never hard-coded in HTML). The page shows an address
   only if `public/js/mint.js` accepts it, and the contract only from `launchAt` on. Two people check
   the mint against Jupiter Studio and Solscan before it is committed.
3. **Never invent a number.** Dashboard values come from on-chain reads; `null` means pending and is
   shown as pending. The sample ticket on the page is labelled as an example. No made-up volume,
   holders, burns or partners.
4. **French legal lines** (not legal advice; a French crypto lawyer has the last word):
   - No paid promotion in any form: money, tokens, commissions, gifts (loi n° 2023-451, art. 4 V,
     tightened on 1 July 2026; misleading practices carry up to 2 years and €300,000).
   - Every communication fair, clear and not misleading, consistent with the fiche (MiCA arts 7 and 14).
     Whether a bonding-curve launch makes the founders "offerors" under MiCA is open for the lawyer.
   - No raffle and nothing tied to buying or holding $PLEIN: contests are free, judged on skill by a
     jury, adults only, with written rules. **The Saturday contest is off the site** until the lawyer
     has answered whether a prize for a post showing the $PLEIN mark counts as paid promotion; its
     draft rules (`public/reglement-concours.html`) are not linked from anywhere.
   - No political symbol, party, union or movement; no fuel brand; no real person's face.
   - The food-aid partner is named only once the agreement is signed. 18+ only. No cookies, no trackers.
   - The formula changes only with four weeks' public notice.
5. **Keep the coin off the founders' personal accounts.** The station account talks; personal
   accounts don't.
6. **French typography.** Non-breaking space before `: ; ! ? % € »` and after `«`, and between a
   number and its unit. Use `&nbsp;` in HTML; runtime text goes through `typo()` in `public/js/typo.js`.

## The mechanism

- On the official pool, every buy and sell of $PLEIN pays a 1 % fee: 0.5 % to Jupiter, 0.5 % to the
  creator ("la station"), as Jupiter Studio publishes it (Tier 2 until the first ticket shows it).
  The station's share lands on the **creator wallet**, is claimed every week and moved into **le
  réservoir**, a multisig whose signers and threshold are published before opening. Never write that
  "nothing leaves without both signatures" for the fees: until they are claimed, they are not in it.
- **Saturday split** (source of truth: `public/js/formula.js`, tested in `test/formula.test.mjs`):
  buyback and burn = 20 × official diesel price in €/L, rounded to 0.1 point, kept within 30–60 %;
  food aid = 10 %, fixed; team = the rest. When diesel rises, the team's share is what shrinks
  (60 % at €1.50, 43.4 % at €2.3283, 30 % at €3.00).
- **Which price:** the latest weekly national average published by the ministry (DGEC) before
  Saturday 17:45. It comes out early in the week for the previous week, so it is a few days old.
  The current value is `official` in `public/config.js`.
- **Saturday run sheet (Paris):** 17:45 price frozen · 17:50 the week's fees reach the multisig ·
  18:00–19:00 buyback in 12 slices · 19:00 burn · 19:05 ticket on the site, X and Telegram, each line
  with its Solscan transaction. A ticket prints every Saturday, even for an almost empty réservoir.
- Launch: Saturday 17 October 2026, 18:00 Paris, on Jupiter Studio. The anti-sniper fee collected at
  launch goes in full to buyback #1. Plein #1 is Saturday 24 October.

## Layout

```
public/                  everything served
  index.html             the site (generated once from design/canvas/Main.dc.html; now the source of truth)
  app.js                 behaviour: phases, countdown, live.json polling, toll slider, dashboard, Mon Plein, Atelier, pump
  config.js              settings set once, plus the weekly official diesel price
  live.json              what changes: contract (launch day), wallets, dashboard; re-read by open pages
  js/formula.js          the buyback formula and weekly split (shared with tests)
  js/mint.js             Solana address shape check (base58, 32 bytes)
  js/typo.js             French non-breaking spaces for runtime text
  js/clock.js            Paris time: next Saturday 18:00 as a real instant, countdown text
  js/fiche.js            fills the fact sheet from config.js and live.json
  fiche-plein.html       the fact sheet: rule, fees, wallets, commitments, risks (draft)
  mentions-legales.html  legal notice (draft)
  reglement-concours.html  contest rules (draft, not linked: the contest is off until the lawyer answers)
  css/fonts.css, fonts/  self-hosted brand fonts (OFL), no third-party font requests
  css/page.css           styles of the three secondary pages
  og.png, favicon.svg, plein.ics (Saturday 18:00 calendar)
api/                     Vercel Node functions; files starting with _ are not endpoints
  _feed.js               access to the official fuel-price open data (field names live here only)
  diesel.js              GET /api/diesel → national live averages per fuel (cached 10 min)
  stations.js            GET /api/stations?cp=75011&fuel=gazole&tank=50 → three cheapest stations
scripts/dev.mjs          local server: public/ + api/, like Vercel (npm run dev, PORT=3000)
scripts/check-feed.mjs   probes the live feed and the two endpoints (npm run check:feed; runs in CI)
test/                    node --test suites: formula, clock, address check, typography, config and
                         live.json shapes, the two endpoints on a stubbed feed, the no-signing guard
design/                  Claude Design source of the site and kit, previews, tokens (see design/README.md)
brand/                   PNG exports of the social kit and the og card source
docs/                    thesis.md (design thesis), playbook.md (launch playbook, partly superseded),
                         research-2026-10-16.md (research notes, Tier 2)
vercel.json              Other preset, output public/, cache and security headers
```

## Commands

```bash
npm test              # all suites; must stay green
npm run dev           # http://localhost:3000 (PORT=3311 npm run dev for another port)
npm run check:feed    # needs network: checks the official feed still has the fields api/ reads
```

## Working on the site

- `index.html` keeps the design's inline styles. Behaviour hangs on data attributes, so keep them
  when editing markup: `data-bind`, `data-if`, `data-on-click|input|submit`, `data-post` (text after
  opening), `data-ca` (contract), `data-wallet`, `data-link`, `data-official*`, `data-dash`,
  `data-needle`, `data-odometer`, `data-voyant*`, `data-ct*`, `data-led-target`,
  `data-countdown-label`, `<template data-template="station">`.
- **Phase:** the station is open when `live.json` holds a well-formed contract and the clock has
  passed `launchAt`. Before that: countdown to the opening, contract slot "publié ici samedi à 18:00",
  copy buttons disabled, pump closed, dashboard pending. Open pages re-read `live.json` every 15 s
  from five minutes before the opening, every minute once open, every five minutes otherwise. If the
  contract changes after a visitor opened the pump, the page reloads rather than keep a swap widget
  set up on the old mint.
- **Dashboard honesty:** `null` shows as a dash; the tag reads "Relevé du …" only when `asOf` is set,
  otherwise "En attente du premier relevé". A light's label states a fact ("Création révoquée") only
  once its state is `ok`; until then it names what is checked ("Autorité de création").
- **Ticker:** it says "Gazole en direct" only after `/api/diesel` answers; until then it shows the
  official weekly survey, labelled as such.
- **Atelier links:** a totem prefilled from URL parameters carries a notice that it is a visitor's
  card, not a message from the station.
- `/api/*` failing is normal offline (the page keeps its printed fallbacks). Some sandboxes cannot
  reach the feed; CI can, and its `feed` job is the live check.
- Check both widths after any layout change (1440 and 390); the page must never scroll sideways.
- The design is dark by choice (one look, every colour explicit). Tokens are in `design/README.md`.

## Status, tiered

**Tier 1, verified here:** the formula and weekly split in integer arithmetic (every four-decimal
price from €1.50 to €3.20, exact halves rounding up, and the example ticket 3 412,00 → 1 607,05 /
341,20 / 1 463,75 at €2.356); the Paris countdown across the 25 October clock change; French number
formatting and typography; the address check; the no-signing guard (it catches the 15 signing and
key-material cases an independent review planted); the endpoints' arithmetic and département
fallback on a stubbed feed; the page at 1440 and 390 px with no sideways scroll; the pre-opening
state; in a simulated opening (the all-ones system address as a visibly fake placeholder): the
contract appearing without a reload, a malformed wallet refused, dated dashboard readings, a 9-digit
burn count, and the reload when the contract changes under an open swap widget.

Also Tier 1, verified in CI on 17 October 2026 (GitHub Actions run 38975061978): the live official
feed has every field `api/_feed.js` reads, `/api/diesel` returns a national average in the sane
band, and `/api/stations` answers for 75011, 13001 and 69003. The Monday CI run re-checks it.

**Tier 2, built but unverified:**
- Jupiter Plugin script URL and `init` options (`displayMode: 'integrated'`, `formProps.fixedMint`).
  Test in a real browser with a wallet on a preview deployment before launch.
- Jupiter Studio economics: the 0.5 % creator share before and after graduation, the anti-sniper fee
  going to the creator, and the **fee-claim path** (research suggests Studio pays creators from its
  own vault). Test with a small amount.
- **Liquidity lock** after migration: do not write "locked for good" anywhere until it is seen on-chain.
- The official survey of 9 October 2026, €2.3283/L (quoted by Le Figaro and Selectra), now in
  `config.js`: confirm it against the ministry's weekly note.
- `vercel.json` (Other preset, `outputDirectory: public`, headers): confirm on the first deploy.
- The no-signing guard is a tripwire on names and shapes, not a proof (it does not catch a generic
  Anchor `.rpc()` call, for instance); anything touching a wallet still needs a human review.

**Tier 3, design:** the psychology in `docs/thesis.md` (reappraisal, symbolic control, costly
signals, the weekly loop). Its section "How we'll know it works" lists the metrics; there is no data yet.

## Open decisions for the team

Marked `[entre crochets]` in the three draft pages: the publishing company (a legal person, which
MiCA requires of an offeror), contacts, the host's details, what happens if Solana or Jupiter is down
on a Saturday, the multisig tool, signers and threshold, the recovery procedure if a key is lost
(with a strict 2-of-2, one lost key freezes the réservoir for good), and whether to add cookie-free
analytics. The contest (prizes, jury, eligibility, entry by e-mail or a neutral hashtag, an Atelier
export without the station's mark) waits for the lawyer's answer on paid promotion.

## Roadmap

1. **Before launch:** fill the drafts and remove their `noindex`; set `links` and `siteUrl` in
   `config.js`; make `og:image` absolute and add `og:url`; deploy a preview; test the pump with a
   wallet; then production with an empty `contract` (see README, launch day).
2. **Chain reader** (read-only, public RPC, no keys): réservoir balance, supply and burned amount,
   mint and freeze authorities, top-10 concentration; writes `live.json`. Then schedule it.
3. **Weekly plein builder:** from the réservoir balance and the frozen price, compute the split and
   build the unsigned buyback transactions or multisig proposal for the founders to review and sign.
   Simulate only.
4. **Ticket generator:** fill the ticket template from the week's transaction signatures (PNG for X
   and Telegram, HTML for the site's ticket wall).
5. **Content-Security-Policy** once the Jupiter Plugin's domains are known from a real session.
6. **Official price helper:** fetch the ministry's weekly note and propose the `config.js` change for
   a human to confirm.

## Conventions

- ES modules everywhere; no dependencies unless one does substantial work, and never for signing.
- Every change to the formula, parsing or addresses comes with a test.
- Commit messages in the imperative. Never commit keys, seed phrases, `.env` files or keypair JSON
  (`.gitignore` and the guard test cover the usual shapes).
- The design canvas, the thesis and the playbook are dated 16 October 2026 and use the 2 October
  diesel figure; the site's live figures come from `config.js` and `live.json` only.

# Interfaces between the parts of the station

17 October 2026. The shapes every part relies on: the site, the endpoints, the scripts and the
agents. Change a shape here first, then in the code and its test, in the same commit.

## Who writes what

| File | Written by | Read by |
| --- | --- | --- |
| `public/config.js` | a founder, by hand or by merging the weekly price PR | the site, the scripts, the tests |
| `public/live.json` | a founder, by hand (contract at launch, wallets, the lights a human judges) | the site, `api/chain.js`, the scripts |
| `public/tickets/*.json` | `npm run ticket` from the signatures the founders paste, merged by PR | the site's ticket wall, `npm run verify:ticket` |
| `GET /api/chain` | computed live from Solana and DexScreener, never stored | the site's dashboard, `npm run releve` |

Nothing in this list signs, sends or holds a key. Every write to `main` goes through a pull request
the other founder approves.

## `config.js` → `launchpad`

```js
launchpad: { name: 'pump.fun', quote: 'USDC' | 'SOL', coinUrl: 'https://pump.fun/coin/' }
```

`launchAt` is the opening (Saturday 17 October 2026, 15:30 Paris). `firstPleinAt` is the first
weekly plein (Saturday 24 October, 18:00). After the opening, the countdown targets
`max(nextPleinAt(now), firstPleinAt)`.

## `GET /api/chain`

Reads the contract and the wallets from the deployed `public/live.json`, never from the request,
so the endpoint cannot be turned into a free RPC proxy for another mint. Cached at the edge:
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

```jsonc
{
  "asOf": "2026-10-17T13:31:05.000Z",   // when the reading was taken (ISO 8601, UTC)
  "mint": "<contract>" | null,          // null before the opening: every block below is null too
  "token": {
    "supply": 999123456.123456,         // UI units (6 decimals on pump.fun)
    "decimals": 6,
    "burned": 876543.876544 | null,     // 1 000 000 000 − supply; null if the supply is above what the curve created (Mayhem mode), with a reason in errors
    "mintAuthority": null | "<address>",
    "freezeAuthority": null | "<address>"
  } | null,
  "curve": {                            // pump.fun bonding curve
    "address": "<bonding curve PDA>",
    "progressPct": 63.2,                // share of the curve's sellable tokens already bought
    "complete": false                   // true once the pool has migrated to PumpSwap
  } | null,
  "reservoir": { "address": "<multisig vault>", "usdc": 1234.56, "sol": 0.12 } | null,
  "creatorVault": {                     // Tier 2. unclaimed = inVault + toSweep
    "unclaimed": 12.34, "unit": "USDC" | "SOL",
    "inVault": 10.00,                   // in the creator vault: can be collected now
    "toSweep": 2.34                     // still in the curve or pool: needs a sweep_creator_fee first
  } | null,
  "holders": {
    "top10Pct": 21.4,                   // of supply, held by the 10 largest wallets
    "excluded": "token accounts whose owner is not a wallet (curve, pools, programs)"
  } | null,
  "market": {
    "source": "dexscreener",
    "priceUsd": 0.0000812,
    "marketCapUsd": 81200,
    "volume24hUsd": 154000,
    "pairUrl": "https://dexscreener.com/solana/..."
  } | null,
  "errors": ["holders: rate limited"]   // what could not be read this time; the rest still counts
}
```

`null` always means "not read", shown as a dash. The page never fills a gap with a guess.

## Lights the site may set from `/api/chain`

| Light | Rule | Label when `ok` | Label otherwise |
| --- | --- | --- | --- |
| `mint` | `token.mintAuthority === null` | Création révoquée | Autorité de création |
| `freeze` | `token.freezeAuthority === null` | Gel révoqué | Autorité de gel |
| `top10` | `holders.top10Pct ≤ 30` is `ok`, above is `warn` | Top 10 des wallets : 21,4 % | Top 10 des wallets : 41,2 % (warn) |

The others (`team`, `lp`, `bundles`, the inspection stamp) stay as a human sets them in
`live.json`, after `npm run audit`.

## Tickets

```jsonc
// public/tickets/index.json
{ "tickets": [ { "n": 1, "date": "2026-10-24", "path": "/tickets/plein-001.json" } ] }

// public/tickets/plein-002.json, as normalizeTicket() in scripts/ticket.mjs writes it
// (zeros under "carried" and "unspent" when nothing is carried; plein #1 carries nothing)
{
  "n": 2,
  "at": "2026-10-31T18:00:00+01:00",
  "diesel": { "price": 2.3283, "week": "23 oct.", "source": "Relevé hebdomadaire officiel du 23 octobre 2026" },
  "unit": "USDC",
  "reservoir": 3853.20,       // everything in the réservoir before the split: fees + carried
  "fees": 3412.00,            // this week's fees: reservoir minus carried
  "carried": { "aid": 341.20, "buyback": 100.00, "team": 0 },  // what earlier weeks left in it
  "ratePct": 46.6, "buyback": 1589.99, "aid": 341.20, "team": 1480.81,   // = splitWeek(fees, price)
  "slices": [ { "sig": "<base58 signature>", "spent": 132.50, "bought": 1234567.123456 } ],  // up to 48
  "unspent": 89.99,           // buyback to make (buyback + carried.buyback) minus what the slices spent
  "burn": { "sig": "<base58 signature>", "amount": 14814814.123456 } | null,  // null when nothing was bought
  "aidTransfer": { "sig": "<base58 signature>" } | null,   // null: the aid share is held, not paid
  "teamTransfer": { "sig": "<base58 signature>" } | null,  // null: the team waits
  "claim": { "sig": "<base58 signature>" } | null,
  "notes": ["Rachat arrêté à la 11e tranche."]   // up to 6 lines of 240 characters
}
```

A ticket is valid only if `reservoir` = `fees` + the three `carried` amounts, its split equals
`splitWeek(fees, diesel.price)` to the cent, the slices plus `unspent` add up to
`buyback + carried.buyback`, and `carried` is what the last earlier ticket left in the réservoir
(`heldOver` in `scripts/plein.mjs`: a share whose transfer is null together with what was already
carried for it, and the `unspent` buyback). `npm run ticket` checks all of it;
`npm run verify:ticket` re-reads every signature on Solana.

**What the site shows of a ticket** (`readTicket` in `public/js/readings.js`, `fillTicket` in
`public/app.js`): every field above. When something was carried, RÉSERVOIR is followed by DONT REPORTÉ
and FRAIS DE LA SEMAINE (the split is made on the fees alone), with the aid / buyback / team detail;
RELIQUAT REPORTÉ shows when `unspent` is above zero; each slice, the burn, the claim and each paid
transfer get a Solscan line, and an aid or team share whose transfer is null shows as « retenu » or
« reportée » with its running total. `MAX_SLICES` (48) is the same number in `scripts/plein.mjs` and
`public/js/readings.js`; a test pins them.

**The dashboard's « Rachat prévu samedi »** uses the same rule: the latest ticket's leftover
(`heldOver`, also in `public/js/readings.js`, pinned to `scripts/plein.mjs` by a test) comes off
the balance before the split, and the carried buyback is added on top. Before plein #1 nothing is
carried. While a plein runs (18:00 to 19:05) it reads « en cours »; from 19:05 until the ticket of that
plein is published it is a dash.

## `live.json` → `wallets`

Public addresses only, empty until published: `creator` (the station's creator wallet, fees accrue
there), `reservoir` (the multisig), `aid` (the food-aid wallet; an escrow the two founders control
until a partner agreement is signed), `team` (where the Saturday team share is paid, the
`teamTransfer` of the ticket), and `founder1` / `founder2` (the founders' own wallets for personal
purchases, docs/moteur.md section 5). The site's « Tous nos wallets » commitment covers the first four
and reads as a promise (« seront publics avant le premier plein ») until all four are published.

## Scripts (CLI contracts used by the workflows)

Every script reads, computes and prints. None signs or sends a transaction. `--markdown` prints a
report for the GitHub job summary and the founders' Telegram ops chat; `--json` prints machine
output. Exit code 0 unless the inputs are invalid.

| Command | Module exports | Does |
| --- | --- | --- |
| `node scripts/releve.mjs [--json\|--markdown] [--mint <m>]` | — | one `/api/chain` reading, offline of Vercel (`--mint` for testing on another coin only) |
| `node scripts/audit.mjs [--markdown] [--mint <m>]` | — | launch self-audit: creation slot, same-slot buyers, early buyers, top 10, authorities, suggested light states |
| `node scripts/verify-ticket.mjs <ticket.json>` | — | re-reads every signature of a ticket on Solana |
| `node scripts/official-price.mjs [--json] [--write]` | `parseOfficial(text)` | latest DGEC weekly diesel price; `--write` updates `official` in `config.js` (a PR follows) |
| `node scripts/vigie.mjs [--markdown\|--json]` | `findClones(pairs, official)` | tokens on DexScreener that pose as $PLEIN |
| `node scripts/totem.mjs [--post]` | — | the 08:00 totem PNG and caption; `--post` sends it if the Telegram secrets exist |
| `node scripts/telegram.mjs --ops\|--channel (--text "…"\|--file f.md) [--photo f.png]` | `sendMessage`, `sendPhoto` | Telegram Bot API; dry run (prints) when the secrets are missing |
| `node scripts/plein.mjs (--reservoir <amount>\|--from-chain) [--markdown\|--json]` | `buildOrder(opts)` | Saturday purchase order: split, 12 slices, Jupiter quotes, the human checklist |
| `node scripts/ticket.mjs <draft.json> [--write]` | `validateTicket(t)` | checks a filled ticket and adds it to `public/tickets/` |

Shared helpers: `api/chain.js` exports `takeReading({ live, rpcUrl, mint })` (the object above);
`scripts/_render.mjs` exports `renderPng(htmlPath, pngPath, { width, height })` (headless
Chrome or Edge; throws if none is found).

Secrets (GitHub Actions, never in the repo): `SOLANA_RPC_URL` (optional, public RPC otherwise),
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` (public channel), `TELEGRAM_OPS_CHAT_ID` (the two
founders), `CLAUDE_CODE_OAUTH_TOKEN` (for @claude).

## Loyalty card (browser only)

`localStorage['plein.carte']`, read and written inside `try/catch`, never sent anywhere. Nothing is
written until the visitor presses « Prendre ma carte »: until then the stamps live in memory, and the
click is the first write (the key's existence is the choice). « Jeter ma carte » removes the key.
`createKeeper` in `public/js/carte.js` holds that rule. The stored shape:

```jsonc
{ "v": 1, "stamps": [ { "kind": "plein" | "monplein" | "totem" | "ticket", "week": "2026-W43" } ], "full": 0 }
```

One stamp per kind per ISO week, ten stamps fill the card, a full card wins nothing and says so.

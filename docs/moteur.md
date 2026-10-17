# Le moteur — how money moves through $PLEIN on pump.fun

17 October 2026, written at about 01:00 Paris and revised at 03:45 and, after a review, at 04:15,
before the 15:30 opening. The economist's file: where the fees go, how much reaches the station,
how to create the coin, how the Saturday buyback should be executed, and when to stop.

> **Status.** Fees as published on pump.fun/docs/fees (read 17 October 2026) and, since 01:00
> today, as read on-chain in pump.fun's fee program: the 25 USDC pool rows, the flat fee of other
> pools and the curve's 0.95 + 0.30 match `public/js/fees.js` exactly (section 9, A2). That is
> Tier 1 for the configuration and Tier 2 for what $PLEIN's own trades pay, until its first trades
> and its first ticket show it. The USDC curve's starting reserves were read from pump.fun's Global
> account (A3). Jupiter's own fee is as `fees.js` records it (A7, Tier 2). Every table was
> recomputed at 03:45 with `fees.js` and `formula.js`; the front-run break-evens of section 4 were
> corrected then. Every revenue figure is arithmetic on stated assumptions, not a forecast: most
> memecoins lose most of their volume within days. Split at the 9 October diesel survey,
> €2.3283/L: buyback 46.6 %, food aid 10 %, team 43.4 % (`public/js/formula.js`). Legal notes are
> questions for the French crypto lawyer, not advice. Nothing here is a promise of return; it
> describes mechanisms.

## The engine on one page

- **Traders always pay more than the buyback returns.** In the band where the creator rate is
  highest ($59k–$300k market cap), $100 traded pays $1.20 in pool fees ($1.65 through the pump.fun
  app); $0.95 reaches the station and $0.44 of it comes back as buyback. On the curve it is $1.25
  paid, $0.14 back. For traders as a group, $PLEIN is negative-sum. Say it on the site; it is the
  honest frame for "a meme with a buyback you can check".
- **The station's best band is small.** The creator share is 0.30 % on the curve, 0.95 % from $59k
  to $300k, then it shrinks tier by tier to 0.05 % above $20M. Measured against market cap, the
  buyback matters most between $59k and $300k and is cosmetic above about $10M. A USDC coin
  graduates at about $58.8k, $200 under the line where the station's share triples.
- **The Saturday hour is farmable unless it is capped.** Its time is public and its size is
  computable from Monday. Bought in one hour, the weekly buyback is 4–73 % of the pool's USDC
  reserve at the turnovers of section 4, so buying before 18:00 and selling into the slices pays
  well, and slicing within the hour does not stop it. A front-run stops paying once the hour's total
  is below the pool's own fee rate times its USDC reserve. Section 4 caps the hour at 0.8 × that
  (about 1 % of the reserve on the curve and up to $300k, 0.24 % above $20M). The founders decide
  before 15:30, because the fiche goes public then: the recommendation is to cap the hour and carry
  the rest to the following Saturdays (no new code), then buy the carry in weekday slices of the
  same size, at fixed published times, once it grows. On 24 October the stake is small (on the
  curve, a front-runner could take $0–150 of a $70–420 buyback), and it grows with success. The
  cap has a visible cost: at $300k of curve volume, Plein #1 would buy $68 of $419 and carry 84 %.
- **No route is free, and the site's pump is not the cheapest on day one.** pump.fun's app adds
  0.45 %; Jupiter, which runs the site's pump, takes 0.50 % on a token under 24 hours old and
  0.10 % after (as Jupiter states it, Tier 2). The creator share is the same on every route; the
  leak is volume in pools that are not the canonical one.
- **Creation settings:** created from the station creator wallet, not a personal one, funded from a
  source named on the fiche; USDC quote; Holder Rewards, charity, cashback and Mayhem off; the
  default fee schedule (`creatorFeeBps` 0); the whole creator fee to that one wallet; no dev buy;
  0 % team allocation. At 15:31, read the curve's flags and ask Jupiter for a quote: if it cannot
  route the USDC curve, the site's pump and Plein #1 both need another route.
- **The team share sells no $PLEIN, and the founders hold none.** Fees arrive in USDC and the team
  share is paid in USDC. The founders neither hold nor buy $PLEIN (section 5), so there is no
  founder sell pressure; tokens someone sends them are burned.
- **Revenue from outside the coin won't arrive in time to matter this autumn.** The research's
  ideas are mostly slow, small, or legally exposed. A widget fee or fee-sharing with promoters is
  out. Merch and a neutral audit report are possible later, through a company, and announced only
  once the money is in.

## 1. Where every fee goes

Per side of a trade, in percent of the trade (`public/js/fees.js`):

| Where the trade happens | Creator (la station) | pump.fun | LP | Total | Via the pump.fun app (+0.45) |
| --- | --- | --- | --- | --- | --- |
| Bonding curve | 0.30 | 0.95 | 0 | 1.25 | 1.70 |
| Canonical pool, market cap under $59k | 0.30 | 0.93 | 0.02 | 1.25 | 1.70 |
| Canonical pool, $59k–$300k | 0.95 | 0.05 | 0.20 | 1.20 | 1.65 |
| Canonical pool, $900k–$2M | 0.75 | 0.05 | 0.20 | 1.00 | 1.45 |
| Canonical pool, $10M–$11M | 0.30 | 0.05 | 0.20 | 0.55 | 1.00 |
| Canonical pool, above $20M | 0.05 | 0.05 | 0.20 | 0.30 | 0.75 |
| Any other PumpSwap pool | 0 | 0.05 | 0.25 | 0.30 | 0.75 |

**On-chain, 01:00 today.** The fee program's PumpSwap configuration holds exactly the 25 USDC rows
of `fees.js` (thresholds in USDC, creator 30 basis points, then 95 down to 5) and 0.25 + 0.05 + 0
for any other pool; its curve configuration holds 0.95 + 0.30 + 0. Its SOL rows differ from the
published page in five places (A2). pump.fun can rewrite these accounts at any time.

**What the 0.45 % platform fee does.** From today, a trade placed in pump.fun's web or mobile app
pays 0.45 % more (0.40 % with a referral code); a trade through Jupiter, a terminal or any other
interface does not (as pump.fun states it, Tier 2). But no interface is free. What one side of a
trade costs, by route, in percent (the interfaces' own fees are Tier 2, A7):

| Route | Its own fee | On the curve | Pool, $59k–$300k | Round trip on the curve |
| --- | --- | --- | --- | --- |
| pump.fun web or app | 0.45 (0.40 with a referral code) | 1.70 | 1.65 | 3.40 |
| The site's pump (Jupiter Plugin), token under 24 hours old | 0.50 | 1.75 | 1.70 | 3.50 |
| The site's pump, after 24 hours | 0.10 | 1.35 | 1.30 | 2.70 |
| Jupiter's Swap API, a terminal with no fee of its own | 0 | 1.25 | 1.20 | 2.50 |
| A trading bot | about 1 | about 2.25 | about 2.20 | about 4.50 |

- **Discovery stays on pump.fun, execution moves away.** The coin page, comments and front page
  are where people find a curve coin, so curve-phase retail will still trade in the app and pay
  1.70 %. Price-sensitive traders and bots will route around it. Bots charge their own fee, often
  about 1 % per side (Tier 2), so for their users the app is not the most expensive route.
- **On launch day the site's pump costs 0.05 point more than the pump.fun app**, because of
  Jupiter's new-token fee. From Sunday 15:30 it is 0.35 point cheaper. The site must never call its
  pump the cheapest route; it lists every fee and says the site adds none (it does, in
  `index.html`). « Ici, la station ne prend rien » is true; « seuls les frais du pool
  s'appliquent » is not.
- **The station's share does not depend on the route.** The creator fee is set by the fee program,
  so it is charged on the curve or canonical pool whichever interface sends the trade. The platform
  fee costs the station only through lost volume, and nobody can measure that elasticity yet.
  Whether the platform fee is ever taken out of the creator's share is Tier 2.
- **The real leak is other pools.** A non-canonical PumpSwap pool, or a Meteora or Raydium pool,
  charges 0.30 % against 1.20 %. Aggregators will route to it whenever it has depth, and the
  station earns 0 on that flow (arbitrage through the canonical pool still pays). The station never
  creates or seeds another pool. The dashboard watches the canonical share of volume (section 8).
- **The site's pump keeps `referralFeeBps: 0`.** The station takes nothing on it; Jupiter takes its
  fee, which the Plugin shows before the visitor signs. Check one real Plugin quote against
  `fees.js` before the page states more than « d'après Jupiter » (Tier 2).
- **The station never publishes a pump.fun referral code.** What a referrer earns is Tier 2; if a
  code earns the station anything, publishing it is a commission for promoting a crypto service
  (loi 2023-451, art. 4 V).
- **The station's own buyback uses Jupiter's Swap API,** never the app and never the Plugin: a
  Squads vault cannot sign the transaction Ultra hands back, so each slice is built from the Swap
  API's instructions inside a vault transaction (`scripts/plein.mjs` quotes from
  `lite-api.jup.ag/swap/v1`). Jupiter states no fee of its own there (Tier 2), so the buyback pays
  the pool fee and network fees only. At the 0.95 % tier, 0.95 of the 1.20 % the buyback pays
  comes back to the creator wallet the following week, so a slice costs the station about 0.25 %
  net. That recycled fee is volume the station itself generated; it is about 0.4 % of the week's
  volume and is named on the ticket. It is split again like any fee, so 0.41 cents of every
  buyback dollar becomes team pay the next week (0.13 cents on the curve). Disclose it; it is too
  small to be worth a special case in the ticket.

## 2. Creator revenue

```
weekly creator fees  F = 7 × daily volume × creator rate
buyback              B = F × 46.6 %     food aid = F × 10 %     team = F × 43.4 %
```

**Weekly creator fees in USD, with (buyback / food aid / team).** Illustrative grid; not every cell
is plausible (a $20M coin rarely trades $10k a day). The $1k column is to the cent.

| Creator rate (where) | $1k a day | $10k a day | $50k a day | $250k a day | $1M a day |
| --- | --- | --- | --- | --- | --- |
| 0.30 % (curve, pool under $59k, or $10M–$11M) | 21.00 (9.79 / 2.10 / 9.11) | 210 (98 / 21 / 91) | 1,050 (489 / 105 / 456) | 5,250 (2,447 / 525 / 2,279) | 21,000 (9,786 / 2,100 / 9,114) |
| 0.95 % ($59k–$300k) | 66.50 (30.99 / 6.65 / 28.86) | 665 (310 / 67 / 289) | 3,325 (1,549 / 333 / 1,443) | 16,625 (7,747 / 1,663 / 7,215) | 66,500 (30,989 / 6,650 / 28,861) |
| 0.75 % ($900k–$2M) | 52.50 (24.47 / 5.25 / 22.78) | 525 (245 / 53 / 228) | 2,625 (1,223 / 263 / 1,139) | 13,125 (6,116 / 1,313 / 5,696) | 52,500 (24,465 / 5,250 / 22,785) |
| 0.55 % ($5M–$6M) | 38.50 (17.94 / 3.85 / 16.71) | 385 (179 / 39 / 167) | 1,925 (897 / 193 / 835) | 9,625 (4,485 / 963 / 4,177) | 38,500 (17,941 / 3,850 / 16,709) |
| 0.05 % (above $20M) | 3.50 (1.63 / 0.35 / 1.52) | 35 (16 / 4 / 15) | 175 (82 / 18 / 76) | 875 (408 / 88 / 380) | 3,500 (1,631 / 350 / 1,519) |

Splits computed with `splitWeek()` at €2.3283/L; the columns from $10k are rounded to the dollar.

**Turnover is the variable that matters.** Turnover is daily volume divided by market cap. At a
fixed turnover, creator fees per day are `turnover × rate × market cap`. At the top of each tier,
`rate × market cap` gives the creator's fees per day for 100 % daily turnover:

| Market cap | $59k | $300k | $900k | $2M | $5M | $8–9M | $12M | $15M | $19M | $20M | just over $20M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fees per day | $177 | $2,850 | $7,200 | $15,000 | $30,000 | $36,000 | $33,600 | $30,000 | $19,000 | $16,000 | $10,000 |

The station's income keeps rising until about $8–9M, then falls, and drops by more than a third
($16,000 to $10,000) when the coin crosses $20M. The buyback **measured against market cap** falls
from the start:

```
buyback per week ÷ market cap = 7 × turnover × rate × 46.6 %
  0.95 %: 3.1 % × turnover      0.75 %: 2.4 % × turnover
  0.30 %: 1.0 % × turnover      0.05 %: 0.16 % × turnover
```

At a turnover of 0.25, the buyback absorbs 0.8 % of market cap a week in the best band and 0.04 %
above $20M. One top-10 holder selling outweighs months of buybacks.

**Launch day is curve money.** pump.fun's Global account, read at 01:00, starts every USDC curve at
4,292 USDC of virtual reserve against 1,073,000,000 virtual tokens, with 793,100,000 tokens for
sale. A constant-product curve on those reserves (A3) opens at a $4,000 market cap and graduates
after about $12.2k of net buying ($12.3k with the 1.25 % fee) at about **$58.8k**. Curve volume
until then of $50k–$300k (assumption) pays the station $150–$900. Graduation costs 0.015 SOL, as
pump.fun publishes it (Global's `poolMigrationFee` reads 15,000,001 lamports); who pays it on a
USDC curve is Tier 2, and the creator wallet keeps a little SOL for network fees either way.

- **The $59k line is a cliff.** Just under it the canonical pool pays the station 0.30 %, just over
  it 0.95 %. The coin lands $200 under it; a 0.4 % rise after graduation triples the station's rate,
  and a coin that graduates and sags earns curve rates.
- **Most pump.fun coins never complete the curve** (public dashboards have long put the share that
  graduates near 1 %; Tier 2, read one before quoting it). Without graduation the station earns
  0.30 % of curve volume, and curve volume dies with attention.
- **At a tenth of the volume.** $30k of curve volume in the whole first week pays $90: $41.94 to
  buy back, $9.00 for food aid, $39.06 for the team. A ticket of that size is the likely case, not
  the worst one. It prints anyway.

## 3. Creation settings for 15:30

| Setting | Value | Why |
| --- | --- | --- |
| Creating wallet | **The station creator wallet itself** | pump.fun credits the creator fee to the coin's `creator`, the wallet that creates it (Tier 2 until the first fees land). Created from a personal wallet, the fees would accrue to a founder's personal address (non-negotiable 5). A fresh wallet on a hardware device, published in `live.json` as `creator`, holding a little SOL for network fees and no USDC, so a buy in the creation transaction has nothing to spend (Tier 2: whether the form can swap SOL into one). |
| Funding of the creator wallet | **A single deposit of SOL, straight from an exchange withdrawal, named on the fiche before 15:30** | The first thing degens check with Bubblemaps or GMGN is who funded the dev wallet. Funded from a founder's own wallet, its trading history becomes the story within minutes; funded from an unnamed wallet, it looks hidden. So: a single withdrawal from an exchange account, nothing else in, and the fiche says « Financé par un retrait de [plateforme] le 17 octobre : c'est la première transaction du wallet » next to the wallet's Solscan link. Link the wallet's page rather than the transaction: the funding is its first entry, and a raw 64-byte signature is a shape `test/no-signing.test.mjs` refuses anywhere in the repo. |
| Quote asset | **USDC** | See below. The Global account lists USDC in `whitelistedQuoteMints` (read at 01:00). `config.js` already says `quote: 'USDC'`; if the form does not offer USDC for this coin, use SOL and change `quote` before the contract goes into `live.json`. |
| Name / ticker | Le Plein / PLEIN | As designed. |
| Holder Rewards | **Off** | Switched on program-wide (Global `isHolderRewardEnabled` true at 03:50), so the form offers it. It pays the creator fee to holders pro rata. That is a payment for holding: it contradicts "not a yield", it ties a reward to holding (a line we don't cross), it sends most of the money to the largest wallets (snipers first), and it empties the réservoir the formula splits. |
| Charity option | **Off** | No food-aid agreement is signed yet, and the partner is named only once it is. Donations go out in euros through the weekly split, not to a charity pump.fun lists. |
| Cashback, Mayhem mode (if offered) | **Off** | Both are switched on program-wide in the Global account (read at 01:00 and 03:50), so the form may offer them; what they do exactly is Tier 2. A trading rebate is a reward tied to trading; an agent that trades the coin is volume we did not earn, and Mayhem mode mints a second billion tokens to a trading agent (a USDC curve read today had 2,000,000,000 on its mint): half the supply outside the fair launch, and a burn count nobody can check (`api/chain.js` then shows `burned` as pending). |
| Creator fee rate (if the form offers one) | **The default schedule; no custom rate; editing off** | Global, read again at 03:50 (slot 457859759): `creatorFeeConfigurable` true, `maxConfigurableCreatorFeeBps` 300, so the form may let the creator set up to 3 % (how it applies, on the curve only or in the pool too, is Tier 2: the PumpSwap pool account stores a `creatorFeeBps` of its own, `POOL_SPEC` in `api/_pump.js`, so a custom rate may follow the coin past migration and replace the tiers). See "Why not a higher creator fee" below. |
| Creator fee recipient | **100 % to the creating wallet, no fee-sharing split** | See "Fee sharing" below. |
| Initial dev buy | **None** (the buy field at 0) | See below. |
| Supply | 1,000,000,000, 6 decimals; 793,100,000 on the curve (Global, read at 01:00) | Mint and freeze authorities: check them with `npm run releve` at 15:31 (Tier 2 until read). |
| Team allocation | 0 % | pump.fun has no allocation; the only way to give the team tokens would be a dev buy, which we don't make. |

**At 15:31, read the curve account** (`api/_pump.js` parses it) before the mint goes anywhere:
`quoteMint` is USDC, `creator` is the published creator wallet, `isHolderReward`, `isCashbackCoin`,
`isMayhemMode` and `canEditCreatorFee` all read false, `creatorFeeBps` reads 0, and
`initialVirtualQuoteReserves` reads 4,292 USDC. 0 is what a coin on the default schedule reads: 39
of 42 sampled curves at 01:00, and every one of the 5,423 USDC-quoted curves a reviewer read at about
04:00 (slot about 457862461; not re-read here), all with `canEditCreatorFee` false. Any other value
may be a custom flat rate that replaces the tiers, on the curve and perhaps in the pool (Tier 2);
the fiche's 25-row table and the toll would then be false for $PLEIN from day one. If one is wrong,
the coin was created wrong: do not publish that mint, and the founders decide in the open whether to
create again.

**Then ask Jupiter for a quote,** USDC to the new mint, for $1: a read, one GET to `QUOTE_URL` in
`scripts/plein.mjs` with `inputMint` USDC, `outputMint` the mint and `amount=1000000`. Whether
Jupiter routes a USDC-quoted pump.fun curve is Tier 2, and two things hang on it. If there is no
route, the site's pump stays closed with a link to the coin's pump.fun page, and Plein #1, which
will most likely happen on the curve, needs another route: pump.fun's own buy instruction inside the
vault transaction, built from its public IDL and reviewed by both founders before 24 October. Ask
again an hour later; aggregators often index a new market within minutes.

**Why USDC over SOL.**

- The réservoir, the split, the food aid and the ticket are all in dollars to the cent. With SOL,
  a 10 % move in SOL between Monday and Saturday changes the réservoir's value, and the ticket
  needs a conversion rate: one more number to trust.
- The buyback is one hop, USDC to $PLEIN in the canonical pool. The site's pump already starts from
  USDC (`config.jupiter.inputMint`).
- The USDC tiers are in USD, the market cap everyone reads, and the USDC curve's shape is fixed in
  dollars: it opens at $4,000 and graduates near $58.8k whatever SOL does. The SOL tiers drift with
  SOL's price.
- The food aid goes out in euros: USDC to EUR is one step.
- **Against it:** most pump.fun flow, sniping and terminal tooling is SOL-quoted. Of 42 pump.fun
  coins on DexScreener's latest profile and boost lists at 01:00, one was USDC-quoted and 36 were
  SOL (a small, biased sample). Support for USDC pairs in terminals and listings is Tier 2. A USDC
  coin may get less bot volume: less revenue, and less wash. A SOL holder buying from the site pays
  a SOL to USDC hop of a few basis points. Circle can freeze a USDC address, so the réservoir
  carries a remote issuer risk; name it on the fiche. This is the price of a ticket that adds up to
  the cent; we accept it.

**Why not a higher creator fee.** If the form allows it, a custom rate up to 3 % would multiply
the station's take: at 1 % on the curve, $100 traded pays $1.95 and returns $0.47 as buyback
($0.43 to the team); at 3 %, $3.95 per side, a 7.9 % round trip, $1.40 back and $1.30 to the team.
Each extra point costs traders $1.00 per $100 and gives holders $0.47 of it. Don't:

- every figure on the toll, the fiche and in `fees.js` is the published schedule; a custom rate
  makes them wrong on day one;
- price-sensitive flow and bots leave a coin with a 4 % toll, and a "tax token" label sticks;
- the thesis's costly signal is taking less, not more. The founders would be paying themselves out
  of traders' pockets at a rate they chose;
- a rate the creator key can edit (`canEditCreatorFee` true) is a lever to raise the toll at will:
  it must read false at 15:31.

**Fee sharing (up to 10 wallets): don't configure it.**

- Create from the station creator wallet and leave fee sharing unset: 100 % of the creator fee
  accrues to that one wallet. It claims every week and moves the fees to the réservoir multisig at
  17:50 on Saturday, and both transactions go on the ticket.
- Unclaimed fees sit in a pump.fun account that pump.fun's program governs. In a big week, claim
  and move them to the réservoir midweek as well, the claim and the transfer back to back so the
  single-key wallet holds them for minutes. The threshold is a judgement call: $1,000 unclaimed.
  Every claim goes on that week's ticket (`claim` holds one signature today: a list is a change to
  the ticket shape).
- If the founders can confirm before 15:30 that a Squads vault can be a fee-sharing recipient and
  can claim, sending 100 % to the vault keeps the fees out of a single-key wallet. Tier 2: the claim
  mechanics of fee sharing are unverified, so do not choose this blind.
- **Do not split at source** (for example 10 % to an aid wallet). The ticket is valid only if its
  split equals `splitWeek()` of the week's fees (`scripts/ticket.mjs`). One recipient keeps one
  total.
- **Never put a third party in a fee-sharing slot.** A share of fees in exchange for promotion is
  paid promotion (art. 4 V), whatever the recipient calls it.
- Each coin has a fee-sharing config address (`sharingConfigAddress(mint)` in `api/_pump.js`).
  Whether the creator can set or change recipients later is Tier 2; if it can, the creator key can
  redirect every future fee. Keep it offline, and have the chain reader show that account and
  `canEditCreatorFee` as a light (section 8).

**No dev buy, and the rule we publish.** On the curve, the first dollars buy the most tokens: from
the Global reserves, $50 in the creation transaction buys about 12.2M tokens (1.2 % of supply)
after the 1.25 % fee, and $100 about 24.1M (2.4 %). Snipers will buy in the first slots anyway; a
dev buy would only make the insider one of them. There is no anti-sniper fee on pump.fun, so
buyback #1 has no sniper windfall (unlike the Jupiter Studio plan). The rule, on the fiche, in place
of the open « Achat de l'équipe à la création » line (with the founders' rule of section 5):

> « Aucun achat à la création. Le portefeuille créateur n’achète et ne vend jamais de $PLEIN. Côté
> station, seul le réservoir achète du $PLEIN, et tout ce qu’il achète est brûlé. Les fondateurs ne
> détiennent pas de $PLEIN et n’en achètent pas ; cette règle ne change qu’avec quatre semaines de
> préavis public, comme la formule. »

**Supply distribution:** a fair launch. 793.1M tokens are sold on the curve and the other 206.9M
seed the pool at graduation (Global parameters, read at 01:00; what migration moves is Tier 2).
There is no presale, no allocation and no dev buy, and the founders hold none, at the opening or
after. The launch self-audit (`npm run audit`) names same-slot and early buyers in public. The
buyback runs on schedule whatever they do.

**Token page text.** It goes into pump.fun's description at 15:30, and as far as we know that field
cannot be edited after creation (Tier 2: check the form), so treat it as permanent. It therefore
names no hour and no execution detail (those can change under section 4; the site holds them), it
starts on 24 October because there is no plein on launch day, and it names all three shares, the
team's included: leaving out the largest slice is the first thing a reader would call unfair. It
says « prix officiel du gazole en €/L » so that nobody reads « 20 × le prix » as the token's price.
The spaces before `:` `;` `%` and between a number and its unit are U+00A0 here; paste it from this
file as it is:

```text
Memecoin, aucune promesse de rendement. Chaque samedi à partir du 24 octobre 2026, les frais de créateur de la semaine se partagent en trois. Rachat et burn de $PLEIN : 20 fois le prix officiel du gazole en €/L, en pourcentage, entre 30 et 60 % (à 2,33 €/L, 46,6 %). Aide alimentaire : 10 %. Équipe : le reste. Chaque mouvement a sa transaction ; règle et horaires sur le site. Réservé aux majeurs. Ne mets jamais l’argent de ton plein dans $PLEIN.
```

Check before 15:30 that it fits the field (its length is Tier 2). If it does not, cut « règle et
horaires sur le site » and then the example in brackets; never the team's share, the 18+ line or
the last sentence.

## 4. The Saturday buyback: attack surface and the execution rule

**What everyone knows in advance.** The rate is public from the Monday's DGEC note. The réservoir
balance is public on-chain all week, and the claim at 17:50 shows it to the cent. The time is
public. Hiding any of it would break the brand, so the defence has to be in the sizing.

**How deep the market is.** On a constant-product pool, the USDC side `x` sets the impact: buying
`B` lifts the price by `(1 + B/x)² − 1`. From the graduation reserves (A3–A4),
`x ≈ 50 × √(market cap)`: about $12.2k at graduation. The cap `H` is defined in the rule below:
`0.8 × f × x`, where `f` is the pool's total fee per side.

| Market cap | Creator rate | Pool fee `f` | Pool USDC `x` | Cap `0.8 × f × x` | Turnover 0.25: `B`, `B/x`, lift if bought in one hour, slices of cap size | Turnover 1: same |
| --- | --- | --- | --- | --- | --- | --- |
| $59k | 0.95 % | 1.20 % | $12,184 | $117 | $457, 3.8 %, +8 %, 4 | $1,828, 15.0 %, +32 %, 16 |
| $100k | 0.95 % | 1.20 % | $15,863 | $152 | $775, 4.9 %, +10 %, 6 | $3,099, 19.5 %, +43 %, 21 |
| $300k | 0.90 % | 1.15 % | $27,475 | $253 | $2,202, 8.0 %, +17 %, 9 | $8,807, 32.1 %, +74 %, 35 |
| $1M | 0.75 % | 1.00 % | $50,162 | $401 | $6,116, 12.2 %, +26 %, 16 | $24,465, 48.8 %, +121 %, 61 |
| $3M | 0.65 % | 0.90 % | $86,883 | $626 | $15,902, 18.3 %, +40 %, 26 | $63,609, 73.2 %, +200 %, 102 |
| $10M | 0.30 % | 0.55 % | $158,625 | $698 | $24,465, 15.4 %, +33 %, 36 | $97,860, 61.7 %, +161 %, 141 |
| $25M | 0.05 % | 0.30 % | $250,809 | $602 | $10,194, 4.1 %, +8 %, 17 | $40,775, 16.3 %, +35 %, 68 |

The lift is a ceiling: it assumes nobody sells during the hour. Sellers will, and the front-runners
first. The curve is thinner still: its virtual USDC reserve is about $4.6k at 10 % progress, $6.8k
at 50 % and $12.8k at 90 % (A3), so its cap is $46, $68 and $128.

**Pre-buying and dumping into the buyback.** A trader who buys before 18:00 and sells after 19:00
gains about `2H/x` on their position and pays the fee twice. A constant-product simulation of the
best such trade (no other flow; the station pays the same pool fee) gives the front-runner's profit
as a share of the hour's buy `H`:

| Pool fee per side | `H` = 0.5 % of `x` | 0.8 % | 1 % | 1.2 % | 2 % | 5 % | 20 % | Break-even `H/x` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.25 % (curve, pool under $59k) | ≤ 0 | ≤ 0 | ≤ 0 | ≤ 0 | +5 % | +30 % | +62 % | 1.28 % |
| 1.20 % ($59k–$300k) | ≤ 0 | ≤ 0 | ≤ 0 | ≤ 0 | +6 % | +31 % | +62 % | 1.23 % |
| 1.00 % ($900k–$2M) | ≤ 0 | ≤ 0 | ≤ 0 | +1 % | +10 % | +36 % | +64 % | 1.02 % |
| 0.55 % ($10M–$11M) | ≤ 0 | +4 % | +8 % | +13 % | +28 % | +52 % | +70 % | 0.56 % |
| 0.30 % (above $20M, or another pool) | +6 % | +19 % | +25 % | +31 % | +45 % | +63 % | +73 % | 0.30 % |

A front-runner trading in the pump.fun app (1.65 % per side against the station's 1.20 %) makes
≤ 0 up to 1.2 %, +1 % at 2 %, +22 % at 5 % and +57 % at 20 %.

The break-even is the pool's fee rate, almost exactly: `H/x = f / (1 − f)²`. Below it the trade
loses; above it, the front-runner keeps a growing share of the buyback: the réservoir pays a higher
price, the burn shrinks, and the chart shows a weekly pump and dump. A flat cap of 1 % of `x` is
safe on the curve and up to $2M, and farmable above: at $10M it hands a front-runner 8 % of the
hour, above $20M a quarter. The cap has to follow the fee. If another pool for the mint has real
depth, the attacker buys and sells there at 0.30 % and arbitrage carries the station's lift across,
so `f` is 0.30 %.

**Why spreading works.** The weekly buyback is a small share of the week's flow: creator rate ×
46.6 %, so 0.44 % of the week's volume in the best band and 0.14 % on the curve. Bought in one hour
of average volume, the same money is 168 times more concentrated: 74 % of that hour's volume.
Spread over the week in slices each below the fee threshold, no slice is worth trading around. A
known weekly buyer still nudges the price; that is a side effect of buying, not its purpose.
Betting on it means holding a memecoin for days, not taking a low-risk trade.

**Slicing within the hour does not fix it.** On a single pool, twelve slices end at the same price
as one buy. They only help when other sellers fill in between, and a front-runner just holds
through the hour. `scripts/plein.mjs` caps each slice at 1 % impact with up to 48 slices: that
limits the damage of each swap, not the hour's total lift (48 slices × 1 % ≈ +60 %). The cap has to
be on the hour.

**MEV and sandwiches.** A sandwich is the same trade squeezed into one block around one slice: it
pays only when the slice itself is bigger than about `f × x`. Every slice under the rule is below
`0.8 × f × x` (the hour's slices are a twelfth of that), so a sandwich does not pay at any
slippage; the slippage limit caps the loss if `x` was misread. Use a fixed slippage of 100 bps or
less (`plein.mjs` default), never "auto".

**A multisig buy is announced by its own proposal.** A Squads vault transaction exists on-chain
from the moment one founder proposes it, with the swap, its amount and its minimum out in plain
view, and it runs only once the other has approved and someone executes it. A bot that watches
the réservoir sees every slice minutes before it lands, so « never announced » does not make a
weekday slice secret. There is also no private landing for it that we know of: Jupiter's own
sender serves Ultra, not a vault transaction (Tier 2). The defence is the size, and it holds: a
slice under `0.8 × f × x` is not worth trading around even when it is known in advance. Two habits
keep it so: build each slice from a fresh quote, and propose, approve and execute it within
15 minutes; a proposal still pending after that is rejected, never left open overnight with a
minimum out that the market has moved past. Since secrecy is impossible and not needed, the weekday
times are fixed and published (rule 3): a founder who chose them each morning would hold the one
piece of non-public information about holders' money, and buying on red days would look like price
support.

**Jupiter's order products don't fit the réservoir.** Read on developers.jup.ag at 01:00 (Tier 2,
re-read before any use): the Recurring API is marked no longer actively maintained and superseded
by a DCA in the Trigger API. That DCA draws each round from « one Privy-managed vault » per wallet,
needs an API key and a session token obtained by signing a challenge with the wallet, and takes at
least $10 a round, at least 2 rounds, 60 seconds to a year between rounds, and 10 active orders per
wallet; that page states no fee (an older guide said 0.1 %). It fails twice for holders' money: a
Squads vault is a program address and cannot sign a challenge, so the order would belong to a
single-key wallet; and a week of the holders' share would sit in a vault a third party manages,
outside the multisig. The weekday slices are done by hand.

**The decision for the founders, before 15:30.** None of this changes the formula: the split, the
rate and the burn stay as published. It changes when the buying happens, and the fiche goes public
at 15:30 with « 12 tranches jusqu'à 19:00 » in its run sheet, so it has to be settled there first.

| Option | At 18:00 | Cost | Risk | Needs |
| --- | --- | --- | --- | --- |
| **A.** As the fiche says today | the whole `B` in 12 slices | none | farmable once `B` passes about 1.3 % of `x`; at Plein #1, $0–150 of a $70–420 buyback (below); grows with success | nothing |
| **A′.** Cap the hour, carry the rest to the following Saturdays | `H` in 12 slices, `B − H` written in `unspent` | the buyback lags; once the carry passes one week's `B`, the team waits (rule 6) | nothing to farm; but on the curve the cap is $46–128, so the carry grows every week once `B` is regularly above it, and each Saturday is capped again. Optics: the most-watched ticket looks worst exactly when the coin does well (at $300k of curve volume, Plein #1 buys $68 of $419.40 and carries $351, 84 %) | one sentence on the fiche; `plein.mjs` and `ticket.mjs` already handle `unspent`; the cap printed as arithmetic on the ticket (not built: a note line until then) |
| **B.** Cap the hour, buy the rest during the week (the rule below) | `H` in 12 slices, `R` from Sunday to Friday at fixed times | up to 24 more two-signature vault transactions a week | proposals visible on-chain, harmless under the cap; more to check on each ticket | the fiche; a weekday order in `plein.mjs`; weekday slices in the ticket (not built) |
| **C.** Jitter the times and sizes inside the hour | random | none | no protection: on one pool the hour's total lift is the same, and a front-runner simply holds through it | — |

**Recommendation: A′ on the fiche at 15:30, and B once the carry has passed one week's `B` two
Saturdays running,** or sooner if its tooling is ready. A′ needs no new code and one sentence. It
has to give the formula, so that anyone can recompute the cap, say why it exists, say what happens
when the hour is zero, and say that the team waits (rule 6), which is the strongest answer to « ils
gardent la caisse ». It says « le marché » because Plein #1 will most likely run on the curve, and
it promises no safety:

> « Pour qu’acheter avant 18:00 et revendre pendant le rachat ne rapporte rien, le rachat de
> l’heure est plafonné à 0,8 × le taux de frais du marché × sa réserve en USDC (courbe ou pool),
> relevés à 17:45 et publiés avec l’ordre du plein ; il est nul si la courbe dépasse 90 % ou si la
> réserve ne peut pas être lue. Le reste attend dans le réservoir, affiché sur chaque ticket comme
> reliquat : il est racheté en premier les samedis suivants, dans la même limite, et ne revient
> jamais dans le partage. Tant que le reliquat dépasse le rachat d’une semaine, l’équipe n’est pas
> payée. »

Under B, one more sentence: « Le reliquat s’achète du dimanche au vendredi à 09:00, 13:00, 17:00 et
21:00, une tranche par créneau dans la même limite, chacune publiée avec sa transaction une fois
passée ; tout est brûlé le samedi à 19:00. » The ticket prints the cap as arithmetic, for example
at 50 % of the curve: « Plafond de l’heure : 0,8 × 1,25 % × 6 808 USDC = 68,08 USDC ».

If the fiche cannot change before 15:30, run Plein #1 as A and announce A′ or B like a formula
change, with four weeks' notice (the lawyer may say less is enough). At launch-week sizes that costs
little.

**The execution rule (option B in full).**

1. **17:45.** Freeze the price and compute the split, as today. `B` is the week's buyback plus any
   reliquat carried in. Read `x`: the canonical pool's USDC reserve, or on the curve its virtual
   USDC reserve. Take `f` from `feeRow()`: the pool's total fee, 1.25 % on the curve, 0.30 % if any
   other pool for the mint holds more than 10 % of its USDC liquidity. Set **`H` = the smaller of
   `B` and `0.8 × f × x`**. If `x` cannot be read, or the curve is above 90 % progress (the hour
   could complete the curve mid-plein and move trading to a new, thin pool), `H` = 0.
2. **18:00–19:00.** Buy `H` in 12 equal slices, one every 5 minutes, at a fixed slippage of
   100 bps or less, each built from Jupiter's Swap API (section 1: no platform fee, no Ultra fee).
3. **Sunday to Friday, at fixed times published on the fiche: 09:00, 13:00, 17:00 and 21:00
   Paris.** Buy the rest `R` = `B` − `H`, one slice per slot, in order from Sunday 09:00 until `R`
   is bought. Each slice is the smaller of what is left of `R` and `0.8 × f × x` (`x` and `f`
   re-read before each), and never more in a day than 25 % of the coin's average daily volume over
   the last seven days (A10). Nobody chooses a time, so timing is not inside knowledge, and the
   regulars get a « tranche vérifiée » moment every day. Each slice is built from a fresh quote and
   proposed, approved and executed within 15 minutes of its slot, posted on the station channel with
   its signature once it has landed, and is a vault transaction both founders sign. A missed slot (a
   founder unavailable, Solana or Jupiter down, the volume limit reached) is named on the ticket
   with its reason; the next slot does not double up.
4. **Saturday 19:00.** Burn every $PLEIN the réservoir holds: this hour's buy and every weekday
   slice since the last burn. After the burn its $PLEIN balance is zero. Anyone can check that.
5. **What is not bought by Friday 23:59** stays in the réservoir as « reliquat de rachat », shown on
   the ticket, and is bought first the next week. It never goes back into the split. The weekday
   slices are spent out of last week's reliquat, so the next order must take them off it before it
   splits the balance; otherwise this week's fees come out short by exactly what was bought.
6. **The team is paid last:** after the burn. While the reliquat is larger than one week's `B`,
   the team's share waits in the réservoir until it is bought. Every slot runs while `R` is left;
   when the founders miss slots, the holders' share still comes first, because their own pay waits.

**Not at launch: a Squads spending limit.** A spending limit would let one founder move up to its
amount out of the vault without the other's signature, to any destination unless it is restricted
(Tier 2). That is a single-signature path out of the réservoir, and the fiche's multisig section
(signers and threshold) would then overstate how the holders' share is protected. So every slice is
a two-signature vault transaction. If the founders ever want one, it is announced like a change to
the fiche, its only destination is a published executor wallet, its amount is at most one day of
slices and its period one day, and the fiche lists its amount, period, member and destination and
says it is a single-signature path; the dashboard shows the executor's balance, the burn covers it,
and the line « Côté station, seul le réservoir achète du $PLEIN » changes with it.

**Plein #1 in numbers** (assumptions of section 2: $50k–$300k of curve volume in the launch week,
the curve at 50 % on 24 October, so `x` ≈ $6,808 and the cap $68). Fees $150–$900, so `B` =
$69.90–$419.40. Under A′ or B: `H` = $68.08, and $1.82–351.32 (up to 84 % of `B`) either carried
to the following Saturdays, where each hour again buys one cap, reliquat first (A′), or bought in
one to six weekday slices from Sunday 09:00 (B). Under A, the whole `B` in the hour is 1.0–6.2 %
of `x`: nothing to farm at the low end, $8 of a $140 buyback at $100k of volume, and $150 of the
$419 at $300k, for a front-runner willing to put about $4,700 on the curve. Small money, but the
first ticket would show it.

**Capacity.** The hour buys one cap; four slots a day on the six days from Sunday to Friday buy 24
more: 25 caps a week. Against the table's "slices" counts, that is enough for every turnover-0.25
row except $3M (26) and $10M (36), and at turnover 1 only for $59k (16) and $100k (21). Above that
the reliquat grows and rule 6 holds the team's pay. A good problem, and the honest limit: two
people signing by hand can buy a few dozen safe slices a week, no more. Two slots a day would be
easier to keep and give 13 caps, enough only up to the $300k row at turnover 0.25.
The volume limit of rule 3 rarely binds: at steady volume a whole week's buyback is 1–3 % of one
average day's trading. It binds only in a near-dead market, below about `12.8 × f × x` a day
(about $2,400 at a $100k market cap, $1,100 on the curve at 50 %), where four depth-sized slices
would be more than a quarter of the day: the weeks after a collapse, when last week's fees meet a
thin market.

At the $100k / turnover-1 row, that means $152 in the Saturday hour and $2,947 in 20 weekday slices
of at most $152. The hour is mostly ceremony. The ritual is the frozen price, the split, the burn
and the ticket, and that is the part people watch. The burn gets bigger, because it burns a week of
buying.

**What to publish.**

- **At 17:45** (the order from `npm run plein`): price and rate, réservoir total and split, `x` and
  `f` with their sources, `H` with its arithmetic, slice size and slippage, `R`, the reliquat
  carried in, and the address the slices come from. The Friday J-1 post (`docs/culture.md`) is safe
  under the cap: `H` is below break-even whatever anyone knows.
- **Weekday slices:** the slots are on the fiche; each slice is posted after it lands, with its
  signature, spend and tokens. The station posts nothing else about a slice before it lands; it
  does not pretend slices are secret either (the proposal is public on the chain), and the fiche
  says so.
- **At 19:05, on the ticket:** the cap as arithmetic (« Plafond de l’heure : 0,8 × f × x = H », with
  the 17:45 figures), each slice's signature, spend and tokens (the hour and the week), each missed
  slot with its reason, the burn, the reliquat carried out, and the team and aid transfers. Add an
  execution-cost line: the pool fees the buyback paid, and its average price against the 17:45
  price. Add a farming meter: net buy volume from 16:00 to 18:00 against the same hours' four-week
  average, and the price at 17:45, 19:05 and Sunday 18:00. If the buyback is being farmed, the
  ticket says so before anyone else does.

## 5. The team share and the founders' rule

- **The team share does not touch $PLEIN.** Fees arrive in USDC and the team's 43.4 % is paid in
  USDC, so it creates no sell pressure on the coin. Its real cost is that 53.4 % of the fees
  (team + aid) leave the system for good. That is disclosed on the toll and the fiche, and it is
  the right thing to disclose, not something to hide.
- **The creator wallet never trades $PLEIN** (rule in section 3).
- **The founders know little the market doesn't.** The plein's inputs are public (the relevé, the
  réservoir, `x` and `f`), and the weekday slots are fixed and published (section 4, rule 3), so
  nobody holds the time of a buy in advance. What they know first is whether a slot will be missed.
  MiCA's market-abuse rules (Title VI, insider dealing in art. 89) apply to crypto-assets admitted
  to trading on a trading platform; whether a pump.fun or PumpSwap listing counts is for the
  lawyer. Behave as if it does.
- **The founders hold no $PLEIN and buy none:** « Les fondateurs ne détiennent pas de $PLEIN et
  n'en achètent pas », on the fiche in the « Aucun achat à la création » line (section 3), and
  changed only with four weeks' public notice, like the formula. The team is paid in USDC out of the
  fees, and that is the whole of what it gets. It is the cleanest anti-rug line there is, and a
  policy for founder trades would undercut it with the station's own maths: 1 % of supply at a
  $100k market cap is about $1,000, 6.3 % of that pool's USDC (`x` = $15,863), so a buy that size
  announced a day ahead with its amount gives a front-runner more than the +31 % of section 4's 5 %
  column at a 1.20 % fee; a pre-announced founder sale is a 24-hour countdown for holders to sell
  first; and posting either from the station channel turns a founder's personal trade into station
  content (non-negotiable 5).
- **If the founders insist on buying anyway** (weaker; not recommended): published wallets
  (`founder1`, `founder2` in `live.json`) before the first trade, at most 1 % of supply for both
  together, a sale at most 25 % of the holding in any seven days, no advance notice of side or
  amount (a notice is a front-run), each trade listed on the fiche and the next ticket within
  24 hours with its Solscan link, never posted as station content. The rule above would have to be
  withdrawn first, with its four weeks' notice.
- **Tokens nobody asked for.** People send tokens to a creator's wallet, sometimes to make it look
  like an insider holding. Any $PLEIN that lands in a published wallet (creator, réservoir, aid,
  team) is burned at the next plein and named on the ticket as « reçu non sollicité, brûlé »; it is
  never sold and never counted as a buyback. $PLEIN sent to a wallet a founder is known to use goes
  to the réservoir and is burned the same way. Any other token that arrives is left alone: no swap,
  no transfer, no approval (unknown tokens are a common drain lure).
- **What this rule cannot do:** stop a founder from using an undisclosed wallet. Today only the
  founders' word stands in the way: `scripts/audit.mjs` reads same-slot and early buyers, the top 10
  and the authorities, but no funding trail. The check to build is the first funder of the creator
  wallet and of each same-slot or early buyer, read from their oldest transactions; until it exists,
  the fiche says that the rule rests on the founders' word, and names where the creator wallet's
  SOL came from (section 3).

## 6. Revenue from outside the coin

The research's "perpetual engine" idea is to send outside revenue into the réservoir. Three rules
apply to any of it:

1. **Nothing is announced before it is invoiced and paid,** the same rule as the food-aid partner.
   Announcing future revenue is a forward-looking claim, and MiCA art. 7 wants marketing that is
   fair and not misleading.
2. **It goes only through the company** (which does not exist yet), as an on-chain transfer from a
   published company wallet. It appears on the ticket as « apport externe » with its source, and
   **100 % of it goes to the buyback.** It does not go through `splitWeek`: the company already
   pays the founders, so splitting it would pay them twice.
3. **The lawyer clears it before the first transfer.** Company revenue funding a token's buybacks
   makes the token look like a claim on the company's success. That is the step from meme to
   something a regulator may read as an investment product: a financial instrument if holders had
   rights (ESMA's guidelines on qualifying crypto-assets as financial instruments are the test;
   Tier 2), and at least a fiche that must disclose it under MiCA arts 6–7 and 14. This is the
   biggest legal risk in the whole "engine", and the research skips it.

| Idea | How it earns | Loi 2023-451 (art. 4 V, paid promotion) | MiCA and other law | To the réservoir | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Contrôle technique** (SOL OS audit for other launchers) | Monthly fee from a launcher for a live audit of its coin | A paid badge on a client's page, shown to French buyers, is paid promotion of a crypto-asset. Only a neutral report survives: raw measurements, no grade or « vérifié » seal, the client cannot edit or hide it, published whatever it says | Advice on crypto-assets is a licensed service (art. 3(1)(16)(h)); a buyer-facing score edges toward it. A clean verdict on a coin that then rugs is liability (misleading information) | 25 % of gross, as « apport externe » | Keep it as the station's own self-audit, which builds trust. Selling it waits for the company and the lawyer. Buyers are few and adversely selected: the clean coins need it least. Expect nothing before December |
| **Mon Plein as a media asset** | Sponsorship of the tool by a non-crypto advertiser; or a paid price-alert service for small fleets (VTC, artisans), in euros | Not triggered if the sponsor pays for a driver audience and the space is away from the coin; commercial influence still needs a clear « Publicité » label | Our lines exclude fuel brands; "no cookies, no trackers" excludes cookie-based affiliate links; insurance affiliation can require ORIAS registration. The open data allows commercial reuse with attribution (Tier 2: re-read the licence) | 25 % of net | Weak: brand safety keeps most advertisers off a crypto page. Keep Mon Plein free and unsponsored for at least four weeks: its job is reciprocity (thesis target: 30 % of sessions run a search). Revisit with data, maybe on its own domain |
| **Merch** (print on demand) | Margin per item, perhaps €5–8 on a tee after VAT and printing (Tier 2) | The station selling its own mark is not paid promotion. Merch given to creators for posts is a benefit in kind: never | Consumer law (terms of sale, 14-day withdrawal, VAT, legal notice) needs the company. Nothing tied to buying or holding: no "holders' discount", no tokens with a tee | 100 % of net margin | Brand, not money: 100 tees is about €500–800. Do it once the company exists |
| **Swap widget referral fee** | 0–50 bps on swaps through the site's pump, minus Jupiter's cut | A commission for sending people to a crypto service that is not MiCA-authorised is what art. 4 V bans | Earning on order flow edges toward reception and transmission of orders (art. 3(1)(16)(g)) without a licence | — | **Refuse.** Keep `referralFeeBps: 0`. About $200 on $100k of swaps at 25 bps was never worth it |
| **Fee sharing or a pump.fun referral code** | A share of creator fees or of platform fees | Paid promotion, by definition | — | — | **Refuse** |
| **Yield on idle réservoir USDC** | Lending interest | — | Smart-contract and depeg risk on money promised to holders that same week | — | **Refuse.** $5k at 6 % a year is about $6 a week |
| **Unsolicited deposits** to the réservoir | Someone sends USDC | Never solicited, never thanked in public as a "donor" | AML: a deposit from a flagged source is set aside, not used, and the lawyer is told | Meant to go 100 % to buyback, as « apport non sollicité » on the ticket. **Not built** (see the interim rule below and "What this implies elsewhere"): today's ticket and order would count it as fees and pay 43.4 % of it to the team | Accept passively, never ask |
| **Totem generator licence** (invented) | Local news sites or fuel-price media license a totem card generator, white-label, without the $PLEIN mark | No coin on the product: outside the law | Ordinary software licence, in euros, through the company | 25 % of net | Plausible but small; only if a buyer asks |
| **Mon Plein API** (invented) | Paid access to the cheapest-station search | — | Ordinary service | — | Won't work: the data is free open data, and free apps already serve it |

**What the station spends.** Hosting, a domain, an RPC if the public one is not enough, the
lawyer and the accountant come out of the team share, never out of the buyback or the aid. The
research's paid listings are spending, not revenue, and the law reads them differently:

- **Boosts, trending slots, paid "calls" and listings in a channel: never.** They buy placement in
  front of traders. A paid call or a paid channel listing is paid promotion by whoever runs the
  channel (loi 2023-451, art. 4 V), whatever the lawyer adds, and a boost or a trending slot would
  break the line the fiche publishes at 15:30 in its fixed commitments: « Aucune promotion payée,
  aucun influenceur rémunéré ». Changing that line would take public notice and the lawyer.
- **DexScreener's token profile** (« Enhanced Token Info », $299 according to the research, Tier 2)
  sets a logo, links and a description, with no placement. It is the only paid listing left as a
  question, for the lawyer: whether an issuer paying a listing site counts as a marketing
  communication under MiCA art. 7 (then it must match the fiche), and whether it breaks « Aucune
  promotion payée ». Until the answer: not bought; if yes, factual, once, after graduation at the
  earliest.

**Interim rule for unsolicited deposits**, until an `apports` field exists: any USDC in the
réservoir that is not a creator-fee claim is listed in the ticket's notes with its source and kept
apart, never split: it stays out of `fees` and out of the balance the order splits
(`npm run plein -- --reservoir <balance minus the deposit>`), and waits for `apports` to be bought
back in full. The field is a blocker before the réservoir address is published: the address goes
public before Plein #1, anyone can send a test deposit, and a ticket that splits it reads as
« l'équipe empoche les dons ». Carrying it by hand through `--carried-buyback` is no way round:
after Plein #1, `scripts/ticket.mjs` checks `carried` against the previous ticket and refuses a
mismatch unless the notes explain it.

## 7. What will not work

- **The buyback won't hold the price.** It is 0.04–3 % of market cap a week (section 2); any large
  holder's exit outweighs it. It is a ritual you can check, not a floor.
- **Fees beat the buyback, always.** Per $100 traded: $0.30–2.25 paid depending on pool and route,
  $0.02–0.44 back (section 1).
- **Volume the station makes itself is a loss and a lie.** A station-funded wash pays 1.20 % a side
  to recover 0.95 % at best, so it loses money on every lap, and fake volume is market
  manipulation under MiCA art. 91 and a misleading figure on the dashboard. No volume bot, no
  "market maker" paid in tokens, ever. The buyback's own recycled fee is the only volume the
  station generates, and the ticket names it.
- **All-in-one-hour buybacks feed front-runners** (section 4). Without the hour cap, the brand's
  weekly highlight becomes a weekly dump. A flat cap fails above $2M; the cap follows the fee.
- **No product buys the remainder for us.** Jupiter's current DCA would take the holders' share
  out of the multisig. By hand, two founders cover the remainder only up to moderate volume; above
  it the reliquat grows and their own pay waits (rule 6).
- **Outside revenue won't arrive in time.** None of section 6 produces money before the company
  exists, the lawyer answers and a customer pays: weeks at best. Don't mention any of it at launch.
- **Growth without paid reach is slow, by law.** pump.fun lists a flood of new coins every day, and
  paid KOLs, raids and referral pushes are illegal toward France. The meme, the site, the totem
  and the tickets are the whole reach plan. Expect the "flop" row of the playbook, and plan for it.
- **The loyalty card has no economic effect,** by design. Fine: it must never gain one.
- **A bigger coin is not a better engine.** Above about $10M the creator rate falls faster than
  volume tends to grow. Above $20M the buyback is a rounding error.

## 8. Kill criteria and the dashboards that show them

Read every Sunday from `npm run releve --markdown` (the ops chat) and the latest ticket. "Veille"
means the ritual continues (a ticket prints every Saturday) but no new spending and no new
features. "Wind-down" means four weeks' public notice, then a final plein under the same formula,
and the site stays up as an archive.

| Indicator | Source | Act when | Action |
| --- | --- | --- | --- |
| Creator fees of the week | ticket `fees`; `creatorVault.unclaimed` during the week | under $100 for 4 pleins in a row; under $25 for 8 | veille; then wind-down |
| Tier in force | `feeRow()` from `curve.complete` and `market.marketCapUsd` | the rate changes tier | the toll shows the new split per trade the same day; the plein order uses the new `f` |
| Fee configuration | pump.fun's fee program accounts (seeds `fee_config` + program; not read by `/api/chain` yet), pump.fun/docs/fees as backup | any row differs from `fees.js` | PR to `fees.js` the same day; the formula does not change |
| Curve flags | the curve account (`api/_pump.js` parses them, `npm run audit` reads them once; `/api/chain` does not expose them yet) | `isHolderReward`, `isCashbackCoin`, `isMayhemMode` or `canEditCreatorFee` true, or `creatorFeeBps` other than 0 (on the curve, and on the pool account after migration) | stop and publish: the coin was created wrong, or something changed it; at 15:31, the mint is not published and the founders decide in the open |
| Creator fee recipients | `curve.creator` and the fee-sharing config account (not built) | anything other than the published station wallet | stop, publish, rotate |
| Canonical share of volume | DexScreener pairs for the mint (not built) | under 80 % for 2 weeks | post where fees are and are not paid; `f` drops to 0.30 % in the plein order; never seed another pool |
| Reliquat de rachat | ticket `unspent`, then the next ticket's `carried.buyback` | larger than one week's `B` | the team's share waits (rule 6); under A′, two Saturdays running: switch to B; under B, every slot is already used, so the team keeps waiting and the carnet says so |
| Slice size | each slice's spend against `x` at that time | any slice above `0.8 × f × x` | named on the ticket |
| Daily buying | weekday slices against the seven-day average daily volume (DexScreener, not built) | above 25 % in a day | no more slices that day; named on the ticket |
| Pending proposals | the réservoir's Squads vault transactions | any still pending 15 minutes after it was proposed | rejected, rebuilt from a fresh quote |
| Route | a $1 Jupiter quote, USDC to the mint, at 15:31 and each Saturday at 17:45 | no route | the site's pump closes with a link to pump.fun; the plein uses pump.fun's own buy instruction, reviewed by both founders |
| Unclaimed fees midweek | `creatorVault.unclaimed` | above $1,000 | claim and move them to the réservoir back to back; both on the ticket |
| Unsolicited $PLEIN | the published wallets, read on-chain | any $PLEIN nobody bought | burned at the next plein, named on the ticket |
| Farming meter | ticket (not built) | the Saturday spike fully reverses by Sunday, 3 weeks running | `H` = 0: under B, everything goes into weekday slices; under A, adopt A′ or B |
| Top 10 wallets | `holders.top10Pct` | over 30 % (light turns warn); over 50 % | name the wallets in the self-audit; the buyback is unchanged |
| Founders' $PLEIN | the team wallet read on-chain; the funding-trail check (not built); reports | a founder holds or buys $PLEIN, or an undisclosed founder wallet is found | disclosed within 24 hours; a second breach ends the project |
| Unsolicited USDC | réservoir inflows that are not a creator-fee claim, read on-chain (not built) | any | listed in the ticket's notes, kept out of the split (section 6, interim rule); a flagged source: set aside, the lawyer told |
| Missed slots | each weekday slot against the slices that landed (under B) | more than a third missed in a week | named in the carnet; the founders say whether the schedule can be kept, and change it only on the fiche |
| Unclaimed fees at 17:50 | `creatorVault.unclaimed` | a claim fails | the ticket prints with a « frais non réclamés » line |
| Fake contracts | `npm run vigie` | any reported loss | warning pinned everywhere, checker in the hero |
| Legal | mail, platform notices | any AMF or DGCCRF contact, or the lawyer says "offeror" | stop all marketing at once; keep the tickets only if the lawyer agrees |
| Security | the station's wallets, read on-chain | any transaction nobody signed knowingly | pause the plein, publish, rotate keys |

## 9. Assumptions and tiers

- **A1.** Diesel €2.3283/L → 46.6 / 10 / 43.4 (`config.js`; the price itself is Tier 2).
- **A2.** The fee schedule. Published on pump.fun/docs/fees (17 October 2026), and read on-chain at
  01:00 Paris (slot 457830952) in the fee program (`pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`),
  accounts derived from `["fee_config", program]`: for PumpSwap
  (`5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx`), flat 25 / 5 / 0 basis points (LP / protocol /
  creator), 25 tiers with thresholds in lamports, then 25 tiers with thresholds in USDC base units
  (that this second list is the USDC one is inferred from its thresholds: 59,000.000000 and so
  on), then one more fee triple (20 / 5 / 5) whose role is unknown; for the curve
  (`8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt`), 0 / 95 / 30. The USDC rows and the curve match
  `fees.js` to the basis point. The SOL rows differ from the published page in five tiers: on-chain
  28, 23, 18, 13 and 8 basis points where the page and `fees.js` have 0.275, 0.225, 0.175, 0.125
  and 0.075 %. The Global account's own `creatorFeeBasisPoints` reads 5, and 39 of 42 sampled curves
  read 0 in their `creatorFeeBps` (the other three are quoted in neither SOL nor USDC): neither is
  the live rate. A review at about 04:00 (slot about 457862461) reports all 5,423 USDC-quoted curves
  at `creatorFeeBps` 0 with `canEditCreatorFee` false (not re-read here). So 0 reads as "the
  schedule applies", and a non-zero value as a possible custom flat rate that replaces it; the
  PumpSwap pool account has a `creatorFeeBps` too. Tier 2: that $PLEIN's trades pay this schedule
  (until its first trades are read), what a non-zero `creatorFeeBps` does, and that the platform
  fee never comes out of the creator's share.
- **A3.** The curve. Global, read at 01:00: `initialVirtualQuoteReserves` 4,292 USDC,
  `initialVirtualTokenReserves` 1,073,000,000, `initialRealTokenReserves` 793,100,000,
  `tokenTotalSupply` 1,000,000,000, USDC in `whitelistedQuoteMints` (the sample also found curves
  quoted in other tokens). Constant product on the virtual reserves gives a $4,000 opening market
  cap, $12.2k net to graduate and $58.8k at graduation. Tier 2: that $PLEIN's curve starts from
  these (read its `initialVirtualQuoteReserves` at 15:31), and that migration moves all the raised
  USDC and the 206.9M remaining tokens into the pool.
- **A4.** Pool reserve `x ≈ 50.16 × √(market cap)` (that is `√(12,161 × 0.2069 × market cap)`):
  constant product from the graduation reserves, nobody adds or removes liquidity, LP fees and
  burns ignored. The plein order reads the real reserve.
- **A5.** Turnover of 0.25 and 1 is illustrative. Launch week can be far higher, later weeks far
  lower.
- **A6.** The market cap that sets the tier is the one the fee program computes (Tier 2: whether
  burns lower it).
- **A7.** Interfaces' own fees, as `public/js/fees.js` records them: Jupiter Ultra, which the
  Plugin is a version of, 0.50 % on a token under 24 hours old and 0.10 % after
  (developers.jup.ag/docs/ultra/fees, read 17 October 2026); pump.fun's app 0.45 % (0.40 % with a
  referral code). Jupiter's Swap API, which the buyback uses, with no fee of its own; trading bots
  about 1 % per side. All Tier 2: check one real quote of each before quoting it in public.
- **A8.** Jupiter's order products as read on developers.jup.ag at 01:00 (section 4), and what a
  Squads spending limit allows (amount, period, member, destinations): Tier 2. Not used at launch.
- **A8′.** That pump.fun's coin description cannot be edited after creation, and how long it may
  be: Tier 2 (check the form before 15:30).
- **A9.** The front-run table: one constant-product pool, no other flow, fees on the quote side and
  taken out of the pool, the station paying the same fee, the attacker's buy at most the pool's USDC
  reserve, the best size by grid search. Its break-even is `f / (1 − f)²` of `x`. Without the size
  limit the shares in the 20 % column are higher (up to +84 % at 0.30 %). Real flow can make farming
  better or worse in a given week; the break-even at the fee rate holds either way.
- **A10.** The daily volume limit borrows the closest legal benchmark: the EU safe harbour for share
  buybacks (Regulation (EU) 596/2014, art. 5, and Delegated Regulation (EU) 2016/1052, arts 2 and 3:
  a programme disclosed in advance, every trade reported, no more than 25 % of the average daily
  volume bought on any day). MiCA has no such safe harbour for crypto-assets, so meeting it proves
  nothing; it is the yardstick a regulator would reach for (a question for the lawyer).
- **A11.** Global read again at 03:50 Paris (slot 457859759) with `api/_pump.js`: the same curve
  reserves as A3, `feeBasisPoints` 95, `poolMigrationFee` 15,000,001 lamports,
  `creatorFeeConfigurable` true with `maxConfigurableCreatorFeeBps` 300, `isHolderRewardEnabled`,
  `isCashbackEnabled` and `mayhemModeEnabled` all true, USDC the only whitelisted quote mint.
  What a configurable creator fee does on a coin is Tier 2.
- **Tier 1 here:** the arithmetic (every table recomputed at 03:45 with `fees.js` and
  `formula.js`, the front-run table by simulation under A9), and the on-chain configuration in A2,
  A3 and A11 as read.

## What this implies elsewhere

As read in the repo at 04:15. Every public line that promises the whole buyback in the hour changes
together with the fiche, or the site and the calendar contradict it (MiCA art. 7: communications
consistent with the fiche). French copy below is set with U+00A0.

- **pump.fun's token page, at 15:30:** the text of section 3, pasted as it is. It is probably
  permanent (A8′).
- **The fiche** (`public/fiche-plein.html`), before 15:30:
  - the « Aucun achat à la création » line of section 3, which carries the founders' rule, in place
    of the open dev-buy line (still open, line 46);
  - the opening sentence (line 32), which reads « Chaque samedi à 18:00, […] rachète des $PLEIN sur
    le marché et les brûle »: under A′ or B, « Chaque samedi à partir du 24 octobre 2026, une part
    des frais de $PLEIN, fixée par le prix officiel du gazole, sert à racheter des $PLEIN sur le
    marché, qui sont brûlés. » The hour and its cap belong in the run sheet;
  - the run sheet (line 190, « en 12 tranches jusqu’à 19:00 »): under A′, the sentence of section
    4; under B, its second sentence too, with the four weekday slots;
  - where the creator wallet's SOL came from (section 3), and, until the funding-trail check exists,
    that the founders' rule rests on their word (section 5);
  - the unsolicited-tokens rule (section 5) and the interim rule for unsolicited deposits
    (section 6);
  - the USDC issuer risk; « le créateur n’a fixé aucun taux de frais personnalisé »;
  - « Aucune promotion payée, aucun influenceur rémunéré » (line 212) stays as it is: section 6
    makes boosts, trending slots, paid calls and channel listings a flat never because of it.
- **`public/index.html:392`:** « Rachat en 12 tranches », then « Une tranche toutes les 5 minutes,
  chacune avec sa transaction. » The earlier « pour ne pas faire bondir le prix » is gone, as read
  now; it was false on one pool (section 4), and no line may claim that slicing protects the price.
  Under A′ or B the heading still presents the 12 slices as the whole buyback: « Rachat de l’heure
  en 12 tranches », then « Une toutes les 5 minutes, chacune avec sa transaction, dans la limite de
  la profondeur du marché ; le reste est reporté. » (A′), or « […] ; le reste s’achète dans la
  semaine. » (B).
- **`public/plein.ics:41`:** « Rachat en 12 tranches de 18:00 à 19:00 » becomes, under A′ or B,
  « Rachat de l’heure en 12 tranches de 18:00 à 19:00, dans la limite de la profondeur du
  marché » (commas escaped as `\,` in the file).
- **`docs/thesis.md:173`** (copy deck, run sheet: « 18:00 rachat en 12 tranches ») and
  **`docs/culture.md:112`** (lexicon, « les tranches »: "the 12 slices of the buyback"): the hour's
  slices, not the whole buyback.
- **`docs/culture.md`, other lines:**
  - line 147, « Les tranches de la semaine »: Sunday to Friday at 09:00, 13:00, 17:00 and 21:00,
    with no Tuesday exception; its "never" column becomes "posts anything about a slice before it
    lands beyond the published slots";
  - lines 136 and 148, « la fenêtre fondateurs »: removed, since the founders hold and buy none;
  - line 317, « Les fondateurs ont des jetons ? »: « Non. Les fondateurs ne détiennent pas de
    $PLEIN et n’en achètent pas : l’équipe est payée en USDC sur les frais, sur un wallet public.
    C’est sur la fiche, et ça ne change qu’avec quatre semaines de préavis. »
  - section 7, a row for « Pourquoi pas de Holder Rewards ? », the comparison question the
    pump.fun form will raise most: « Reverser les frais aux détenteurs, c’est payer pour détenir :
    on ne le fait pas. Et ça irait d’abord aux plus gros wallets, snipers en tête. Ici, la part du
    rachat rachète et brûle, chaque ligne avec son lien. » Never imply that the burn is worth
    anything to holders.
- **`README.md` and the launch run sheet** (`docs/lancement.md`, which the README links and which
  does not exist as read now): the coin is created from the station creator wallet, not « in their
  own wallet » (README line 48), funded by a single exchange withdrawal, with the buy field at 0, no
  custom creator fee and the token page text of section 3; the 15:31 curve check (`creatorFeeBps`
  0 and nothing else, `canEditCreatorFee` false, `initialVirtualQuoteReserves` 4,292) and the
  Jupiter quote.
- **`CLAUDE.md`, `docs/salle-de-controle.md`:** "18:00–19:00 buyback in 12 slices" for the whole
  amount becomes the hour cap, with the rest carried (A′) or bought at the fixed weekday slots (B),
  burn at 19:00 of everything bought since the last burn. The kill criteria of section 8 go to
  `docs/objectifs.md` through chef-de-station (that file does not exist as read now).
- **`scripts/plein.mjs`:** done: `hourCheck()` computes `H` and `R` and warns (`hour-cap-needed`),
  without applying them; carried money and `unspent` are taken off the balance before the split.
  Still to do: the cap's arithmetic in the order; a weekday-slice order (`R`, the four slots, the
  slice size `0.8 × f × x`, the 25 % daily-volume limit), and subtracting the weekday slices from
  the carried buyback before splitting (rule 5); the 17:45 route check.
- **`scripts/audit.mjs`:** the funding-trail check of section 5, which does not exist: the first
  funder of the creator wallet and of each same-slot or early buyer.
- **`/api/chain` and `docs/interfaces.md`:** the canonical pool's USDC reserve (the pool's quote
  token account, or DexScreener `liquidity`), the curve's flags (`isHolderReward`,
  `isCashbackCoin`, `isMayhemMode`, `canEditCreatorFee`, `creatorFeeBps`, `creator`, `quoteMint`;
  `api/_pump.js` parses them, `scripts/audit.mjs` reads them once) and, after migration, the pool
  account's `creatorFeeBps`; the seven-day volume, the canonical share of volume, and the fee
  program's configuration for a weekly comparison with `fees.js`.
- **The ticket shape:** `scripts/ticket.mjs` and `docs/interfaces.md` now agree on `fees`,
  `carried`, `unspent`, `aidTransfer` and `teamTransfer`, split on `fees`. Still missing: `cap`
  (printed as arithmetic), the weekday slices and missed slots, a list of claims, a line for
  unsolicited $PLEIN burned, and an `apports` list for outside or unsolicited money, kept out of
  `fees` and bought back in full. `apports` is a **blocker before the réservoir address is
  published** (section 6, interim rule).
- **`public/js/fees.js` and its fiche test:** the five SOL rows as configured on-chain (28, 23, 18,
  13, 8 basis points), or a comment that the published page and the chain disagree. It matters only
  if the quote ever becomes SOL.
- **`public/live.json` and `docs/interfaces.md`:** `founder1` / `founder2` are not needed under the
  founders' rule of section 5 (only under its fallback); no `executor` slot, since there is no
  spending limit at launch.

# Station $PLEIN

> *Quand le gazole monte, $PLEIN rachète.*

The website of **$PLEIN**, a memecoin on Solana. Every Saturday at 18:00, part of the week's trading
fees buys back $PLEIN and burns it, and that part follows the official French diesel price:
**20 × the price per litre, between 30 % and 60 %**. 10 % goes to food aid; the team gets the rest.
Everything is published, ticket included. Nothing is promised.

| Desktop | Phone |
|---|---|
| ![The site on desktop](design/previews/site-desktop.jpg) | ![The site on a phone](design/previews/site-phone.jpg) |

## Run it

```bash
npm test        # formula, address check, typography, no-signing guard
npm run dev     # http://localhost:3000
```

No dependencies to install. Node 20 or later. Working on it with Claude Code: start with
[`CLAUDE.md`](CLAUDE.md).

## Deploy

On Vercel: import the repository, keep the framework preset on **Other**, no build command. The
settings are in `vercel.json` (output `public/`, functions in `api/`). Every push to `main`
redeploys in about a minute.

## Launch day: Saturday 17 October 2026

Before:
- [ ] Repository private. Vercel project created; a preview deployment checked on a phone.
- [ ] The three draft pages (`fiche-plein.html`, `mentions-legales.html`, `reglement-concours.html`):
      every `[bracket]` filled, read by a lawyer, `noindex` removed.
- [ ] `public/config.js`: `links.xHandle`, `links.telegram`, `siteUrl`; `official` = the latest weekly survey.
- [ ] `public/index.html`: absolute `og:image` and an `og:url` once the domain exists.
- [ ] The pump tested with a real wallet on the preview deployment.
- [ ] Production deployed with `contract` **empty** in `public/live.json`: the site shows the countdown.

At 18:00:
- [ ] The founders create the token on Jupiter Studio, in their own wallets.
- [ ] Two people check the mint address on Jupiter Studio and on Solscan.
- [ ] Paste it into `public/live.json` → `"contract"`, commit, push. Open pages show it within
      15 seconds, without a reload. Until then they read *Ouverture imminente*.
- [ ] Check the home page, the copy button, the fiche and the Solscan link.
- [ ] Add the public wallets to `live.json` as they are created (réservoir, aid, founders).

At 19:00: measure top-10 concentration and bundled buys, set the dashboard lights in `live.json`.

## Every week

- [ ] When the ministry publishes the new weekly survey: update `official` in `public/config.js`
      (price with its decimals, week, source), `npm test`, push.
- [ ] Saturday 17:45 the price is frozen. 18:00 the buyback runs from the multisig, signed by both
      founders. 19:00 burn. 19:05 the ticket.
- [ ] Update the dashboard in `public/live.json` from on-chain reads, never from estimates.

## What's in here

| Path | What |
|---|---|
| `public/` | The site: home page, fact sheet, legal drafts, fonts, script, config |
| `api/` | `/api/diesel` and `/api/stations`, reading the official fuel-price open data |
| `test/` | The test suites, including the guard that keeps keys and signing out of the repo |
| `design/` | The Claude Design source, previews and tokens |
| `brand/` | Social kit exports: logo, X banner, launch post, ticket and daily totem templates |
| `docs/` | The design thesis, the launch playbook (partly superseded) and the research notes |

*$PLEIN est un memecoin : il ne donne aucun droit, ni dividende, ni vote, ni remboursement, et son
prix peut tomber à zéro. Rien ici n'est un conseil en investissement. Réservé aux majeurs.*

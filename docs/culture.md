# La Station — the $PLEIN culture

17 October 2026, before the 15:30 opening · identity bible: who we are in public, what we say, what
the community does.

> **Read [`thesis.md`](thesis.md) first.** It holds the why: tone, visual system and the lines we
> don't cross. This file is the how, for every post, pin, template and reply. Where the two
> disagree on a fact, [`../CLAUDE.md`](../CLAUDE.md), `public/config.js` and the code win; how
> money moves is in [`moteur.md`](moteur.md).
>
> **What changed on 17 October and is applied here:** launch on pump.fun at 15:30 Paris, quoted in
> USDC; no plein on launch day, Plein #1 on Saturday 24 October at 18:00; pump.fun has no
> anti-sniper fee, so the thesis line « Snipe-nous » is dead; no airdrops, a loyalty card worth
> nothing instead; the « Montre ton ticket » contest of the playbook is cut; the Friday « si le
> plein était maintenant » estimate is cut (section 14).
>
> **This file is public.** The repository is public, so assume a journalist, a competitor and a
> scammer read this page before the first post. Nothing here should embarrass the station if it is
> quoted whole: no theory vocabulary, no audience to "work", no tactic we would not say out loud. A
> line that only works if nobody reads this file is cut.
>
> **Second pass, about 01:00 on 17 October** (the critic's notes are in section 14): the
> graduation post no longer says « rien ne change », because the station's share does change; the
> X bio fits in 160 characters and carries the risk line; the « fin du mois » joke leaves the
> station's posts; the site's pump is never called the cheapest route; the plein hour is one edited
> Telegram message, not twelve notifications; posts on a trigger (delay, clone, failure,
> graduation, founder order) are written in advance; six new hard questions.
>
> **Third pass, after the 03:45 revision of `moteur.md`** (the reviewers' notes): the team's
> income does depend on diesel, and the file says so; every capped-hour line has an A′ form (the
> rest carried to the next Saturday) beside its B form; the 17:45 post carries the price and the
> taux only, and the réservoir comes at 18:00, after the claim; the pump is « le site n'ajoute
> aucune commission », never « la station ne prend rien »; graduation is « Rodage terminé »; posts
> fit X's 280 characters with the risk line; the founder window is a plan on the fiche and one
> silent channel message, never an X post; three new hard questions; the cuts give their reason,
> not their audience.
>
> **Conventions.** French lines are ready to paste: they carry their non-breaking spaces (U+00A0).
> `[entre crochets]` marks a value filled from a source at posting time (`config.js`, `/api/chain`,
> `/api/diesel`, `/api/stations`, `public/js/fees.js`, the ministry's note), never estimated. Where
> a bracket holds an example, it is worked at the 9 October relevé (2,3283 €/L, taux 46,6 %) and
> is replaced by the relevé in force. Tier 2 marks a fact from outside the repo that nobody here
> has checked yet.

## 1. The core identity

$PLEIN is a petrol station at night that never closes and never makes a pitch. It posts the
official diesel price, the one number every French driver resents, and gives it a second job:
every Saturday at 18:00 the week's fees are split in public, a share set by that price buys $PLEIN
back and burns it, and a printed ticket proves every line. The station has a pump but no salesman,
no hero, no enemy and no cause. It is run by an attendant you never see, visited by regulars who
check the receipts, and open to people who will never buy: Mon Plein finds them a cheaper fill for
free. Its humour is about the number, never about people. Its pride is the ticket that prints even
when the tank is nearly empty, and the defect it shows before anyone else finds it. Its signature
is « Un prix qu'on subit, un rachat qu'on vérifie. », and one sentence holds it up: « Ne mets
jamais l'argent de ton plein dans $PLEIN. »

## 2. The lore of La Station

The lore is small on purpose. Every element is something the site really does; nothing in it is
a promise.

- **La station.** A station on a road nobody names, in a town nobody names, lit all night. No
  brand on the canopy, no flag, no slogan on the walls. Everyone passes through it, whatever they
  vote. It opens on 17 October 2026 at 15:30 and never closes.
- **Le pompiste de nuit.** The voice of the station account. A role, not a person: never drawn,
  never named, no face. Dry, warm, has seen everything, sells nothing. The attendant reads the
  price out, writes the ticket, says when something went wrong, and never writes first. Automated
  posts say they are automatic (the morning totem's caption does not yet: section 15): the
  attendant is a voice, not a bot pretending to be a man, and not a man pretending to be a bot.
- **Les habitués.** The community. They are defined by what they do at the station, never by
  their job, their income or their politics. The recurring types, for captions and stickers:
  - *Celle qui arrive à 17:59*, every Saturday, for the first slice.
  - *Le vérificateur*, who opens one Solscan link per ticket and says so.
  - *Celui qui fait des totems à 2 h du matin* in L'Atelier.
  - *Celle qui ne vient que pour Mon Plein* and has never looked at the chart. She is the most
    respected regular: she is why the station is not just a coin.
  - *Le sceptique du fond*, who asks the hard question every week. The station answers him
    first, with a link, and his question gets the Sunday slot (section 4).

  They are types, not people. The station never writes a line of dialogue for a regular, never
  quotes one it made up, never posts « un habitué nous écrit ». An invented regular is invented
  social proof.
- **Le totem.** The brand, the logo, the face. It shows the official weekly diesel price (DGEC),
  never one brand's price, and the buyback rate it gives. It lights up every morning, about 08:17
  (the `totem` workflow). It shows a falling price exactly like a rising one. Its motto is a rule,
  not a boast: *le totem affiche, il ne commente pas.*
- **Le ticket.** Thermal paper, printed every Saturday at 19:05, numbered *Plein #N*, one Solscan
  link per line. It prints even when the réservoir is nearly empty: that promise is the brand. A
  ticket is never edited after printing; a mistake gets a corrective line on the next one. A step
  that failed prints as *HORS SERVICE*, and the ticket still comes out. It carries no joke.
- **Le mur.** The wall of past tickets. Empty until 24 October, and it says so plainly: an empty
  wall is a fact, not an embarrassment.
- **La machine à café.** Out of order since the opening. The one running gag, and the only thing
  in the lore that is not true of the site. It lives on a sticker and in L'Atelier, and at most
  once a week in a caption that carries no number. Never on the dashboard, never on a ticket,
  never in a post with a price, a rate or a link: those are records, and a record holds no
  fiction. Office humour wears out fast; if nobody uses the sticker by Plein #3, drop it.

**What the lore never contains:** a founder as hero, a villain (no State, no oil company, no
station owner, no « ils »), a promised land (no moon, no lambo, no « bientôt »), a mascot with a
face, or a real place.

## 3. The lexicon

The words do the community-building. Use them exactly; a regular should recognise the station
from three words without seeing the logo. If the community coins its own words, the station
listens and does not adopt them in its posts until they pass section 13.

| Mot | What it means | How the community uses it | Never |
| --- | --- | --- | --- |
| la station | the project, the site, the station account | « Passe à la station. » | « le projet », « la team » |
| les habitués | the community; the only collective name | « Les habitués vérifient. » | « la commu », « la famille $PLEIN », « les Pleiners » |
| le totem | the hero sign; also any card made in L'Atelier | « Le totem du matin est sorti. » « Fais ton totem. » | a logo with a face |
| le relevé | the official weekly national diesel average (DGEC), a few days old | « Le relevé est tombé : 2,3283 €/L. » | a live price called official, a brand's price |
| le taux | the buyback share for Saturday: 20 × the relevé, 30–60 % | « Taux du Plein #1 : [taux] %. » | « APY », « rendement » |
| le péage | the fees each trade pays on pump.fun's curve or official pool, the station's share included, whatever the interface. An interface may add its own on top: 0,45 % in pump.fun's app, Jupiter's fee in the site's pump (Tier 2). A trade routed through another pool pays the station nothing (`fees.js`) | « Où va le péage ? » | a fixed « 1 % » from the old Jupiter design; « sans frais » for any route; « le même partout » |
| le réservoir | the multisig the week's claimed fees go into | « Le réservoir est à [x] USDC. » | « la trésorerie », « le coffre de l'équipe » |
| le plein, Plein #N | the Saturday 18:00 split, buyback, burn and ticket, always numbered | « Plein #1 samedi. » | « le pump », « le rachat qui fait monter » |
| prix figé | the relevé locked at 17:45 for that Saturday; the réservoir is read after the 17:50 claim | « Prix figé : le taux ne bouge plus. » | a réservoir figure at 17:45, before the week's fees are in it |
| les tranches | the 12 slices of the buyback, 18:00–19:00 | « Tranche 7/12 vérifiée. » | « on achète le dip » |
| l'heure, le report, la semaine | only if the founders adopt the hour cap of `moteur.md` §4: the hour's buy `H`, and the rest `R`, either carried to the next Saturday (option A′, the one `moteur.md` recommends for 15:30) or bought from Sunday to Friday (option B) | A′: « Rachat de l'heure : [H] USDC. Le reste, [R] USDC, est reporté au samedi suivant. » B: « Rachat de l'heure : [H] USDC. Le reste s'achète dans la semaine. » | presenting the hour as the whole buyback; a weekday slice under A′ |
| le reliquat | under a cap of `moteur.md` §4. Under A′: what is above the hour's cap, carried to the next Saturday. Under B: what was not bought by Friday 23:59, bought first the next week. Either way it is on the ticket and never goes back into the split | « Reliquat reporté : [x] USDC. » | « on garde une réserve pour plus tard » |
| brûler, le burn | sending the bought tokens out of supply, 19:00 | « [n] $PLEIN brûlés. » | « déflationniste donc ça monte » |
| le ticket, le mur | the weekly on-chain proof; the wall of past tickets | « Le ticket est sorti. » « Voir le mur. » | a ticket without links |
| hors service | a step that failed (a slice, Solana, an endpoint), printed as it is | « Tranche 9/12 : hors service, reprise au prochain ticket. » | « petit souci technique », or silence |
| vérifié | a regular opened a Solscan link and it matched | « Tranche 4 vérifiée, [lien]. » | « trust me » |
| le tableau de bord, les voyants | the live on-chain dashboard and its lights | « Voyant gel : révoqué. » | a light set to ok by hand without a check |
| le contrôle technique, le PV | the public self-audit; « PV » is the joke on ourselves (the inspection report and the fine) | « On s'est mis un PV. » « Contrôle technique : [n] défaut(s), tous listés. » | « favorable » written before the audit ran, « 100 % safe », « audité » |
| le rétroviseur | if `moteur.md` §4 ships its farming meter: net buying before the plein against the four-week average, and the price at 17:45, 19:05 and Sunday 18:00, on the ticket | « Rétroviseur : rien d'anormal avant l'heure. » | hiding it the week it looks bad |
| la courbe | the pump.fun bonding curve | « La courbe est à [x] %. » (on the dashboard only) | a countdown to graduation |
| rodage terminé | the curve completes and the coin migrates to PumpSwap (once): a new car's break-in is over | « Rodage terminé. » | « le plein est fait » (that word belongs to Saturday), « on a gradué » |
| la fiche | the fact sheet: rule, fees, wallets, commitments, risks | « C'est sur la fiche. » | « le whitepaper » |
| les lignes continues | the team's public commitments | « C'est une ligne continue. » | |
| le préavis | the four weeks' public notice before any formula change | « Préavis de quatre semaines, ou rien ne change. » | a change « dès samedi » |
| la bande d'arrêt d'urgence | the risk warning | pinned, quoted when someone gets carried away | |
| l'aire de repos | the FAQ; the Telegram group | « Question ? Aire de repos. » | |
| Mon Plein | the free cheapest-station finder | « Trouve ton plein. » | « Mon Plein, puis achète » |
| L'Atelier | the meme maker | « Sorti de l'Atelier. » | |
| la carte, un tampon | the loyalty card and its stamps, worth nothing | « Carte pleine, gagné : rien. » | « points », « airdrop », « snapshot » |
| la vigie | spotting and reporting fake coins and fake accounts | « Vigie : fausse pompe signalée. » | |
| une fausse pompe | a clone coin or a fake contract posing as $PLEIN | « C'est une fausse pompe. » | naming a real person behind it |
| le carnet de bord | the Sunday report | « Carnet de bord #1. » | |
| la question du sceptique | the hardest question in the week's replies, answered in the carnet; the asker is never named | « Question du sceptique : [question]. Réponse : [réponse, ou « on ne sait pas encore »]. » | picking an easy one |
| la fenêtre fondateurs | under `moteur.md` §5, if adopted: Tuesday 10:00–12:00, the only time a founder may trade. The plan (side, total, number of Tuesdays, wallet) goes on the fiche, in `live.json` and in one silent channel message 24 h before the first window, and is traded in slices under the hour cap of §4; each fill is posted once it lands. Never on X | « Fenêtre fondateurs : [fondateur], [achat ou vente] de [total] $PLEIN sur [n] mardis, wallet [adresse]. » | « les fondateurs y croient », a post on X, any comment at all |

## 4. Rituals

Each ritual is something the station does at a fixed time and something small it asks of the
community. None of them asks anyone to buy.

| When (Paris) | Ritual | The station does | It asks the community | It never |
| --- | --- | --- | --- | --- |
| Every day, about 08:17 | **Le totem** | The `totem` workflow posts the card and its caption on the Telegram channel and sends an X draft to the ops chat; a founder presses post on X | Nothing. Optionally: make a totem in L'Atelier | Comments the day's news |
| Early in the week, when the ministry publishes (Tier 2: usually Monday or Tuesday) | **Le relevé tombe** | `prix-officiel` opens a PR; a founder checks the ministry's note and merges; then one post: price, week, taux, source link | Open the source link | Posts a rate before the merge |
| Sunday to Friday except Tuesday, only under option B of `moteur.md` §4 (A′ has no weekday slices) | **Les tranches de la semaine** | Each weekday slice posted on the channel after it lands, with its link | Nothing | Announces a slice, its time or its size before it lands |
| Tuesday 10:00–12:00, from 27 October, if `moteur.md` §5 is adopted | **La fenêtre fondateurs** | A founder's plan (side, total, number of Tuesdays, wallet) on the fiche and in `live.json`, and one silent channel message 24 hours before the first window; each fill posted once it lands. A sale and a buy get the same words. Never on X. Most weeks: nothing | Nothing | Comments it, frames a buy as confidence, posts a buy louder than a sale |
| Friday, 18:00 | **J-1** | One post: the run sheet and the calendar file (`plein.ics`) | Set the calendar | Estimates the size of the buy (section 14) |
| Saturday 17:45 → 19:05 | **Le plein** | 17:45 prix figé: the relevé and the taux, nothing else (the week's fees are not claimed yet) · 17:50 fees reach the réservoir · 17:52 the `plein` workflow computes the order on the claimed balance · 18:00 on Telegram one live message, edited after each slice, on X a thread: the réservoir after the claim and the buy (under a cap of `moteur.md` §4, the hour's `H` and the rest `R`), then twelve slices · 19:00 burn · 19:05 the ticket, a new post on the site, X and Telegram. The ticket is the record, not the live message | Watch; open one link; reply « tranche [n] vérifiée » with it | Posts a chart, talks about the price of $PLEIN, celebrates a move |
| Sunday, 11:00 | **Le carnet de bord** | The week in numbers read from the chain, what failed, what changes, and *la question du sceptique*: the hardest question of the week, answered, even with « on ne sait pas encore » | Ask the hard question in the replies | Spins a bad week; skips a week; picks the easy question |
| Once, when `curve.complete` turns true | **Rodage terminé** | One post with the migration transaction link, the station's new share and the date of the next plein, then back to normal | Nothing | Counts down to it, posts curve progress, says « liquidité verrouillée » before it is seen on-chain |
| Sat 17 Oct, 15:30 | **L'ouverture** | See section 5 | Copy the contract from the site only | Posts the contract anywhere before the site |
| Sat 17 Oct, 16:30 | **Le contrôle technique** | `npm run audit` on our own launch: same-slot buyers, early buyers, top 10, authorities. Defects shown | Re-run the checks themselves | Hides a defect, calls it « fair launch » |
| Sat 24 Oct, 18:00 | **Plein #1** | The first ticket. The first day the card's *plein* and *ticket* stamps exist | Verify one line | Calls it « the first pump » |
| Sat 24, 23:00 → Sun 25 Oct | **Le changement d'heure** | One post: 03:00 becomes 02:00, and the week to Plein #2 lasts 169 hours, one more than usual (`clock.js`, Tier 1) | Nothing | Jokes about the clock that need an explanation |
| Wed 28 Oct | **L'explication** | What the announced drop would do to the taux, said before it lands | Read it before 1 November | Hides that the team's share rises when diesel falls |
| Sat 31 Oct, 18:00 | **Plein #2** | The first plein after sunset in Paris (sunset about 17:33, against about 18:45 on the 24th: our own astronomical calculation, Tier 2; Brest is later, Strasbourg earlier, so the post says « à Paris »). The earliest moment a card started on launch day can fill (section 9) | Watch | Halloween theme |
| Sun 1 Nov | **La baisse** | One post if the live average is below the last relevé; otherwise nothing | Nothing | Ghost or death jokes: it is Toussaint |

**Why the rituals work and when they stop working.** The ritual is the reason to come back, so
it never moves, never skips and never upgrades itself into an event with prizes. If a Saturday
goes wrong (Solana down, a slice fails), the ticket still prints at 19:05 with the failure on it
as *hors service*, and the fix goes on the next ticket. What happens if Solana or Jupiter is down
for the whole hour is still an open decision for the founders; until they decide, the station
says only what happened, with times.

**One notification an hour, not twelve.** On a Saturday the channel posts at 17:45 (prix figé),
18:00 (the live message, then edited after each slice) and 19:05 (the ticket). An edit does not
notify subscribers (Tier 2: check it on the real channel before the 24th); twelve separate posts
in an hour get the channel muted by 18:20. Until `scripts/telegram.mjs` can edit a message, a
founder edits it by hand as the channel's admin.

### Rodage terminé (graduation)

On pump.fun a coin's bonding curve fills as people buy; when it completes, liquidity migrates to
a PumpSwap pool (Tier 2, read from pump.fun on 17 October 2026). The dashboard shows
`curve.progressPct` as a plain fact. The station posts nothing about it until it is done, because
a progress post on a bonding curve is a countdown to a purchase, the urgency twin we refuse.

When it happens, one post and nothing more:

> « Rodage terminé : $PLEIN quitte la courbe pour sa pool PumpSwap. [lien Solscan] Part de la station : [part] % par échange à cette capitalisation, échelle de pump.fun sur la fiche. Prochain plein : samedi [date], 18:00. »

In launch week the last sentence is « Premier plein : samedi 24 octobre à 18:00. »: never
« comme chaque semaine » before Plein #1 has happened, and on 17 October « samedi, 18:00 » reads as
tonight. `[part]` is the creator rate of `feeRow({ complete: true, marketCap, quote: 'USDC' })`
(`fees.js`). With the risk line, the post is 277 characters on X.

Not « rien ne change »: at migration the station's share leaves the curve's 0,30 % for pump.fun's
pool scale, 0,30 % under 59 k$ and 0,95 % from 59 k$ to 300 k$ (`fees.js`, Tier 2), and a USDC
coin graduates near 58,8 k$, just under the line where that share triples (`moteur.md` §1). « Rien
ne change » would be false on the day our share may triple. Not « on a gradué », not « next stop
Raydium », not « LP lockée » (unverified: never write it until the lock is seen on-chain). Not « le
plein est fait » either: a USDC curve completes after about 12,2 k$ of net buying (`moteur.md` §2),
so it can happen on launch Saturday, and the feed would read « Le plein est fait » at 16:00 and
« Pas de plein ce soir » at 21:00. *Rodage*, a new car's break-in, says that the coin has left the
curve and nothing more. If the founders adopt the hour cap of `moteur.md` §4, the hour's buy is
zero when the curve is above 90 % at 17:45, so that a plein cannot trigger the migration halfway;
without the cap, `npm run plein` warns and the founders decide whether to hold the buyback (it is
then carried to the next Saturday, never split again). Either way the ticket says so in one line,
and nobody spins it as suspense.

## 5. The launch narrative: 15:30 today, on a protest day

**The story in one sentence:** today a station opens; it shows an official price, publishes one
contract, audits itself an hour later, and prints its first ticket next Saturday. An opening, not
a cause.

17 October is also a day of protest about the cost of living. The station says nothing about it,
for or against, and borrows nothing from it: no slogan, no hashtag, no image, no colour, no
« colère », no « pouvoir d'achat », no « vie chère », no « fin du mois », no « les Français ». It
posts prices and times.

| Time | Post (X and the Telegram channel) | Why |
| --- | --- | --- |
| Until the totem | Nothing. Bios set, pinned post: « Le contrat sera publié sur le site à 15:30. Tout contrat qui circule avant est faux. » | Warn before the fakes exist |
| About 08:17 | The automatic totem on the channel, if its workflow runs. Its caption does not yet say it is automatic, nor carry the opening time: add « Publication automatique. » before this run, or switch `totem` off for the day (section 15) | The station's daily habit starts on day one |
| 08:30 | By hand, after the totem: the opening, the rule in one line and the taux at the relevé du 9 octobre (post 1 in section 10). No rate is called « du Plein #1 »: that one uses the latest relevé before 24 October, 17:45 | The whole idea in five seconds: a price, a rule, a time |
| 12:00 | Mon Plein: the first day of the Toussaint holidays, the cheapest fill near you, no wallet | The first thing the station gives is a favour |
| 15:00 | « Dans 30 minutes, le contrat s'affiche sur le site. Ne cherche pas PLEIN sur pump.fun : plusieurs coins porteront ce nom. Copie le contrat depuis le site. On ne t'écrira jamais en premier. » | The repository is public, name and time included: the clones will exist before we do, and pump.fun's search is where they are |
| 15:30 | The contract, copied from the deployed `live.json` after the site shows it, the same minute on X and Telegram | One source |
| 15:35 | The published wallets and the team's tokens on them, as read at 15:31 | What a rug would hide, shown first |
| 16:30 | Le contrôle technique, defects included: « On s'est mis un PV » | Our defects, shown by us before anyone else |
| 19:00 | Le péage, with the interface fees and the line that the toll always costs more than the buyback returns (post 7; its pool form if the curve has already completed) | The cost before the story |
| 21:00 | « Pas de plein ce soir. Le premier, c'est samedi 24 octobre à 18:00. » | The ritual starts with a wait |

That is the whole day: one 30-minute warning, no hourly countdown to 15:30. On a protest day some
stations may run dry. Mon Plein shows each price with its update time; the 12:00 post promises a
price, never that a station has fuel.

**If the opening slips.** A delay is the best hour a fake contract will ever get. Post at once,
pin it, and repeat every 30 minutes until the contract is out:

> « Ouverture retardée. Aucun contrat n'est encore publié : tout contrat qui circule est faux. Prochaine information à [heure]. »

No reason until the founders know it, no new opening time until it is certain. If the 15:31 check
of `moteur.md` §3 shows the coin was created wrong, its mint is not published; the founders decide
in the open whether to create again, and the « coin raté » trigger post of section 10 says what
failed. A second creation leaves two coins called PLEIN from the same creator wallet, which looks
like a serial launcher: the post says so first, the creator wallet never trades the failed coin,
and the site's contract is the only answer, said the same way every time.

**If the day turns.**

- **Violence dominates the news:** stop posting except anti-scam warnings. No « restez
  prudents », no commentary: commentary is a position.
- **Someone asks « vous soutenez le 17 ? »:** « La station ne prend pas position. Tout le monde
  passe à la pompe, quel que soit son vote. » Once, then no reply in political threads.
- **The coin is adopted as a protest symbol, or attacked as profiting from one:** the thesis kill
  switch. One post with the neutrality line, no reposts of protest content, no engagement.
- **A journalist asks why today:** « Oui, c'est le même jour, et nos premières notes le citaient
  parmi les raisons de la date. On l'a retiré du récit : aucun slogan, aucun hashtag, aucune image
  de la mobilisation. Les notes et leur correction sont publiques. » The admission comes first
  because it is true and public: the playbook (« Why the timing works ») cited the protest, its
  unions and its parties as a reason for the date, and the thesis tied the food aid to the UN day
  against poverty.
- **Someone quotes our own first notes:** the same answer. Never deny it. Deleting the notes would
  not erase the git history, and it would be hiding them.
- **A clone appears:** see section 11, anti-scam, and the trigger posts of section 10.

**Cut from the launch, on purpose:** the X Space of the first hour (on a protest day it gets
hijacked, and it puts a founder's voice on the record), any pump.fun livestream (faces, voices),
any hashtag at all on 17 October, the UN day against poverty (it ties a memecoin to
poverty), the flight strikes of the playbook's calendar (a union action), and the « Snipe-nous »
line (pump.fun has no anti-sniper fee, so it would be false).

## 6. Voice

The voice is a night attendant who has seen everything: dry, warm, never selling. *Tu* to
visitors, always; *vous* to the press, an institution, an association or a lawyer. Short
sentences, one idea per post. The station posts; it does not chat.

| Rule | Bon | Mauvais |
| --- | --- | --- |
| The price first, the opinion never | « Gazole, relevé officiel du 9 octobre : 2,3283 €/L. » | « 2,33 € le litre, c'est du vol. » |
| Every claim has a link and a time | « Tranche 4/12 : [x] USDC → [n] $PLEIN. [Solscan] » | « Gros rachat ce soir ! » |
| Never ask anyone to buy | « Le ticket sort à 19:05. » | « Fais le plein de $PLEIN avant 18:00 ! » |
| Never promise a price | « Le rachat redistribue des frais. Il ne garantit aucun prix. » | « Chaque samedi, le burn fait monter le cours. » |
| Never put a fill next to the coin | « Un plein de 50 L au relevé du 9 octobre : 116,42 €. » | « Un plein = [n] $PLEIN. » |
| The price of $PLEIN is never news | (the dashboard shows it; the carnet de bord gives it up or down, at the same size) | « +40 % aujourd'hui ! », or silence on the week it halves |
| Jokes are about the number, not about people | « MORAL 0,00 €/L. » | « Pas de quoi faire le plein ? Prends du $PLEIN. » |
| Sellers are not enemies | « Chacun vend quand il veut. Le ticket sort quand même. » | « Les jeets ont paniqué. » « Paper hands. » |
| Say the defect before someone finds it | « Défaut mineur : 3 wallets ont acheté dans le même bloc que la création. Les voici. » | « Lancement 100 % fair. » |
| No enemy, no « ils » | « Le prix, personne ne le contrôle. Le rachat, tout le monde le vérifie. » | « Ils nous saignent à la pompe, on reprend le contrôle. » |
| Answer the question, not the person | « Oui, l'équipe touche 43,4 % de la part de la station au relevé du 9 octobre. C'est sur la fiche. » | « Les haters n'ont rien compris. » |
| Numbers come from a source, or not at all | « Lu sur la chaîne à 14:02. » | « Déjà plus de 2 000 holders ! » |
| No superlative nobody can check | « Un rachat chaque samedi, et son ticket. » | « Le premier memecoin indexé sur le gazole. » « Le seul coin honnête. » |
| The pump is a button, not a deal | « Le site n'ajoute aucune commission. Sur la courbe et la pool officielle, le péage de pump.fun, part de la station comprise, est le même quelle que soit l'interface ; Jupiter prend ses propres frais. » | « La pompe la moins chère, c'est ici. » « La station ne prend rien sur sa pompe. » |
| A founder's trade is a line, never a signal | On the channel, silent, never on X: « Fenêtre fondateurs : [fondateur] vendra [total] $PLEIN sur [n] mardis, de 10:00 à 12:00, wallet [adresse]. » | « Les fondateurs croient au projet : ils achètent mardi ! » |
| The risk line travels with the coin | Posts that name $PLEIN, the taux or the contract end with « Cryptoactif risqué : perte totale possible. 18+. » (the morning totem's caption already does) | « NFA », « DYOR » |
| Quiet when nothing happens | (no post) | « gm les habitués » and an emoji, every morning |
| Records carry no emoji | « Plein #1. Le ticket est imprimé. » | « BURN » between two flame emojis |
| French, not CT English | « Rodage terminé. » | « LFG », « wagmi », « bullish », « ser » |
| Neutral in grammar too: no point médian, which reads as a camp in France | « tout le monde », « les habitués » | « les habitué·es » |
| Capitals belong to the totem | « Le totem s'allume plus tôt. » | « GROSSE ANNONCE » between two sirens |
| *Vous* for the press | « Bonjour. La règle, les wallets et les risques sont sur la fiche : [lien]. Les tickets se vérifient sur Solscan. » | « Salut, check la fiche » |

**Emoji.** None in a record: the relevé, the tranches, the ticket, the carnet, an anti-scam
warning. Elsewhere at most one per post, the fuel pump or the receipt, never a rocket, a moon or a
flame. **Language.** The station posts in French only. A question in English gets one line in
English, the link to the fiche and the risk line; the station never posts first in English.

No theory vocabulary, in a public post or in this file. Plain words: the station talks to people,
not about them; the theory is in [`thesis.md`](thesis.md), also public.

## 7. Hard questions, ready answers

The attacks are predictable, so the answers are written now, while nobody is angry. One reply,
with a link, then stop. Never quote-post a critic. Insults and political bait get no reply.

| Attack | Answer | Note |
| --- | --- | --- |
| « C'est juste des frais recyclés. » | « Oui. Le rachat vient des frais payés par ceux qui échangent, rien d'autre : il ne crée pas d'argent. Sur la courbe, pour 100 $ échangés, 1,25 $ de péage, dont [0,14 $] reviennent en rachat. C'est sur la fiche. » | `moteur.md` §1; Tier 2 until the first ticket |
| « 0,14 $ pour 100 $, votre rachat c'est rien. » | « Petit, oui. On ne te vend pas la taille, on te montre le ticket. » | True at every size: the buyback holds no price (`moteur.md` §7) |
| « L'équipe se sert. » | « L'équipe touche [43,4 %] de la part de la station au relevé en vigueur, en USDC, sur un wallet public : sur la courbe, environ [0,13 $] pour 100 $ échangés. Quand le gazole monte, c'est cette part qui baisse. » | 0,30 % × 43,4 % |
| « Le réservoir, c'est vous deux : rien ne vous empêche de tout garder. » | « Techniquement, rien. Ce qui se voit : le réservoir est public, chaque samedi le ticket montre ce qui y est entré et ce qui en est sorti, et un samedi sans rachat se verrait à 19:05. » | The custody question every buyback coin gets. Never claim more: the signers and the threshold stay an open decision until the fiche carries them |
| « Vous profitez de la crise. » | « Notre part baisse quand le gazole monte : 60 % à 1,50 €/L, [43,4 %] au relevé en vigueur, 30 % à 3,00 €/L. À volume égal, un gazole plus cher nous rapporte moins, pas plus. » | `formula.js`: the team gets 90 % of the station's share minus the taux. Never say our income does not depend on diesel: it does |
| « Les snipers ont tout raflé. » | « Le contrôle technique de 16:30 les compte : [n] acheteurs dans le même bloc que la création, wallets listés. pump.fun n'a pas de frais anti-snipe, on ne fait pas semblant. » | |
| « Votre rachat de 18:00 se fait front-run. » | « C'est possible, et ça se mesure : le prix avant et après l'heure est sur la chaîne. [A′ : l'heure est plafonnée sous le seuil où ça paie, le reste est reporté au samedi suivant.] [B : l'heure est plafonnée, le reste s'achète dans la semaine.] » | `moteur.md` §4. A bracket only once its option is adopted; the ticket's farming meter only once it is built |
| « Le rachat de l'heure, c'est tout ? » | A′: « Non. L'heure est plafonnée pour que la farmer ne rapporte rien. Le reste est reporté au samedi suivant, écrit sur le ticket, et ne revient jamais dans le partage. » B: « Non. L'heure est plafonnée pour que la farmer ne rapporte rien. Le reste s'achète dans la semaine, tranche par tranche, chacune publiée avec son lien, et tout est brûlé samedi à 19:00. » | Only if a cap of `moteur.md` §4 is adopted, in the form adopted |
| « Votre part triple après la migration. » | « Ce n'est pas notre réglage : c'est l'échelle par défaut de pump.fun, sans taux personnalisé. 0,30 % sur la courbe, 0,95 % entre 59 k$ et 300 k$, moins au-delà. C'est sur la fiche, et chaque ticket montre ce qui est vraiment arrivé. » | `fees.js`, Tier 2. « Sans taux personnalisé » only once the 15:31 curve read shows it (`moteur.md` §3) |
| « Pourquoi passer par votre pompe ? » | « Tu n'es pas obligé. Le site n'ajoute aucune commission. Sur la courbe et la pool officielle, le péage de pump.fun, notre part comprise, est le même quelle que soit l'interface, et certaines ajoutent leurs frais : 0,45 % sur l'app pump.fun, ceux de Jupiter sur notre pompe. » | Jupiter's fee in the Plugin is Tier 2 (`fees.js`: 0,50 % the first 24 hours, then 0,10 %). Never « la moins chère », never « le même partout »: a trade routed through another pool pays the station nothing (`fees.js`, `NON_CANONICAL`) |
| « Vous aviez annoncé Jupiter Studio et 18:00. » | « Changé le matin même, et c'est écrit dans le dépôt. Ce que ça change pour toi : le péage (détail sur la fiche) et pas de frais anti-snipe. » | Give no reason the founders have not written down |
| « Pourquoi USDC ? Je peux payer en SOL ? » | « Pour un ticket juste au centime : réservoir, partage et aide en dollars, sans taux de change. [Comment payer en SOL, une fois testé.] Circle peut geler une adresse USDC : [c'est sur la fiche]. » | `moteur.md` §3. The SOL route through the pump is Tier 2 (`config.jupiter.inputMint` is USDC); the Circle line goes on the fiche before this answer is used |
| « Les fondateurs ont des jetons ? » | « [Zéro] sur nos wallets publiés à l'ouverture, lisible sur Solscan, et aucun achat avant que le Plein #1 soit imprimé. Un wallet non déclaré, aucune règle ne peut l'empêcher : [c'est écrit sur la fiche], et le contrôle technique liste les premiers acheteurs. » | [Zéro] only after the 15:31 read; the no-buy rule only if `moteur.md` §5 is adopted, otherwise say what is true; the undisclosed-wallet line goes on the fiche first (`moteur.md` §5) |
| « Le relevé a une semaine de retard. » | « Quelques jours, oui. C'est le prix publié par le ministère, que personne ne peut pousser. Le direct est sur le bandeau ; le taux suit le relevé. » | |
| « Et si le ministère ne publie pas ? » | « Le taux reste celui du dernier relevé publié avant samedi 17:45. On ne l'estime jamais. » | `CLAUDE.md`, « Which price » |
| « L'aide alimentaire, c'est du vent. » | « Aucune association n'est nommée avant que la convention soit signée. D'ici là, les 10 % sont mis de côté [où : décision des fondateurs], et chaque ticket le montre. » | Never name a partner early |
| « Vous surfez sur le 17 octobre. » | The neutrality answer of section 5 | Once |
| « Site fait par une IA. » | « Oui, des agents IA lisent, calculent et rédigent. Aucun ne signe et aucun ne tient de clé : seuls les deux fondateurs signent, à la main. Le réservoir est un multisig ; ses signataires et son seuil sont sur la fiche. » | True by `CLAUDE.md` rule 1. Only once the fiche carries the signers and the threshold (an open decision) |
| « Qui est derrière ? » | « Deux fondateurs, pas d'investisseurs. L'éditeur du site est dans les mentions légales : [société]. Nos visages, non. » | Only once the publisher is filled in |
| « C'est un casino. » | « C'est un memecoin : son prix peut tomber à zéro, et le péage coûte plus que le rachat ne rend. Si tu cherches un placement, ce n'est pas ici. » | |
| « Pourquoi pas d'airdrop ? » | « Des jetons pour un post, c'est de la promotion payée. Des jetons pour ceux qui détiennent, c'est lié à la détention. Les deux, c'est non. La carte de fidélité ne vaut rien, et c'est écrit dessus. » | |
| « Le cours s'effondre, vous faites quoi ? » | « Le ticket sort samedi à 19:05, comme prévu. » | The volume-collapse kill switch, in one line |
| « Wen Binance ? » « Wen listing ? » | No reply. In the FAQ: « Aucune annonce de cotation, jamais. » | A listing announcement is a promise, and may weigh on the MiCA exemptions (playbook, for the lawyer) |

## 8. Meme formats and the next templates for L'Atelier

L'Atelier today makes three cards (totem, road sign, ticket) from two lines and two values, in a
chosen LED colour, exported at 1 080 × 1 350. The best memes are the ones that need no explanation
to a French driver and no knowledge of crypto.

**Formats the community already gets** (no new code): *le totem de ma vie* (LUNDI 08:00 · MORAL
0,00), *le panneau de sortie* (« Sortie 12 : lundi matin »), *le ticket de ma semaine*.

**No preset and no station post borrows a movement's words.** « Fin du mois » echoes « fin du
monde, fin du mois », a 2018 slogan; « vie chère » is the theme of today's protest, and « on lâche
rien » is a protest chant. The site's FIN DU MOIS J-12 preset should go (section 15). LOYER 980
(also the card's default) and BAGUETTE 1,45 are the same household budget in one line: the
station's own examples are road and time jokes (« LUNDI 08:00 · MORAL 0,00 »), and those presets
should be replaced too. Visitors make what they like; the station does not repost it.

**Next templates, in order:**

| # | Template | What it is | Example | Why it earns its place | Watch out |
| --- | --- | --- | --- | --- | --- |
| 1 | **Le compteur** | The pump display: two red LED rows, MONTANT and LITRES, labels editable | « MONTANT 116,42 · LITRES 50,00 », then « MONTANT 116,42 · LITRES DE MORAL 0,00 » | The counter is the core insight of the thesis, the moment everyone has stared at | No brand on the casing; red stays red (what you pay) |
| 2 | **Le ticket long** | The ticket with up to five lines and a total | « PÉAGE 23,10 · PLEIN 116,42 · SANDWICH 7,90 · TOTAL 147,42 », the holiday drive | Lists are the format people share most | Nothing that looks like a real fuel receipt (no brand, no card digits, no address); the station's own examples are a drive, not a household budget (« RESTE 0,00 » is the protest's argument in one line) |
| 3 | **Le voyant** | A dashboard warning light pictogram and one label | « VOYANT MORAL · NIVEAU RÉSERVE » | Ties the meme to the dashboard's honest lights | Generic pictograms only |
| 4 | **La carte** | Export of the visitor's own loyalty card | « 7/10 · Valeur : 0,00 € » | The anti-airdrop joke, shareable | Never a code, a wallet or anything that could prove a stamp |
| 5 | **Le PMV** | The motorway variable-message sign, three lines of dot-matrix text | « BOUCHON MENTAL · À 2 KM · PATIENCE » | Very French, uses the Doto font already loaded | Lowest priority; three lines are harder to make funny |

**Stickers for Telegram** (a pack, made from the brand kit): the stamps *VÉRIFIÉ*, *PRIX FIGÉ*,
*TICKET IMPRIMÉ*, *DÉFAUT MINEUR*, *HORS SERVICE*, *LIGNE CONTINUE*, *MACHINE À CAFÉ HORS
SERVICE*, and the dark totem with no number on it. No sticker carries a rate or a price: those go
stale on Monday.

**Rules for every template:** a card prefilled from a link carries the notice that it is a
visitor's card, not a message from the station; no photo upload (brands, number plates and faces
would arrive within the hour); no AI image generation (photoreal stations get read as real ones,
and AI visuals are already part of the protest's imagery); no mascot. The station never reposts a
card that converts a fill into tokens, names a person or carries a protest sign.

**Cut:** wojak and pepe at the pump (generic crypto, mocked on sight, and a step from a face),
anything yellow or a vest, Marianne or the tricolore, a real totem with a brand, a politician's
face, a drawn pompiste, a « countdown to graduation » card, a template that looks like an official
form (a PV, a Cerfa), and Halloween or Toussaint skins.

## 9. Roles, the loyalty card and the contest

**No role carries money, tokens, whitelists, early access or any perk.** A perk for posting is
paid promotion; a perk for holding is a draw tied to holding. Titles are earned by doing things
anyone can do without a wallet.

| Role | Who | What it does | What it never gets |
| --- | --- | --- | --- |
| Les habitués | everyone at the station | come Saturdays, make totems, ask questions | a rank by holdings |
| Le vérificateur | anyone who posts a matching Solscan link on a ticket | proves the ticket is real, in public | a reward, a badge tied to a wallet |
| Le sceptique du fond | anyone who asks the question the station finds hardest | gets the Sunday slot of the carnet de bord | a name in the carnet, a prize |
| La vigie | anyone who reports a fake coin or a fake account | feeds the `vigie` reports and the pinned warnings | a bounty |
| Les veilleurs de nuit | the group's moderators, volunteers, listed by exact @ in the pinned rules | delete scams, keep politics out, answer with links | pay of any kind, the right to DM first, a word on the price |
| L'Atelier | anyone who makes a card | the memes | a prize of any kind |

No *OG* role for early buyers, no holder leaderboard, no « top holder » shout-out, no ambassador
programme. The carnet de bord can count the verifications (« 12 tranches vérifiées par 9
habitués ») without naming anyone.

### La carte de fidélité

The founders replaced airdrops with it. It is a joke with a rule behind it, and the rule is the
point. As `interfaces.md` and `public/js/carte.js` define it: kept in the visitor's browser only,
one stamp per kind per ISO week, ten stamps fill it, a full card wins nothing and says so. The
four kinds, as the site words them: being on the page during a Saturday plein (18:00–19:05, from
24 October), a successful Mon Plein search, a PNG exported from L'Atelier, a click on a Solscan
link of a real ticket. No kind is a purchase, a swap, a follow or a post.

- **The site's copy is the reference** (`index.html`): « Ta carte reste dans ton navigateur. Rien
  n'est envoyé, rien n'est à gagner, aucun achat ne compte. » and, when full, « Dix tampons, et tu
  gagnes… rien. Comme partout, mais ici on te le dit. »
- **It must never become an airdrop later.** Degens will assume any card is a future snapshot. In
  posts and replies the station adds the promise the site does not yet print: « Elle ne vaut rien
  et ne sera jamais convertie en jetons. » What makes it credible is the fact beside it: we cannot
  reward what we cannot see.
- **Arithmetic** (checked against `carte.js`): in launch week only two kinds exist (Mon Plein and
  L'Atelier), then four a week from 24 October. A card started on 17 October fills at the earliest
  on Saturday 31 October, during Plein #2: 2 + 4 + 4 stamps.
- **What the card is for:** it marks the visitor's own habit (the free tool, the workshop, the
  ritual, the check) and nothing else. The *ticket* stamp is a stamp for verifying, which is the
  behaviour the station most wants and the one nobody pays for.

### The jury contest

**Off.** The draft rules (`public/reglement-concours.html`) stay unlinked until the lawyer answers
whether a prize for a post showing the $PLEIN mark is paid promotion. Until then: no teaser, no
« bientôt un concours », no « on garde vos meilleurs totems pour plus tard ». If it opens, it is
free, adults only, judged on skill by a named jury, with written rules, entered by e-mail or a
neutral hashtag, and nothing tied to buying, holding, following or reposting.

## 10. Thirty posts, 17 October to 1 November

Each one is tied to a real event or a real number, none promises a gain, and none is posted
before its number exists. Times are Paris. « Canal » is the Telegram channel; X is the station
account. Posts that name $PLEIN, the taux or the contract end with the risk line of section 6; it
is not repeated in the table. On X a post holds 280 characters, risk line included (a standard
account; a link counts 23, an image nothing), counted with each bracket at its worked example; a
post that cannot fit is a thread, with the risk line in its first post.

| # | When | Where | Anchor | Post |
| --- | --- | --- | --- | --- |
| 1 | Sat 17, 08:30, after the automatic totem | X, canal | Launch day; the rule (`formula.js`); relevé du 9 octobre (`config.js`) | « Ouverture à 15:30. Chaque samedi à 18:00, dès le 24 octobre, une part des frais rachète et brûle du $PLEIN : 20 × le prix officiel du gazole, 46,6 % au relevé du 9 octobre. Contrat sur le site à 15:30, nulle part ailleurs. » |
| 2 | Sat 17, 12:00 | X, canal | First day of the Toussaint holidays (Tier 2, iCalendrier) | « Premier jour des vacances. Avant de prendre la route : les trois stations les moins chères autour de ton code postal, avec l'heure de leur dernier prix. Données officielles, gratuit, sans wallet. [lien Mon Plein] » |
| 3 | Sat 17, 15:00 | X, canal | `launchAt` | « Dans 30 minutes, le contrat s'affiche sur le site. Ne cherche pas PLEIN sur pump.fun : plusieurs coins porteront ce nom. Copie le contrat depuis le site. On ne t'écrira jamais en premier. » |
| 4 | Sat 17, 15:30 | X, canal, pinned | The contract in `live.json` | « La station est ouverte. Contrat officiel : [adresse]. Le seul. Copie-le depuis le site et vérifie-le avant de signer quoi que ce soit. Ne mets jamais l'argent de ton plein dans $PLEIN. » |
| 5 | Sat 17, 15:35 | X, canal | Published wallets; their tokens as read at 15:31 | « Nos wallets sont publics : [lien fiche]. Jetons sur les wallets de l'équipe à l'ouverture : [0, ou le montant exact et son wallet]. Ni prévente ni investisseurs. » |
| 6 | Sat 17, 16:30 | X, canal | `npm run audit` | « On s'est mis un PV. Contrôle technique de notre propre lancement : [n] acheteurs dans le même bloc que la création, top 10 à [x] %, autorités de création et de gel : [état]. Défauts compris : [lien]. » If nothing is found: « Contrôle technique de notre propre lancement : aucun défaut trouvé à 16:30. Ça ne veut pas dire aucun risque. [lien] » |
| 7 | Sat 17, 19:00 | X (thread of two), canal | pump.fun fees (`fees.js`, Tier 2) | « Le péage : 1,25 % par échange sur la courbe, dont 0,30 % pour la station. Sur 100 $ échangés, [0,14 $] reviennent en rachat. Le péage coûte toujours plus que le rachat ne rend. Chiffres de pump.fun, à vérifier au premier ticket. » Then: « Ton interface peut ajouter ses frais : 0,45 % sur l'app pump.fun, ceux de Jupiter sur la pompe du site. Le site, lui, n'ajoute aucune commission. » If the curve has completed, the first post becomes « Le péage : [1,20] % par échange sur la pool officielle, dont [0,95] % pour la station à cette capitalisation. Sur 100 $, [0,44 $] reviennent en rachat. Le péage coûte toujours plus que le rachat ne rend. Chiffres de pump.fun. » (`feeRow()` gives the total and the creator rate; the rachat is the creator rate × the taux) |
| 8 | Sat 17, 21:00 | X, canal | `firstPleinAt` | « Pas de plein ce soir. Le premier, c'est samedi 24 octobre à 18:00, et son ticket sort à 19:05, même si le réservoir est presque vide. Un prix qu'on subit, un rachat qu'on vérifie. » |
| 9 | Sun 18, 11:00 | X, canal | Carnet de bord #0; `/api/chain` (its volume is DexScreener's) | « Carnet de bord #0. Volume des dernières 24 h (DexScreener) : [x] $. Frais de la station : [y] USDC, réclamés : [z]. Top 10 des wallets : [t] %. Ce qui a raté : [une ligne]. Le reste lu sur la chaîne à [heure]. » |
| 10 | Sun 18, 18:00 | X | The ×20 rule, floor and cap (`formula.js`, Tier 1) | « Un centime de plus sur le gazole, c'est 0,2 point de rachat en plus, et 0,2 point de moins pour l'équipe. Plancher 30 % à 1,50 €/L, plafond 60 % à 3,00 €/L. L'aide alimentaire reste à 10 %. » |
| 11 | Mon 19, 10:00 | X, canal | `/api/diesel`, gazole against SP95-E10 | « Ce matin, moyenne nationale en direct : gazole [x] €/L, SP95-E10 [y] €/L. Le gazole coûte [z] centimes de plus que l'essence. Données officielles, relevées à [heure]. » Only if the gap is positive that morning |
| 12 | Mon 19 or Tue 20, when merged | X, canal | The ministry's next weekly note (Tier 2 timing) | « Le relevé est tombé : gazole à [prix] €/L, semaine du [date]. Taux du Plein #1 : [taux] %. Source : [lien ministère]. » |
| 13 | Tue 20 | X, canal | `/api/stations`: cheapest, average and saving for one postcode | « 75011, ce matin, données officielles : gazole à [min] €/L dans la station la moins chère, [moyenne] €/L en moyenne. Sur un plein de 50 L, l'écart fait [économie] €. Le tien : [lien Mon Plein]. » Rotate 75011 (this week), 13001, 69003, week by week, fixed in advance; quote the average, never the dearest station (a stale price can sit at the top) |
| 14 | Wed 21 | X, canal | `/api/chain`, the same lights as 16:30 on the 17th | « Contrôle technique, quatre jours après l'ouverture : top 10 des wallets à [x] %, contre [y] % samedi à 16:30. Autorités de création et de gel : [état]. Lu sur la chaîne à [heure]. » Posted whichever way it moved |
| 15 | Wed 21 | X, canal | L'Atelier | « Fais ton totem. Deux lignes, deux valeurs, un PNG. LUNDI 08:00 · MORAL 0,00. [lien Atelier] » Never the LOYER or BAGUETTE presets (section 8) |
| 16 | Thu 22 | X | `fillCost(relevé, 50)` | « Un plein de 50 L au relevé en vigueur : [116,42 €]. Mon Plein ne le rendra pas gratuit. Il te dit juste où il coûte le moins. [lien Mon Plein] » |
| 17 | Thu 22 | X, canal, group pin | The founders' no-airdrop decision | « Il n'y a pas d'airdrop $PLEIN, et il n'y en aura pas. Notre carte de fidélité ne vaut rien et ne sera jamais convertie en jetons. Un lien qui te promet le contraire veut vider ton wallet. » |
| 18 | Fri 23, 18:00 | X, canal | The run sheet | « Demain. 17:45 prix figé. 17:50 les frais rejoignent le réservoir. 18:00 rachat en 12 tranches. 19:00 burn. 19:05 ticket. [plein.ics] » Under `moteur.md` §4, A′: « 18:00 rachat de l'heure en 12 tranches, plafonné par la profondeur de la pool ; le reste est reporté au samedi suivant. » B: « 18:00 rachat de l'heure en 12 tranches, le reste dans la semaine. » |
| 19 | Sat 24, 17:45 | X, canal | The frozen relevé | « Prix figé : [prix] €/L, relevé du [date]. Taux du Plein #1 : [taux] %. » Nothing about the réservoir: the week's fees reach it at 17:50 |
| 20 | Sat 24, 18:00–19:00 | canal (one message, edited per slice), X (thread) | The 17:52 order (`npm run plein`), then each slice signature | It opens with « Plein #1 en cours. Réservoir après réclamation : [x] USDC. Rachat : [B] USDC, en 12 tranches. » Under A′ the second line is « Rachat de l'heure : [H] USDC, plafonné par la profondeur de la pool. Le reste, [R] USDC, est reporté au samedi suivant et ne revient jamais dans le partage. » Under B: « Rachat de l'heure : [H] USDC. Le reste, [R] USDC, s'achète dans la semaine, tranche par tranche, chacune publiée après coup. » Then, per slice: « Tranche [n]/12 : [x] USDC → [y] $PLEIN. [lien Solscan] » A failed slice: « Tranche [n]/12 : hors service. [raison]. » |
| 21 | Sat 24, 19:05 | X, canal, site | Plein #1 ticket | « Plein #1. Le ticket est imprimé. Chaque ligne a son lien. Prends-en une, vérifie-la, dis laquelle : à plusieurs, on les fait toutes. [image du ticket] » |
| 22 | Sat 24, 23:00 | X, canal | Clock change, 25 Oct (`clock.js`, Tier 1) | « Cette nuit, à 3 h, il sera 2 h. Entre le Plein #1 et le Plein #2 : 169 heures, une de plus que d'habitude. Le compte à rebours le sait déjà. » |
| 23 | Sun 25, 11:00 | X (thread of two), canal | Carnet de bord #1 | « Carnet de bord #1. Plein #1 : [x] USDC rachetés, [y] $PLEIN brûlés, [z] USDC mis de côté pour l'aide. Tranches vérifiées par des habitués : [n]/12. » Then: « Défaut de la semaine : [une ligne]. Question du sceptique : [question]. Réponse : [réponse]. » |
| 24 | Mon 26 | X, canal | The first ticket on the wall; under §4, the reliquat | « Le mur n'est plus vide. Plein #1 : [n] lignes, chacune avec son lien. Le prochain s'imprime samedi 31 octobre à 19:05. » Under `moteur.md` §4, add for A′: « Reliquat reporté au Plein #2 : [R] USDC. Il ne revient jamais dans le partage. » For B: « À racheter cette semaine : [R] USDC, tranche par tranche, chacune publiée après coup. » |
| 25 | Mon 26 or Tue 27, when merged | X, canal | The relevé for Plein #2 | « Le relevé est tombé : [prix] €/L, semaine du [date]. Taux du Plein #2 : [taux] %. Source : [lien]. » |
| 26 | Wed 28 | X, canal, Péage notice | The drop announced for 1 November, 8 to 18 cents (Tier 2, thesis sources); `formula.js` | « Si la baisse annoncée au 1er novembre arrive, le taux baissera : 8 centimes de moins au relevé, 1,6 point en moins ; 18 centimes, 3,6 points. C'est la règle. Notre part remonte d'autant. Ton plein, lui, coûtera moins cher. » |
| 27 | Thu 29 | X, canal | `carte.js` arithmetic | « Samedi, pendant le Plein #2, les premières cartes de fidélité peuvent se remplir. Dix tampons. Gain : rien. C'était écrit dessus. » |
| 28 | Fri 30, 12:00 | X, canal | The holidays' return weekend (Tier 2, iCalendrier) | « Week-end de retour. Ton code postal, ton carburant, ton réservoir : les trois stations les moins chères autour de toi, avec l'heure de leur dernier prix. Gratuit, sans wallet. [lien Mon Plein] » |
| 29 | Sat 31, 17:45 → 19:05 | X, canal, site | Plein #2, the first after sunset in Paris | « Plein #2. Le totem s'allume plus tôt : c'est le premier plein après le coucher du soleil à Paris. Prix figé : [prix] €/L. Taux : [taux] %. » then the slices and the ticket, as on the 24th |
| 30 | Sun 1 Nov, 11:00 | X, canal | The drop, if `/api/diesel` shows it | « Le gazole baisse ? Tant mieux pour ton plein. Le taux suivra au premier relevé qui intègre la baisse, comme annoncé mercredi. » No post if the live average is not below the last relevé |

Notes: post 5 says what the 15:31 read shows on the published wallets; if one of them bought at
creation, the amount and the wallet go in the post. It cannot speak for a wallet nobody declared,
and section 7 says so. Post 23 says « mis de côté pour l'aide » until the food-aid agreement is
signed; how the 10 % is held until then is a founders' decision. Post 26 is conditional because
the drop is a government announcement, not a fact yet, and it works in points, not in a final
rate, so it stays true whatever the relevé in force on 28 October is (within the 30–60 % band).
Which plein first prints the lower rate depends on how the ministry dates the survey that
includes 1 November: say « au premier relevé qui l'intègre », never a plein number in advance.

### Posts on a trigger

Written now, posted only when the event happens, word for word.

| Trigger | Where | Post |
| --- | --- | --- |
| The opening slips | X, canal, pinned, every 30 minutes | « Ouverture retardée. Aucun contrat n'est encore publié : tout contrat qui circule est faux. Prochaine information à [heure]. » |
| The coin was created wrong (the 15:31 check of `moteur.md` §3) | X (thread of two), canal, pinned | « Le coin créé à [heure] depuis notre wallet créateur est raté ([raison]) : ce n'est pas $PLEIN, ne l'achète pas. Le seul contrat sera celui du site. » Then: « Ses frais de créateur, s'il y en a : [ce que les fondateurs en font], transaction à l'appui. » The founders decide what those fees become before posting; the creator wallet never trades that coin |
| A clone or a fake contract spreads (`vigie`) | X, canal, group | « Fausse pompe : un coin nommé [nom] se fait passer pour $PLEIN. Ce n'est pas le nôtre. Le seul contrat est sur le site : [siteUrl]. » Never a person's name |
| A slice or a step fails | canal, X thread, then the ticket | « Tranche [n]/12 : hors service. [raison en une ligne]. Reprise : [quand]. » |
| The curve completes | X, canal | The « Rodage terminé » post of section 4 |
| A founder's plan (`moteur.md` §5, if adopted) | the fiche and `live.json` first, then the canal, silent (Bot API `disable_notification`), 24 hours before the first window; never X | « Fenêtre fondateurs, à partir du mardi [date], 10:00–12:00 : [fondateur] [achètera ou vendra] [total] $PLEIN sur [n] mardis, depuis [wallet]. » then, after each window, « Fait : [lien Solscan]. » The same words for a sale and a buy |
| A mistake found on a printed ticket | the next ticket, canal | « Correction du Plein #[n] : [ligne]. Le ticket #[n] reste tel qu'il a été imprimé. » |
| The food-aid agreement is signed | X, canal, fiche | « Convention signée avec [association]. [Montant] mis de côté depuis le Plein #1 lui sont versés en euros, reçu publié. » Only with the signed agreement in hand |
| Political capture (thesis kill switch) | X, canal | « La station ne prend pas position. Tout le monde passe à la pompe, quel que soit son vote. » Once |

## 11. Telegram and X

**One voice, two places, no personal accounts.** The founders never post about $PLEIN from their
own accounts and never reply as themselves.

### Telegram

- **Canal « Station $PLEIN »** (broadcast, `TELEGRAM_CHANNEL_ID`): the morning totem, the relevé,
  J-1, the plein, the ticket, the carnet de bord, anti-scam warnings. Nothing else; three or
  four posts on an ordinary day, and on a Saturday the three of section 4.
- **Groupe « L'aire de repos »** (discussion). The founders moderate it as anonymous admins
  (Telegram's « Rester anonyme » right, Tier 2), so their personal accounts never show; volunteer
  *veilleurs de nuit* join later, by exact @. On launch day: slow mode; no links or media from new
  members for their first 24 hours; no bot at the door unless the founders have reviewed it
  themselves. If nobody can moderate, the group stays closed and the channel carries the day.
- **Ops chat** (the two founders and the bot, `TELEGRAM_OPS_CHAT_ID`): reports, never public.

**Group rules, pinned:**

> **L'aire de repos · règles**
> 1. 18 ans et plus.
> 2. Pas de politique : aucun parti, mouvement, syndicat, élu.
> 3. Parle du cours si tu veux, mais personne ne promet rien ici, toi non plus : les « x10 », les « ça va exploser » et les captures de gains sont supprimés.
> 4. Aucun contrat (l'officiel est épinglé), aucun lien sauf le site et Solscan.
> 5. Personne de l'équipe ne t'écrira en privé. Celui qui le fait est un escroc.
> 6. Pas de pub, pas d'autre coin, pas d'appel à acheter.
> 7. Les blagues visent les prix, jamais les gens. Personne n'est moqué pour avoir vendu ou pour ne pas avoir acheté.
> 8. Pas de visage réel, pas de marque, pas de photo de vrai ticket ni de plaque. Les totems de l'Atelier sont les bienvenus.
> 9. Les veilleurs de nuit sont bénévoles et non payés : [@liste exacte]. Tout autre « admin » est faux.

**Pinned in the group, in this order:** the official contract and the three official links;
these rules; the anti-scam block below; the risk block (*bande d'arrêt d'urgence*); « Il n'y a pas
d'airdrop. Il n'y en aura pas. »

### X

- **Display name:** Station $PLEIN. **Bio** (157 characters, X allows 160): « Memecoin : le prix
  officiel du gazole fixe la part du rachat du samedi 18:00, ticket vérifiable. Perte totale
  possible. 18+. On ne t'écrit jamais en premier. »
- **Pinned:** until 15:30 the prebunk; after, the contract post (post 4).
- **Replies:** to questions, with a link, once (section 7). Never in political threads, never a
  quote-post of a critic, never a raid, never « RT si ». No hashtags on 17 October; after that, at
  most one, about fuel, never a protest one. No ads and no paid boost, on X or anywhere.

### pump.fun's page

The coin page carries the site, X and Telegram links set at creation and the token text of
`moteur.md` §3. The station never writes in its comments: a message from the creator shows a
« dev » badge (Tier 2) and reads as the issuer talking up its coin. Fake contracts posted there go
to the vigie.

### Anti-scam

The pinned block, in the group and on the channel:

> **Anti-arnaque · à lire avant tout**
> 1. Le seul contrat est celui du site : [siteUrl]. Compare chaque caractère, pas seulement le début et la fin.
> 2. Personne de la station ne t'écrira en privé. Jamais. Ni « support », ni « admin », ni « pompiste ».
> 3. Il n'y a ni airdrop, ni bonus du Plein, ni remboursement. Un lien qui en promet un veut vider ton wallet.
> 4. Pour entrer dans le groupe, on ne te demandera jamais de connecter ton wallet, de coller une commande ni ta phrase secrète.
> 5. Tu as perdu des fonds ? Personne ne peut les « récupérer » contre paiement. Ceux qui le proposent sont la deuxième arnaque.

The scams to expect (a pattern common on Solana launches, Tier 2):

- clone coins named PLEIN created on pump.fun before 15:30, because the name and the time are in
  a public repository: the 15:00 post says so before they appear;
- fake support DMs (« je suis admin, je t'aide à acheter ») and fake admins with a copied name;
- fake verification bots at the door of a fake group that ask for a wallet connection, a secret
  phrase or a command to paste into a terminal;
- fake airdrops, « bonus du Plein #N » and « remboursement » links;
- a lookalike site with a swap widget that drains the wallet: the only site is the one in the
  bio, and the contract checker on it is the reference;
- clone coins named PLEIN or GAZOLE and fake contracts posted in replies or in the pump.fun
  comments: the `vigie` workflow finds them; the vigie reports them; the station posts « fausse
  pompe » with the real contract;
- fake groups named « Station PLEIN Officiel » and fake « Plein #N en direct » streams: the only
  links are on the site;
- after any fall in price, « recovery » services that DM victims: rule 5 above.

On a wave of fakes, the thesis kill switch: pinned warning everywhere, the contract checker in the
hero, reports filed with X and Telegram.

## 12. Why a copy does not work

Be honest about it: the name, the ticker, the totem, the formula, Mon Plein and the site's code can
be copied in ten minutes, and the repository makes it easy. What cannot be copied is what only time
and conduct produce.

- **The wall of tickets.** Every Saturday since 24 October, with every signature on Solana. A copy
  starts at zero and cannot backdate a Saturday. Our git history proves nothing (commit dates can
  be written by hand); the chain does.
- **A clock nobody controls.** The rate comes from a price the State publishes. A copy can use it
  too, and it then becomes a second station, one that started later.
- **Promises kept when they cost something.** A ticket for a near-empty réservoir; a defect shown
  at 16:30 on launch day; the team's share shrinking when diesel rises; the toll's cost to traders
  said out loud. A copy that tunes the formula in its own favour shows it on its first ticket.
- **Mon Plein with nothing to sell.** The tool is open data and copies easily. A copy built to
  sell a coin puts the coin in front of it; ours keeps it free, without a wallet, and away from
  the pump.
- **The lexicon used unprompted.** When regulars say « tranche vérifiée » without being asked, the
  station is theirs. That is the falsifiable sign the thesis asks for.

None of it protects the price. The ticket proves the process, not the value, and the station says
so.

## 13. Cringe and banned

**Banned (law, the lines, or the facts):**

- Gains: x10, « moon », « rendement », « investissement », « revenu passif », « le rachat fait
  monter le cours », « soutient le prix », « prix plancher », « protège-toi du gazole »,
  « assurance », « bientôt listé sur » any exchange, « un plein = [n] $PLEIN ».
- Rewards: airdrop, snapshot, whitelist, holder rewards (pump.fun's stays off), giveaways,
  « RT + follow pour gagner », anything won by buying, holding, following or posting, and a prize
  for a full loyalty card, ever.
- Paid reach: paid influencers or callers, paid raids, paid trending (Telegram bots, DexScreener
  boosts), X or Telegram ads, tokens gifted to creators, volume bots, a pump.fun referral code.
  Whether DexScreener's paid token profile counts is a question for the lawyer; until then, no.
- Politics: the gilet jaune and anything yellow or reflective, protest hashtags and chants
  (« on lâche rien »), « colère », « le peuple », « ils », « blocage », « vie chère », « fin du
  mois », fuel taxes (the heart of the political fight), politicians by name (the 1 November drop
  is « la baisse annoncée »), Marianne, the tricolore, the State's logos.
- People: real faces (founders included), fuel brands, photos of real stations, receipts or number
  plates, jokes about anyone who cannot fill up, mocking sellers (« jeets », « paper hands ») or
  people who did not buy, anything aimed at students or under-18s, screenshots of anyone's gains
  or losses.
- Facts: a number with no source, a holder count used as a boast, the price of $PLEIN as news,
  « favorable » before the audit ran, « LP lockée » before it is seen on-chain, the food-aid
  partner's name before the agreement is signed, an invented regular, a superlative nobody can
  check (« le premier », « le seul »), « la pompe la moins chère », « la station ne prend rien sur
  sa pompe », a toll « le même partout », « ce qu'on gagne ne dépend pas du gazole », « rien ne
  change » on a day something does.

**Cringe (legal, but a French degen screenshots it and laughs):**

- « WAGMI », « LFG », « gm les habitués », emoji chains, « dev is based », « on est différents des
  autres coins », « la famille $PLEIN », « les Pleiners ».
- « Qui est prêt pour samedi ? », hourly countdown posts on a Saturday or before 15:30, « Plein
  #1 sera historique ».
- Call-centre politeness: « Le pompiste vous souhaite une excellente journée ! ».
- « Le pompiste a parlé », « le totem ne ment pas »: the attendant does not have catchphrases, and
  does not role-play.
- Puns on every post (« un plein d'énergie »). One pun a week, at most.
- The coffee machine every day. Once a week, at most, and never next to a number.
- Explaining the joke, or the psychology behind it.
- « Not financial advice » as an English badge: the risk line says it in French, properly.
- Halloween and Toussaint skins, a mascot, a celebration of 1 000 holders.
- Replying to every critic, pinning press articles, begging for reposts.

## 14. The critic's cuts

Every idea here went through two readers, used as a test: *le degen*, who mocks anything that
smells of marketing, and *la journaliste*, who looks for the sentence to quote against us. The test
finds the weak line; it is not the reason to cut it. Each verdict gives the reason: false,
misleading, political, a call to buy, or noise.

| Idea | Why it is cut | Verdict |
| --- | --- | --- |
| « Snipe-nous : la fenêtre anti-snipe paie le premier plein » | false: pump.fun has no anti-sniper fee | Cut. Snipers are measured at 16:30 instead |
| An X Space for the first hour on launch day | a founder's voice, live and unscripted, on a protest day | Cut. A Space for a later plein can be reconsidered |
| A livestream of Plein #1 with voices | the face rule, and the founders' voices on the record | Cut: the page is the broadcast |
| Launching « on the day against poverty » | political: it ties a memecoin to poverty on a protest day | Never mentioned |
| The flight strikes until 21 October as a post | political: a union action | Never mentioned |
| « Montre ton ticket »: post your real fuel receipt | real receipts carry brands, card digits and addresses, and a prize for a post is paid promotion | Cut, replaced by L'Atelier's ticket |
| « Si le plein était maintenant », the Friday estimate | it advertises the hour's size to front-runners (`moteur.md` §4), and it is a teaser | Cut: the dashboard shows the réservoir; the station does not narrate it |
| Curve progress posts (« plus que 10 % ») | a countdown to a purchase: the urgency we refuse | Cut: dashboard only, one post when done |
| « Pour le reste, rien ne change » in the graduation post | false: at migration the station's share can go from 0,30 % to 0,95 % | The post states the share in force |
| « Le plein est fait » for the graduation | confusing: on launch Saturday the feed could read « Le plein est fait » at 16:00 and « Pas de plein ce soir » at 21:00 | Renamed « Rodage terminé » |
| « Samedi, 18:00, comme chaque semaine » in the graduation post | false before Plein #1, and on 17 October it reads as tonight | « Prochain plein : samedi [date], 18:00 » |
| « Le totem ne ment pas » as a motto | a boast that one wrong relevé, merged, would make false | Replaced by « le totem affiche, il ne commente pas » |
| « Le gazole est au plus haut » in the journalist answer | false: the 9 October relevé is below the 2 October one | Say the number |
| « Les patrouilleurs » for the moderators | a real motorway job where people die on duty, and it reads as policing | Renamed les veilleurs de nuit |
| Regulars quoted as characters (« le vérificateur dit… ») | misleading (MiCA's « clair et non trompeur »): invented social proof | Types for stickers, never quoted |
| A public honour roll of verifiers by name | a status game that ranks people | Counts only, no names |
| « Devine le relevé », a weekly poll | engagement bait without a prize; with one, a contest for the lawyer | Cut |
| « Un plein = [n] $PLEIN » cards | a call to put fuel money into the coin, against the sentence that holds the site up | Banned, never reposted |
| Photos of your local totem | the brand rule: real totems carry brands | Cut: make one in L'Atelier |
| A mascot pompiste | the face rule | Cut: the totem is the face |
| A bot that speaks as a human attendant | misleading (MiCA's « clair et non trompeur ») | Automated posts say they are automatic (the totem caption still has to: section 15) |
| Halloween plein | noise: every coin does it, and Toussaint follows | Cut: Plein #2 is « le premier après le coucher du soleil à Paris » |
| A sunset joke about the one town where 18:00 is still daylight on 31 October | false at the minute: a computed sunset is good to a minute or two, the joke needs the exact one | Cut |
| Three posts on the clock and the dark in one week | noise: one joke, told three times | Two: the clock change on the 24th, the totem line folded into Plein #2 |
| Loyalty card with prizes « later » | a hidden promise: an airdrop in disguise | It says it will never be converted |
| A second full-card line of our own | the site already has a better one | The site's line is the reference |
| « Fais le plein de $PLEIN » as a slogan | a call to buy | Cut; the site button stays a button |
| « On est la seule équipe qui gagne quand le gazole baisse » | a superlative nobody can check | Replaced by « notre part remonte d'autant » (post 26) |
| « Ce qu'on gagne dépend du volume, pas du gazole » | false: the team gets 90 % minus the taux, so at equal volume its income moves with diesel | « À volume égal, un gazole plus cher nous rapporte moins, pas plus » |
| A post for the fiche while it still has brackets | it sends people to a page that is half empty | Posted only once its brackets are filled |
| « La pompe la moins chère, c'est ici » | false: Jupiter's fee on a token under 24 hours (0,50 %, Tier 2) is above the pump.fun app's 0,45 % | « Le site n'ajoute aucune commission », with every fee listed, as the site does |
| « La station ne prend rien sur sa pompe », a toll « le même partout » | misleading: the station's share is charged on every trade through its pump, and a trade routed through another pool pays the station nothing (`fees.js`) | « Le site n'ajoute aucune commission », and the share named |
| A post when Jupiter's new-token fee falls after 24 hours | a fee cut, posted, is a call to trade, and the figure is Tier 2 | On the fiche only, once checked |
| FIN DU MOIS J-12 and « Sortie 3 : fin du mois » | political: « fin du monde, fin du mois » was a 2018 slogan, and the day's protest is about the cost of living | Out of the station's posts; the preset should go |
| LOYER 980 as the station's example and the card's default; BAGUETTE 1,45 | political by register: a household budget in one line, the protest's argument | The station's examples are road and time jokes (« LUNDI 08:00 · MORAL 0,00 »); the presets should go |
| A household-budget ticket (« RESTE 0,00 ») as the station's example | political: the protest's argument in one line, on the protest day | The example is a holiday drive |
| Twelve Telegram posts in one hour | noise: the channel gets muted by 18:20 | One message, edited per slice; the ticket is the new post |
| An hourly countdown to 15:30 | false urgency | One post at 15:00, then the contract |
| Founder buys announced with enthusiasm | a call to buy from an insider | One flat line, the same words for a sale |
| A founder's sized order announced 24 hours ahead on X | a buy of known size and time from the official account is a buy signal, and a trade to front-run | The plan on the fiche and in `live.json`, one silent channel message, slices under the hour cap; never on X |
| « Nobody audits their own launch; we do » | a superlative nobody can check | « Our defects, shown by us first » |
| Gains screenshots in the group | a promise of gains by display, in the official group; the lawyer's question on members' posts is open | Removed by rule 3 |
| Replying in pump.fun's comments | a creator's comment carries a « dev » badge and reads as the issuer talking up its coin | Never |
| Picking the most striking postcode gap, or the dearest station | misleading: cherry-picked, and a stale price can sit at the top | Rotation fixed in advance, the average quoted |
| « Vérifie-en une, une seule suffit » on the ticket | false: one line checked does not check the other eleven | « Prends-en une, vérifie-la, dis laquelle : à plusieurs, on les fait toutes » |
| Theory words in posts and in this file | jargon that describes the audience instead of talking to it | Plain words; the thesis keeps the theory |

## 15. Open, for others

- **The lawyer:** the contest; whether the risk line is enough on a post, and whether a Mon
  Plein-only post needs it; whether members' price talk in an official group binds the station;
  DexScreener's paid token profile; the 0 % team line if a founder buys at creation; whether
  publishing a founder's plan 24 hours ahead is enough under the market-abuse rules
  (`moteur.md` §5).
- **The founders:** the moderators and their exact @; whether the group opens on launch day;
  how the 10 % is held until the agreement is signed; what a Saturday looks like if Solana or
  Jupiter is down; which option of `moteur.md` §4 goes on the fiche at 15:30 (A, A′ or B), and
  whether the founder window of §5 is adopted (posts 18, 20 and 24, two lexicon rows and two hard
  answers carry the A′ and B forms; the founder-plan trigger exists only if §5 is); what the
  creator fees of a coin created wrong would become; the X handle, the Telegram links and
  `siteUrl` in `config.js`. One more since the repository is public: the thesis's psychology
  table describes the audience in the vocabulary of levers. Keep it, or reword it in a commit
  that says why; deleting it would not erase the git history, and it would be hiding it.
- **The fiche** (`public/fiche-plein.html`), before the hard answers that point to it are used:
  that nothing stops a founder's undisclosed wallet (`moteur.md` §5); that Circle can freeze a
  USDC address (`moteur.md` §3); the multisig's signers and threshold.
- **The builders:** the morning caption should end with « Publication automatique. » and, on
  17 October, carry the opening time (`scripts/totem.mjs`), before this morning's run, or
  `totem` stays off for the day; the card should print « ne sera jamais convertie en jetons »
  (`public/index.html`); the FIN DU MOIS J-12, LOYER 980 and BAGUETTE 1,45 presets should leave
  L'Atelier, and LOYER 980 stop being the card's default (`public/index.html`, `public/app.js`);
  `scripts/telegram.mjs` could edit a channel message, for the plein hour, and send one without a
  notification, for the founder plan; the ticket needs a *hors service* line and, under option B,
  the weekday slices, and the rétroviseur once it is built; L'Atelier's next template is *le
  compteur*.
- **`moteur.md`:** « What this implies elsewhere » says this file « already words both cases »;
  it now words A′ and B. « What to publish » puts the réservoir and `H` at 17:45, before the
  17:50 claim; the order runs at 17:52 (`plein.mjs` refuses unclaimed fees), and this file posts
  them at 18:00. §5 announces a founder's « wallet, side and amount » on the channel; this file
  adds a plan traded in slices under the hour cap, a silent message, and never X.

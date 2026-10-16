# Design source

The visual design of the station, made in Claude Design as the canvas **"$PLEIN launch kit"**
(16 October 2026). The live canvas is a private claude.ai artifact:
<https://claude.ai/artifact/PVtLUSBLhbDsgPPY1jQS7F>

`public/index.html` was generated once from `canvas/Main.dc.html` and is now the source of truth
for the site. These files are the reference for the look: when the design changes, port the change
to `public/` by hand (and keep the `data-*` hooks the site's script relies on).

## Boards

| File | Size | What it is |
|---|---|---|
| `canvas/Main.dc.html` | 1440 × 10 100 | The site, desktop: totem hero, péage, tableau de bord, samedi, Mon Plein, Atelier, lignes, aire de repos |
| `canvas/Site-phone.dc.html` | 390 × 15 300 | The same page at phone width (imports `Main`) |
| `canvas/Preouverture.dc.html` | 390 × 844 | Live state before launch: countdown, contract "published here at 18:00" |
| `canvas/Plein-en-cours.dc.html` | 1440 × 900 | Live state on Saturday 18:00–19:05, with example figures |
| `canvas/X-banner.dc.html` | 1500 × 500 | Station X banner |
| `canvas/Logo.dc.html` | 400 × 400 | Profile picture (mini totem) |
| `canvas/Launch-post.dc.html` | 1200 × 675 | Launch post, Saturday 18:00 |
| `canvas/Receipt.dc.html` | 1080 × 1350 | Weekly ticket template, `[placeholders]` to fill |
| `canvas/Totem-du-jour.dc.html` | 1080 × 1350 | Daily 08:00 totem post, shown with the example values of 16 October |
| `canvas/canvas.json` | | Board positions and titles |

`previews/` holds renders of the site boards and the two live states. The social kit exports are in
[`../brand/`](../brand/).

## Format

`.dc.html` files run only inside Claude Design's runtime (not included here): `{{holes}}`,
`<sc-for>`, `<sc-if>`, `onClick="{{fn}}"` handlers and a `DCLogic` class per board. The figures in
these files are the ones of 16 October 2026 (official diesel survey of 2 October, €2.356/L → 47.1 %);
the site reads current figures from `public/config.js` and `public/live.json`.

## Tokens

| Token | Hex | Use |
|---|---|---|
| nuit | `#07090C` | page background |
| asphalte | `#0F1216` | panels |
| béton | `#171B21` | buttons, chips |
| trait | `#262C35` | hairlines (`#3A414C` for stronger borders) |
| auvent | `#F1F4F6` | text, canopy light |
| brume | `#A7AFB9` | secondary text |
| gris | `#8A939E` | tertiary text, labels |
| LED rouge | `#FF3D2E` | what you pay (diesel price) |
| LED vert | `#3CF08A` | the buyback |
| sodium | `#FFA733` | actions, buttons, links |
| bleu autoroute | `#1D4FA3` | exit signs (section markers) |
| ticket / encre | `#F2EFE6` / `#17181B` | thermal ticket |
| LED window / borne cap | `#030405` / `#D7261E` | LED panel background, kilometre-post red |

Type: Barlow Condensed 600–800 (headlines, signage), Barlow 400–700 (text), Doto 700/900 (LED
digits), IBM Plex Mono 400–600 (labels, tickets, addresses), Instrument Serif italic (the one human
line). Motifs: the totem, the canopy light, exit signs, kilometre posts, toll lanes, the thermal
ticket, the dashboard, road paint.

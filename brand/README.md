# Brand kit exports

Rendered from the boards in [`../design/canvas/`](../design/canvas/) at 1× and 2×. To change one,
edit the board in Claude Design (or the `.dc.html` file) and export again.

| File | Size (1×) | Use |
|---|---|---|
| `logo.png`, `logo@2x.png` | 400 × 400 | Profile picture for the station's X and Telegram accounts |
| `x-banner.png`, `x-banner@2x.png` | 1500 × 500 | X header of the station account |
| `launch-post.png`, `launch-post@2x.png` | 1200 × 675 | The 18:00 launch post. Replace `@[compte]` with the real handle first |
| `ticket-template.png`, `ticket-template@2x.png` | 1080 × 1350 | Weekly ticket layout with `[placeholders]`; the real ticket is filled from on-chain transactions |
| `totem-du-jour.png`, `totem-du-jour@2x.png` | 1080 × 1350 | Daily 08:00 post, shown with the example values of Friday 16 October; re-render with the day's figures |

The social sharing card is `public/og.png` (1200 × 630). Its source is `source/og.html`: it loads
`/css/fonts.css`, so open it through the site (for example copy it to `public/_og.html`, run
`npm run dev`, screenshot `http://localhost:3000/_og.html` at 1200 × 630, then delete the copy).
It carries no weekly figure on purpose, because platforms cache it for weeks.

Rules for anything made from this kit: no political symbol, party, union or movement; no fuel brand;
no real person's face; no promise of gains; nothing tied to buying $PLEIN.

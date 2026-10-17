# Mise en route: from zero to everything working

17 October 2026. The shortest path, in order, for two founders who are not engineers. Every step
gives the exact link or command, how long it takes, and how you know it worked. Steps marked
**phone** can be done from a phone browser or app; **laptop** steps need a terminal once.

Where to go next: how you drive the station day to day is [`salle-de-controle.md`](salle-de-controle.md);
the launch minute by minute is [`lancement.md`](lancement.md); what runs when is
[`infrastructure.md`](infrastructure.md). Facts here were read from the vendors' docs on 17 October
2026; "Tier 2" marks what nobody has tried on this project yet.

> **Two rules for every step.** Never paste a token, a key or a seed phrase into a chat with an agent,
> an issue, a PR or Telegram: secrets go only into GitHub's secret form (and Vercel's environment
> form), which is a password field. And nothing here ever asks for a wallet key: the agents never hold
> one, and neither does the repo.

## The order, at a glance

| Step | What | Where | Time | Before 15:30 today? |
| --- | --- | --- | --- | --- |
| a | Let the agents push the workflow files (GitHub scope `workflow`) | laptop | 2 min | yes |
| b | Put the site online on Vercel, check that everybody can open it, give the address to an agent | phone | 10 min | yes |
| c | Invite the co-founder: GitHub, then the console | phone | 5 min | yes |
| d | Telegram: bot, channel, ops group, two GitHub secrets | phone and laptop | 20 min | yes |
| e | `@claude` from the GitHub app: token and the Claude app on the repo | laptop, then phone | 8 min | helpful |
| f | Optional, free: a Helius key for reliable chain reads | phone | 5 min | helpful (the 16:30 top-10 reading) |
| g | Each laptop: Node, Git, `gh`, Claude Code, the repo, the station server, the always-on session | laptop | 20 min each | yes |
| h | The phone kit: Claude app, PLEIN Control, GitHub app, Telegram | phone | 10 min | yes |
| i | The founder-only steps of launch day | wallet device | see `lancement.md` | yes |
| j | Optional: command the agents from the Telegram ops group (le standard) | phone | 30 min | no, after the branch rule is on |
| k | Optional, your decision: more autonomy for the agents | none | none | no |

If you will move the repo into a GitHub organization (the two-key rule's step 0 in
[`salle-de-controle.md`](salle-de-controle.md)), do it **before b and e**: a transfer breaks the Vercel
link and the Claude app's install, and you would repeat them. It takes about 15 minutes at
https://github.com/account/organizations/new (free plan, both founders as Owners).

## a. Let the agents push the workflow files

**Why.** The eight workflows other than `ci` (`audit`, `claude`, `plein`, `prix-officiel`, `releve`,
`standard`, `totem`, `vigie`) exist only on a laptop. GitHub refuses a push that adds a workflow file
unless the login has the `workflow` scope. Until it does, none of the buttons, the 16:30 audit, the
15-minute `vigie` of launch day, `@claude` or the Telegram commands exist on GitHub.

**Do (laptop, 2 min).**

```bash
gh auth refresh -h github.com -s workflow
```

It prints a one-time code and a link (https://github.com/login/device): open it on your phone, type
the code, press Authorize.

**It worked when** `gh auth status` lists `workflow` among the token scopes.

**Then tell the agent:** « Push the workflows: open the PR from a branch. » The agent pushes the branch
(Claude Code asks you to approve the push), opens the PR (it asks again), and the other founder
approves it in the GitHub app. After the merge, Actions lists nine workflows (`ci` and the eight above).

**Right after the merge, keep two of them quiet today** (`lancement.md`, the 10:35 row): `totem`
posts to the public Telegram channel by itself every morning once the channel secret exists, and
`plein` must not run on 17 October. Tell an agent « disable totem, and plein if it does not skip
today by itself »; it prepares `gh workflow disable totem`, which asks you for a tap.

Fallback if the scope cannot be granted: on github.com, **Add file**, **Create new file**, type
`.github/workflows/<name>.yml`, paste the file's text, commit to a branch. The web editor does not
need the scope. Eight files, about fifteen minutes.

## b. Put the site online on Vercel

**Do (phone or laptop, 10 min).** Open
https://vercel.com/new/import?s=https://github.com/rpk0407/PLEIN and sign in with GitHub. Then:

1. Framework Preset: **Other**.
2. Build Command: leave empty. Install Command: leave empty (the repo has no dependencies).
3. Output Directory: **public**. Root Directory: the repository root. Production Branch: **main**.
4. Environment Variables: none yet (step f adds `SOLANA_RPC_URL`, Production only).
5. Deploy.

`vercel.json` already says the same (no framework, output `public`), so the form is a double check.

**It worked when** the project page shows a production address like `https://plein-xxxx.vercel.app`
and opening it shows the station with a countdown to 15:30 and an empty contract. Check three
addresses by tapping them: `<address>/api/diesel`, `<address>/api/stations?cp=75011` and
`<address>/api/chain` answer with data (the last may show nulls before the opening: that is correct).

**And everybody can enter it.** You are signed in to Vercel, so your own check proves nothing about
visitors. Open the production address (Settings, **Domains**) in a private tab, or on a phone that
is not signed in to Vercel and ideally on mobile data, and see the station. If a Vercel login
appears instead, the project is behind Vercel's login: Settings, **Deployment Protection**, and make
the production domain public (Tier 2: Vercel's standard protection normally leaves the production
domain open and puts the per-deployment and branch addresses behind the login). Share only the
production domain, never an address with a hash or a branch name in it.

**Then tell the agent:** « The site is https://plein-xxxx.vercel.app » (the real address). The agent
opens a PR that sets `siteUrl` in `public/config.js`, `og:url` and an absolute `og:image` in
`public/index.html`, and refreshes the console's station card. Do not share the address publicly
until it counts down to 15:30.

Vercel's free Hobby plan says non-commercial use (Tier 2: read its fair-use page).
[`infrastructure.md`](infrastructure.md) section 6 names the decision and the upgrade path.

## c. Invite the co-founder

**GitHub (phone, 3 min).** https://github.com/rpk0407/PLEIN/settings/access, **Add people**, their
username, role **Write** (or Owner of an organization). They accept from the e-mail or the GitHub app.
**It worked when** they can open a PR from the app and press Approve.

**Then tell the agent their handle**, e.g. « The second founder is @their-handle. » Three things use it:
the second line of `.github/CODEOWNERS` (replace the commented line, keep one active line), the
`include_comments_by_actor` list in `.github/workflows/claude.yml` (replace `SECOND_FOUNDER_HANDLE`),
and the branch rule's code-owner review in [`salle-de-controle.md`](salle-de-controle.md) (turn it on
only after both handles are in the file). These are files that change what agents may do, so the PR
waits for a founder's explicit yes.

**The console (phone, 2 min).** Open https://claude.ai/artifact/NuDByudcLStVmnLCFg4tKW, press **Share**,
invite the co-founder **by e-mail**, role **Editor**. Never "anyone with the link", and never anyone
else: whoever can write in it can queue orders for the agents. (The `console` skill also checks that
each order was written by one of the two founders' ids, but the invitation is the first lock.)
**It worked when** the co-founder opens the link on their phone, the top bar shows two avatars
(« vous êtes deux »), and a note they type in « Note rapide » appears on your screen.

**Then the two ids (laptop, 2 min, after step g).** Once both of you have opened the console and typed
one note, type `/console ids` in the always-on session. It lists the people it found, with their
display names; say which two are you. It prints the two lines to put in the table at the top of
`.claude/skills/console/SKILL.md`: an agent opens a PR with them and the other founder merges it.
Until that PR is merged the session asks again each time it starts.

## d. Telegram: bot, channel, ops group

About 20 minutes. Do it with the co-founder next to you or on a call. Steps 1 to 3 and 5 are on the
Telegram and GitHub phone apps; step 4 wants a laptop.

1. **The bot.** Open https://t.me/BotFather, send `/newbot`, choose a name and a username ending in
   `bot`. It replies with a token. Keep that message open; it is `TELEGRAM_BOT_TOKEN`. Paste it nowhere
   but GitHub's secret form (below) and, in step 4, a terminal prompt.
2. **The public channel.** New Channel, type **Public**, pick the link (this is the station's address).
   Add the bot as **Administrator** with the right to post messages. `TELEGRAM_CHANNEL_ID` is
   `@channelusername` for a public channel. **Do not put it in GitHub yet** (step 6).
3. **The ops group.** New Group with the co-founder, then add the bot. Keep it private. This is the
   founders' ops chat.
4. **The ops group's number (laptop, in a terminal where no Claude session runs).** A bot does not
   see ordinary messages in a group, so first send `/start@<your bot's username>` in the group.
   Then, in Git Bash:

   ```bash
   read -rs TELEGRAM_BOT_TOKEN && curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"; unset TELEGRAM_BOT_TOKEN
   ```

   or in PowerShell:

   ```powershell
   $t = Read-Host "Bot token"; curl.exe -s "https://api.telegram.org/bot$t/getUpdates"; Remove-Variable t
   ```

   Find `"chat":{"id":-100…` or another negative number in the answer. That is `TELEGRAM_OPS_CHAT_ID`.
   An empty result means send the command again: Telegram keeps updates 24 hours. The token never goes
   into an address bar this way: a phone browser sends what you type to its search suggestions and
   syncs its history, so avoid it. If the laptop is out of reach and the phone is all you have, use a
   private tab with search suggestions turned off, then close it and clear it from the history.
   (`getUpdates` stops working once a webhook is set; read the ids first if you do step j.)
5. **The two GitHub secrets** (phone browser, desktop site if the form is cramped):
   https://github.com/rpk0407/PLEIN/settings/secrets/actions, **New repository secret**, one each:
   `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPS_CHAT_ID`. These two only reach the private ops group.
6. **Later, never before the gate: `TELEGRAM_CHANNEL_ID`.** It is the third Telegram secret and the
   only one that lets a workflow post in public: `totem` posts by itself every morning (06:17 and
   07:17 UTC) once the secret exists and the workflow is on `main`. Add it only after
   `ligne-continue` has passed the totem's caption on the exact text, or after you pressed **Disable
   workflow** on `totem` in the Actions tab (`gh workflow disable totem`). The posts of launch day are
   made by hand by the founder who runs the station account (`lancement.md`), so nothing today needs
   this secret.

**It worked when** you open GitHub, **Actions**, **releve**, **Run workflow** (this needs step a to be
merged), and a reading arrives in the ops group about a minute later. Before step a is merged, test
from a laptop with the two ops variables in your own shell: `node scripts/telegram.mjs --ops --text "test"`
(without them it prints instead of sending).

## e. `@claude` from the GitHub phone app

**Do (laptop for one command, 8 min).**

1. Install the Claude app on the repo: https://github.com/apps/claude, **Install**, choose only the
   `PLEIN` repository.
2. In a terminal: `claude setup-token`. Sign in, copy the token it prints (it uses your Claude
   subscription, not API billing).
3. Paste it as a GitHub secret named `CLAUDE_CODE_OAUTH_TOKEN` at the same secrets page as step d.

**Do not use `/install-github-app`** as a shortcut. Besides these three steps it offers to open a
pull request adding the stock Claude workflow files, and the stock `claude.yml` would replace the
hardened one in this repo (no fork refusal, no limit on whose comments the model reads, no deny list,
no `persist-credentials: false`). If you ever run it, decline every workflow file it offers:
`claude.yml` is already in the repo.

**It worked when** you open any issue in the GitHub app, write `@claude say hello and list the agents
you can see`, and within a few minutes it answers in the thread. `claude.yml` must be merged to `main`
first (step a). Test it from both founders' accounts.

**What `@claude` is for.** Code and copy on a branch, in a thread everybody can read. It cannot merge,
approve, push to `main`, post, or reach your wallets, and every reply is public: no legal reasoning,
no attack analysis, nothing about keys or funds. Those go through the laptop session (step g).

## f. Optional, free: a Helius key

The public Solana node rate-limits, and the 16:30 audit reads many accounts.

1. https://dashboard.helius.dev, sign up (free tier), copy the API key.
2. The URL is `https://mainnet.helius-rpc.com/?api-key=<your key>`.
3. Save the whole URL as the GitHub secret `SOLANA_RPC_URL` (same page as step d).
4. Save it also in Vercel: project, **Settings**, **Environment Variables**, name `SOLANA_RPC_URL`,
   tick **Production only** (a preview could run a branch's code that prints it), then
   **Deployments**, the latest, **Redeploy**.

**It worked when** the `releve` button's report has no `rpc` or `holders` entry in its errors.
Anyone with the URL can spend your quota: never in chat, an issue or a file.

## g. Each laptop, once (20 minutes)

1. **Node.js 20 or later** from https://nodejs.org (the installer adds it to the PATH), then close
   and reopen the terminal. `node --version` prints 20 or higher. The repo has no dependencies.
2. **Git** (https://git-scm.com), then **GitHub CLI**: https://cli.github.com, then `gh auth login`
   (choose GitHub.com, HTTPS, log in with the browser), then step a's scope command on the laptop that
   pushes workflow files.
3. **Claude Code**: install it from https://code.claude.com/docs/en/setup and sign in with `claude`,
   then `/login` and the same Claude account as your subscription.
4. The repo:

   ```bash
   git clone https://github.com/rpk0407/PLEIN.git
   cd PLEIN
   npm test
   claude
   ```

   `npm test` ends with « fail 0 ». Claude Code asks you to trust the folder and to approve the
   project's `station` server from `.mcp.json`: answer yes to both.
5. Check, inside Claude Code: `/agents` lists fifteen agents; `/mcp` shows `station` connected with
   eighteen tools; ask « C'est quand, le prochain plein ? » and approve the first tool call.
6. Keep your wallets and any seed phrase **off this machine**: no keypair file, no wallet browser
   profile. Sign with a hardware wallet. That, not a setting, is what keeps a key away from an agent.

**The always-on session (the front door).** On the laptop that stays open at home:

```bash
claude --agent chef-de-station
```

Then type `/remote-control` (or `/rc`): Claude Code prints a link and a QR code, and the session shows
up in the Claude app under **Code**, with a green dot while the laptop is awake and online. Type
`/loop 3m /console` to have it look for new orders from PLEIN Control every three minutes. Set
`/config` → **Push when actions required** so a permission question reaches your phone. Needs a Pro,
Max, Team or Enterprise login (API keys are not supported for Remote Control). On Windows, keep the
laptop plugged in and set it not to sleep.

Four things to know about that session:

- **Check the loop took.** Ask « what scheduled tasks do I have? »: it must list the `/console` loop
  with a next run time. A loop lives in that session only and expires after seven days: type
  `/loop 3m /console` again each Saturday, and after any restart of Claude Code. If it says it cannot
  schedule (Tier 2: `--agent` limits the session to the tools on `chef-de-station`'s line, and the
  scheduling tools are on it), start a plain `claude` instead, then `/remote-control` and
  `/loop 3m /console`: the same skills work there, and `chef-de-station` runs as a subagent.
- **Warm it up once, by hand, so that the loop never stops on a question.** Type `/console status`.
  Claude Code will ask about `git fetch origin`, about `ArtifactData` on the console's address, about
  `WebFetch` on the site's domain and about the station tools. Answer « Yes, and don't ask again »
  to each. The answers go to your own `.claude/settings.local.json`, not to the committed settings.
  An unanswered question holds up the next pass and every order behind it. The push to your phone is
  the safety net, not the plan.
- **Orders from other people do not run.** The `console` skill runs an order only if one of the two
  founders' ids wrote it (step c, the two ids), and it reads everything else in the console as data.
- **Merging and posting stay yours.** The session prepares a pull request and hands you the link; you
  tap **Merge** in the GitHub app once the other founder has approved. It drafts a post and hands
  you the text. See step k for how that could change, by your decision only.

## h. The phone kit (10 minutes)

| Install or open | What it is for | Check |
| --- | --- | --- |
| **Claude app**, tab **Code** | Your laptop session, where agents ask « OK to push? ». Tap to approve or refuse. | the session `chef-de-station` has a green dot |
| **PLEIN Control**, https://claude.ai/artifact/NuDByudcLStVmnLCFg4tKW | Type an order, pick an agent, press **Faire**; see the countdown, the lights, the decisions to take, the checklist. Add it to your home screen. | an order you type shows « Transmise à ta session Claude Code » |
| **GitHub app** | **Actions**, a workflow, **Run workflow**: the buttons. **Pull requests**: approve and merge. **Issues**: `@claude`. Turn notifications on for the repo. | you can see the Actions tab (Tier 2: if the Run workflow button is missing in the app, use github.com in the phone browser, desktop site) |
| **Telegram**, the ops group | Where the agents' reports and alerts arrive, and, after step j, where you type commands. Do not mute it on launch day. | the `releve` button's report arrived |

**Optional, a second door: Telegram straight to the session (research preview, Tier 2).** Claude Code
can receive Telegram messages in a running session. It needs Bun (https://bun.sh), a **second** bot
from @BotFather (not the station bot, whose token stays in GitHub), and the plugin:

```text
/plugin install telegram@claude-plugins-official
/telegram:configure <the second bot's token>
```

Restart with `claude --channels plugin:telegram@claude-plugins-official`, send the bot a message, pair
with `/telegram:access pair <code>`, then `/telegram:access policy allowlist` so only your account can
write. On a Team or Enterprise plan an Owner has to enable channels first. Anyone on the allowlist can
steer the session, so list only the two founders. Step j is the other way in, through GitHub, and does
not need your laptop to be awake.

## i. The founder-only steps of launch day

Nothing in this section can be done by an agent: it is the keys. The full minute-by-minute sheet is
[`lancement.md`](lancement.md); this is the part that is yours, in the same order and under the same
rules. **Rule 1 of that sheet holds today: nobody passes a mint by chat.** That includes PLEIN
Control, the Claude app and Telegram. B types the mint from Solscan into the check on B's laptop, A
opens the pull request by hand, and the contract reaches the site only through B's three checks.

| When | Who and what | Done when |
| --- | --- | --- |
| Morning (07:30) | **A: the creator wallet** on a hardware device, separate from every personal wallet and from the multisig. One funding deposit only, as `lancement.md` says. Then decide **D3** together (row D3 of `lancement.md`, "Decisions due today"): (a) publish the creator's address in `public/live.json` as `wallets.creator` by an earlier PR, or (b, the recommendation there) both of you record it privately at 13:30 and it goes in PR3, so that bots cannot wait for its creation. | D3 written down with both names |
| Before 15:30 (11:00) | **A: a throwaway test coin** from a separate wallet, never the creator wallet: USDC coin, an unrelated name, 2 USDC bought and sold by B from a second wallet, then a fee claim from the throwaway. This shows whether pump.fun offers USDC, which switches exist, and that a claim works. | a claim visible on Solscan |
| 15:15 | **B** reads every setting on A's screen against `lancement.md` « The creation settings ». Nothing submitted yet. | both say it matches |
| 15:30 | **A creates the coin** on pump.fun from the creator wallet, buy field at 0. | the coin page exists |
| 15:30 | **B** reads the mint on Solscan (the creator account's newest transaction) and on pump.fun from the creator's profile, never from its search, and says it aloud. | A's and B's readings match |
| 15:31 | **B, on B's laptop,** types the mint from Solscan into `npm run audit -- --mint <mint> --markdown`, or asks the session to call `pump_verify_launch` with it. One line per setting. Under D3-a every line must be `pass`. Under D3-b the `creator` line is `unread` by design (there is no published creator to compare with yet): B reads the curve's creator on Solscan against the private record, by hand, and every other line must be `pass`. | no `fail`; every other line `pass`; the creator checked by hand under D3-b |
| 15:32 | An agent asks Jupiter for a 1 USDC quote into the mint. No route: the pump stays closed (D10). | route or none, noted |
| 15:33 | **A, by hand:** branch `ouverture`, the `contract` line of `public/live.json` (and `wallets.creator` under D3-b), commit, push, open PR3. | CI starts |
| 15:34 to 15:36 | **B's three checks.** (1) The PR's Files tab against Solscan and pump.fun, character by character (and under D3-b the creator line against the private record). (2) `gh pr checkout <PR3>`, then `npm run audit -- --markdown` with no `--mint`, and `pump_verify_launch` with the mint typed again: every row passes, "Créateur" included (under D3-b this is the first run that can pass). (3) `controleur-technique` gives GO on the diff and CI `test` is green. | all three hold |
| 15:38 | **B approves and merges PR3** in the GitHub app. | the contract shows on the site without a reload |
| 15:42 | **B** posts the contract, copied from the deployed site with its copy button. | pinned |

If any line fails, stop: `lancement.md` « If it goes wrong » says what to do, and the mint is not
published. No agent signs, creates or buys anything, and none will. If you would rather have the
console prepare PR3, both of you must first reword rules 1 and 5 and the 15:33 row of `lancement.md`
and CLAUDE.md non-negotiable 2 in one pull request ([`salle-de-controle.md`](salle-de-controle.md),
"Publishing the contract"). Until then there is one procedure, and it is this one.

## j. Optional: command the agents from the Telegram ops group (le standard)

You type `/etat` or `/faire …` in the private ops group; an agent works on a branch in GitHub and the
answer comes back to the group. The whole setup, with the commands and the troubleshooting, is
[`telegram.md`](telegram.md); this is what you need to know first.

- **Not before the branch rule is on.** The new secret below can write to the repository; branch
  protection with code-owner review is what stops it from touching `main`.
- **It needs** `api/standard.js` deployed by Vercel from `main`, `standard.yml` on `main` (step a),
  the bot and the ops group (step d), and `@claude` working (step e).
- **The new secret, `GITHUB_DISPATCH_TOKEN`.** On github.com, Settings, Developer settings, Personal
  access tokens, **Fine-grained tokens**: only the `PLEIN` repository, the one permission
  **Contents: Read and write**, expiry 90 days (put the date in both calendars). It goes into
  **Vercel only**, Production, ticked Sensitive, with `TELEGRAM_WEBHOOK_SECRET`, `GITHUB_REPO`,
  `FOUNDER_TELEGRAM_IDS` and `TELEGRAM_OPS_CHAT_ID` (the table is in `telegram.md`, step 8). Never in
  GitHub's secrets, never in a chat. Then redeploy, then point Telegram at the function (step 9).
- **It worked when** you send `/etat` in the group and « Reçu, je transmets à chef-de-station. » comes
  back within seconds, a run named `standard` appears under Actions, and the status arrives a few
  minutes later.
- Only the Telegram user ids listed in `FOUNDER_TELEGRAM_IDS` are obeyed. To stop it at once:
  disable the `standard` workflow, or delete `GITHUB_DISPATCH_TOKEN` in Vercel.

## k. Optional, your decision: more autonomy for the agents

Today the agents ask a founder before they push, open a pull request, comment on GitHub or run a
workflow button, and merging and posting are yours. Each ask is a tap on your phone (step g's
session). If the taps get in the way, [`salle-de-controle.md`](salle-de-controle.md) section
« Proposed delegation » lists exactly what could be allowed instead and what would stay a tap. It is
off. It turns on only when both of you say yes in the same conversation; then an agent edits
`.claude/settings.json` in a PR that you merge.

## When something does not work

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `gh` says it cannot push a workflow file | step a not done | `gh auth refresh -h github.com -s workflow` |
| Actions shows only `ci` | the workflows are not merged to `main` yet | step a, then merge the PR |
| Visitors see a Vercel login | Deployment Protection covers the address you shared | step b: open the production domain in a private tab; Settings, Deployment Protection |
| `@claude` does not answer | no `CLAUDE_CODE_OAUTH_TOKEN`, no Claude app on the repo, or `claude.yml` not merged | step e; the Actions tab shows the failed `claude` run |
| `@claude` ignores the second founder | their handle is not in `include_comments_by_actor` | step c |
| The `releve` report never reaches Telegram | one of the two secrets is wrong, or the bot is not in the group | recheck step d, send `/start@bot` in the group again |
| `/mcp` has no `station` | Node is not on the PATH, or the server was not approved | install Node (step g), `claude mcp list`, answer yes to the prompt |
| An order in PLEIN Control stays « Envoyée » | no session is open, or `/console` is not running | open the session, `/console`, or `/loop 3m /console` |
| The loop stopped by itself | a loop expires after seven days, or Claude Code was restarted | type `/loop 3m /console` again |
| An order says « En cours » for a long time | the agent is waiting for a tap, or the session was lost; a scan never takes it again | open the Claude app, Code, the session, approve or refuse; or press « Renvoyer à Claude » on the order |
| An order comes back « Bloqué : l'auteur n'est pas l'un des deux fondateurs » | the two ids are not in the console skill yet, or someone else wrote it | step c, the two ids |
| The loop asks a question every few minutes | a question was never answered « don't ask again » | step g, the warm-up |
| The site shows « pas en ligne » in the console | the station card is stale | order: « rafraîchis la fiche de la station » (`/console status`) |
| The co-founder sees the console but cannot write | Viewer role | Share, set Editor |
| `/etat` in the Telegram group gets no answer | the bridge is not set up or a value is wrong | `telegram.md`, « If it does not work » |

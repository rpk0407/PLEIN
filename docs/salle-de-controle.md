# La salle de contrôle

17 October 2026. How two founders run the whole coin through Claude Code agents, GitHub Actions
buttons and `@claude`, without any agent ever holding a key.

## The deal

- **Agents read, compute, simulate, draft and propose.** Fifteen of them, in `.claude/agents`.
  Eight run on Sonnet (they build and operate), seven on Opus (the six critics, and the
  fact-checker, whose "CONFIRMED" the others build on).
- **Only the two founders sign, claim, merge and post.** The weekly buyback is signed by hand in the
  multisig. The coin is created by hand on pump.fun. Posts go out from the station account by hand;
  the one exception is the scheduled morning totem workflow, which the founders can disable.
- **Two keys on every change.** Whatever one founder (or one agent working for them) changes on
  `main` is approved by the other founder first. See [the two-key rule](#the-two-key-rule). It holds
  only once you have set it up, and only as far as three single keys allow (GitHub's owner,
  Vercel, the creator wallet): [Honest limits](#honest-limits) names them.
- **The repo is public, and so is every issue, PR and `@claude` reply.** Legal reasoning, attack
  analysis, strategy and anything about keys or funds stay in your conversation and your private
  document, not in the repo.
- **Nothing in the repo signs, sends or holds a key.** `test/no-signing.test.mjs` fails the build
  otherwise. `controleur-technique` guards it.

## Once per laptop

1. Install Node 20 or later (the repo has no dependencies), Git, the GitHub CLI (`gh auth login`),
   and Claude Code. On Windows the shared settings cover both Bash and PowerShell.
2. `git clone https://github.com/rpk0407/PLEIN.git`, then `cd PLEIN`, then `claude`.
3. Claude Code asks you to trust the project and its `.claude/settings.json`. Read it once. It lets
   the agents run without asking `npm test`, `node --test test/no-signing.test.mjs`, a named list of
   `npm run` scripts (`releve`, `audit`, `vigie`, `prix`, `plein`, `ticket`, `verify:ticket`,
   `check:feed`) and read-only git and `gh`. Anything else asks first, `node -e` included, and the
   npm scripts that post, merge, push or set a secret ask even if you allow them locally. It
   forbids reading `.env` and key files, running `solana` or `spl-token`, a force push,
   `--node-options`, `--import` and `--require` on any command, and `gh pr review` (an agent must
   not approve a pull request in your name: approve in the GitHub app, or type `! gh pr review ...`
   yourself). It switches off `--dangerously-skip-permissions` (`disableBypassPermissionsMode`);
   without that, every "ask" above would be skipped. **Do not call this list read-only.** `npm test`
   runs every file in `test/`, and the `npm run` scripts run files in `scripts/`; code an agent has
   written there runs as you, with your `gh` login, and could approve or merge a pull request in
   your name. The rules stop the usual spelling of a command, not a determined one: read what an
   agent has written before you let it run it.
   Local overrides go in `.claude/settings.local.json`, which is yours: Claude Code keeps it out of
   git on your machine the first time it writes the file. If you create it by hand, add it to
   `.gitignore` yourself.
4. Type `/agents` to see the team, `/` to see the skills. Check `npm test` passes.
5. Keep your own wallets, your personal social accounts and your browser profile for the coin
   separate from the station account's. The station account talks; personal accounts don't.
6. **No Solana keypair file, seed phrase or wallet browser profile on any machine that runs
   agents.** Sign with a hardware wallet. That, not the deny rules, is what keeps a key out of an
   agent's reach. Turn on a passkey or hardware key for your GitHub and Vercel accounts.

## The team

Call any of them by name in a sentence ("ask ligne-continue to check this"), by `@agent-<name>`,
or run a whole session as one with `claude --agent <name>`. Opus agents are slower and cost more of
your subscription: use them for decisions, not for typing.

| Agent | Model | Use it when |
| --- | --- | --- |
| `chef-de-station` | Opus | You start a session, tasks compete, or you need a go/no-go. Owns `docs/objectifs.md` and the weekly cadence. |
| `controleur-technique` | Opus | Anything touches `api/`, a workflow, an address, the formula or a wallet. Security red team. |
| `ligne-continue` | Opus | Any public text or mechanism, before it goes out. French law and honesty gate. Not legal advice. |
| `economiste` | Opus | Supply, fees, the split, buyback execution and front-running, team income, kill criteria. |
| `critique-degen` | Opus | Copy, names, visuals, posts. Culture and taste, the FUD forecast, what is cringe. |
| `atelier-idees` | Opus | You want bold ideas for profit, culture or reach, with the illegal ones already killed. |
| `mecano-chaine` | Sonnet | Chain readers: `api/chain.js`, `releve`, `audit`, `verify-ticket`, and the purchase-order and gate scripts (`plein`, `official-price`, `_gate`, `vigie`), `mcp/`, their tests. `economiste` and `controleur-technique` gate the money ones. |
| `carrossier` | Sonnet | The site: pages, dashboard, Mon Plein, L'Atelier, the loyalty card. Not `formula.js` or `fees.js`. |
| `automaticien` | Sonnet | Workflows, Telegram, schedules, secrets wiring. |
| `imprimeur` | Sonnet | Tickets, totems, share cards, the social kit, `scripts/templates/`. |
| `tresorier` | Sonnet | The Saturday plein: order, checklist, slice tracking, ticket draft. Never signs. |
| `pompiste` | Sonnet | French copy and community voice: posts, replies, Telegram messages. Drafts only; keeps `docs/culture.md` through the critics. |
| `releveur` | Sonnet | Readings, lights, the Sunday report (`docs/releves/`) against the thesis metrics. |
| `vigie` | Sonnet | Clones, fake admins, phishing, and the first ten minutes of an incident (private until contained). |
| `enqueteur` | Opus | Fact-checks every Tier 2 claim against primary sources; hands back `docs/registre-tier2.md`. |

Who keeps which shared file: `chef-de-station` holds `docs/objectifs.md` (with the Board),
`docs/interfaces.md` and `docs/registre-tier2.md`; `economiste` holds `docs/moteur.md` and gates
`public/js/formula.js` and `public/js/fees.js` (the formula only with four weeks' public notice);
`releveur` writes `docs/releves/YYYY-MM-DD.md`. The ideas graveyard and the lawyer's questions are not
in the repo: they live in your private document.

Every agent reads `CLAUDE.md` and `docs/interfaces.md`. For their field they also read
`docs/thesis.md` (why: voice, psychology, the lines), `docs/culture.md` (how: lexicon, rituals, the
thirty-post calendar, what is banned) and `docs/moteur.md` (the money: fees, creation settings, the
Saturday attack surface, kill criteria). Where those disagree with `CLAUDE.md`, `config.js` or the
code on a fact, the latter win.

Hard vetoes: a NO-GO from `controleur-technique`, `ligne-continue` or `economiste` stands until both
founders override it in writing. Nobody else, and no agent, can lift it. A `ligne-continue` override
is recorded in your private document (date, text, both names); the public issue says only
"overridden by both founders".

## The procedures (skills)

Type the slash command in Claude Code. They name which agents run, in what order, and put the Opus
critics before anything ships.

| Command | What it does |
| --- | --- |
| `/station [focus]` | The dispatcher. Reads the goal tree, git, open PRs, issues and runs; asks `chef-de-station` what to do; runs agents in parallel where their files don't overlap. |
| `/lancement [phase]` | Launch day on pump.fun, Saturday 17 October 2026, 15:30 Paris: preflight, 14:30 go/no-go, who does what at the opening, the first hours. |
| `/plein [step]` | The Saturday routine: price (Tue to Thu), midweek claim, prepare (Fri, with the multisig and ticket rehearsals before Plein #1), go/no-go (17:30), claim and run (17:50 to 19:00), ticket (19:05), Sunday. Has a rehearsal mode. |
| `/releve [--audit]` | One reading of the chain and fuel prices, the lights, and the Sunday report. |
| `/critique <target> [--quick]` | The six Opus critics in parallel on a PR, diff, file, text or idea, with a merged verdict. |
| `/post <brief>` | `pompiste` drafts, `ligne-continue` gates, `critique-degen` checks taste, you get an X link and a Telegram button. |

## The buttons (GitHub Actions)

Each automation is a workflow with a **Run workflow** button. Some also run on a schedule (listed
below). Only one of them posts publicly by itself: the morning totem. Everything else reads, computes
and reports to the founders' private ops chat.

- **Browser or phone:** GitHub, the repo, **Actions**, pick the workflow in the left list, **Run
  workflow**, fill the inputs, confirm. In the GitHub phone app: the repo, **Actions**, the workflow,
  **Run workflow** (Tier 2: if the button is missing in your app version, open github.com in the
  phone browser and ask for the desktop site).
- **Terminal:** `gh workflow list`, then `gh workflow run <file> -f name=value`, then
  `gh run watch`. Claude Code asks before it runs `gh workflow run`.
- Results show in the run's **Summary** (a readable report) and, for the workflows that notify, in
  the founders' Telegram ops chat. Missing Telegram secrets mean a dry run that only prints.

The workflows in `.github/workflows` when this was written (the script each wraps is the contract
in `docs/interfaces.md`; `gh workflow list` shows the current set, and `automaticien` keeps this
table in step when it adds or renames one):

| Workflow | Button inputs | Also runs by itself | Result |
| --- | --- | --- | --- |
| `ci` | none | every push and PR; Monday 07:00 UTC (fuel feed check) | `npm test` and `npm run check:feed` |
| `claude` | none (comment `@claude`) | on `@claude` only | see [`@claude`](#claude-in-github) |
| `prix-officiel` | none | weekdays at 08:23 and 14:23 UTC, Saturday at 08:23 UTC | when the ministry's weekly price is newer than `config.js`, pushes a `prix/...` branch that edits `official` only and sends you a link to open the PR with one click; never merges, never opens it |
| `releve` | `mint` (empty = the contract in `live.json`) | no | one chain reading, in the run summary and the ops chat |
| `audit` | `mint` (empty = same) | once, 16:30 Paris on 17 October | launch self-audit and suggested lights, read only; a founder edits `live.json` |
| `vigie` | none | every 3 hours, and every 15 minutes through 17 October (09:00 to 20:59 UTC) | keeps one issue labelled `vigie` up to date with look-alike tokens; new ones go to the ops chat |
| `plein` | `reservoir` (empty = read on chain) | Saturday 15:52 and 16:52 UTC; the Paris clock decides which one runs (17:52 Paris, after the claim at 17:50). **Switched off on 17 October** (see below) and back on Friday 23 October | the purchase order, 12 slices and checklist, in the summary and the ops chat, plus the ticket draft as an artifact; the founders execute it by hand |
| `totem` | `post` (default on) | daily, 08:17 Paris (two cron lines for the clock change) | renders the card; posts it with its caption to the **public** Telegram channel and sends a draft to the ops chat |

Things to know before you press or rely on them:

- **`plein` must be off today.** Its schedule fires at 15:52 UTC every Saturday, 17 October
  included, and nothing in `plein.yml` or `scripts/_gate.mjs` knows `firstPleinAt` (tested on 17
  October: the gate says go). The run would fail, and its failure message to the ops chat tells you
  to re-run the order by hand with a réservoir figure, which invites a Plein #1 a week early. Run
  `gh workflow disable plein` today (Claude Code asks first) and `gh workflow enable plein` on
  Friday 23 October; `/plein friday` checks it. Better still, `automaticien` makes the workflow
  skip scheduled runs more than 36 hours before `firstPleinAt` (not done yet), and then this
  switch is only a belt on the braces.
- **`totem` is the one automatic public post.** It runs every morning without anyone pressing a
  button, and a manual run posts too unless you untick `post`. Gate its caption templates once with
  `ligne-continue`. To stop it: Actions, `totem`, the "..." menu, **Disable workflow** (or
  `gh workflow disable totem`).
- **A person opens the price PR, on purpose.** `prix-officiel` pushes the branch and puts a
  pre-filled "open the pull request" link in the run summary and the ops chat. A PR opened by a
  person starts `ci` by itself (one opened by a workflow with the built-in token would not, and the
  required `test` check would never report). Opening it by workflow would also need Settings,
  Actions, General, **Allow GitHub Actions to create and approve pull requests**. Leave that switch
  **off**: it also lets a workflow token approve a PR, which would count as the second key. It
  governs the workflow token only; it does not govern the Claude GitHub App, which is why the
  two-key rule below also needs code-owner review. `controleur-technique` checks that no workflow
  asks for it on every workflow change.
- **Scheduled runs are best effort.** GitHub can start them late or skip one under load, and cron
  is UTC (Paris moves from UTC+2 to UTC+1 on Sunday 25 October). The workflows handle the clock
  change with two cron lines and a Paris-hour gate. Never let a schedule be the only thing between
  you and a Saturday step: `plein` is a convenience, and `/plein go` does the same by hand.
- **Ad-hoc Telegram posts have no button yet.** For a one-off public message, a founder pastes the
  text into the channel by hand as its admin, or runs `node scripts/telegram.mjs --channel --text
  "..."` with the Telegram secrets in their own environment (Claude Code asks first).

## `@claude` in GitHub

Write `@claude` plus a request in an issue, an issue comment, a PR comment or a PR review. Claude
Code runs on a GitHub runner with this repo's `CLAUDE.md`, agents and skills, works on a branch,
and answers in the thread. From the phone, that is a comment in the GitHub app.

**Every `@claude` reply is a public comment on a public repo.** Ask it for code and copy only.
Legal screening (`ligne-continue`), attack analysis (`economiste`, a `controleur-technique` finding
about keys or funds) and strategy (`atelier-idees`) are run in a local Claude Code session, and you
paste a reviewed summary where it belongs. The job is told to answer "needs a local review" instead
of posting them, but read what it wrote before you leave it up.

- Good: "@claude fix the failing test in this PR", "@claude draft the Wednesday explainer with
  pompiste" (the gate by `ligne-continue` is yours to run locally before anything goes out),
  "@claude run controleur-technique on this PR's diff".
- Not through `@claude`: `/critique` on a PR (it would post six critics' reasoning in public), the
  lawyer's questions, the economist's attack surface, ideas, anything about a key, a wallet or funds.
- It cannot be triggered by strangers on this public repo: the action checks the author has write
  access, bots are blocked, and `include_comments_by_actor` keeps everyone else's comments out of what
  the model reads. The issue or PR body still reaches it: read an outsider's issue yourself before you
  tag `@claude` on it.
- **Fork pull requests are refused** by the workflow's first step, before any of their code is
  checked out. Read a fork's branch yourself and copy it into this repo if it is worth running.
- **It can run any code in its checkout, not only `scripts/`.** The action gives it Write and Edit,
  and `npm test` runs every file in `test/`; on a PR, only `.claude/` and `CLAUDE.md` come from the
  base branch, and `package.json`, `test/` and `scripts/` stay at the PR head (the action's security
  notes). The workflow lists `npm test`, a named list of read-only scripts and read-only `git` and
  `gh` as allowed, and it denies `solana`, `spl-token`, pushes, merges, reviews, `gh api` and
  `--node-options`, but that list is a tripwire for the usual spelling of a command, not a wall.
- The job has no Telegram or RPC secret, and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` strips the Claude,
  cloud and OIDC credentials from what it runs. It leaves GitHub tokens in place: the Claude GitHub
  App's token (contents, pull requests and issues write, among others) can be used by code the job
  runs. **What actually stops it from merging or approving is on GitHub, not in the workflow:**
  branch protection, and "Require review from Code Owners" with both founders in CODEOWNERS (a bot is
  not a code owner, so its approval never counts as the second key). Whether the App's approval would
  count toward plain "Required approvals: 1" is Tier 2 and not tried, so do not rely on it either
  way. The job is also *told* not to push to `main`, merge, review or post, and
  `.claude/settings.json` still forbids key files, `solana`, `spl-token` and force pushes.
- It pushes branches (as commits signed through GitHub's API) and gives you a link; a founder opens
  the PR and the other founder approves. It cannot push to `main` once the branch rule is on.
- It cannot change files under `.github/workflows` (the action's FAQ says the Claude GitHub App has
  no workflow permission; Tier 2, confirm on the first attempt). Workflow edits happen on a founder's
  laptop, through `automaticien` and a PR.
- The skills `/lancement`, `/plein` and `/post` are for a founder to type: they touch money and
  public words, so Claude cannot load them on its own. In a comment, ask for the agents by name
  ("`tresorier`: prepare the Friday check from `.claude/skills/plein/SKILL.md`") and it will read
  the procedure and follow it, with the reply public. The founders still do every signing, claiming,
  merging and posting.
- It runs on your subscription through `CLAUDE_CODE_OAUTH_TOKEN`, so a long Opus run eats your
  limits. Be specific; the workflow caps a run at 40 turns and 30 minutes. The main thread runs on
  Sonnet; agents with `model: opus` use Opus.

## The two-key rule

Every change to `main` is written by one founder (or an agent for them) and approved by the other.
GitHub enforces it only if you set it up, and **on 17 October it was not set up**: the branch API at
`https://api.github.com/repos/rpk0407/PLEIN/branches/main` read `"protected": false`, and
CODEOWNERS, `claude.yml`, `.claude/` and the new workflows were not even committed (a public read;
run it again with `curl -s` on that address and look for `protected`). Until the steps below are
done, one person can merge the most sensitive change of the day, the contract at 15:30. **Do steps
0 to 9 before any other merge today**, push this work first (through a branch if the rule is
already on), and keep `"protected": true` as a hard condition of the 14:30 go/no-go
(`/lancement preflight`).

0. **An organization, not a personal repo.** On a personal repo the owner can edit or switch off the
   rule alone, and the collaborator can neither see its settings nor notice. Create a free GitHub
   organization with both founders as **Owners** and transfer the repo to it before steps 1 to 9
   and before you install the Claude App, Vercel or any secret (a transfer breaks the Git
   integrations and the App install, which you then redo). Both founders can then read the rules
   and the organization's audit log (Tier 2: check what the free plan's log shows). If you cannot
   do this before 15:30, launch with the limit written in [Honest limits](#honest-limits) and do it
   before Friday 23 October. Either owner can still weaken the rule alone; the log lets the other
   see it afterwards, it does not prevent it. Every `rpk0407/PLEIN` URL in this repo then
   becomes the organization's (GitHub redirects the old ones).
1. Collaborators: the second founder has **Write** access, or is an organization owner. Only
   approvals from people with write access count.
2. **Require a pull request before merging**, **Required approvals: 1**, **Dismiss stale approvals
   when new commits are pushed**, and, if offered, **Require approval of the most recent
   reviewable push** (so a push after approval needs a fresh look).
3. **Require status checks to pass**: the `test` job of the `ci` workflow. Add `feed` only if you
   accept that an outside outage blocks a merge (it is `continue-on-error`, so leave it out).
4. **Require conversation resolution before merging.**
5. **Block force pushes** and **restrict deletions**.
6. **Do not allow bypassing the above settings** (include administrators), or your own admin right
   skips your own rule.
7. **Code owners, today.** `.github/CODEOWNERS` lists both handles (replace the placeholder in the
   file, and put the same second handle in `include_comments_by_actor` in
   `.github/workflows/claude.yml`), then switch on **Require review from Code Owners**. With both
   listed, each founder's PR can be approved by the other; with one listed, their own PRs would be
   stuck, which is why it is not on before the second handle is in. A bot is not a code owner, so
   this is also what makes the Claude App's approval never count as the second key.
8. Settings, Actions, General, **Workflow permissions**: leave **Allow GitHub Actions to create and
   approve pull requests** off (see the price PR above), and keep the default token read-only.
9. **Test it:** open a PR from a branch, try to merge it yourself, and confirm GitHub refuses
   (smoke test 5). The `"protected"` flag can read `false` under a ruleset; the refused merge is
   the proof.

Emergencies: an incident (`vigie`) may need a fix at speed. First roll the site back to the last
good deployment in Vercel, which needs no commit; then fix through a PR the other founder approves
from the phone. Don't switch the rule off to save minutes.

## Free setup of each secret

Secrets live in GitHub: Settings, **Secrets and variables**, **Actions**, **New repository
secret**. Never in the repo, never in chat, never in an issue. The names the workflows read:

| Secret | Needed for | Required |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | `@claude` and any workflow that runs Claude | for `@claude` |
| `TELEGRAM_BOT_TOKEN` | any message to Telegram | for notifications |
| `TELEGRAM_CHANNEL_ID` | the public channel | for public posts |
| `TELEGRAM_OPS_CHAT_ID` | the founders' private ops chat | for notifications |
| `SOLANA_RPC_URL` | reliable chain reads | optional (public RPC otherwise) |

**Claude** (`CLAUDE_CODE_OAUTH_TOKEN`). Needs a Claude Pro or Max subscription. Install the Claude
GitHub App on the repo, after the repo has moved to its organization (https://github.com/apps/claude;
repo admin; it asks for broader permissions than `@claude` uses, which GitHub does not let you
trim, and its token can write pull requests: see `@claude` above). In a terminal run `claude setup-token`,
log in, copy the token it prints, and save it as the secret. Or run `/install-github-app` inside
Claude Code. The token is tied to the subscription of whoever ran it, so one founder carries the
usage; the other can later create their own and swap it. Regenerate it if it leaks or on expiry
(Tier 2: the lifetime is long, check it when you create it).

**Telegram** (free).
1. In Telegram, message `@BotFather`, send `/newbot`, choose a name and a username ending in `bot`.
   It replies with a token: that is `TELEGRAM_BOT_TOKEN`. Don't paste it anywhere else.
2. Create the public channel (its link is the station's). Add the bot as an **administrator** with
   the right to post. `TELEGRAM_CHANNEL_ID` is `@channelusername` for a public channel, or the numeric
   id that starts with `-100`.
3. Create a private group with the two founders and the bot: the ops chat. Send any message in it.
4. To find the ops chat's numeric id: a bot in privacy mode (the default) does not see ordinary
   group messages, so send `/start@<your bot's username>` in the group, a command addressed to the
   bot always reaches it. Then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser
   and read `"chat":{"id":...}` (a negative number for groups). An empty result means send the
   command again: Telegram keeps updates for 24 hours at most. The token is in that URL, so do it
   once, on your own machine, and close the tab. Save the id as `TELEGRAM_OPS_CHAT_ID`. A public
   channel can use `@channelusername` as `TELEGRAM_CHANNEL_ID`.
5. Test: press the `releve` button (with the secrets set it sends its report to the ops chat;
   without them it only prints in the run summary), or run `node scripts/telegram.mjs --ops --text
   "test"` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPS_CHAT_ID` set in your own shell.

**Helius or another RPC** (optional, free tier). The public Solana RPC rate-limits and some readings
will come back as a dash. A free account on helius.dev gives an API key; the URL looks like
`https://mainnet.helius-rpc.com/?api-key=<key>`. Save the whole URL as `SOLANA_RPC_URL`. Free-tier
limits change (Tier 2). Anyone with the URL can use your quota, so it never goes in the repo.

## Public repo or private repo

| | Public (today) | Private |
| --- | --- | --- |
| Actions minutes | Standard runners are free | 2 000 free minutes a month on GitHub Free (Linux counts 1x); the Monday check, the Saturday workflows and some `@claude` runs fit |
| Branch protection | Available on a free account | Not on GitHub Free for private repos, only on a paid plan (Tier 2: check Settings, Branches) |
| `@claude` safety | Write-access check plus the `if` filter; outsiders can read your issues | Same checks; fewer eyes on the repo |
| Strategy | Visible to everyone: agent prompts, kill criteria, the economist's method, ideas filed as issues | Hidden |
| Credibility | A checkable repo is part of the pitch: formula, tests, the no-signing guard | Claims about the code can't be checked |
| Scheduled workflows | Switched off after 60 days without repo activity (GitHub docs, read 17 October 2026); `gh workflow enable <name>` brings one back | The docs page says the rule is for public repos and is silent on private ones; assume it can apply (Tier 2) |
| Fork risk | Anyone can copy the site and code | Contained |

Recommendation: stay public. The formula is a public promise anyway, the code is the proof, and the
free two-key rule needs it unless you pay for a plan. Keep what must stay private out of the repo:
the lawyer's questions in a private document, ideas in a private channel, and never a secret,
address list or key anywhere. `atelier-idees`, `economiste` and `ligne-continue` write their
findings into your conversation; before you paste one into a public issue, read it as a competitor
would, and never let `@claude` post them (its replies are public). Incidents that touch keys or funds
start in the ops chat and a private draft security advisory, not in an issue (`vigie`). The README's launch checklist lists "public or private" as an open decision: tick it when
you have chosen, and if you go private, re-read the branch protection row above first.

## A week in the control room (Paris time)

| When | Who | What |
| --- | --- | --- |
| Sunday | founders, `releveur`, `chef-de-station` | `/releve`, the report saved as `docs/releves/YYYY-MM-DD.md`, update `docs/objectifs.md` |
| Monday | CI | the feed check runs at 07:00 UTC; the ministry's price comes out early in the week |
| Tuesday to Thursday | `enqueteur`, founders | `/plein price`: confirm the survey, approve and merge the price PR |
| Wednesday | `pompiste`, `imprimeur`, critics | the week's post and explainer: `/post`, always through the gate |
| Any day | `tresorier`, founders | `/plein midweek`: if `creatorVault.unclaimed` is above $1,000, claim and move it to the réservoir back to back |
| Friday | `tresorier`, `economiste`, critics | `/plein friday`: dry checks, a rehearsal order, the execution plan, `plein` workflow enabled; before Plein #1 also the multisig rehearsal (a claim, a tiny swap, a tiny burn) and the ticket-against-the-guard rehearsal; the plein's own fees are not claimed yet |
| Saturday 17:30 | `chef-de-station` | `/plein go`: GO, GO-IF or NO-GO |
| Saturday 17:45 | all | the price is frozen |
| Saturday before 17:50 | founders, `tresorier` | claim the week's fees into the réservoir by hand; `tresorier` compares before and after |
| Saturday 17:52 | `plein` workflow, `tresorier` | the order and the ticket draft; run it by hand too |
| Saturday 18:00 to 18:55 | founders sign, `tresorier` checks | the buyback in 12 slices, one every five minutes |
| Saturday 19:00 | founders sign | the burn |
| Saturday 19:05 | `imprimeur`, `pompiste`, founders | the ticket on the site, X and Telegram |

## Smoke tests: do them before 15:30 today

None of this has run for real yet. Each takes a few minutes, and a failure today is cheap.

1. **The team loads.** In Claude Code on each laptop, `/agents` lists fifteen; `/` lists the
   skills. If an agent is missing, its frontmatter is broken: fix it before launch.
2. **The guard holds.** `npm test` is green, including `test/no-signing.test.mjs`. (It is also
   the test that will fail on the first real ticket until the reviewed amendment in
   `controleur-technique.md` is merged: test 6 below makes that visible before Saturday 24.)
3. **A critic answers.** `/critique` on a trivial diff, or "ask `ligne-continue` to check this
   sentence". Confirm you get a `GATE:` line and a French rewrite with correct spaces.
4. **`@claude` works.** In a throwaway issue, comment: `@claude say hello, run npm test, and tell me
   which agents you can see`. Confirm it answers, ran the tests, and listed `.claude/agents`. If
   Bash or the agents are refused, the `--allowedTools` line in `.github/workflows/claude.yml` needs
   a fix. If `gh pr view` fails on a PR now that `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is on, drop the
   `gh` entries from that line: the action already puts the PR in the prompt. If the run cannot
   fetch a PR branch, `persist-credentials: false` on the checkout is the first suspect. Then
   comment from the second founder's account to check theirs too (their comments are read only once
   their handle is in `include_comments_by_actor`). Also open a throwaway PR and tag `@claude` on
   it: the "Refuse pull requests from forks" step must pass on a same-repo PR.
5. **The two-key rule bites.** First `curl -s https://api.github.com/repos/<owner>/PLEIN/branches/main`
   and look for `"protected": true`. Then open a PR from a branch and try to merge it yourself:
   GitHub must refuse. If it lets you through, steps 7 and 9 of the two-key rule are not done. The refused merge is the proof; the
   flag alone is not.
6. **A rehearsal of the Saturday.** `/plein rehearsal` with a made-up réservoir, ending at the
   ticket draft. Everything it prints must say it is a rehearsal. Then go one step further, in a
   scratch copy of the repo and never in the working tree: fill the draft's signatures with
   signature-shaped values built at run time, run `npm run ticket -- <draft> --write`, and run
   `npm test`. It must stay green. Today it will not, which is the point: it tells you the guard
   amendment is still open while there are days left.
7. **The ops chat is reached.** Press `releve` with the Telegram secrets set and see the message
   in the ops chat.
8. **Bypass mode is off.** Start Claude Code with `--dangerously-skip-permissions` in this repo: it
   must refuse (Tier 2: the exact behaviour is the setting's, `disableBypassPermissionsMode`).
9. **`plein` is off for today.** `gh workflow list` shows `plein` as disabled. Put "re-enable
   Friday 23 October" in the Board of `docs/objectifs.md`.

## What the agents will never do

- Sign, broadcast, claim fees, move funds, create the coin, or hold, read or ask for a key, seed
  phrase or keypair file. The settings forbid reading those files and running the Solana tools.
- Post, reply, message anyone, send to Telegram or merge a pull request. An agent drafts and hands
  you the link, the text or the command; a founder does the act. (The scheduled totem workflow is
  the founders' own automation, not an agent's act.)
- Put legal reasoning, an attack analysis, a strategy or anything about keys or funds into a public
  issue, PR or `@claude` reply. Those stay in your conversation and your private document.
- Offer anything of value for a post, contact an influencer, run a draw, a raffle or a contest, or
  tie anything to buying or holding $PLEIN. The Saturday contest is off until the lawyer answers.
- Name the food-aid partner before the signed agreement, use a political symbol, a fuel brand or a
  real person's face, or speak from a founder's personal account.
- Invent a number. Unknown is a dash. An unverified outside fact is marked Tier 2.
- Change the formula without four weeks' public notice, or loosen `test/no-signing.test.mjs`. The
  one amendment pre-approved in principle (tickets under `public/tickets/` and `out/`, signatures
  only, checked more strictly than today) is described in `controleur-technique.md` and needs both
  founders and that critic's GO.
- Give legal advice. `ligne-continue` screens and prepares questions; the French crypto lawyer has the last word.

## Honest limits

- The permission rules in `.claude/settings.json` are a tripwire, not a wall. A Bash rule stops the
  usual spelling of a command, not every way of running it (a full path, a shell wrapper, code an
  agent has just written and then runs under `npm test`). The real protection is that nothing here
  holds a key, the guard test, branch protection with code-owner review, and a second pair of eyes.
- An agent can be wrong, confident and polite. Opus critics lower the risk, they don't remove it.
  Check every address, amount and legal claim yourself, with a second founder, before it is public.
- `@claude` has write access to the repo through its workflow token and a GitHub App token that
  stays reachable to the code it runs. Branch protection and code-owner review are what keep it
  from changing `main` alone; the workflow's instructions are not.
- **The single keys behind "two keys".** The rule is only as strong as the weakest of these, each
  held by one person today. Name them, cover them as listed, and do not claim more than this:

  | Single key | What one person can do alone | Cover |
  | --- | --- | --- |
  | The GitHub owner of the repo | Edit or switch off the branch rule, then merge. The collaborator founder cannot see the settings or notice. | A free organization with both founders as owners (two-key rule, step 0): both read the rules and the organization's audit log (Tier 2). Either owner can still weaken the rule; the log shows it afterwards. A passkey or hardware key on both accounts. |
  | The Vercel account | Promote any deployment, a branch preview included, to production, or run `vercel --prod`, so the contract the site serves need not have passed the reviewed `live.json`. Hobby has a single member (Tier 2). | A passkey or hardware key on that account. Until a check exists, the other founder opens `<siteUrl>/live.json` and compares it with `main` at the opening and before each Saturday. **To build, not built yet:** the `vigie` workflow compares `<siteUrl>/live.json` with `main`'s and tells the ops chat on any difference (`automaticien`). |
  | The creator wallet | Holds up to a week of fees until they are claimed (they wait in a pump.fun account), and could redirect later fees if the fee config were editable. | A hardware wallet, never a file on a machine that runs agents; `canEditCreatorFee` and fee sharing checked off at 15:31; a midweek claim when unclaimed fees pass $1,000 (`/plein midweek`). |
  | The laptop that runs agents | The founder's `gh` login: code an agent runs there can approve or merge in that founder's name. | No keypair file or wallet browser profile on it; `--dangerously-skip-permissions` disabled; read what an agent wrote before it runs it. |
  | `CLAUDE_CODE_OAUTH_TOKEN` | One founder's subscription pays for every run. | Regenerate on a leak; swap to the other founder's if needed. |

- The workflow, the agents' frontmatter and the settings were checked against the current docs of
  Claude Code and of `claude-code-action` on 17 October 2026 (agent and skill field names, the
  permission rule syntax, `disableBypassPermissionsMode`, the action's inputs including
  `include_comments_by_actor`, its write-access check, what `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`
  strips, the latest majors of `actions/checkout` and `actions/setup-node`), then read, not run. The
  smoke tests above are the real tests.
- Tier 2 and untested: the `--allowedTools` list, `persist-credentials: false` and the
  `use_commit_signing` path in the workflow, whether the Claude App's approval would count toward
  "Required approvals" (code-owner review makes the answer irrelevant), the claim that the workflow
  token cannot edit workflow files, the GitHub phone app's Run workflow button, the fee-claim path on
  pump.fun, whether a multisig can burn without a transaction built outside its own interface, X's
  intent link, and every outside fact `enqueteur` has not yet confirmed (its register is
  `docs/registre-tier2.md`).

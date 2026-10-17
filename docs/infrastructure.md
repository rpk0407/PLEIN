# Infrastructure: how the station runs

17 October 2026, 04:28 Paris. One page for the two founders: what the parts are, who holds what,
what runs when, what breaks, what is still to set up. Facts are read from the files named beside
them; anything else is marked. **Planned** means not built. **Tier 2** means not verified here
(tiers as in `CLAUDE.md`).
Shapes shared by the parts: [`interfaces.md`](interfaces.md). How you drive it day to day:
[`salle-de-controle.md`](salle-de-controle.md). The MCP server: [`mcp.md`](mcp.md).

> **State at 04:28.** Verified: the repository `rpk0407/PLEIN` is **public** (`gh repo view`), and of
> `.github/` only `ci.yml` is committed. Committed `main` still has the old `launchAt` (18:00, the
> Jupiter Studio plan) and no `api/chain.js`. The other seven workflows, `.claude/`, `.mcp.json`,
> `mcp/`, the scripts, `api/chain.js` and the newer docs sit in the working tree, uncommitted.
> Scheduled workflows and `@claude` exist on GitHub only once merged to `main` (step 5 of section 8).
> **A branch pushed to a public repo is public, merged or not.** `npm test` moves with every
> edit by the other builders: it was red at 04:28 (the guard flagged `privatekey` in
> `scripts/ticket.mjs` and `test/ticket.test.mjs`; earlier runs showed more failures) and green at
> 04:29 (384 pass, 1 skipped). Step 3 is a gate to re-check at merge time, not a fact to rely on.
> No file proves that a Vercel project, the Telegram bot, a Helius account or the multisig exists yet.

## The loops

| Loop | Path | Who acts |
| --- | --- | --- |
| Opening (once, today) | a fresh creator wallet → founder A creates the coin on pump.fun at 15:30 → founder B reads the mint on pump.fun and Solscan → `audit` → PR changing `contract` in `live.json` → B approves → `main` → Vercel redeploys → open pages re-read `live.json` every 15 s | the founders, by hand; agents check (`/lancement`, phase `open`) |
| Price | ministry spreadsheet → `prix-officiel` → branch `prix/…` → PR opened by a founder → approved by the other → `main` → Vercel redeploys → `official` in `config.js` drives the site and the Saturday split | automatic up to the branch, then the two founders |
| Reading | Solana RPC + DexScreener → `/api/chain` (the site, cached) and the same code in `releve`, `audit`, `plein` (run summary + ops chat) | nobody; read only |
| Money | creator wallet → fee claim → réservoir multisig → 12 Jupiter swaps → burn → signatures into the ticket → ticket PR → site | the founders sign every step by hand |
| Agent | founder → Claude Code on a laptop, or `@claude` in GitHub → branch → a founder opens the PR → the other approves → merge | the founders; agents only draft |

## 1. The map

| Part | What it is here | What it does | State |
| --- | --- | --- | --- |
| **GitHub** | Repo `rpk0407/PLEIN`, public, branch `main` | Source of truth. **PRs** with the two-key rule (one founder writes, the other approves). **Actions**: 8 workflows, 7 with a Run workflow button. **`@claude`**: a comment runs Claude Code on the repo (`claude.yml`). Issues, PRs, comments, run summaries and artifacts are all public (see the table below). | Repo exists. Branch rule: not verified (a GitHub setting, not a file). `CODEOWNERS` lists only `@rpk0407` and must list both founders before the first merge. Workflows other than `ci` uncommitted. |
| **Vercel** | Static `public/` plus three functions in `api/` (`vercel.json`: output `public`, no framework, no build) | `/api/diesel` (live national averages, cache 10 min), `/api/stations` (three cheapest stations, cache 10 min), `/api/chain` (on-chain reading, cache 60 s + 300 s stale). `live.json` is `no-store`. Production on `main`, a preview per branch or PR (Vercel's Git integration; README: about a minute per deploy). | Project not verified. It must be imported **after** the working tree is merged (step 7). No Vercel cron exists: every schedule is on GitHub. |
| **Solana** | Public RPC `api.mainnet-beta.solana.com`, or `SOLANA_RPC_URL` (Helius free tier suggested) | Read-only calls from `api/_solana.js`. **pump.fun**: bonding curve, then the PumpSwap pool (`api/_pump.js`; account layouts Tier 2). **Jupiter**: the Plugin on the site (visitor's own wallet signs, site takes 0 %); the keyless quote endpoint `lite-api.jup.ag/swap/v1/quote` in `plein.mjs` for quotes only (Tier 2). **Réservoir**: the multisig that holds the week's fees (tool, signers and threshold still open; `moteur.md` plans around a Squads vault, Tier 2). | Readers built and tested offline; layouts checked against other coins' live accounts on 17 October (Tier 2). $PLEIN itself does not exist yet. |
| **Market data** | DexScreener public API | `market` block of `/api/chain`; the `vigie` look-alike search. | Free, no key; rate limit Tier 2. |
| **Official fuel data** | Two sources | **Weekly (what the formula uses):** DGEC spreadsheet on ecologie.gouv.fr, read by `scripts/official-price.mjs` into `official` in `config.js`. **Live (ticker, Mon Plein, totem):** data.economie.gouv.fr "flux instantané v2", read by `api/_feed.js`, probed by `npm run check:feed` (CI). | Both read live on 17 October. The page layout of the first is Tier 2. |
| **Telegram** | Bot API through `scripts/telegram.mjs`: a bot, a public channel, a private ops group (two founders + bot) | Reports and alerts to the ops group; the morning totem and manual posts to the channel. No secrets means a dry run that only prints. | Bot and chats do not exist yet. Script tested on a stubbed fetch only (Tier 2 live). |
| **X** | No API, no credentials | Drafts only: `totem.mjs` and the `/post` skill build an `x.com/intent/post?text=…` link; a founder presses Post from the station account. | Intent link Tier 2. |
| **Claude Code layer** | `.claude/`: 15 agents, 6 skills, shared `settings.json` | Section 5. | Written, read, not run. |
| **Station MCP** | `mcp/station.mjs`: a stdio server, started by `.mcp.json` as the project server `station`. `mcp/_core.mjs`: the dependency-free JSON-RPC 2.0 core (tests: `test/mcp-core.test.mjs`, `test/mcp.test.mjs`). `mcp/tools.mjs`: 18 tools, each wrapping a module already in the repo. | Lets an AI client call the station's read, compute and simulate tools (reading, audit, split, ticket checks, fuel prices, look-alikes). One tool, `ops_notify`, sends to the private ops chat (section 5). | **Stdio server built.** Verified at 04:24: a hand-sent `initialize` and `tools/list` over stdio return 18 tools. Tier 2: not yet run inside Claude Code. **Planned, not built:** `api/mcp.js`, the public door. |

**What can reach the public, and who triggers it.** The repo is public, so this is more than the site.

| Output | Path | Triggered by |
| --- | --- | --- |
| The website | merge to `main` → Vercel deploy | the founder who merges, after the other approved. The Vercel account owner can also promote a deployment alone (section 2). |
| The contract | PR changing `contract` in `public/live.json` → merge → Vercel in about a minute → open pages poll every 15 s | founder A writes it; B checks the mint on Solscan and in the PR's own file, and the audit runs on that file, before approving (`/lancement`, phase `open`) |
| Dashboard numbers | `/api/chain` on each visit (cached); lights from `live.json` | nobody for numbers; lights by PR |
| Telegram channel | morning totem (schedule); anything else by hand | the schedule, or a founder as channel admin |
| X | intent link | a founder, by hand |
| On chain | coin creation at 15:30 from the creator wallet; fee claims; multisig proposals | the founders sign by hand; nothing in the repo does |
| The ticket | PR adding `public/tickets/plein-NNN.json` | the founders |
| Any pushed branch or PR | public as soon as it is pushed, merged or not; `prix/…` branches are pushed by `prix-officiel` | whoever pushes; the schedule |
| Issue and PR text, every `@claude` reply | public comments | a founder, or `@claude` when tagged |
| Actions run summaries, logs and artifacts | the `plein` order and checklist, the `audit`, `releve` and `prix` reports, artifacts `plein-order` and `totem`: the same text as the private ops chat | every workflow, on schedule or by button |
| The `vigie` issue | one public issue listing look-alike tokens, edited by the workflow | the schedule |

**Run summaries mirror the ops chat and are public: put nothing in a workflow output that you would
not post.** On a public repo, anyone with a GitHub account can read a run's summary, logs and
artifacts (Tier 2: the login each of the three needs differs). Today that includes the `plein`
order, with its per-slice quotes and impact limits, published at 17:52, eight minutes before the first
slice (the 12-slice schedule itself is already in the fiche). Whether the public summary should
be a stub, with the full order sent only to the ops chat, is for `economiste` and `automaticien`
(section 9).

## 2. Who holds what

**Wallet keys: only the founders, each in their own wallet. None in the repo, GitHub, Vercel, a
workflow, an agent or a script.** `test/no-signing.test.mjs` fails the build on signing calls and
on key-shaped material, and `.claude/settings.json` forbids reading key files and running `solana`
or `spl-token`. Who holds which wallet is recorded in the founders' private document, not here.

| Key | Controls | Held by |
| --- | --- | --- |
| Creator wallet (`wallets.creator`) | **creates the coin at 15:30** (so pump.fun credits the creator fee to it); receives that fee; claims it | a fresh single-key wallet, on a hardware device (`moteur.md` section 3). One key: its loss or theft is in section 7. |
| Réservoir multisig (`wallets.reservoir`) | the week's fees, the 12 swaps, the burn, the aid and team transfers | the signers' wallets, published before opening. **Threshold open**: a strict 2-of-2 freezes it for good if one key is lost (`CLAUDE.md`). |
| Aid wallet (`wallets.aid`) | the food-aid share, held as an escrow the two founders control until a partner agreement is signed (`interfaces.md`) | **Open: holder and threshold, decide before Plein #1.** The partner is named only once the agreement is signed; the address is published before the first plein. |
| Team wallet (`wallets.team`) | where the Saturday team share is paid | **Open: holder, decide before Plein #1.** `plein.mjs` warns that it must be published before the first plein. |
| Founders' own wallets (`founder1`, `founder2`) | their holdings, disclosed | each founder; kept apart from the station's |
| Visitors' wallets | their own swaps | each visitor, inside the Jupiter Plugin |

**Service secrets**, none of which moves money:

| Secret | Opens | Lives in | Read by | If it leaks |
| --- | --- | --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | the Claude subscription of the founder who ran `claude setup-token` | GitHub Actions secret | `claude.yml` only | regenerate it; usage is billed to that subscription |
| `TELEGRAM_BOT_TOKEN` | posting as the bot | GitHub Actions secret; a founder's own shell only for a manual `telegram.mjs` run | `audit`, `plein`, `prix-officiel`, `releve`, `totem`, `vigie` through `scripts/telegram.mjs` | revoke it with @BotFather, set the new one |
| `TELEGRAM_CHANNEL_ID`, `TELEGRAM_OPS_CHAT_ID` | where messages go (ids, not credentials) | GitHub Actions secrets | `totem` (channel); all the others (ops chat) | none by itself |
| `SOLANA_RPC_URL` (optional) | the RPC quota; the API key sits inside the URL | **GitHub Actions secret** (`audit`, `plein`, `releve`) **and a Vercel environment variable for Production only**: `api/chain.js` reads `process.env.SOLANA_RPC_URL` at run time. Not for Preview: every branch gets a preview that runs that branch's own `api/` code, branches that agents push included, so one modified `api/chain.js` could print the key. Previews fall back to the public RPC, or get a separate throwaway free key. | the above | rotate the key at the provider, update both places |
| `JUPITER_API_KEY`, `JUPITER_QUOTE_URL` (optional) | a keyed Jupiter quote endpoint | nowhere yet: `plein.mjs` reads them, `plein.yml` does not pass them | only if Jupiter retires the keyless endpoint (Tier 2); then add the secret and wire it through a PR | n/a |
| `GITHUB_TOKEN` | the repo, for one run | automatic; read-only unless the workflow asks | `prix-officiel` (contents write, pushes a `prix/` branch), `vigie` (issues write), `claude` (contents, PRs, issues write, id-token, actions read) | expires with the run |
| The Claude GitHub App's token | the repo, as the App (pull requests: write, among others) | issued by GitHub for each `@claude` run | `claude.yml`, and any code that job runs | expires with the run; see section 5 for what stops it counting as a review |

There is no Vercel token in GitHub, no deploy key, no X credential, and no model call in any
scheduled workflow: only `claude.yml` uses Claude.

**Accounts and access**

| Account | Who | To do |
| --- | --- | --- |
| GitHub owner | `@rpk0407` today | On a personal repo the owner can switch off the branch rule alone and the collaborator cannot notice. Create a free organization with both founders as Owners and transfer the repo before installing the Claude App, Vercel or any secret (`salle-de-controle.md`, the two-key rule, step 0), or defer it to Friday 23 October and write the limit down. Then add the second founder with Write, and list **both in `CODEOWNERS` today, before the first merge**. A passkey or hardware key on both accounts. |
| Vercel | whoever creates the project | both founders need a login; a Hobby account is personal, so a second member probably needs a paid plan (Tier 2). **One person can promote any deployment to production**, a branch preview included, so the site could serve a contract that never passed the reviewed `live.json`. The other founder compares `<siteUrl>/live.json` with `main` at the opening and before each Saturday. A workflow check is not built (section 9). |
| Telegram | both founders admin the channel and the ops group; the bot is a channel admin with the right to post | create them |
| X station account | shared by the founders; personal accounts never post about the coin | create it; set `links.xHandle` |
| Claude Code | each founder logs in on their own laptop | one founder's subscription also carries `@claude` |
| Domain | none bought; `siteUrl` in `config.js` is empty | buy, then set `siteUrl`, `og:url`, absolute `og:image` |

## 3. Every schedule

GitHub cron is UTC. Paris is UTC+2 (CEST) until Sunday 25 October 2026 and UTC+1 (CET) after, so
a Paris-time job has two lines and `scripts/_gate.mjs` lets through only the one that matches the
clock in force, however late GitHub starts it, up to a Paris cut-off. If the gate closes for a
reason nobody planned, the run is green, so the job tells the ops chat. Every workflow below also
has a Run workflow button except `claude`; a button run skips the gate.

| Workflow | Cron (UTC) | Paris, CEST / CET | Reads | Writes or posts | A founder then |
| --- | --- | --- | --- | --- | --- |
| `ci` | every push and PR; `0 7 * * 1` | Mon 09:00 / 08:00 | the repo; the live fuel feed (job `feed`, non-blocking) | a green or red check. `test` is the one to make required. | looks at a red `feed`: the ministry changed a field, fix `api/_feed.js` |
| `prix-officiel` | `23 8,14 * * 1-5` and `23 8 * * 6` | Mon-Fri 10:23 and 16:23 / 09:23 and 15:23; Sat 10:23 / 09:23 | the ministry spreadsheet | when it is newer than `config.js`: pushes `prix/<date>-<price>` changing `official` only, runs `npm test`, puts an "open the PR" link in the summary and the ops chat. Never opens the PR, never merges. | opens the PR, checks the figure against the weekly note; the other founder approves and merges |
| `plein` | `52 15 * * 6` and `52 16 * * 6` (gate: Paris hour 17, until 18:30) | Sat 17:52 both ways. The first line serves 17 and 24 October, the second from 31 October. **It fires on 17 October too, once merged.** | the ministry table (is `config.js` current?), the chain, Jupiter quotes | the purchase order, 12 slices and checklist in the (public) summary and the ops chat; artifact `plein-order` (order + ticket draft, 30 days) | checks the order, signs in the multisig by hand. **Switched off for today (step 6).** |
| `totem` | `17 6 * * *` and `17 7 * * *` (gate: Paris hour 8, until 11:00) | daily 08:17 | `config.js`, the formula, the live diesel average | renders the card; **posts it to the public channel** and sends card, draft and X link to the ops chat; artifact `totem` (14 days) | nothing; may post the X draft; can disable the workflow |
| `vigie` | `7 */3 * * *`; `*/15 9-20 17 10 *` | every 3 h at :07 UTC; 17 Oct every 15 min from 11:00 to 22:45 CEST | DexScreener search | edits one public issue labelled `vigie`; new look-alikes to the ops chat | reads the alert, runs the `vigie` playbook, pins a warning |
| `audit` | `30 14 17 10 *` (comes back each 17 October) | 17 Oct 16:30 CEST | `contract` in `public/live.json` **on `main`**, then the chain: creation slot, same-slot buyers, early buyers, top 10, authorities | report in the summary and the ops chat | edits the lights in `live.json` by PR |
| `releve` | button only | n/a | the chain (one `/api/chain` reading) | summary + ops chat | presses it after the opening, on Sundays, when a number looks wrong |
| `claude` | on `@claude` in an issue, PR or review only | n/a | the thread and the repo | a branch and (public) comments | opens the PR; the other founder approves |

- **Nothing here fires before it is merged to `main`**: GitHub runs schedules from the default
  branch (confirm in the Actions tab after the merge). The 16:30 `audit` and the 15-minute `vigie`
  of launch day need the merge before they start.
- **`plein` would run today, a week early.** Neither `plein.yml` nor `scripts/_gate.mjs` knows
  `firstPleinAt`. Checked at 04:24:
  `node scripts/_gate.mjs --hour 17 --until 18:30 --event schedule --cron '52 15 * * 6' --now 2026-10-17T15:55:00Z`
  prints `go=true`. The run would fail for lack of a réservoir wallet, and its failure message to
  the ops chat tells the founders to re-run it by hand with a réservoir figure, which invites a
  Plein #1 a week early. So `gh workflow disable plein` today (Claude Code asks first, step 6), and
  `gh workflow enable plein` on Friday 23 October (`/plein friday`, step 8, checks it). Disabled, it
  has no Run workflow button either (Tier 2). Keep both until `automaticien` makes `plein.yml` skip
  scheduled runs before `firstPleinAt` (section 9). The alternative is to leave `plein.yml` out of
  today's merge and merge it on Friday.
- **The 16:30 `audit` reads the contract from `main`.** `scripts/audit.mjs` fails with "the contract
  in live.json is not a valid address" while it is empty. Merge the contract PR before 16:25.
  Otherwise the run fails and pings the ops chat: press the `audit` button (empty `mint`) as soon as
  the PR is merged.
- **Best effort.** Runs can start late or be skipped; the minutes are off :00 on purpose. Each
  workflow runs one at a time (a `concurrency` group; nothing is cancelled). Never let a schedule
  be the only thing between you and a Saturday step: `/plein go` does the same by hand.
- **Quiet repositories.** GitHub disables schedules in a public repo after 60 days without
  activity (docs as read 17 October, per `salle-de-controle.md`). Weekly price and ticket PRs keep it
  active; a pause or wind-down does not, and `gh workflow enable <name>` brings one back.

## 4. The weekly loop (Paris time)

| When | What runs | Who | Output |
| --- | --- | --- | --- |
| **Sunday** | `totem` 08:17. `/releve`: readings, lights, the Sunday report against the thesis metrics. `chef-de-station` updates `docs/objectifs.md` (not written yet). Anything that went wrong becomes an issue with a UTC timeline, or goes to the private record if it touches keys or funds. | founders, `releveur`, `chef-de-station` | report; PR for `live.json` lights |
| **Monday** | `ci` feed check 09:00 CEST. From 10:23 CEST (09:23 CET) `prix-officiel` looks for the new weekly survey (the spreadsheet refreshes early in the week). New figure: branch `prix/…` + link in the ops chat. | automatic, then a founder | PR opened by hand |
| **Tuesday to Thursday** | `/plein price`: `enqueteur` confirms the survey week against the ministry table (a newspaper is not a confirmation); CI green; the other founder approves and merges the price PR before Saturday 17:45. Vercel redeploys. | `enqueteur`, both founders | `official` in `config.js` is the frozen price |
| **Wednesday** | the week's post through `/post`: `pompiste` drafts, `ligne-continue` gates, `critique-degen` checks taste | a founder posts | X intent link, Telegram text |
| **Any day: midweek claim** | `/plein midweek`: whenever a reading shows `creatorVault.unclaimed` above $1,000 (a figure the founders may change), the founders claim and move the fees into the réservoir back to back; `tresorier` compares before and after. It limits how much waits behind the single creator key. | `tresorier`, founders | claim signature; the ticket's `claim` holds one signature today (`/plein` skill) |
| **Friday** | `/plein friday`: `releveur` reads `creatorVault.unclaimed`, the réservoir, the supply; `tresorier` runs a labelled rehearsal order; `economiste` the execution plan; `/critique --quick`; `gh workflow list` shows `plein` enabled again. Before Plein #1: the multisig rehearsal and the ticket-against-the-guard rehearsal. Nothing is claimed. | agents; founders read | rehearsal order |
| **Saturday 10:23 (CEST)** | `prix-officiel` last scheduled look | automatic | PR link if new |
| **Saturday 17:30** | `/plein go`: `chef-de-station` says GO, GO-IF or NO-GO. A NO-GO from `controleur-technique`, `economiste` or `ligne-continue` stands until the founders override it in writing. | founders | go/no-go |
| **17:45** | the price is frozen | all | |
| **Before 17:50** | the founders claim the week's creator fees and move them into the réservoir **by hand**; `tresorier` compares before and after | founders | claim signature for the ticket draft |
| **17:52** | `plein` workflow: price check, chain read, order, ticket draft. Run `npm run plein -- --from-chain --markdown` by hand too. | automatic + `tresorier` | order in the summary and ops chat |
| **18:00 to 18:55** | 12 slices, one every five minutes, signed in the multisig by the founders. When a proposal is pasted as text, `tresorier` answers MATCH or STOP against the order. Any STOP halts the run; the unbought part goes to `unspent`, carried to next week. | founders | swap signatures |
| **19:00** | the burn, then the aid and team transfers, signed by hand | founders | burn signature |
| **19:05** | signatures pasted into the draft (outside git until validated); `node scripts/ticket.mjs <draft>`; `npm run verify:ticket -- <ticket.json>`; `--write`; PR; the other founder merges; Vercel deploys; `/post` for X and Telegram | `imprimeur`, `pompiste`, founders | ticket on the site, X, Telegram |

`docs/moteur.md` section 4 proposes capping the Saturday hour and buying the rest in weekday
slices. It is undecided; the fiche still says 12 slices until 19:00. If adopted, it adds founder
signatures on weekdays.

## 5. The agent layer

**Three doors, one rulebook.** All read `CLAUDE.md`, `docs/interfaces.md` and `.claude/settings.json`.

| Door | How | Model | Can | Held back by |
| --- | --- | --- | --- | --- |
| **Laptop** | `claude` in the clone: `/station`, `/agents`, `claude --agent <name>`, `@agent-<name>` | your session; each agent sets its own `model:` | **Runs without asking** (from `settings.json`): `npm test`, `npm run check:feed`, `npm run` with `releve`, `audit`, `vigie`, `prix`, `plein`, `ticket` or `verify:ticket` and any arguments, `node --test test/no-signing.test.mjs`, read-only `git` (status, diff, log, show, blame, ls-files, rev-parse) and read-only `gh` (pr, issue, run, workflow: list, view, diff, checks). File edits follow the permission mode each founder chose. | **Asks first**: everything else, notably `node scripts/*`, `npm run dev`, `npm run totem`, `gh pr create`, and by name `git push`, `git reset --hard`, `git clean`, `gh pr merge`, `gh workflow run\|disable\|enable`, `gh secret`, `gh api`, `gh repo`, the Telegram script, `totem --post`, `prix --write`. **Denied**: reading `.env`, key files, `~/.config/solana` and `~/.ssh`; `solana` and `spl-*`; force and delete pushes; `gh pr review`; `--node-options`, `--import`, `--require`; bypass mode (`disableBypassPermissionsMode`). |
| **`@claude` in GitHub** | a comment in an issue, PR or review by an owner, member or collaborator (bots blocked; fork PRs refused by the workflow's first step) | Sonnet main thread; Opus agents on their own | work on a branch, commit through GitHub's API (Tier 2: `use_commit_signing`), comment; run the tests and the named read-only scripts; call the agents and skills; WebFetch, WebSearch. 40 turns, 30 minutes. | **Told not to**, by instruction and tool list: merge, review, push by shell, post, `gh workflow run`, `gh api`, `gh secret`. **A tripwire, not a wall**: see the bullets below. No Telegram or RPC secret, so scripts only dry-run. Cannot edit workflow files (Tier 2). No `mcp__` entry in `--allowedTools`, so it cannot use the station MCP server (Tier 2: whether the action loads `.mcp.json` at all). |
| **Workflows** | schedules and buttons | none | read, compute, notify | anything involving Claude |

- **What really stops `@claude` is on GitHub, not in the workflow.** The job can run any code in its
  checkout (`npm test` runs every file in `test/`), and the Claude GitHub App's token (pull requests:
  write, among others) stays reachable by that code. Until `CODEOWNERS` lists both founders and
  "Require review from Code Owners" is on with no bypass, an approval from the App may count as the
  second key and its token could merge (Tier 2: not tried). A bot is not a code owner, so with both
  in place its approval never counts.
- **Every `@claude` reply and every PR description is public.** Only code, copy and test results go
  in a thread. Legal screening, attack analysis and strategy stay in a local session: do not run
  `/critique` through `@claude`, and attach only the verdict table to a PR.
- `@claude` runs on the subscription behind `CLAUDE_CODE_OAUTH_TOKEN`; a long Opus run eats those
  limits. Only the founders' comments (and Claude's own) reach the model, through
  `include_comments_by_actor` in `claude.yml`, which today lists only `rpk0407`: add the second
  founder's handle (step 1). The issue or PR body still reaches it, so read an outsider's issue
  before you tag `@claude` on it. Fork PRs are refused by the workflow's first step, before any of
  their code is checked out.

**How `/station` dispatches.** (1) It reads state itself: `git status`, `git log`, open PRs,
issues, recent runs, `npm test`, `docs/objectifs.md`. (2) It asks `chef-de-station` (Opus) for the
board: now, next, blocked on a founder, waiting for the second key, with owner, files, gate and
metric. (3) Tasks whose files do not overlap run in parallel as Sonnet owner agents; tasks that
share a file run in turn. (4) Anything public, money-adjacent or touching `api/`, workflows,
addresses or the formula goes through `/critique` first. (5) It reports what ran and what only a
founder can do. It opens a branch and a PR; it never merges.

**The team.** Opus agents criticise and decide; Sonnet agents build and operate. Seven run on Opus,
eight on Sonnet. Models and tools are read from each agent's frontmatter at 04:28; several of those
files were still being edited, and `/agents` shows the live set.

| Agent | Model | Edit and Write tools? | Owns |
| --- | --- | --- | --- |
| `chef-de-station` | Opus | Edit and Write (`docs/objectifs.md` by rule); can launch agents | dispatch, cadence, final go/no-go |
| `controleur-technique` | Opus | no | security; guards "never sign"; **veto** |
| `ligne-continue` | Opus | no | French-law and honesty gate on every public text; **veto**; not legal advice |
| `economiste` | Opus | no | fees, split, buyback execution, kill criteria; **veto** |
| `critique-degen` | Opus | no | taste, FUD forecast; advisory |
| `atelier-idees` | Opus | no | ideas, with the illegal ones killed; advisory |
| `enqueteur` | Opus | no | fact-checks every Tier 2 claim against primary sources |
| `mecano-chaine` | Sonnet | Edit and Write | `api/chain.js`, `_solana.js`, `_pump.js`, `releve`, `audit`, `verify-ticket`, `mcp/` |
| `carrossier` | Sonnet | Edit and Write | the site in `public/` |
| `automaticien` | Sonnet | Edit and Write | workflows, `telegram.mjs`, secrets wiring |
| `imprimeur` | Sonnet | Edit and Write | tickets, totems, share cards |
| `tresorier` | Sonnet | Edit and Write | the Saturday order, checklist, ticket draft; never signs |
| `pompiste` | Sonnet | Edit only | French copy; drafts only |
| `releveur` | Sonnet | Write only | readings, lights, Sunday report |
| `vigie` | Sonnet | no | clones, scams, the first ten minutes of an incident |

This column lists tools, not a promise that an agent cannot change files: most agents also have
Bash, and Bash can write files, which only the permission rules govern.

**Skills.** `/station`, `/critique` and `/releve` can also be loaded by Claude on its own.
`/lancement`, `/plein` and `/post` carry `disable-model-invocation: true`: only a founder can type
them, because they touch money and public words. `/critique` runs six of the seven Opus agents in
parallel (all but `enqueteur`); any NO-GO from the three veto holders makes the merged verdict
NO-GO.

**Guardrails, outermost first.** No key exists to be taken. `.claude/settings.json` allow, ask and
deny lists. `test/no-signing.test.mjs` in CI. Branch rule plus code-owner review plus the second
founder. Opus vetoes. Least-privilege `permissions:` in each workflow. The permission rules and
the `@claude` tool lists are a tripwire, not a wall; the walls are that nothing here holds a key
and that a second person reads every merge.

**Station MCP.** *How it plugs in.* `.mcp.json` starts `node mcp/station.mjs` over stdio as the
project server `station`. Claude Code asks each founder, on their own laptop, to approve it on first
start (a committed file cannot approve its own servers); its tools then appear as
`mcp__station__<tool>`. Setup, the 18 tools and the hand test are in [`mcp.md`](mcp.md). *Permissions.*
`.claude/settings.json` has no `mcp__station__*` rule, so every call asks the founder. *Limits.* No
MCP tool may create the coin, seed a pool, swap, claim, burn, transfer or airdrop (`innovations.md`,
section 3). *The exception.* `ops_notify` sends text to the private ops chat, never the public
channel, and works only where the Telegram secrets are in the environment (on a laptop, only if a
founder put them there). That conflicts with "agents never send to Telegram" in
`salle-de-controle.md`, so it is an exception the founders must accept in writing. Until they do,
treat the tool as denied; either way `mcp__station__ops_notify` belongs on the `ask` list of
`.claude/settings.json`, like `node scripts/telegram.mjs`, so a founder's own blanket allow does not
silence it (Tier 2: precedence across settings files). That edit is not made here (section 9).
*Not built:* `api/mcp.js`, the public door pinned to `live.json`, held until the lawyer has answered
on MiCA "offeror" status (`CLAUDE.md`, `innovations.md` idea 14).

## 6. Costs

| Service | Used for | Free, and the limit that could bite | First step if it bites |
| --- | --- | --- | --- |
| GitHub Actions | 8 workflows | Public repo: standard runners free (Tier 2). A private repo gets 2 000 minutes a month on the Free plan and no branch protection (Tier 2). Cron arithmetic: about 360 scheduled job starts a month (`vigie` 240, `totem` 60, `prix-officiel` 47, `plein` 9, `ci` 4), plus pushes, PRs, buttons and `@claude`; run lengths not measured. | Stay public. |
| Vercel Hobby | site and three functions | Free, but its fair-use terms say non-commercial (Tier 2). A site that promotes a coin whose fees pay the team may count as commercial: decision #29 in `innovations.md` is open. Quotas and the 30 s `maxDuration` set for `/api/chain` on Hobby: Tier 2. | **Vercel Pro**, from the team line, cost published. |
| Public Solana RPC | every on-chain read | Free, rate-limited. It refused `getTokenLargestAccounts` on 17 October (comment in `_solana.js`), so holders fall back to `getProgramAccounts`, which it may also refuse (Tier 2). Site load is bounded: edge cache 60 s plus a 60 s warm-instance cache, about eight RPC calls per reading. | A free Helius key first (no cost); a paid plan only if dashes persist. |
| DexScreener API | market block, `vigie` | Free, no key; about 300 requests a minute, staying free: Tier 2 (comment in `vigie.mjs`). | Reduce `vigie` frequency. |
| data.economie.gouv.fr, ecologie.gouv.fr | fuel prices | Open data, no key. Anonymous rate limit not documented in the repo (Tier 2). A Mon Plein search costs a few upstream queries and is cached 10 min **per exact URL** (Tier 2: that Vercel's cache keys on the query string). `/api/chain` sends any query string to the bare path; `/api/diesel` and `/api/stations` do not, so unrelated query strings and every `tank` value from 10 to 120 skip the edge cache. Each such request costs a Vercel invocation plus upstream queries, enough to get the station's egress rate-limited by the ministry and take Mon Plein and the ticker down for everyone. | Same query normalisation as `chain.js` (section 9); a rate limit (step 16); cache longer. |
| Telegram Bot API | reports, totem | Free. Messages are chunked below 4 096 characters. | n/a |
| X | drafts | Intent links only: no API, no cost, no credential. | n/a |
| Jupiter | the Plugin, quotes | Plugin free to the site (zero site fee; the swapper pays Jupiter's own fee, `moteur.md`). Keyless quote endpoint: Tier 2. | A keyed endpoint (`JUPITER_API_KEY`). |
| Claude | `@claude`, agents on laptops | Founders' subscriptions, no API billing; Opus runs use more of the limits. | A second founder's token to share the load. |

Not yet bought: a domain. Outside the repo and much larger: the French crypto lawyer, the company,
the accountant (`CLAUDE.md`, open decisions).

**Recommendation, not a decision: if volume comes, pay first for Vercel Pro.** The site is the one
public face, and a suspension under the Hobby terms is the one outage you could not fix yourselves
on a Saturday. Pay for an RPC plan second, only if the free key still returns dashes. Third, a keyed
Jupiter endpoint if the free one is retired.

## 7. Failure modes

| What fails | What happens | Fallback |
| --- | --- | --- |
| **`plein` runs on 17 October** (not switched off) | At 17:52 the run fails for lack of a réservoir wallet, and its ops-chat message says to re-run by hand with a réservoir figure. | Do not. There is no plein on launch day; Plein #1 is Saturday 24 October at 18:00. `gh workflow disable plein`, then re-enable on Friday 23 October (step 6). |
| **The contract PR is not merged by 16:25** | The 16:30 `audit` fails on an empty contract and pings the ops chat. | Press the `audit` button (empty `mint`) as soon as the PR is merged. |
| **Creator key lost or stolen** | pump.fun pays every future creator fee to that one address, and the fees not yet claimed wait in a pump.fun account. A lost key leaves them unreachable; a stolen key lets someone else claim them or sign as the coin's creator. | The `vigie` playbook (the record stays private until contained), a public notice, then the recovery path. No recovery path is known: whether pump.fun lets the creator move claims to another wallet is Tier 2 (`enqueteur`). Decide it before Plein #1. The midweek claim keeps the exposure small. |
| **Solana RPC down or rate-limited** | `/api/chain` returns `null` blocks and lists them in `errors`; the dashboard shows dashes. Total failure is a 502 and the page keeps `live.json`. `plein --from-chain` fails and the job tells the ops chat. | Press `plein` with the `reservoir` input, or `npm run plein -- --reservoir <amount>`; switch `SOLANA_RPC_URL` to another provider. If Solana itself is down on a Saturday: stop, put what was not bought in `unspent`, print the ticket anyway with the reason in `notes`, tell the ops chat (`/plein` skill; the final procedure is still an open decision). |
| **Fuel feed down** | `/api/diesel` and `/api/stations` return 502; the page keeps its printed fallbacks; the totem shows a dash for the live average. The Saturday split does not use this feed. | None needed for the split. |
| **Ministry spreadsheet unreachable or reshaped** | `official-price` exits 2; `prix-officiel` tells the ops chat; at 17:52 `plein` prints a warning line first. | A founder reads the weekly note and edits `official` by PR. |
| **Vercel down or a bad deploy** | Site and `/api/*` fail. The buyback does not depend on it: the multisig is on chain and the scripts run on GitHub or a laptop. | Roll back to the last good deployment in Vercel (no commit needed). The ticket still goes to Telegram and X. Proposed, not written: quote the contract from the merged `live.json` in the channel until the site is back. |
| **GitHub down** | No PRs, workflows or `@claude`. The site stays up. | Every founder has the clone: `npm run plein` works locally. |
| **Telegram down or a wrong token** | The send step fails and turns the job red; the failure notice also needs Telegram. The order is already in the run summary. The `plein-order` artifact step is skipped after a failed step (Tier 2: not seen). | Read the run summary; `npm run plein -- --from-chain --markdown` writes the ticket draft at `out/plein-NNN-draft.json`; post in the channel by hand. |
| **A founder unreachable on Saturday** | The multisig cannot reach its threshold (open decision; with a strict 2-of-2 nothing can be signed). | By analogy with a STOP in the `/plein` skill: the unbought buyback goes to `unspent`, is carried to next week and never split again; the ticket prints with a note. Proposed, not written: a recovery signer or spending limit decided before Plein #1 (Squads limits are Tier 2). |
| **pump.fun changes fees again** | It already did once, on launch day. `fees.js` is a table; no detector reads pump.fun's fee accounts yet (**planned**, `moteur.md` section 8). The toll and the order use `fees.js`. | Same-day PR to `fees.js`. The formula is unchanged: it splits whatever the fees were. `enqueteur` re-reads pump.fun/docs/fees before each plein. A layout change in `_pump.js` shows as a null block plus an `errors` entry. |
| **Jupiter has no route, or retires the free quote endpoint** | Quotes fail; the order carries an `unquoted` advisory and no impact check. | `moteur.md` section 8: the site's pump closes with a link to pump.fun and the plein uses pump.fun's own buy, both founders reviewing. Keyed endpoint via `JUPITER_API_KEY`. |
| **A scheduled run is late or skipped** | Gate or no gate, GitHub is best effort. An unplanned closed gate sends a message. | The workflow's button; `/plein go` by hand. |
| **A secret leaks** | Telegram token: anyone can post as the bot. RPC URL: someone spends your quota. Claude token: someone uses your subscription. | Rotate at the provider, update the secret (and Vercel for the RPC URL, which is Production-only so a branch preview cannot print it). No wallet key can leak from here: none is stored. |
| **Something private was pushed or posted** | Every branch, PR, issue, comment, run summary and artifact on this repo is public, and deleting one does not recall copies (Tier 2). | Take it out at once, treat it as published, tell the other founder, and rotate anything secret that was in it. Prevent it with step 4 and the "public replies" rule of section 5. |
| **A fake contract or phishing page** | `vigie` lists look-alikes in its issue and the ops chat. | `vigie` agent playbook; pinned warning; the only contract is the one in `live.json`. |

## 8. Setup checklist, in order

Today first; "by" times are Paris. Repo-admin steps need `@rpk0407` (or an organization Owner).

| # | Step | Who | By | Done when |
| --- | --- | --- | --- | --- |
| 0 | **The organization** (`salle-de-controle.md`, two-key rule, step 0): create a free GitHub organization with both founders as Owners and transfer the repo, before the Claude App, Vercel or any secret (a transfer breaks those integrations). Every `rpk0407/PLEIN` URL changes; GitHub redirects the old ones. Or defer it to Friday 23 October and write the limit in the Board of `docs/objectifs.md`. | both | first thing | both founders can read the branch rule and the audit log (Tier 2), or the deferral is written |
| 1 | Done 17 October: `axel9lg` invited with **Write**; he accepts the invitation. `.github/CODEOWNERS` reads `* @rpk0407 @axel9lg`, and the same handle is in `include_comments_by_actor` in `claude.yml` and in `standard.yml`. | `@rpk0407` | morning | they can approve a PR; `@claude` threads they write reach the model |
| 2 | Set the branch rule on `main` (steps 1 to 9 of "The two-key rule" in `salle-de-controle.md`); keep "Allow GitHub Actions to create and approve pull requests" **off**. Turn "Require review from Code Owners" on only once both handles are in `CODEOWNERS`. Note: GitHub reads `CODEOWNERS` from the base branch (Tier 2), which has none until step 5 merges, so the step 5 PR is held by "Required approvals" alone and the code-owner rule bites from the next PR. | `@rpk0407` | morning | a PR you wrote refuses to merge without the other's approval |
| 3 | **Precondition for step 5: `npm test` green locally and the CI `test` check green on the PR.** It went red and green again within minutes as the other builders edited, so run it at merge time. Step 2 makes `test` a required check, so a red PR cannot merge and the 11:00 and 14:30 deadlines slip without warning. The owners of the failing files fix them first; never loosen `test/no-signing.test.mjs`. | owners of the red files | before step 5 | `npm test` prints no failure |
| 4 | **Precondition for the first push: nothing private goes public.** The repo is public, so a pushed branch is public even if it is never merged. Move `docs/innovations.md` section 3 (the killed ideas) and section 4 (the lawyer's questions: the file itself says the list stays private) into the founders' private document, with anything else the docs mark private (`salle-de-controle.md`: legal reasoning, attack analysis, strategy, keys, wallets, funds). Run `ligne-continue` and `controleur-technique` locally on `git diff` and the new files. Decide knowingly about `moteur.md` sections 4 and 8 (attack surface, kill criteria): `salle-de-controle.md` keeps attack analysis out of the repo, and `economiste` and the founders choose. | both; `ligne-continue`, `controleur-technique`, `economiste` | before the first push | the founders have read the diff as a competitor would |
| 5 | Review and merge the working tree: branch, PR, second founder approves. Without this no schedule, no `@claude`, no agents on the other laptop. | either, then the other | by 11:00 if you can (launch-day `vigie` starts then), at the latest 14:30 (`audit` fires at 16:30) | Actions lists 8 workflows; `.claude/` and `.mcp.json` are in the other's clone |
| 6 | **Switch `plein` off for today:** `gh workflow disable plein` (Claude Code asks first), `gh workflow list` shows it disabled, and "re-enable on Friday 23 October" goes in the Board. (Alternative: leave `plein.yml` out of today's merge.) Re-enable with `gh workflow enable plein` on Friday 23 October; `/plein friday` checks it. | a founder | right after step 5, and before 17:52 | the 17:52 run does not exist |
| 7 | Vercel, **after step 5**: import the repo, preset **Other**, no build command, production branch `main`; open the preview on a phone; read the Hobby terms (decision #29). Do not share the production URL until it shows the 15:30 countdown. | whoever owns the account | before 14:30 | the page counts down to 15:30 with an empty contract; `/api/diesel`, `/api/stations?cp=75011`, `/api/chain` answer |
| 8 | Telegram: bot via @BotFather, public channel (bot as admin with post right), private ops group; the two chat ids; the three secrets. Have `ligne-continue` gate the `totem` caption and card text **before** creating the channel secret: it is the one public post nobody reads first. | one creates, both join | before 14:30 | the `releve` button puts a report in the ops chat |
| 9 | Claude for GitHub: install the Claude GitHub App, run `claude setup-token`, save `CLAUDE_CODE_OAUTH_TOKEN` | the founder whose subscription carries it | before 14:30 | `@claude` answers in a throwaway issue, from both accounts |
| 10 | Free Helius key: save `SOLANA_RPC_URL` in GitHub secrets **and** in Vercel for **Production only**; redeploy | either | before 14:30 | the `releve` button with a live pump.fun mint reports no `rpc` or `holders` error |
| 11 | Each laptop: Node 20+, git, `gh auth login`, Claude Code; `npm test` green; `/agents` lists 15; approve the `station` MCP server (`/mcp` shows 18 tools); the smoke tests of `salle-de-controle.md` | both | before 14:30 | all pass |
| 12 | Station accounts: X handle, Telegram link in `links` of `config.js`; domain in `siteUrl`; absolute `og:image` and `og:url`. `/lancement` preflight reads them. | both | before 14:30 | merged by PR |
| 13 | Wallets: creator wallet created on a hardware device (`moteur.md` section 3), funded as that section says, and published as `wallets.creator` **by PR, merged by 14:30**: the `/lancement` go/no-go needs it already in `live.json`, checked by both founders, because the contract PR is proved by the curve's creator matching it. Record who holds it in the private document, not in the repo. Multisig tool, signers and **threshold** decided, lost-key procedure written, `wallets.reservoir` published. `wallets.aid` and `wallets.team`: holders decided and published. Each address checked by two people. | both | creator 14:30; the rest before Plein #1 | after the opening, `/api/chain` has a `reservoir` block; the fiche's "all our wallets" line is true |
| 14 | Test the fee claim and a multisig swap with a throwaway coin and a tiny amount (README), **from a separate throwaway wallet, never the station creator wallet or the réservoir**: the creator wallet must stay fresh (`moteur.md` section 3), and pump.fun shows a creator's other coins, so the public would see a station dev who launched another coin today. | throwaway-wallet holder + signers | before 15:30 if possible, else before Friday 23 | a claim and one vault transaction seen on Solscan |
| 15 | **The opening, by `/lancement` phase `open`:** A creates the coin from the creator wallet; B reads the mint on pump.fun and Solscan; 15:31 `npm run audit -- --mint <mint> --markdown`; the contract PR; B's three checks; **merge before 16:25** so the 16:30 `audit` reads a real contract. | A, B; `mecano-chaine`, `controleur-technique` | 15:30 to 16:25 | the contract shows on the live site without a reload; the 16:30 audit report reaches the ops chat |
| 16 | Optional: a Vercel Firewall rate limit on `/api/*` (suggested in a comment in `api/chain.js`, which covers only itself; the other two endpoints are cache-bustable too). Whether the Firewall rate limit exists on Hobby: Tier 2. | Vercel owner | week 1 | rule active |
| 17 | **Guard fix (idea #12):** let transaction signatures under `public/tickets/` pass `no-signing.test.mjs`. Today it flags any 86-90 character base58 string and has no ticket exemption, so the 19:05 ticket PR would turn CI red. Both founders approve in writing. | `imprimeur` builds, `controleur-technique` reviews | Thursday 22 | a planted key pair in a `sig` field still fails |
| 18 | Decide `moteur.md` section 4, the "Solana or Jupiter down" procedure, and the unreachable-founder rule; write them into the fiche and the `/plein` skill | both | Wednesday 21 | the fiche and the order say the same thing |
| 19 | Full rehearsal, **local only**: `/plein rehearsal`, i.e. `npm run plein -- --reservoir <made-up amount> --out <scratch dir>`, which `tresorier` labels by hand (the script prints no rehearsal label, except when the number already has a published ticket). Do **not** press the `plein` button with a made-up `reservoir`: `plein.yml` has no rehearsal input, so the unlabelled order with an invented figure would land in a public run summary, the ops chat and a `plein-order` artifact that could be mistaken for Saturday's. The button rehearsal is planned (section 9). | both | Friday 23 | every output the agents print says it is a rehearsal |

Not infrastructure, but they gate the first plein: the `[bracket]` blanks in the three draft pages,
the lawyer's answers, the company, and `docs/objectifs.md`, `docs/lancement.md` and
`docs/registre-tier2.md`, which other docs mention and which do not exist yet.

## 9. Needs from other owners

Changes this page depends on and does not make. Nothing here is built.

| Owner | Change | Why |
| --- | --- | --- |
| `automaticien` | `plein.yml` skips scheduled runs more than 36 hours before `firstPleinAt`; a `rehearsal` input that prefixes every output and renames the artifact | today's run and the button rehearsal (sections 3 and 8) |
| `automaticien`, `economiste` | decide whether the public `plein` summary is a stub, with the full order sent only to the ops chat | the order is public eight minutes before the first slice |
| `automaticien` | a `vigie` step that compares `<siteUrl>/live.json` with `main` and tells the ops chat | the Vercel account's single key (section 2) |
| `mecano-chaine` (owner of `api/`) | the same query normalisation on `/api/diesel` and `/api/stations` as in `api/chain.js` | cache-busting (section 6) |
| `controleur-technique`, `chef-de-station` | add `mcp__station__ops_notify` to the `ask` list of `.claude/settings.json` | section 5 |
| both founders | accept the `ops_notify` exception in writing, or have it removed | it conflicts with "agents never send to Telegram" |
| `chef-de-station` | link this page from `CLAUDE.md` or `salle-de-controle.md`; write `docs/objectifs.md` and `docs/lancement.md` | nothing links here yet |

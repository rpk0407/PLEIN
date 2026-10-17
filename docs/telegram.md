# Telegram: talk to the agents from the ops group

17 October 2026. You type a command in the private ops group on your phone; an agent works on it in
GitHub; the answer comes back in the same group. Nothing here signs or sends a transaction, and the
agents still only open branches and pull requests: the founders approve, merge, sign and post.

Code: [`api/standard.js`](../api/standard.js) (the webhook and the way back), [`.github/workflows/standard.yml`](../.github/workflows/standard.yml)
(the run), [`test/standard.test.mjs`](../test/standard.test.mjs). Shapes shared with the rest:
[`interfaces.md`](interfaces.md). Day-to-day use: [`salle-de-controle.md`](salle-de-controle.md).
Tier 2 throughout (see the last section): nothing here has run against the live Bot API or GitHub yet.

## How it works

```
your phone ── /faire … ──▶ Telegram ──▶ https://<site>/api/standard      (Vercel, checks who you are)
                                              │ replies "Reçu, je transmets à …" in the HTTP answer
                                              ▼
                  GitHub: repository_dispatch "station-order" (with a proof valid for this order)
                                              ▼
              workflow "standard": Claude Code as the agent, on a branch claude/order-…
                                              ▼  the answer, posted with the proof
              https://<site>/api/standard ──▶ the ops group, as the ops bot: answer + branch + run links
```

- **Door 1, Telegram to Vercel.** Telegram sends the secret you chose in a header; the function
  compares it in constant time. Then it accepts one thing: a plain text message from one of
  `FOUNDER_TELEGRAM_IDS`, inside the group `TELEGRAM_OPS_CHAT_ID`, that starts with a known command.
  Bots, forwarded messages, anonymous admin posts, edits and every other chat get a silent 200.
- **Door 2, Vercel to GitHub.** The function sends one `repository_dispatch` event with the token
  `GITHUB_DISPATCH_TOKEN`. The acknowledgement goes back to Telegram in the HTTP response itself (the
  webhook reply method), which needs no bot token. The event also carries a proof: an HMAC, made
  with the webhook secret, valid for this order only and for two hours.
- **Door 3, the run.** The workflow runs only for a human on its list (the two founders' GitHub
  handles), checks the event again (known agent, whole-number ids, text cut), writes the order to a
  file, and runs Claude Code. The repo is public, so the order is never put in the workflow's `env` or
  `with:` (the runner prints both in the log), the answer never goes through the log, and the order
  file holds no Telegram id.
- **Door 4, the way back.** The last step of the run posts the outcome to the function with the
  proof. The function checks the proof, builds the message (fixed words, the agent's answer with
  every link that is not github.com, solscan.io or the site replaced by `[lien retiré]`, then the
  branch, the run and a warning if `main` moved) and posts it to the group with the ops bot's token.

**Why no Telegram secret is in GitHub.** On a hosted runner nothing inside the job that runs the agent
is a wall: code it runs can write files and leave a process behind, and the agent reads pages and
issues that anyone can write. A bot token in that job could be stolen, and with it a thief could post
in the official channel or capture your commands. So the ops bot's token lives in Vercel only. What a
stolen proof is worth: a few messages in the private group, from the ops bot, until it expires.

The "Reçu" in the group means GitHub accepted the event (HTTP 204). It does not prove that a
workflow ran: the `standard` workflow must be on `main`, and the first run is the real test.

## Commands

All of them work only for the founders, in the ops group. Telegram adds `@botname` by itself when
you pick a command from the menu; it is accepted. Accents and capitals do not matter (`/état`,
`/Releve`, `Économiste`).

| Command | Goes to | What it does |
| --- | --- | --- |
| `/faire <tâche>` | `chef-de-station` | The manager takes the task and calls the other agents when needed. The default for anything. |
| `/agent <nom> <tâche>` | the agent you name | Talk to one agent directly. A wrong name gets the list back. |
| `/releve [note]` | `releveur` | One reading of the chain and the diesel price, compared with `live.json`, with proposed light changes. Changes no file. |
| `/audit [note]` | `releveur` | The launch self-audit (`npm run audit`), line by line. Changes no file. |
| `/etat [note]` | `chef-de-station` | A status in at most 12 lines: now, next, blocked on a founder, waiting for the second key. Changes no file. |
| `/aide` | nobody | The list of commands and agents. |

The text after the command is the order. Up to 2 000 characters are kept (the reply says when it
cut); control characters and invisible direction marks are dropped. Examples to paste:

```
/etat
/releve regarde surtout le top 10
/faire prépare le brouillon du post de midi sur Mon Plein
/agent ligne-continue relis ce texte avant que je le publie : …
/agent critique-degen dis-moi ce que la scène en pensera
```

Anything else you type in the group is ignored on purpose, so you can talk to each other there.
Limits: ten orders per founder in ten minutes (kept in memory by each Vercel instance, so it is a
brake and not a wall); an update Telegram delivers twice is dispatched once.

### The agents

| Agent | What it is for |
| --- | --- |
| `chef-de-station` | Manager and dispatcher; go or no-go; the board. |
| `controleur-technique` | Security and on-chain red team; guards "never sign". |
| `ligne-continue` | French law and honesty gate before anything public. |
| `economiste` | Token economics, the weekly split, fee scenarios. |
| `enqueteur` | Fact-checker for every Tier 2 claim. |
| `critique-degen` | Taste: would the French scene share it. |
| `atelier-idees` | The brainstorm room; ranked ideas with the cheapest test. |
| `carrossier` | The site and its behaviour. |
| `mecano-chaine` | Solana read-only code: `api/chain.js`, the readers, the audit. |
| `automaticien` | Workflows, Telegram, schedules, secrets wiring. |
| `imprimeur` | Tickets, totem cards, visuals. |
| `pompiste` | French copy and community voice; drafts only. |
| `releveur` | Meter reader; the Sunday report. |
| `tresorier` | Friday and Saturday operator; the order for the multisig. |
| `vigie` | Scam and impersonation watch; the incident playbook. |

## What comes back

1. Within seconds, in the group: `Reçu, je transmets à economiste.` If the pipe is broken you get a
   plain sentence instead (token refused, repository not found, GitHub unreachable) and, for the first
   cases, "Rien n'est parti". If the sentence goes on with « Attention : la réponse ne reviendra pas
   ici », the order went but its answer cannot find its way back: `TELEGRAM_OPS_BOT_TOKEN` is missing
   in Vercel, or the site's address is not readable. Fix it before waiting for an answer.
2. Minutes later, from the ops bot, as a reply to your command: the agent's own answer (French, plain
   text, at most 15 lines, first line FAIT, BLOQUÉ or À DÉCIDER), then:
   - `Branche :` a GitHub link that opens the comparison, when the agent pushed a branch. On the phone,
     tap it, then "Create pull request" if the agent did not open one itself;
   - `Attention :` main moved while the order ran. Look at the link before anything else;
   - `Journal :` the run, for when something looks wrong.
3. A failed or timed-out run also reports, in one line. The agent gets 23 minutes; the job has 30, so
   the report still has time to go.

To merge from the phone: GitHub app, the pull request, wait for CI to be green, the other founder
approves, then Merge. The agents never merge or approve (see "Hard lines").

Orders run side by side, each on its own branch `claude/order-<run>-<attempt>`. A second order does not
see the first one's work until it is merged. GitHub keeps only one waiting run per queue and drops the
older ones silently, which is why the workflow does not queue.

**Reading a report safely.** A report is text written by an agent that read pages anyone can write.
Treat it like a message from a stranger who is usually right. Links that are not github.com,
solscan.io or the site are replaced by `[lien retiré]`, but a handle or a name can still be bait.
Never connect a wallet or sign from a link in a report: the multisig is something you open yourself,
from your own bookmark, and no agent ever asks you to sign anything.

## Setup, in order

Marked **phone** when it can be done from the Telegram, GitHub and Vercel apps or their sites in the
phone's browser, **laptop** when a terminal makes it much easier. Do the whole list once; it takes
about 30 minutes. Keep each token in your password manager as you go and never paste one into the chat
or into an issue.

Before you start, four things must already be true: `api/standard.js` is deployed by Vercel from
`main`; `.github/workflows/standard.yml` is on `main` (pushing a workflow file needs a token with the
`workflow` scope, so it ships in its own pull request); and `@claude` works (the Claude GitHub App is
installed and `CLAUDE_CODE_OAUTH_TOKEN` is set, see `salle-de-controle.md`, "Free setup of each
secret"). The fourth: in `standard.yml`, the job's list holds both founders' GitHub handles, `rpk0407` and
`axel9lg`, the same as in `claude.yml` and in `.github/CODEOWNERS`. Also turn on branch protection and code-owner review on `main` first: the
dispatch token below can write to the repository, and protection is what stops it from touching `main`.

### 1. The ops bot (phone)

1. In Telegram, open `@BotFather`, send `/newbot`. Give it a neutral name (for example "Le Standard
   PLEIN") and a username ending in `bot`. It answers with the token: this is `TELEGRAM_OPS_BOT_TOKEN`.
   Make a new bot even if the totem bot exists. The two have different jobs: the totem bot is an
   administrator of the public channel and its token is a GitHub secret for the scheduled workflows;
   the ops bot belongs to the private group and nothing else, never an administrator of the public
   channel, and its token goes to Vercel only. If one token leaks, the other does not open the channel.
2. Still with BotFather: `/setcommands`, pick the bot, and paste this block. It fills the menu that
   appears when you type `/` in the group:

   ```
   faire - Une tâche pour le chef de station
   agent - Parler à un agent : nom puis tâche
   releve - Un relevé de la chaîne et du prix
   audit - L'auto-audit du lancement
   etat - Où en est la station
   aide - La liste des commandes
   ```
3. Leave privacy mode as it is (on). In a group, a bot in privacy mode is always sent a command that
   names it (`/etat@<bot username>`), but a bare `/etat` only if it was the last bot to speak in that
   group (Telegram's bot features page). Keep this one bot in the ops group. Known gap: the scheduled
   workflows still post their alerts with the totem bot's token, so until `scripts/telegram.mjs` and
   those workflows take the ops bot's token too, the totem bot is also in the group; pick commands
   from the menu (Telegram adds the bot name by itself) or type `/etat@<bot username>`.

### 2. The public channel, once (phone)

Only for the totem and the posts, not for orders, and not with the ops bot. Create the channel, add the
totem bot as an administrator allowed to post, and keep its `@name` as `TELEGRAM_CHANNEL_ID`. Details:
`salle-de-controle.md`, "Free setup of each secret", Telegram.

### 3. The ops group (phone)

1. Create a **private** group with the two founders. Add the ops bot. Do not make it public or give it
   a username, and add nobody else.
2. Back in BotFather: `/setjoingroups`, pick the bot, **Disable**. It stops anyone else from adding
   your bot to other groups (it stays in this one).
3. If you ever convert the group to a supergroup or turn on topics, its id changes: redo step 4 and
   update the two places that hold it.

### 4. The three numbers: your two ids and the group's (phone)

Before the webhook exists, Telegram keeps the messages for the bot and a browser can read them. In
the group, each founder sends `/aide@<bot username>`. Then, once, in a private tab of the phone's
browser, open (with the ops bot's token from step 1):

```
https://api.telegram.org/bot<TELEGRAM_OPS_BOT_TOKEN>/getUpdates
```

Read the lines `"from":{"id":…` (one number per founder: these two go in `FOUNDER_TELEGRAM_IDS`,
separated by a comma) and `"chat":{"id":-100…` (the group, negative: `TELEGRAM_OPS_CHAT_ID`). An empty
result means send the command again (Telegram keeps updates 24 hours at most). The token is in that
address: close the tab and clear it from the history. This only works before step 9; once a webhook
is set, `getUpdates` answers an error.

### 5. The GitHub token for the bridge (phone)

On github.com, in the phone's browser: Settings, Developer settings, Personal access tokens,
**Fine-grained tokens**, Generate new token.

- Name `plein-standard`; resource owner: the account that owns the repository.
- Expiration: 90 days. Put the date in both founders' calendars: an expired token makes the bot answer
  "GitHub refuse le jeton (401)".
- Repository access: **Only select repositories**, the PLEIN repository.
- Permissions, Repository permissions: **Contents: Read and write**. Nothing else (Metadata read is
  added by itself). GitHub's documentation lists this as the permission the dispatch endpoint needs.
- Generate, copy the token once: this is `GITHUB_DISPATCH_TOKEN`.

The token belongs to one founder's own account, on purpose: the Claude action refuses a run started by
a bot account, and the workflow only runs for the two handles on its list, so make the token while
signed in as one of them. It can also write code to the repository, so it goes into Vercel only (not
into GitHub secrets, not into chat), and branch protection on `main` is its second lock. If the
repository moves to an organization, make a new token there and change `GITHUB_REPO`.

### 6. The webhook secret (phone)

Make 40 or more random characters with your password manager's generator, **letters and digits
only**: Telegram accepts `A-Z a-z 0-9 _ -`, 1 to 256 characters, and nothing else. This is
`TELEGRAM_WEBHOOK_SECRET`. It is the real lock on the door: ids are not secret, so whoever has this
secret can pretend to be a founder. It is also the key of the proofs that let a report through, so
whoever has it can make the ops bot post in the group.

### 7. Secrets in GitHub (phone)

Repository, Settings, Secrets and variables, Actions, New repository secret. One for this workflow, and
it exists already if `@claude` works:

| Secret | Value |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | from `claude setup-token` |

No Telegram value goes to GitHub for this workflow. The scheduled workflows have their own secrets
(`salle-de-controle.md`); the `standard` workflow never reads them.

### 8. Variables in Vercel (phone), then redeploy

Project, Settings, Environment Variables, for **Production** (tick "Sensitive" on the first three):

| Variable | Value |
| --- | --- |
| `TELEGRAM_WEBHOOK_SECRET` | step 6 |
| `GITHUB_DISPATCH_TOKEN` | step 5 |
| `TELEGRAM_OPS_BOT_TOKEN` | the ops bot's token, step 1 |
| `GITHUB_REPO` | `owner/name`, for example `rpk0407/PLEIN` |
| `FOUNDER_TELEGRAM_IDS` | the two ids, comma-separated |
| `TELEGRAM_OPS_CHAT_ID` | the group's id |

Vercel applies a variable only to **new** deployments: redeploy the latest production deployment
(Deployments, the three dots, Redeploy) after the last one.

### 9. Point Telegram at the function (phone or laptop)

Use the production address of the site (the custom domain or the project's `.vercel.app` alias), not a
per-deployment address, which may sit behind Vercel's login. Port 443 is what Telegram needs. The
report is posted to the same address, so the address you give Telegram is the one the way back uses.

Phone (the token and the secret end up in the browser history: use a private tab and clear it):

```
https://api.telegram.org/bot<TELEGRAM_OPS_BOT_TOKEN>/setWebhook?url=https://<site>/api/standard&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22message%22%5D&drop_pending_updates=true
```

Laptop (variables read from your password manager, nothing typed into the history):

```
curl -s "https://api.telegram.org/bot$TELEGRAM_OPS_BOT_TOKEN/setWebhook" -d url="https://<site>/api/standard" -d secret_token="$TELEGRAM_WEBHOOK_SECRET" -d 'allowed_updates=["message"]' -d drop_pending_updates=true
```

Telegram answers `{"ok":true,"result":true,"description":"Webhook was set"}`. Check with
`https://api.telegram.org/bot<TOKEN>/getWebhookInfo`: `url` is yours, `last_error_message` is absent,
`pending_update_count` is 0.

### 10. Test (phone)

In the group send `/aide@<bot username>` first. It always gets through, and the bot's answer (the list
of commands) makes it the last bot to have spoken, which is what lets a bare command reach it next.
Then send `/etat`. Expected: `Reçu, je transmets à chef-de-station.` within seconds (nothing after it
but the full stop; an « Attention » means a variable is missing), a run named `standard` in the
repository's Actions tab within a minute, and the status in the group a few minutes later, as a reply
to your `/etat`. Last, to see the refusal, send a command from a second Telegram account that is not in
the group (nothing should happen). If `/etat` gets no reply and no error, type `/etat@<bot username>`.

### Try the door on a laptop, before any of this

Nothing leaves the machine while `GITHUB_DISPATCH_TOKEN` is unset, so this is safe to run with made-up
values: start `npm run dev` with `TELEGRAM_WEBHOOK_SECRET`, `FOUNDER_TELEGRAM_IDS=111111111` and
`TELEGRAM_OPS_CHAT_ID=-1001234567890` set to anything, then:

```
curl -s -X POST localhost:3000/api/standard -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" -H "content-type: application/json" -d '{"update_id":1,"message":{"message_id":7,"from":{"id":111111111,"is_bot":false},"chat":{"id":-1001234567890},"text":"/aide"}}'
```

You get back the JSON Telegram would turn into a message (the list of commands). Without the header you
get a 401; with another sender id, a silent `{"ok":true}`. `npm test` runs the same checks offline,
including the way back with a stand-in for Telegram.

## If it does not work

| You see | Cause | Fix |
| --- | --- | --- |
| Nothing at all, `getWebhookInfo` shows `last_error_message` "401" | The secret in Vercel is not the one given to `setWebhook` | Same value in both; redeploy; run `setWebhook` again |
| "503" in `last_error_message` | `TELEGRAM_WEBHOOK_SECRET` missing in Production, or Vercel not redeployed since you added it | Add it, redeploy |
| "404", "403" or a login page in `last_error_message` | Wrong address, function not deployed, or a per-deployment address behind Vercel's login | Use the production address ending in `/api/standard` |
| `getUpdates` answers 409 | A webhook is set | Expected after step 9 |
| No reply, no error | A bare `/etat` was not delivered: in privacy mode a bare command reaches the bot only if it was the last bot to speak in the group | Type `/etat@<bot username>`, or pick the command from the menu, or send `/aide@<bot username>` first |
| No reply, `last_error_message` empty | Your id or the group id is not the one in Vercel, the message is a forward, or it is not a command | Redo step 4 and compare; type the command, do not forward it |
| "Le pont vers GitHub n'est pas réglé" | `GITHUB_DISPATCH_TOKEN` or `GITHUB_REPO` missing or malformed | Fix in Vercel, redeploy |
| "GitHub refuse le jeton (401)" | Token expired, revoked or pasted with a typo | Make a new token (step 5), replace it, redeploy |
| "GitHub refuse l'envoi (403)" | The token lacks Contents: Read and write, or GitHub is rate-limiting | Check the token's permissions |
| "GitHub ne trouve pas le dépôt (404)" | `GITHUB_REPO` is wrong, or the token was not given this repository | Fix the name; edit the token's repository access |
| « Reçu » then « Attention : la réponse ne reviendra pas ici » | `TELEGRAM_OPS_BOT_TOKEN` is missing in Vercel, or the site's address is not a public name | Add the variable, redeploy; use the production address in step 9 |
| "Reçu" but no run in Actions | `standard.yml` is not on the default branch yet, or Actions is disabled | Merge the workflow; Settings, Actions, General |
| "Reçu", a run appears but is skipped | The dispatch token's owner is not on the job's list (`rpk0407`, `axel9lg`): the token was made by another account | Make the token as one of the two founders |
| A run starts and fails at "Carry out the order" | The Claude GitHub App is not installed on the repository, or `CLAUDE_CODE_OAUTH_TOKEN` is missing or expired | `salle-de-controle.md`, setup of `@claude` |
| The run ends, nothing arrives in the group, and the last step says "Outcome not delivered (…)" | The number is the site's answer: 401 the proof is refused (the webhook secret changed during the run), 410 the proof expired (the run waited over two hours), 400 the report was malformed, 429 too many reports for this order, 502 Telegram refused the message (the bot left the group), 503 `TELEGRAM_OPS_BOT_TOKEN` or `GITHUB_REPO` missing in Vercel | Fix the cause; the order's work is on its branch anyway |
| The last step says "nothing sent" | The order did not come through the switchboard (a dispatch made by hand or by another token) so it has no proof | Expected; send the order from the group |
| `Attention : main a bougé` | Either a founder merged during the run, or the commit tool wrote to `main` | Open the link. If an agent's commit is on `main`, tell the other founder and fix branch protection |

## Rotating and removing

- **A founder loses a phone or leaves:** remove the id from `FOUNDER_TELEGRAM_IDS`, redeploy, remove them
  from the group.
- **The webhook secret leaks:** new value in Vercel, redeploy, run `setWebhook` again with it. Until
  then, anyone holding it could pretend to be a founder and make the ops bot post in the group.
- **The dispatch token leaks or expires:** revoke it in GitHub, make a new one, replace it in Vercel,
  redeploy.
- **The ops bot's token leaks:** BotFather, `/revoke`, then update `TELEGRAM_OPS_BOT_TOKEN` in Vercel and
  redeploy (the webhook stays set). The totem bot's token is a different one.
- **Stop the bridge at once:** `https://api.telegram.org/bot<TOKEN>/deleteWebhook`, or disable the
  `standard` workflow in the Actions tab, or delete `GITHUB_DISPATCH_TOKEN` in Vercel.

## The event, as GitHub receives it

The only body `api/standard.js` sends (eight properties; GitHub allows ten and 64 KB). The last three
are the way back; `report_mac` here is made up:

```json
{
  "event_type": "station-order",
  "client_payload": {
    "agent": "economiste",
    "text": "relis le barème des frais",
    "from": 111111111,
    "chat_id": -1001234567890,
    "message_id": 41,
    "report_url": "https://<site>/api/standard",
    "report_until": 1760007200,
    "report_mac": "3f9a1c0b7d2e4a583f9a1c0b7d2e4a583f9a1c0b7d2e4a583f9a1c0b7d2e4a58"
  }
}
```

`from` is the founder's Telegram user id, `chat_id` the group, `message_id` the command message (the
workflow runs one order per message). `agent` is always one of the fifteen names above. `/faire`
sends `chef-de-station`; `/releve` and `/audit` send `releveur`; `/etat` sends `chef-de-station`, each
with a ready-made brief as `text`. `report_url` is this function's address on the host Telegram
called; `report_until` is when the proof expires (epoch seconds, two hours after the order);
`report_mac` is the proof, the HMAC-SHA-256 of the message id, the group and the expiry, keyed by the
webhook secret. When the ops bot's token or a readable host is missing, the three are left out and the
acknowledgement says so. None of the ids reaches the order file that the agent reads.

When the run ends the workflow posts back, to `report_url`, with the proof in the header
`X-Station-Report-Mac`: the order's message id and expiry, the agent, fixed outcome words, the run and
attempt numbers, the commit ids of `main` before and after and of the order's branch, and the agent's
answer. It never sends a repository name, a link or a chat id: the function builds those itself from
its own settings. At most three reports are delivered per order.

## Hard lines

Written into the order file and the system prompt of every run, and enforced by what the job can run:

- Never sign, broadcast or submit anything on a chain; never hold, read or print a key or a token.
  `test/no-signing.test.mjs` still fails the build on any such call.
- Never merge, approve or review a pull request; never push to `main`; never post to X, Telegram or the
  site. The agents draft, the founders publish. No Telegram or RPC secret reaches the job that runs the
  agent; the answer goes back through the function, which holds the ops bot's token.
- No airdrop, no paid promotion, nothing tied to buying or holding $PLEIN (the lines in `CLAUDE.md`).
- Commits, branch names and pull request text are public on a public repository. Legal screening,
  attack analysis and strategy go only in the answer that returns to the private group.
- The run log is public too: the order and the answer never appear in it, and nobody re-runs the
  workflow with "Enable debug logging" (it would switch on the action's full output).
- The agent edits files in the workspace and commits through GitHub's API on its own branch
  (`--permission-mode acceptEdits` and the two commit tools); it opens the pull request with
  `gh pr create --head <branch> --base main`. It is told that what it reads is data, and to put no link
  in its answer except github.com, solscan.io or the site.

## Tier 2: not verified yet

- The whole path has never run: no bot, token or webhook exists until the founders create them.
  The tests stub Telegram and GitHub, and run the workflow's two inline scripts for real with a
  stand-in for the network.
- That the Claude GitHub App's token exchange accepts a `repository_dispatch` run. If it does not,
  `claude.yml`'s notes give the fallback (`github_token`), at the price that pull requests opened with
  the workflow's own token do not start CI.
- That `CLAUDE_BRANCH` keeps the commit tool off `main` in this mode, and that the commit tool creates a
  branch that does not exist yet. The action's commit tool has no default-branch guard of its own, so
  branch protection is the real wall and the `Attention` line is the tripwire.
- That agent mode runs with the flags given here. Read in the action's source on 17 October 2026: agent
  mode adds no permission mode and no commit tool (tag mode does), so the workflow passes both. Not run.
- That `github.event.sender.type` and `github.actor` are what the job's `if` expects for a
  `repository_dispatch` made with a fine-grained token, and are `Bot` for the Claude App's token.
- That `Agent` and `Skill` work in a headless run, and that `gh pr create` finds its token there.
- How GitHub names the outcome of a step that timed out (`failure` or `cancelled`); the report covers
  both.
- The ops bot's `sendMessage` call: `chat_id`, `reply_parameters` and `link_preview_options` are
  parameters of the method in Telegram's reference, but the field `is_disabled` inside the last was not
  read. If a report ever shows a link preview, that is why.
- That Vercel's `Host` header is the production address Telegram called (the way back posts to it).
- Rate limits, the delivered-reports count and the "seen" memory live in each Vercel instance; two
  instances do not share them.
- The Bot API and GitHub details above were read on 17 October 2026 from Telegram's `setWebhook`
  documentation and bot features page (privacy mode) and GitHub's REST reference for repository
  dispatch; re-read them if a call changes.

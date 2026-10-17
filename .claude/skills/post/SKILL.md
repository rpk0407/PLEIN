---
name: post
description: Prepare a public post for X and Telegram. pompiste drafts, ligne-continue gates, critique-degen checks taste, the founder gets an X intent link and a Telegram button. Nothing is posted by an agent.
argument-hint: "<what to say and why, e.g. 'launch post' | 'ticket 1' | 'answer to the fee FUD'>"
disable-model-invocation: true
---

# /post: draft, gate, hand to a founder

Brief: $ARGUMENTS

## 1. Facts first
List every fact and number the post will state, each with its source: a live reading
(`npm run releve -- --json`, with `asOf`), a ticket, `public/config.js`, `public/live.json`. A fact
with no source is dropped or sent to `enqueteur`. The contract is quoted only from `live.json`, and
only after the station is open.

## 2. Draft
Call `pompiste` with the brief and the fact list. It returns two or three French variants with
character counts and a source note per number, typographically correct (non-breaking spaces).

## 3. Gate (Opus)
Call `ligne-continue` on the variants. PASS, PASS-WITH-EDITS (apply its rewrite exactly) or BLOCK.
On BLOCK, stop and show the founders the reason; do not route around it. Then, for X, call
`critique-degen` for taste and the FUD forecast; apply its cuts, and re-run `ligne-continue` on the
final text if anything changed. No gate result, no post.

## 4. Prepare the hand-off
- **X:** build the intent link with the final text URL-encoded:
  `https://x.com/intent/post?text=<encoded text>` (Tier 2: confirm it opens the composer; the
  older `https://twitter.com/intent/tweet?text=` form redirects). Give the plain text too, to paste.
  The founder opens it logged in as the station account, never a personal one, reads it, and presses Post.
- **Telegram:** the simplest route is the founder pasting the final text into the channel by hand
  as its admin. If a Telegram workflow button exists (`gh workflow list`), name it and its inputs.
  Otherwise give the command `node scripts/telegram.mjs --channel --text "..."`, which only prints
  unless the Telegram secrets are in the founder's environment. The founder sends; the agent does not.
  The scheduled 08:00 `totem` workflow posts its own caption: do not duplicate it.
- A reply to a person: give the text only. Replying is the founder's decision.

## 5. Report
Final text, gate result, what the founder must do and where, and what to watch after posting
(`vigie`, replies). Keep the final text and the gate's verdict line in the issue or PR for the
record; the gate's reasoning and any question for the lawyer stay with the founders (the repo is public).
Never post, never contact an influencer, never offer anything of value in return for a post.

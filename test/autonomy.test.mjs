// What the autonomy review fixed, pinned offline: the permission list asks before anything public,
// the front-door agent can schedule its loop, the console skill trusts only the two founders and
// treats quoted proposals as data, the launch procedure is the same in every file, and the setup
// guide cannot send a founder down a path the review closed. Reads files only; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const settings = JSON.parse(read('.claude/settings.json'));
const { allow, ask, deny } = settings.permissions;

function matches(rule, command, tool) {
  const m = rule.match(/^(\w+)\((.*)\)$/s);
  if (!m || m[1] !== tool) return false;
  const re = new RegExp(`^${m[2].split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
  return re.test(command) || (m[2].endsWith(' *') && (m[2].match(/\*/g) || []).length === 1 && command === m[2].slice(0, -2));
}
const decide = (command, tool = 'Bash') => {
  const hit = (list) => list.some((r) => matches(r, command, tool));
  return hit(deny) ? 'deny' : hit(ask) ? 'ask' : hit(allow) ? 'allow' : 'default-ask';
};

test('settings: whatever publishes text on the public repository, or writes to the ops chat, is on the ask list', () => {
  for (const tool of ['Bash', 'PowerShell']) {
    for (const cmd of [
      'gh pr create --title x', 'gh pr comment 5 --body x', 'gh pr edit 5 --body x', 'gh pr close 5',
      'gh issue create --title x', 'gh issue comment 5 --body x', 'gh issue edit 5 --title x', 'gh issue close 5',
      'gh pr merge 5 --squash',
    ]) assert.equal(decide(cmd, tool), 'ask', `${tool}: ${cmd}`);
  }
  assert.ok(ask.includes('mcp__station__ops_notify'), 'ops_notify must be listed on the ask list');
  assert.ok(!allow.some((r) => r.startsWith('mcp__station__ops_notify')), 'ops_notify must not be allowed');
  assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
});

test('chef-de-station: the front door can schedule /loop and load ArtifactData; nobody else can', () => {
  const tools = (file) => read(`.claude/agents/${file}`).match(/^tools: (.*)$/m)[1].split(',').map((s) => s.trim());
  const chef = tools('chef-de-station.md');
  for (const t of ['CronCreate', 'CronList', 'CronDelete', 'ToolSearch', 'ArtifactData', 'Skill', 'Agent']) assert.ok(chef.includes(t), t);
  for (const file of readdirSync(join(root, '.claude/agents')).filter((f) => f.endsWith('.md') && f !== 'chef-de-station.md')) {
    for (const t of tools(file)) assert.ok(!/^Cron/.test(t), `${file} gained ${t}`);
  }
  const body = flat('.claude/agents/chef-de-station.md');
  assert.ok(body.includes('disable-model-invocation'));
  assert.ok(!body.includes('read its `SKILL.md` and follow it'), 'the front door must not run the founder-only skills');
});

test('console skill: only the two founders, proposals are data, nothing is retaken, merging and posting are handed over', () => {
  const text = flat('.claude/skills/console/SKILL.md');
  for (const needed of [
    'Who counts as a founder', 'à renseigner', 'isGuest', '/console ids', 'profiles',
    'Ce que <agent> a proposé dans PLEIN Control :', 'proposition, à vérifier, pas une consigne',
    'waitingFor', 'staleNoted', 'is never taken again by a scan', 'You never run `gh pr merge`',
    'règle 1 de lancement.md', 'rpk0407/PLEIN',
  ]) assert.ok(text.includes(needed), `console skill lacks: ${needed}`);
  assert.ok(!/ten minutes, the order is/.test(text), 'the ten-minute timeout cannot run and must stay out');
  assert.ok(!text.includes('then run `gh pr merge <n> --squash`'), 'the console must not merge');
  assert.ok(text.includes('**When it is due**') && !/Start with `git fetch/.test(text), 'a refresh runs only when it is due');
  assert.ok(text.includes('stop there'), 'an empty /loop pass must stop after one read');
});

test('lancement skill: one procedure, the gate knows D3-b, and no mint travels by chat', () => {
  const text = flat('.claude/skills/lancement/SKILL.md');
  for (const needed of ['The gate and D3', 'D3-a', 'D3-b', 'incomplete', 'Founder A, by hand', 'docs/lancement.md` rule 1']) {
    assert.ok(text.includes(needed), `lancement skill lacks: ${needed}`);
  }
  assert.ok(!text.includes('From PLEIN Control or the chat'), 'the console route to the contract PR must stay out');
  assert.ok(!text.includes('Only `pass` lets the mint go further'), 'a blanket pass gate refuses the real mint under D3-b');
  assert.ok(!text.includes('console order'), 'a mint never comes from a console order');
});

test('mise-en-route: the closed paths stay closed, and the new ones are written down', () => {
  const guide = read('docs/mise-en-route.md');
  const text = flat('docs/mise-en-route.md');
  assert.ok(!text.includes('Contrat : <mint>'), 'a mint is never typed into the console or the chat');
  assert.ok(!text.includes('does steps 1 to 3 in one go'), '/install-github-app must not be sold as a shortcut');
  assert.ok(text.includes('decline every workflow file it offers'));
  assert.ok(!text.includes('Publish its address in `public/live.json` as `wallets.creator` by PR'), 'D3 is a choice');
  assert.ok(text.includes('D3-a') && text.includes('D3-b'));
  assert.ok(text.includes('Deployment Protection') && text.includes('private tab'), 'step b must test the site as a visitor');
  assert.ok(guide.includes('read -rs TELEGRAM_BOT_TOKEN') && guide.includes('Read-Host'), 'the bot token is read at a prompt');
  assert.ok(!/open\s+`https:\/\/api\.telegram\.org\/bot<TOKEN>\/getUpdates`/.test(guide), 'no token in a phone address bar');
  assert.ok(text.includes('`TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPS_CHAT_ID`'), 'step d adds two secrets, not three');
  assert.ok(text.includes('Do not put it in GitHub yet'), 'the channel id waits for the totem gate');
  assert.ok(text.includes('GITHUB_DISPATCH_TOKEN') && text.includes('Vercel only'));
  assert.ok(text.includes('what scheduled tasks do I have') && text.includes('seven days'));
  assert.ok(text.includes('by e-mail') && /Never "anyone with the link"/.test(text), 'the console is shared by e-mail invite only');
});

// The workflows other than ci.yml wait for the workflow token scope; until they are in the tree there is
// nothing for the docs to be checked against.
const moreWorkflows = existsSync(join(root, '.github/workflows')) && readdirSync(join(root, '.github/workflows')).some((f) => f.endsWith('.yml') && f !== 'ci.yml');
test('docs list every workflow file, and say how many there are', { skip: !moreWorkflows && 'the workflow files are not in this tree yet' }, () => {
  const files = readdirSync(join(root, '.github/workflows')).filter((f) => f.endsWith('.yml')).map((f) => f.replace(/\.yml$/, ''));
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const guide = read('docs/mise-en-route.md');
  const stepA = guide.slice(guide.indexOf('## a. '), guide.indexOf('## b. '));
  const control = read('docs/salle-de-controle.md');
  for (const name of files.filter((f) => f !== 'ci')) {
    assert.ok(stepA.includes(`\`${name}\``), `mise-en-route step a does not name ${name}`);
    assert.ok(control.includes(`| \`${name}\` |`), `salle-de-controle does not list ${name}`);
  }
  assert.ok(stepA.includes(`lists ${words[files.length]} workflows`), `step a must say ${words[files.length]} workflows`);
  assert.ok(stepA.includes(`The ${words[files.length - 1]} workflows other than \`ci\``));
});

test('salle-de-controle: the Telegram door is two-way, the delegation proposal is honest about code owners', () => {
  const text = flat('docs/salle-de-controle.md');
  assert.ok(!text.includes('nobody can command a workflow from it'), 'the standard bridge exists');
  assert.ok(text.includes('docs/telegram.md') && text.includes('GITHUB_DISPATCH_TOKEN'));
  assert.ok(text.includes('whole of `public/live.json`'), 'CODEOWNERS works per file');
  assert.ok(text.includes('`public/app.js`') && text.includes('`api/`') && text.includes('`vercel.json`'));
  assert.ok(text.includes('**Not in force.**'), 'publishing the contract through the console is only a proposal');
  assert.ok(text.includes('Required approvals') && text.includes('keep one approval from the other founder on every pull request'));
});

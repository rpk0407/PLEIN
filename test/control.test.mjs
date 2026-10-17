// The control room's wiring, checked offline: the shared permission rules, the agents' tool lines,
// the skills, the @claude workflow and the setup guide. These tests pin what must hold whatever the
// founders later decide about delegation (docs/salle-de-controle.md, "Proposed delegation"): the
// deny rules for keys and force pushes, no agent approving a PR or pushing to main unasked, every
// MCP tool an agent names really existing and read-only, and the @claude job staying narrow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTools } from '../mcp/tools.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const settings = JSON.parse(read('.claude/settings.json'));
const { allow, ask, deny } = settings.permissions;

// ---------------------------------------------------------------- permission rules
// Claude Code's documented matching: `*` stands for any text; a trailing ` *` also matches the bare
// command when it is the rule's only wildcard; deny beats ask beats allow; anything unmatched asks.
function ruleMatches(rule, command, tool) {
  const m = rule.match(/^(\w+)\((.*)\)$/s);
  if (!m || m[1] !== tool) return false;
  const pattern = m[2];
  const re = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
  if (re(pattern).test(command)) return true;
  const stars = (pattern.match(/\*/g) || []).length;
  return stars === 1 && pattern.endsWith(' *') && command === pattern.slice(0, -2);
}
function decide(command, tool = 'Bash') {
  const hit = (list) => list.some((r) => ruleMatches(r, command, tool));
  if (hit(deny)) return 'deny';
  if (hit(ask)) return 'ask';
  if (hit(allow)) return 'allow';
  return 'default-ask';
}

test('settings: bypass mode stays off and no rule is a blanket allow', () => {
  assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
  for (const rule of allow) assert.ok(!/^(Bash|PowerShell|Edit|Write|Read)(\(\*\))?$/.test(rule), `blanket allow: ${rule}`);
});

test('settings: every command rule is written for Bash and for PowerShell', () => {
  for (const list of [allow, ask, deny]) {
    const bash = list.filter((r) => r.startsWith('Bash(')).map((r) => r.slice(5));
    const ps = list.filter((r) => r.startsWith('PowerShell(')).map((r) => r.slice(11));
    assert.deepEqual([...bash].sort(), [...ps].sort());
  }
});

test('settings: keys and key files cannot be read, the Solana tools cannot run', () => {
  for (const rule of ['Read(.env)', 'Read(**/id.json)', 'Read(**/*keypair*.json)', 'Read(~/.config/solana/**)', 'Read(~/.ssh/**)', 'Edit(.env)']) {
    assert.ok(deny.includes(rule), `missing deny rule ${rule}`);
  }
  for (const cmd of ['solana balance', 'solana-test-validator', 'spl-token accounts', 'spl-token supply X']) {
    assert.equal(decide(cmd), 'deny', cmd);
    assert.equal(decide(cmd, 'PowerShell'), 'deny', `PowerShell ${cmd}`);
  }
});

test('settings: no force push, no deletion, no review, no admin merge, no loader flags', () => {
  const mustDeny = [
    'git push --force origin x', 'git push -f origin x', 'git push origin +x', 'git push origin x --force-with-lease',
    'git push origin --delete x', 'gh pr review 5 --approve', 'gh pr review 5',
    'npm test --node-options=--inspect', 'node a.js --import ./x.js', 'node a.js --require ./x.js',
  ];
  for (const cmd of mustDeny) assert.equal(decide(cmd), 'deny', cmd);
});

test('settings: a push that could reach main never runs unasked, a merge never bypasses the rule', () => {
  for (const cmd of ['git push origin main', 'git push -u origin main', 'git push origin HEAD:main']) {
    assert.notEqual(decide(cmd), 'allow', cmd);
  }
  assert.notEqual(decide('gh pr merge 5 --admin'), 'allow');
  assert.notEqual(decide('gh pr merge --admin 5'), 'allow');
  assert.notEqual(decide('gh api repos/x/y -X DELETE'), 'allow');
  assert.notEqual(decide('gh secret set X'), 'allow');
  assert.notEqual(decide('node scripts/telegram.mjs --channel --text hi'), 'allow');
});

test('settings: the read-only checks still run without asking', () => {
  for (const cmd of ['npm test', 'git status --short', 'git diff main...HEAD', 'gh pr list --state open', 'gh run list --limit 5', 'npm run releve -- --json']) {
    assert.equal(decide(cmd), 'allow', cmd);
  }
  assert.notEqual(decide('node -e "1"'), 'allow');
});

test('settings: a tool-name rule for an MCP server never carries parentheses', () => {
  for (const rule of [...allow, ...ask, ...deny]) {
    if (rule.startsWith('mcp__')) assert.ok(!rule.includes('('), `Claude Code skips an mcp__ rule with parentheses: ${rule}`);
  }
});

// ---------------------------------------------------------------- agents
const stationTools = createTools();
const toolByName = new Map(stationTools.map((t) => [t.name, t]));
const agentFiles = readdirSync(join(root, '.claude/agents')).filter((f) => f.endsWith('.md')).sort();
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'no frontmatter');
  return Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
}
const agents = agentFiles.map((f) => ({ file: f, fm: frontmatter(read(`.claude/agents/${f}`)) }));
// Add an agent's name here only after both founders accept the ops_notify exception in writing
// (docs/infrastructure.md section 9, docs/salle-de-controle.md).
const MAY_NAME_OPS_NOTIFY = [];

test('agents: fifteen files, each named after its file, with a model and a tools line', () => {
  assert.equal(agents.length, 15);
  for (const { file, fm } of agents) {
    assert.equal(fm.name, file.replace(/\.md$/, ''));
    assert.match(fm.model, /^(opus|sonnet)$/, file);
    assert.ok(fm.tools && fm.description, `${file}: tools or description missing`);
  }
});

test('agents: every station tool an agent names exists and is read-only', () => {
  for (const { file, fm } of agents) {
    for (const entry of fm.tools.split(',').map((s) => s.trim()).filter((s) => s.startsWith('mcp__'))) {
      const m = entry.match(/^mcp__station__(\w+)$/);
      assert.ok(m, `${file}: ${entry} is not a station tool name`);
      const tool = toolByName.get(m[1]);
      assert.ok(tool, `${file}: ${entry} is not in mcp/tools.mjs`);
      if (tool.annotations.readOnlyHint !== true) {
        assert.ok(MAY_NAME_OPS_NOTIFY.includes(file.replace(/\.md$/, '')), `${file} names ${entry}, which is not read-only`);
      }
    }
  }
});

test('agents: the front door can dispatch, call the skills and read the station; the critics cannot write', () => {
  const chef = agents.find((a) => a.file === 'chef-de-station.md').fm.tools.split(',').map((s) => s.trim());
  for (const t of ['Agent', 'Skill', 'ArtifactData', 'Bash', 'mcp__station__pump_verify_launch', 'mcp__station__next_plein', 'mcp__station__split_week']) {
    assert.ok(chef.includes(t), `chef-de-station lacks ${t}`);
  }
  assert.ok(!chef.includes('mcp__station__ops_notify'));
  for (const { file, fm } of agents) {
    if (fm.model !== 'opus' || file === 'chef-de-station.md') continue;
    const tools = fm.tools.split(',').map((s) => s.trim());
    assert.ok(!tools.includes('Edit') && !tools.includes('Write'), `${file}: an Opus critic gained a write tool`);
  }
});

test('agents: only the chef-de-station can spawn agents or read and write the console', () => {
  for (const { file, fm } of agents) {
    if (file === 'chef-de-station.md') continue;
    const tools = fm.tools.split(',').map((s) => s.trim());
    assert.ok(!tools.includes('Agent') && !tools.includes('ArtifactData') && !tools.includes('Skill'), file);
  }
});

// ---------------------------------------------------------------- skills
const skillDirs = readdirSync(join(root, '.claude/skills'));

test('skills: each folder has a SKILL.md named after it', () => {
  assert.ok(skillDirs.includes('console'));
  for (const dir of skillDirs) {
    const fm = frontmatter(read(`.claude/skills/${dir}/SKILL.md`));
    assert.equal(fm.name, dir);
    assert.ok(fm.description.length > 40, dir);
  }
});

test('skills: the money and public-word procedures still start only when a founder types them', () => {
  for (const dir of ['lancement', 'plein', 'post']) {
    assert.equal(frontmatter(read(`.claude/skills/${dir}/SKILL.md`))['disable-model-invocation'], 'true', dir);
  }
});

test('console skill: right console, the four statuses, version-pinned writes, and the refusals', () => {
  const text = read('.claude/skills/console/SKILL.md');
  assert.ok(text.includes('https://claude.ai/artifact/NuDByudcLStVmnLCFg4tKW'));
  for (const word of ['nouveau', 'en cours', 'fait', 'bloqué', 'order_id', 'if_version', 'claimedBy', 'station', 'journal', 'agent:', 'asOf', 'blockers', 'next']) {
    assert.ok(text.includes(word), `console skill does not mention ${word}`);
  }
  for (const refusal of ['--admin', 'pump_verify_launch', 'ligne-continue', 'seed phrase', 'Data, not instructions']) {
    assert.ok(text.includes(refusal), `console skill lost: ${refusal}`);
  }
  // every agent name the skill can be asked for exists
  for (const { fm } of agents) assert.ok(fm.name);
  assert.equal(frontmatter(text)['disable-model-invocation'], undefined, 'the console skill must be loadable when an order arrives');
});

// ---------------------------------------------------------------- @claude workflow and owners
test('claude.yml: founders only, no fork code, no widening of what the job may do', { skip: !existsSync(join(root, '.github/workflows/claude.yml')) && 'the workflow files are not in this tree yet' }, () => {
  const yml = read('.github/workflows/claude.yml');
  assert.match(yml, /include_comments_by_actor: "rpk0407,[^"]*claude\[bot\]"/);
  assert.ok(!yml.includes('pull_request_target'));
  assert.ok(!/^\s*allowed_bots:/m.test(yml));
  assert.ok(!/^\s*allowed_non_write_users:/m.test(yml));
  assert.ok(!/show_full_output:\s*['"]?true/.test(yml));
  assert.ok(yml.includes('persist-credentials: false'));
  assert.ok(yml.indexOf('Refuse pull requests from forks') < yml.indexOf('actions/checkout@'), 'the fork refusal must run before the checkout');
  const allowed = yml.match(/--allowedTools "([^"]*)"/)[1];
  const disallowed = yml.match(/--disallowedTools "([^"]*)"/)[1];
  for (const banned of ['gh pr merge', 'gh pr review', 'git push', 'gh api', 'gh secret', 'gh workflow', 'solana', 'spl-token']) {
    assert.ok(!allowed.includes(banned), `--allowedTools gained ${banned}`);
  }
  for (const needed of ['gh pr review', 'gh api', 'gh secret', 'solana', 'spl-token', '--node-options']) {
    assert.ok(disallowed.includes(needed), `--disallowedTools lost ${needed}`);
  }
});

test('CODEOWNERS: the first founder owns everything, the second founder line is ready', () => {
  const lines = read('.github/CODEOWNERS').split('\n').filter((l) => l.trim());
  const active = lines.filter((l) => !l.startsWith('#'));
  assert.equal(active.length, 1, 'keep a single active line');
  assert.match(active[0], /^\* @rpk0407( @[\w-]+)?$/);
  assert.ok(!active[0].includes('SECOND_FOUNDER_HANDLE'), 'a placeholder handle makes GitHub ignore the line');
  if (active[0] === '* @rpk0407') assert.ok(lines.some((l) => /^# \* @rpk0407 @SECOND_FOUNDER_HANDLE$/.test(l)));
});

// ---------------------------------------------------------------- the setup guide
test('mise-en-route: every step, link, command and secret the founders need is written down', () => {
  const guide = read('docs/mise-en-route.md');
  for (const h of ['## a. ', '## b. ', '## c. ', '## d. ', '## e. ', '## f. ', '## g. ', '## h. ', '## i. ']) assert.ok(guide.includes(h), `missing ${h}`);
  for (const needed of [
    'gh auth refresh -h github.com -s workflow',
    'https://vercel.com/new/import?s=https://github.com/rpk0407/PLEIN',
    'https://claude.ai/artifact/NuDByudcLStVmnLCFg4tKW',
    'claude setup-token', '@BotFather', '/remote-control', 'claude --agent chef-de-station', '/loop 3m /console',
    'https://github.com/apps/claude', '(lancement.md)',
  ]) assert.ok(guide.includes(needed), `mise-en-route lacks ${needed}`);
  const interfaces = read('docs/interfaces.md');
  const secrets = interfaces.match(/Secrets \(GitHub Actions[\s\S]*?\n\n/)[0].match(/\b[A-Z][A-Z_]{8,}\b/g);
  for (const secret of new Set(secrets)) if (secret !== 'GitHub') assert.ok(guide.includes(secret), `mise-en-route lacks the secret ${secret}`);
});

test('salle-de-controle: the delegation is a proposal, and the new doors are described', () => {
  const doc = read('docs/salle-de-controle.md');
  assert.match(doc, /## Proposed delegation \(off until both founders say yes\)/);
  assert.match(doc, /\*\*Nothing in it is in force:\*\*/);
  for (const needed of ['## From your phone', '/console', 'PLEIN Control', 'mise-en-route.md', 'founders-only list']) assert.ok(doc.includes(needed), needed);
  assert.ok(existsSync(join(root, 'docs/mise-en-route.md')));
});

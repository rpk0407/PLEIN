// The MCP protocol core: handshake, listing, calls, errors, stdio framing. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { checkArgs, createServer, serveStdio } from '../mcp/_core.mjs';

const server = createServer({
  name: 'test-station',
  version: '0.0.1',
  instructions: 'read-only',
  tools: [
    {
      name: 'double',
      description: 'doubles a number',
      inputSchema: { type: 'object', properties: { n: { type: 'number', minimum: 0 } }, required: ['n'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      run: ({ n }) => ({ value: n * 2 }),
    },
    { name: 'text', description: 'returns text', run: () => 'bonjour' },
    { name: 'broken', description: 'throws', run: () => { throw new Error('feed down'); } },
  ],
});

test('initialize echoes a supported protocol version and falls back otherwise', async () => {
  const a = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(a.result.protocolVersion, '2025-03-26');
  assert.deepEqual(a.result.capabilities, { tools: { listChanged: false } });
  assert.equal(a.result.serverInfo.name, 'test-station');
  assert.equal(a.result.instructions, 'read-only');
  const b = await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(b.result.protocolVersion, '2025-06-18');
});

test('notifications get no answer; unknown methods and bad messages get JSON-RPC errors', async () => {
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).error.code, -32601);
  assert.equal((await server.handle({ id: 4, method: 'ping' })).error.code, -32600);
  assert.deepEqual((await server.handle({ jsonrpc: '2.0', id: 5, method: 'ping' })).result, {});
});

test('tools/list hides the run functions and fills a default input schema', async () => {
  const { result } = await server.handle({ jsonrpc: '2.0', id: 6, method: 'tools/list' });
  assert.deepEqual(result.tools.map((t) => t.name), ['double', 'text', 'broken']);
  assert.ok(result.tools.every((t) => !('run' in t) && t.inputSchema.type === 'object'));
});

test('tools/call returns text plus structured content, and tool errors as isError results', async () => {
  const call = (name, args) => server.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } });
  const doubled = (await call('double', { n: 21 })).result;
  assert.deepEqual(doubled.structuredContent, { value: 42 });
  assert.deepEqual(JSON.parse(doubled.content[0].text), { value: 42 });
  assert.deepEqual((await call('text')).result, { content: [{ type: 'text', text: 'bonjour' }] });
  const thrown = (await call('broken')).result;
  assert.equal(thrown.isError, true);
  assert.match(thrown.content[0].text, /feed down/);
  assert.equal((await call('double', { n: -1 })).result.isError, true);
  assert.equal((await call('nope')).error.code, -32602);
});

test('argument checks cover required, type, enum, bounds, length and unknown keys', () => {
  const schema = {
    properties: { a: { type: 'integer', maximum: 3 }, b: { type: 'string', enum: ['x', 'y'], maxLength: 1 } },
    required: ['a'],
    additionalProperties: false,
  };
  assert.equal(checkArgs(schema, { a: 1, b: 'x' }), null);
  assert.match(checkArgs(schema, {}), /missing argument: a/);
  assert.match(checkArgs(schema, { a: 1.5 }), /integer/);
  assert.match(checkArgs(schema, { a: 4 }), /at most 3/);
  assert.match(checkArgs(schema, { a: 1, b: 'z' }), /one of x, y/);
  assert.match(checkArgs(schema, { a: 1, c: true }), /unknown argument: c/);
  assert.match(checkArgs(schema, []), /must be an object/);
});

test('stdio framing: one JSON message per line, parse errors answered, batches handled', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  serveStdio(server, { input, output });
  const lines = [];
  output.setEncoding('utf8');
  output.on('data', (chunk) => lines.push(...chunk.split('\n').filter(Boolean)));
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  input.write('not json\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  input.write('[{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"double","arguments":{"n":2}}}]\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const msgs = lines.map((l) => JSON.parse(l));
  assert.ok(msgs.some((m) => m.id === 1 && m.result));
  assert.ok(msgs.some((m) => m.error?.code === -32700));
  assert.ok(msgs.some((m) => Array.isArray(m) && m[0].result.structuredContent.value === 4));
  assert.ok(!lines.some((l) => l.includes('\n')));
});

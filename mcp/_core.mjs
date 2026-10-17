// A minimal Model Context Protocol server: JSON-RPC 2.0, tools only, no dependencies.
// The same server answers over stdio (Claude Code on the founders' laptops, see .mcp.json) and
// over one HTTP request at a time (api/mcp.js, the public read-only endpoint).
//
// Every tool here reads, computes or simulates. None signs, sends a transaction or holds a key;
// test/no-signing.test.mjs scans this folder like the rest of the repo.

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_VERSION = '2025-06-18';

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
};

/** The subset of JSON Schema the tools use: required, type, enum, minimum, maximum, maxLength. */
export function checkArgs(schema = {}, args = {}) {
  if (!TYPES.object(args)) return 'arguments must be an object';
  for (const key of schema.required || []) {
    if (args[key] === undefined) return `missing argument: ${key}`;
  }
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties?.[key];
    if (!rule) {
      if (schema.additionalProperties === false) return `unknown argument: ${key}`;
      continue;
    }
    if (rule.type && !TYPES[rule.type]?.(value)) return `${key} must be ${rule.type === 'integer' ? 'an integer' : `a ${rule.type}`}`;
    if (rule.enum && !rule.enum.includes(value)) return `${key} must be one of ${rule.enum.join(', ')}`;
    if (rule.minimum !== undefined && value < rule.minimum) return `${key} must be at least ${rule.minimum}`;
    if (rule.maximum !== undefined && value > rule.maximum) return `${key} must be at most ${rule.maximum}`;
    if (rule.maxLength !== undefined && String(value).length > rule.maxLength) return `${key} is longer than ${rule.maxLength} characters`;
  }
  return null;
}

/**
 * tools: [{ name, title, description, inputSchema, annotations, run(args) }].
 * run returns a plain object (sent as JSON text and as structuredContent) or a string (text only).
 */
export function createServer({ name, version, instructions, tools }) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const listing = tools.map(({ name: n, title, description, inputSchema, annotations }) => ({
    name: n, title, description, inputSchema: inputSchema || { type: 'object', properties: {} }, annotations,
  }));

  async function callTool(params = {}) {
    const tool = byName.get(params.name);
    if (!tool) return null;
    const args = params.arguments ?? {};
    const problem = checkArgs(tool.inputSchema, args);
    if (problem) return toolError(problem);
    try {
      const out = await tool.run(args);
      if (typeof out === 'string') return { content: [{ type: 'text', text: out }] };
      const structured = TYPES.object(out) ? out : { result: out };
      return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
    } catch (err) {
      return toolError(String(err?.message || err));
    }
  }

  /** One JSON-RPC message in, one response out (null for notifications). */
  async function handle(msg) {
    if (!TYPES.object(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return fail(TYPES.object(msg) && msg.id !== undefined ? msg.id : null, -32600, 'Invalid request');
    }
    if (msg.id === undefined) return null; // notifications/initialized, cancellations: nothing to answer
    const { id, method, params } = msg;
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return ok(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : DEFAULT_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          ...(instructions ? { instructions } : {}),
        });
      }
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: listing });
      case 'tools/call': {
        const result = await callTool(params);
        return result ? ok(id, result) : fail(id, -32602, `Unknown tool: ${params?.name}`);
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  /** A parsed body that may be one message or a batch (older protocol versions allowed batches). */
  async function handleBody(body) {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean);
      return out.length ? out : null;
    }
    return handle(body);
  }

  return { handle, handleBody, tools: listing };
}

/** Newline-delimited JSON-RPC on stdin/stdout. Logs go to stderr, never stdout. */
export function serveStdio(server, { input = process.stdin, output = process.stdout } = {}) {
  let buffer = '';
  const write = (msg) => output.write(`${JSON.stringify(msg)}\n`);
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        write(fail(null, -32700, 'Parse error'));
        continue;
      }
      server.handleBody(msg).then((res) => { if (res) write(res); }, (err) => {
        process.stderr.write(`mcp: ${err?.stack || err}\n`);
      });
    }
  });
}

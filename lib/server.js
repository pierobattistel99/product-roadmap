/**
 * The connector's HTTP side: MCP over Streamable HTTP, one request at a time
 * and no session kept between them (each call stands on its own, which suits
 * a serverless function). A call without a valid token gets a 401 that points
 * Claude at the OAuth metadata, which is how it learns where to send the
 * person to approve the connection.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools, INSTRUCTIONS } from './tools.js';
import { MCP_PATH } from './config.js';
import { CORS, originOf } from './resource.js';

export { metadataResponse, resourceMetadata } from './resource.js';
export const VERSION = '1.0.0';

const withCors = (res) => {
  const h = new Headers(res.headers);
  Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
  h.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};
const jsonRpcError = (status, message, extra) => withCors(new Response(
  JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }),
  { status, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) }));

/* deps: { verify(token) -> { userId, email } | null, open({ token, userId, email, origin }) -> account } */
export function createMcpHandler(deps) {
  return async function handle(request) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
    const origin = originOf(request);
    const challenge = (error) => 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource' + MCP_PATH + '"' +
      (error ? ', error="' + error + '"' : '');
    const m = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i.exec(request.headers.get('authorization') || '');
    if (!m) return jsonRpcError(401, 'Connect Quartermap to Claude to use it.', { 'WWW-Authenticate': challenge() });
    let who;
    try { who = await deps.verify(m[1]); } catch (e) {
      /* A passing outage at Supabase is not a bad token: Claude should try
         again, not send the person through the connection once more. */
      console.error('[quartermap mcp] token check unavailable:', (e && e.message) || e);
      return jsonRpcError(503, 'Quartermap could not check the sign-in just now. Try again in a moment.', { 'Retry-After': '5' });
    }
    if (!who) return jsonRpcError(401, 'The access token is not valid or has expired.', { 'WWW-Authenticate': challenge('invalid_token') });
    /* No session is kept, so there is no stream to open and nothing to close. */
    if (request.method !== 'POST') return jsonRpcError(405, 'Method not allowed: this server answers POST only.', { Allow: 'POST, OPTIONS' });

    const account = deps.open({ token: m[1], userId: who.userId, email: who.email, origin });
    const server = new McpServer({ name: 'quartermap', title: 'Quartermap', version: VERSION }, { instructions: INSTRUCTIONS });
    registerTools(server, account);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return withCors(await transport.handleRequest(request));
    } finally {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    }
  };
}

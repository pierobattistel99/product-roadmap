/* OAuth protected resource metadata (RFC 9728): what the connector is and
   which server issues the tokens it accepts. Kept apart from the connector
   itself, so answering it loads nothing else. */
import { SUPABASE_URL, MCP_PATH } from './config.js';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400'
};
export const originOf = (request) => new URL(request.url).origin;

export function resourceMetadata(origin) {
  return {
    resource: origin + MCP_PATH,
    authorization_servers: [SUPABASE_URL + '/auth/v1'],
    bearer_methods_supported: ['header'],
    resource_name: 'Quartermap',
    resource_documentation: origin + '/'
  };
}
export function metadataResponse(request) {
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, CORS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify(resourceMetadata(originOf(request)), null, 2), { status: 200, headers });
}

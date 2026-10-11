/* OAuth protected resource metadata (RFC 9728) for the connector, served at
   /.well-known/oauth-protected-resource (see vercel.json). It tells Claude
   that Supabase Auth issues the tokens this resource accepts. */
import { metadataResponse } from '../lib/resource.js';

export const GET = (request) => metadataResponse(request);
export const OPTIONS = (request) => metadataResponse(request);

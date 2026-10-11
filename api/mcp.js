/* The Quartermap connector for Claude: https://<this site>/api/mcp
   See lib/server.js for the protocol side and lib/tools.js for the tools. */
import { createMcpHandler } from '../lib/server.js';
import { verify } from '../lib/auth.js';
import { openAccount } from '../lib/store.js';

const handle = createMcpHandler({ verify, open: openAccount });

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;

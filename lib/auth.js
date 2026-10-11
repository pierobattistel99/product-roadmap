/**
 * Who is calling. Claude sends the access token Supabase Auth issued when the
 * person approved the connection (see oauth/consent.html). It is checked here
 * against the project's public signing keys; the database then checks it
 * again on every query, through row level security.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SUPABASE_URL } from './config.js';

export const ISSUER = SUPABASE_URL + '/auth/v1';
const KEYS = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks.json'), {
  cacheMaxAge: 10 * 60 * 1000, cooldownDuration: 30 * 1000, timeoutDuration: 5000
});

/* What is wrong with the token itself: expired, forged, for someone else.
   Anything else (the keys could not be fetched in time) is not the token's
   fault, and must not send the person through the connection again. */
const BAD_TOKEN = new Set([
  'ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWT_INVALID', 'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JOSE_ALG_NOT_ALLOWED', 'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
]);
const OPTIONS = { issuer: ISSUER, audience: 'authenticated', algorithms: ['ES256', 'RS256', 'EdDSA'] };
let reloadedAt = 0;

function unavailable(e) {
  const err = new Error('the signing keys could not be checked: ' + ((e && e.message) || e));
  err.unavailable = true;
  return err;
}

/* The person behind a token, or null when the token is not one this project
   issued. Throws when it cannot tell right now. */
export async function verify(token) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, KEYS, OPTIONS));
  } catch (e) {
    if (e && BAD_TOKEN.has(e.code)) return null;
    if (!e || e.code !== 'ERR_JWKS_NO_MATCHING_KEY') throw unavailable(e);
    /* Signed with a key the keys held here do not have yet: Supabase may have
       just rotated them. Fetch them again (at most every 30 seconds, so made-up
       tokens cannot make this server hammer Supabase), then decide. */
    if (Date.now() - reloadedAt < 30000) throw unavailable(e);
    reloadedAt = Date.now();
    try {
      await KEYS.reload();
      ({ payload } = await jwtVerify(token, KEYS, OPTIONS));
    } catch (e2) {
      if (e2 && (BAD_TOKEN.has(e2.code) || e2.code === 'ERR_JWKS_NO_MATCHING_KEY')) return null;
      throw unavailable(e2);
    }
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.role !== 'authenticated') return null;
  return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

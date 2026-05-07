/**
 * tests/integration/cakto-auth.test.js
 *
 * Integration test for Cakto API authentication.
 *
 * This test calls the REAL Cakto endpoint (https://api.cakto.com.br/public_api/token/)
 * using the credentials from .env (CAKTO_CLIENT_ID + CAKTO_CLIENT_SECRET).
 *
 * It validates that the implementation in api/cakto-api.js matches the official
 * Cakto contract documented at https://docs.cakto.com.br/authentication:
 *
 *   - Endpoint accepts ONLY `client_id` + `client_secret` in the body.
 *   - Endpoint MUST NOT receive `grant_type` (returns 400 unsupported_grant_type).
 *   - Successful response shape: { access_token, expires_in, token_type, scope }.
 *
 * The test is skipped automatically when credentials are absent so it can run
 * safely in CI without secrets. When credentials are invalid (401 invalid_client),
 * the test surfaces a clear, actionable failure — distinct from a code regression.
 */

require('dotenv').config();

const { CaktoAPI } = require('../../api/cakto-api');

const hasCredentials =
  Boolean(process.env.CAKTO_CLIENT_ID) && Boolean(process.env.CAKTO_CLIENT_SECRET);

const itIfCreds = hasCredentials ? it : it.skip;

describe('Cakto API authentication (integration)', () => {
  // The Cakto endpoint can be slow under load — give it 20s.
  const TEST_TIMEOUT_MS = 20000;

  beforeAll(() => {
    if (!hasCredentials) {
      // eslint-disable-next-line no-console
      console.warn(
        '[cakto-auth.test] Skipping integration tests: CAKTO_CLIENT_ID and/or ' +
          'CAKTO_CLIENT_SECRET not set in environment.'
      );
    }
  });

  itIfCreds(
    'authenticate() returns a non-empty JWT access_token',
    async () => {
      const api = new CaktoAPI();
      const token = await api.authenticate();

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // JWTs have three dot-separated base64url segments.
      expect(token.split('.')).toHaveLength(3);
    },
    TEST_TIMEOUT_MS
  );

  itIfCreds(
    'authenticate() caches the token (subsequent calls do not re-authenticate)',
    async () => {
      const api = new CaktoAPI();
      const first = await api.authenticate();
      const second = await api.authenticate();

      expect(second).toBe(first);
      expect(api.tokenExpiry).toBeGreaterThan(Date.now());
    },
    TEST_TIMEOUT_MS
  );

  itIfCreds(
    'raw token endpoint returns the documented response shape',
    async () => {
      // Hit the endpoint directly to validate the contract Cakto guarantees.
      const body = new URLSearchParams({
        client_id: process.env.CAKTO_CLIENT_ID,
        client_secret: process.env.CAKTO_CLIENT_SECRET,
      }).toString();

      const response = await fetch('https://api.cakto.com.br/public_api/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual(
        expect.objectContaining({
          access_token: expect.any(String),
          expires_in: expect.any(Number),
          token_type: 'Bearer',
          scope: expect.any(String),
        })
      );
      expect(data.access_token.length).toBeGreaterThan(0);
      expect(data.expires_in).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );

  itIfCreds(
    'sending grant_type makes the endpoint reject with unsupported_grant_type (regression guard)',
    async () => {
      // This guards against re-introducing the bug fixed in api/cakto-api.js:
      // including `grant_type=client_credentials` causes Cakto to reply
      // 400 unsupported_grant_type (the endpoint is not standard OAuth2).
      const body = new URLSearchParams({
        client_id: process.env.CAKTO_CLIENT_ID,
        client_secret: process.env.CAKTO_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }).toString();

      const response = await fetch('https://api.cakto.com.br/public_api/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('unsupported_grant_type');
    },
    TEST_TIMEOUT_MS
  );
});

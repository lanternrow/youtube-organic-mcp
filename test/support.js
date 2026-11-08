/**
 * Offline test boundary for youtube-organic-mcp.
 *
 * Replaces global fetch before production modules are imported. Unmocked
 * requests throw. The saved live fetch is not called and is restored only
 * after a file's suite finishes.
 *
 * Fixture strings are fake. Do not point these helpers at real credentials.
 */

import { after, afterEach, beforeEach, test as nodeTest } from "node:test";

// `--test-timeout` is not a Node 18 CLI flag. Each test sets the `timeout`
// option, which has existed since the 18.7.0 test runner.
export const TEST_TIMEOUT_MS = 10_000;

export function test(name, options, fn) {
  if (typeof options === "function") {
    fn = options;
    options = {};
  }
  return nodeTest(name, { ...options, timeout: TEST_TIMEOUT_MS }, fn);
}

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DATA_API = "https://www.googleapis.com/youtube/v3";
export const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";

const ENV_KEYS = [
  "YOUTUBE_ACCOUNTS",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
];

const nativeFetch = globalThis.fetch;
let blockedFetches = 0;

if (typeof nativeFetch !== "function") {
  throw new Error("global fetch was not a function when the test harness loaded");
}

export function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) return String(input.url);
  return String(input);
}

export function blockedFetchCount() {
  return blockedFetches;
}

export function blockLiveFetch() {
  globalThis.fetch = async (input, init = {}) => {
    blockedFetches += 1;
    const method = String(init.method ?? "GET").toUpperCase();
    throw new Error(`Blocked unmocked fetch: ${method} ${requestUrl(input)}`);
  };
  if (globalThis.fetch === nativeFetch) {
    throw new Error("failed to replace global fetch");
  }
}

export function installOfflineGuards() {
  const originalEnv = new Map();
  let captured = false;

  beforeEach(() => {
    if (!captured) {
      for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
      captured = true;
    }
    for (const key of ENV_KEYS) delete process.env[key];
    blockedFetches = 0;
    blockLiveFetch();
  }, { timeout: TEST_TIMEOUT_MS });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    blockLiveFetch();
  }, { timeout: TEST_TIMEOUT_MS });

  after(() => {
    for (const key of ENV_KEYS) {
      if (process.env[key] !== originalEnv.get(key)) {
        throw new Error(`Environment variable ${key} was not restored after tests`);
      }
    }
    globalThis.fetch = nativeFetch;
  }, { timeout: TEST_TIMEOUT_MS });
}

export function fakeAccount(name, overrides = {}) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    name,
    client_id: `fake-${slug}-client-id.example.invalid`,
    client_secret: `fake-${slug}-client-secret`,
    refresh_token: `fake-${slug}-refresh-token`,
    ...overrides,
  };
}

export function assertSecretsAbsent(text, ...accounts) {
  for (const account of accounts) {
    if (text.includes(account.client_secret)) {
      throw new Error("client_secret appeared in an assertion surface");
    }
    if (text.includes(account.refresh_token)) {
      throw new Error("refresh_token appeared in an assertion surface");
    }
  }
}

export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(status, text) {
  return new Response(text, { status });
}

/**
 * Replace fetch with a recorder. The handler must return a Response.
 * Returning null/undefined fails closed and does not call the live fetch.
 */
export function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const call = {
      url: requestUrl(input),
      method: String(init.method ?? "GET").toUpperCase(),
      headers: init.headers ?? {},
      body: init.body,
    };
    calls.push(call);
    const response = await handler(call);
    if (response == null) {
      throw new Error(`Blocked unmocked fetch: ${call.method} ${call.url}`);
    }
    return response;
  };
  if (globalThis.fetch === nativeFetch) {
    throw new Error("failed to replace global fetch");
  }
  return calls;
}

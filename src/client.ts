/**
 * YouTube API HTTP client — native fetch, zero external dependencies.
 *
 * Handles Google OAuth 2.0 access-token minting from a refresh token, with a
 * small in-process cache so we don't mint a new token on every call. Access
 * tokens last ~1 hour; we refresh a minute early.
 *
 * Two API hosts:
 *   - Data API:      https://www.googleapis.com/youtube/v3
 *   - Analytics API: https://youtubeanalytics.googleapis.com/v2
 */

import type { AccountConfig } from "./accounts.js";
import type { TokenResponse } from "./types.js";

const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Get a valid access token for an account, refreshing via the refresh token
 * when the cache is empty or about to expire.
 */
export async function getAccessToken(account: AccountConfig): Promise<string> {
  const cached = tokenCache.get(account.name);
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: account.client_id,
      client_secret: account.client_secret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Google OAuth token refresh failed ${res.status}: ${body}\n` +
        "Check that the refresh token, client_id, and client_secret are valid " +
        "and that the YouTube Data + Analytics APIs are enabled on the project."
    );
  }

  const data = (await res.json()) as TokenResponse;
  tokenCache.set(account.name, {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

/**
 * GET against the YouTube Data API v3.
 */
export async function dataGet<T>(
  account: AccountConfig,
  path: string,
  params: Record<string, string>
): Promise<T> {
  return apiGet<T>(account, DATA_API, path, params);
}

/**
 * GET against the YouTube Analytics API v2.
 */
export async function analyticsGet<T>(
  account: AccountConfig,
  path: string,
  params: Record<string, string>
): Promise<T> {
  return apiGet<T>(account, ANALYTICS_API, path, params);
}

async function apiGet<T>(
  account: AccountConfig,
  base: string,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const token = await getAccessToken(account);
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }

  return (await res.json()) as T;
}

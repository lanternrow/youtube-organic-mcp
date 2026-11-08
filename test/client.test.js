import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ANALYTICS_API,
  DATA_API,
  TOKEN_URL,
  assertSecretsAbsent,
  blockLiveFetch,
  blockedFetchCount,
  fakeAccount,
  installFetch,
  installOfflineGuards,
  jsonResponse,
  textResponse,
} from "./support.js";

blockLiveFetch();

const { dataGet, analyticsGet, getAccessToken } = await import("../dist/client.js");

describe("HTTP client", { concurrency: false }, () => {
  installOfflineGuards();

  test("an unmocked fetch fails closed and does not include credential fixtures", async () => {
    const account = fakeAccount("blocked");
    await assert.rejects(() => fetch("https://offline.test/probe"), {
      message: "Blocked unmocked fetch: GET https://offline.test/probe",
    });
    await assert.rejects(() => getAccessToken(account), {
      message: `Blocked unmocked fetch: POST ${TOKEN_URL}`,
    });
    assert.equal(blockedFetchCount(), 2);
  });

  test("dataGet posts the refresh grant, then calls the Data API with the fixture access token", async () => {
    const account = fakeAccount("data-ok");
    const calls = installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        assert.equal(call.headers["Content-Type"], "application/x-www-form-urlencoded");
        assert.ok(call.body instanceof URLSearchParams);
        assert.equal(call.body.get("grant_type"), "refresh_token");
        assert.equal(call.body.get("client_id"), account.client_id);
        assert.equal(call.body.get("client_secret"), account.client_secret);
        assert.equal(call.body.get("refresh_token"), account.refresh_token);
        return jsonResponse(200, {
          access_token: "fake-access-token-data-ok",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET" && call.url.startsWith(`${DATA_API}/channels?`)) {
        assert.equal(call.headers.Authorization, "Bearer fake-access-token-data-ok");
        const url = new URL(call.url);
        assert.equal(url.origin + url.pathname, `${DATA_API}/channels`);
        assert.equal(url.searchParams.get("part"), "snippet");
        assert.equal(url.searchParams.get("mine"), "true");
        return jsonResponse(200, { items: [{ id: "UC_FIXTURE_ONLY" }] });
      }
      return null;
    });

    const body = await dataGet(account, "/channels", { part: "snippet", mine: "true" });
    assert.deepEqual(body, { items: [{ id: "UC_FIXTURE_ONLY" }] });
    assert.deepEqual(
      calls.map((call) => call.method),
      ["POST", "GET"]
    );
    assertSecretsAbsent(calls[1].url, account);
    assert.equal(calls[1].headers.Authorization.includes(account.refresh_token), false);
  });

  test("a token that lasts longer than the one-minute early refresh is reused", async () => {
    const account = fakeAccount("cache-hit");
    let tokenPosts = 0;
    installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        tokenPosts += 1;
        return jsonResponse(200, {
          access_token: "fake-access-token-cache-hit",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") {
        assert.equal(call.headers.Authorization, "Bearer fake-access-token-cache-hit");
        return jsonResponse(200, { ok: tokenPosts });
      }
      return null;
    });

    await dataGet(account, "/channels", { part: "id" });
    await dataGet(account, "/channels", { part: "id" });
    assert.equal(tokenPosts, 1);
  });

  test("a token inside the one-minute early-refresh window is minted again", async () => {
    const account = fakeAccount("early-refresh");
    let tokenPosts = 0;
    installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        tokenPosts += 1;
        return jsonResponse(200, {
          access_token: `fake-access-token-early-${tokenPosts}`,
          expires_in: 30,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") {
        assert.equal(call.headers.Authorization, `Bearer fake-access-token-early-${tokenPosts}`);
        return jsonResponse(200, { ok: true });
      }
      return null;
    });

    await dataGet(account, "/channels", { part: "id" });
    await dataGet(account, "/channels", { part: "id" });
    assert.equal(tokenPosts, 2);
  });

  test("different account names do not share a cached access token", async () => {
    const first = fakeAccount("cache-a");
    const second = fakeAccount("cache-b");
    const tokens = new Map();
    installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        const name = call.body.get("client_id").includes("cache-a") ? "cache-a" : "cache-b";
        const access = `fake-access-token-${name}`;
        tokens.set(call.body.get("refresh_token"), access);
        return jsonResponse(200, {
          access_token: access,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") {
        return jsonResponse(200, { authorization: call.headers.Authorization });
      }
      return null;
    });

    const a = await dataGet(first, "/channels", { part: "id" });
    const b = await dataGet(second, "/channels", { part: "id" });
    assert.equal(a.authorization, "Bearer fake-access-token-cache-a");
    assert.equal(b.authorization, "Bearer fake-access-token-cache-b");
    assert.equal(tokens.size, 2);
  });

  test("the same account name reuses the cached access token even if the refresh token changed", async () => {
    const first = fakeAccount("shared-cache-name");
    const rotated = fakeAccount("shared-cache-name", {
      client_secret: "fake-shared-cache-name-rotated-client-secret",
      refresh_token: "fake-shared-cache-name-rotated-refresh-token",
    });
    let tokenPosts = 0;
    installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        tokenPosts += 1;
        assert.equal(call.body.get("refresh_token"), first.refresh_token);
        return jsonResponse(200, {
          access_token: "fake-access-token-shared-cache-name",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") {
        assert.equal(call.headers.Authorization, "Bearer fake-access-token-shared-cache-name");
        return jsonResponse(200, { ok: true });
      }
      return null;
    });

    await getAccessToken(first);
    await getAccessToken(rotated);
    assert.equal(tokenPosts, 1);
  });

  test("a failed token refresh throws the status and body and is not cached", async () => {
    const account = fakeAccount("token-error");
    let tokenPosts = 0;
    installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        tokenPosts += 1;
        return textResponse(400, "invalid-grant-fixture");
      }
      return null;
    });

    const expected =
      "Google OAuth token refresh failed 400: invalid-grant-fixture\n" +
      "Check that the refresh token, client_id, and client_secret are valid " +
      "and that the YouTube Data + Analytics APIs are enabled on the project.";

    await assert.rejects(
      () => dataGet(account, "/channels", { part: "id" }),
      (err) => {
        assert.equal(err.message, expected);
        assertSecretsAbsent(err.message, account);
        return true;
      }
    );
    await assert.rejects(() => getAccessToken(account), { message: expected });
    assert.equal(tokenPosts, 2);
  });

  test("a failed API response throws the status and body without the credential fixtures", async () => {
    const account = fakeAccount("api-error");
    const calls = installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        return jsonResponse(200, {
          access_token: "fake-access-token-api-error",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") {
        return textResponse(403, "fixture-denied");
      }
      return null;
    });

    const expected = "YouTube API error 403: fixture-denied";
    await assert.rejects(
      () => dataGet(account, "/channels", { part: "id" }),
      (err) => {
        assert.equal(err.message, expected);
        assertSecretsAbsent(err.message, account);
        return true;
      }
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "GET");
    assertSecretsAbsent(calls[0].url + calls[1].url, account);
  });

  test("blank, null, and undefined query params are omitted", async () => {
    const account = fakeAccount("params");
    const calls = installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        return jsonResponse(200, {
          access_token: "fake-access-token-params",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET") return jsonResponse(200, { ok: true });
      return null;
    });

    await dataGet(account, "/channels", {
      part: "snippet",
      pageToken: "",
      filter: undefined,
      mine: null,
    });
    const url = new URL(calls[1].url);
    assert.equal(url.searchParams.get("part"), "snippet");
    assert.equal(url.searchParams.has("pageToken"), false);
    assert.equal(url.searchParams.has("filter"), false);
    assert.equal(url.searchParams.has("mine"), false);
  });

  test("analyticsGet uses the Analytics host and not the Data API host", async () => {
    const account = fakeAccount("analytics-host");
    const calls = installFetch((call) => {
      if (call.method === "POST" && call.url === TOKEN_URL) {
        return jsonResponse(200, {
          access_token: "fake-access-token-analytics-host",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (call.method === "GET" && call.url.startsWith(`${ANALYTICS_API}/reports`)) {
        const url = new URL(call.url);
        assert.equal(url.origin + url.pathname, `${ANALYTICS_API}/reports`);
        assert.equal(url.searchParams.get("ids"), "channel==MINE");
        return jsonResponse(200, { rows: [[1]] });
      }
      return null;
    });

    const body = await analyticsGet(account, "/reports", { ids: "channel==MINE" });
    assert.deepEqual(body, { rows: [[1]] });
    assert.equal(calls[1].url.includes("youtube/v3"), false);
    assert.equal(calls[1].url.startsWith(DATA_API), false);
  });
});

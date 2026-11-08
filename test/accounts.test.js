import { describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertSecretsAbsent,
  blockLiveFetch,
  blockedFetchCount,
  fakeAccount,
  installOfflineGuards,
  test,
} from "./support.js";

blockLiveFetch();

const { getAccounts, listAccountNames, resolveAccount } = await import("../dist/accounts.js");

const NO_ACCOUNTS = [
  "No YouTube accounts configured. Set either:",
  "  • YOUTUBE_ACCOUNTS (JSON array for multi-account), or",
  "  • YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN (single account mode)",
  "",
  "See: https://github.com/lanternrow/youtube-organic-mcp#readme",
].join("\n");

describe("account configuration", { concurrency: false }, () => {
  installOfflineGuards();

  test("missing configuration throws and does not fetch", () => {
    assert.throws(() => getAccounts(), { message: NO_ACCOUNTS });
    assert.equal(blockedFetchCount(), 0);
  });

  test("a partial single-account env does not echo the values that were set", () => {
    const account = fakeAccount("partial");
    process.env.YOUTUBE_CLIENT_ID = account.client_id;
    process.env.YOUTUBE_CLIENT_SECRET = account.client_secret;
    assert.throws(() => getAccounts(), { message: NO_ACCOUNTS });
    assert.equal(blockedFetchCount(), 0);
  });

  test("single-account env vars become the default account", () => {
    const account = fakeAccount("ignored-name");
    process.env.YOUTUBE_CLIENT_ID = account.client_id;
    process.env.YOUTUBE_CLIENT_SECRET = account.client_secret;
    process.env.YOUTUBE_REFRESH_TOKEN = account.refresh_token;

    const parsed = getAccounts();
    assert.deepEqual(parsed, [
      {
        name: "default",
        client_id: account.client_id,
        client_secret: account.client_secret,
        refresh_token: account.refresh_token,
      },
    ]);
    parsed[0].name = "mutated";
    assert.equal(getAccounts()[0].name, "default");
    assert.equal(blockedFetchCount(), 0);
  });

  test("YOUTUBE_ACCOUNTS parses required fields, coerces them, and drops extras", () => {
    process.env.YOUTUBE_ACCOUNTS = JSON.stringify([
      {
        name: "Brand",
        client_id: 1001,
        client_secret: "fake-brand-client-secret",
        refresh_token: "fake-brand-refresh-token",
        note: "not-copied",
      },
      fakeAccount("Other"),
    ]);

    assert.deepEqual(getAccounts(), [
      {
        name: "Brand",
        client_id: "1001",
        client_secret: "fake-brand-client-secret",
        refresh_token: "fake-brand-refresh-token",
      },
      fakeAccount("Other"),
    ]);
    assert.equal(blockedFetchCount(), 0);
  });

  test("YOUTUBE_ACCOUNTS overrides single-account variables", () => {
    const multi = fakeAccount("Multi");
    const single = fakeAccount("Single");
    process.env.YOUTUBE_ACCOUNTS = JSON.stringify([multi]);
    process.env.YOUTUBE_CLIENT_ID = single.client_id;
    process.env.YOUTUBE_CLIENT_SECRET = single.client_secret;
    process.env.YOUTUBE_REFRESH_TOKEN = single.refresh_token;

    assert.deepEqual(getAccounts(), [multi]);
    assert.equal(blockedFetchCount(), 0);
  });

  test("an empty YOUTUBE_ACCOUNTS array is rejected", () => {
    process.env.YOUTUBE_ACCOUNTS = "[]";
    assert.throws(() => getAccounts(), {
      message: "YOUTUBE_ACCOUNTS must be a non-empty JSON array.",
    });
  });

  test("a JSON value that is not an array is rejected", () => {
    process.env.YOUTUBE_ACCOUNTS = "{}";
    assert.throws(() => getAccounts(), {
      message: "YOUTUBE_ACCOUNTS must be a non-empty JSON array.",
    });
  });

  test("invalid YOUTUBE_ACCOUNTS JSON does not fall back to single-account vars", () => {
    const single = fakeAccount("fallback");
    process.env.YOUTUBE_ACCOUNTS = "{not-json";
    process.env.YOUTUBE_CLIENT_ID = single.client_id;
    process.env.YOUTUBE_CLIENT_SECRET = single.client_secret;
    process.env.YOUTUBE_REFRESH_TOKEN = single.refresh_token;

    const error = assertThrown(() => getAccounts());
    assert.equal(
      error.message,
      "YOUTUBE_ACCOUNTS environment variable is not valid JSON. " +
        "It should be a JSON array of account objects."
    );
    assertSecretsAbsent(error.message, single);
  });

  test("an entry missing a required field names its index", () => {
    process.env.YOUTUBE_ACCOUNTS = JSON.stringify([
      fakeAccount("Ok"),
      { name: "Missing", client_id: "fake-id", client_secret: "", refresh_token: "fake-token" },
    ]);
    assert.throws(() => getAccounts(), {
      message:
        'YOUTUBE_ACCOUNTS[1] must have "name", "client_id", "client_secret", and "refresh_token" fields.',
    });
  });

  test("resolveAccount defaults, matches case-insensitively, and lists names without secrets", () => {
    const brand = fakeAccount("Brand");
    const other = fakeAccount("Other");
    process.env.YOUTUBE_ACCOUNTS = JSON.stringify([brand, other]);

    assert.deepEqual(resolveAccount(), brand);
    assert.deepEqual(resolveAccount("other"), other);
    assert.deepEqual(listAccountNames(), ["Brand", "Other"]);
    assertSecretsAbsent(JSON.stringify(listAccountNames()), brand, other);

    const error = assertThrown(() => resolveAccount("missing"));
    assert.equal(error.message, 'Account "missing" not found. Available accounts: Brand, Other');
    assertSecretsAbsent(error.message, brand, other);
    assert.equal(blockedFetchCount(), 0);
  });
});

function assertThrown(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a throw");
}

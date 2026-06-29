/**
 * Multi-account support for YouTube Organic MCP.
 *
 * Unlike short-lived bearer tokens, Google OAuth uses a long-lived
 * **refresh token** plus your OAuth client (client_id + client_secret) to
 * mint fresh access tokens on demand. So each account stores those three
 * values; the client refreshes access tokens automatically (see client.ts).
 *
 * Accounts can be configured two ways:
 *
 * 1. Multi-account (recommended): Set YOUTUBE_ACCOUNTS as a JSON array:
 *    [
 *      {
 *        "name": "myfunnycaptions",
 *        "client_id": "xxx.apps.googleusercontent.com",
 *        "client_secret": "yyy",
 *        "refresh_token": "1//zzz"
 *      },
 *      { "name": "otherbrand", ... }
 *    ]
 *
 * 2. Single-account (legacy): Set individual env vars:
 *    YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *
 * When using multi-account mode, pass the account name to any tool.
 * If omitted, the first account in the array is used as default.
 */

export interface AccountConfig {
  name: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * Parse all configured accounts from environment.
 * Returns at least one account or throws.
 */
export function getAccounts(): AccountConfig[] {
  const accountsJson = process.env.YOUTUBE_ACCOUNTS;

  if (accountsJson) {
    try {
      const parsed = JSON.parse(accountsJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("YOUTUBE_ACCOUNTS must be a non-empty JSON array.");
      }

      return parsed.map((entry: Record<string, unknown>, i: number) => {
        if (!entry.name || !entry.client_id || !entry.client_secret || !entry.refresh_token) {
          throw new Error(
            `YOUTUBE_ACCOUNTS[${i}] must have "name", "client_id", "client_secret", and "refresh_token" fields.`
          );
        }
        return {
          name: String(entry.name),
          client_id: String(entry.client_id),
          client_secret: String(entry.client_secret),
          refresh_token: String(entry.refresh_token),
        };
      });
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(
          "YOUTUBE_ACCOUNTS environment variable is not valid JSON. " +
            "It should be a JSON array of account objects."
        );
      }
      throw err;
    }
  }

  // Legacy single-account fallback
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "No YouTube accounts configured. Set either:\n" +
        "  • YOUTUBE_ACCOUNTS (JSON array for multi-account), or\n" +
        "  • YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN (single account mode)\n\n" +
        "See: https://github.com/lanternrow/youtube-organic-mcp#readme"
    );
  }

  return [
    {
      name: "default",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
  ];
}

/**
 * Resolve an account by name. If accountName is undefined, returns the first (default) account.
 */
export function resolveAccount(accountName?: string): AccountConfig {
  const accounts = getAccounts();

  if (!accountName) {
    return accounts[0];
  }

  const match = accounts.find(
    (a) => a.name.toLowerCase() === accountName.toLowerCase()
  );

  if (!match) {
    const available = accounts.map((a) => a.name).join(", ");
    throw new Error(
      `Account "${accountName}" not found. Available accounts: ${available}`
    );
  }

  return match;
}

/**
 * List all configured account names (for the list_accounts tool).
 */
export function listAccountNames(): string[] {
  return getAccounts().map((a) => a.name);
}

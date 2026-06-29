#!/usr/bin/env python3
"""
Generate a YouTube OAuth refresh token for the youtube-organic-mcp server.

Prerequisites (one-time):
  1. In Google Cloud Console, enable "YouTube Data API v3" and "YouTube Analytics API".
  2. Create an OAuth client of type "Desktop app" and download its client_secret JSON.
  3. pip install google-auth-oauthlib

Usage:
  python3 scripts/get_youtube_token.py /path/to/client_secret.json [account_name]

A browser opens for Google sign-in. Authorize with the Google account that owns
the target YouTube channel (for a Brand Account channel, pick the brand when
prompted). If the "Google hasn't verified this app" screen appears, it's your
own app — click Advanced -> Go to <project> (unsafe) to continue.

On success it prints YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
to drop into your MCP config (or .env), and also writes them to
.youtube_account.json next to the repo (gitignored).
"""
import json
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python3 scripts/get_youtube_token.py "
            "/path/to/client_secret.json [account_name]",
            file=sys.stderr,
        )
        sys.exit(1)

    client_secret_path = Path(sys.argv[1]).expanduser()
    account_name = sys.argv[2] if len(sys.argv) > 2 else "default"

    if not client_secret_path.exists():
        print(f"ERROR: client_secret not found at {client_secret_path}", file=sys.stderr)
        sys.exit(1)

    secret = json.loads(client_secret_path.read_text())
    installed = secret.get("installed") or secret.get("web") or {}
    client_id = installed.get("client_id")
    client_secret = installed.get("client_secret")
    if not client_id or not client_secret:
        print("ERROR: could not read client_id/client_secret from the JSON.", file=sys.stderr)
        sys.exit(1)

    print(f"Account label: {account_name}")
    print("Opening browser for Google sign-in...")
    print("Authorize with the account that owns the YouTube channel.\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path), SCOPES)
    creds = flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",  # force refresh_token issuance
        open_browser=True,
    )

    account = {
        "name": account_name,
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": creds.refresh_token,
    }

    out = Path(__file__).resolve().parent.parent / ".youtube_account.json"
    out.write_text(json.dumps(account, indent=2))

    print("\n" + "=" * 70)
    print("SUCCESS — refresh token issued. Add these to your MCP config or .env:")
    print("=" * 70)
    print(f"\nYOUTUBE_CLIENT_ID={client_id}")
    print(f"YOUTUBE_CLIENT_SECRET={client_secret}")
    print(f"YOUTUBE_REFRESH_TOKEN={creds.refresh_token}\n")
    print(f"(Also written to {out} — gitignored.)")


if __name__ == "__main__":
    main()

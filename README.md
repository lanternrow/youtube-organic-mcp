# youtube-organic-mcp

MCP server for **YouTube organic analytics** — channel stats, video performance, watch time, and audience engagement via the **YouTube Data API v3** and **YouTube Analytics API v2**.

Built for [Claude Code](https://claude.ai/claude-code) and any MCP-compatible AI tool. Gives your AI assistant direct, read-only access to your own channel's organic data — subscribers, views, watch time, per-video engagement, and day-by-day trends.

Part of **[The SEO Engine](https://lanternrow.com/seo-engine/)** toolkit by [Rex Jones](https://rexjones.me) — AI-powered SEO and social media tooling for agencies and businesses.

## Why this exists

- **No good open-source YouTube organic MCP existed.** Plenty of ad MCPs; organic channel analytics, nobody.
- **YouTube has the richest organic API of the major platforms.** Watch time, average view duration, subscribers gained/lost, traffic sources — none of it gated behind a multi-week review.
- **Reuses your existing Google OAuth.** If you already run the GA4 / GSC / Google Ads MCPs, the same OAuth client works here.

## Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List configured channels and the default |
| `get_channel_info` | Channel profile + lifetime stats (subscribers, total views, video count, uploads playlist) |
| `get_videos` | Paginated uploads with per-video views, likes, comments, duration |
| `get_video_details` | Details for specific video IDs (batch up to 50) |
| `get_channel_analytics` | Channel analytics over a date range: views, watch time, avg view duration/%, subs gained/lost, likes, comments, shares — optionally by day |
| `get_video_analytics` | The same metrics for a single video over a date range |

All tools accept an optional `account` parameter for multi-account setups.

## Getting connected

### Step 1: Enable the APIs
In Google Cloud Console (any project — you can reuse an existing one), enable **YouTube Data API v3** and **YouTube Analytics API**.

### Step 2: Get a refresh token
Create an OAuth client of type **Desktop app** and download its `client_secret` JSON. Then run the helper (needs `pip install google-auth-oauthlib`):

```bash
python3 scripts/get_youtube_token.py /path/to/client_secret.json my-channel
```

Authorize with the Google account that owns the channel (pick the Brand Account if prompted). It prints the three `YOUTUBE_*` values to drop into your config and writes them to `.youtube_account.json` (gitignored).

### Step 3: Configure
Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "youtube-organic": {
      "command": "node",
      "args": ["/path/to/youtube-organic-mcp/dist/index.js"],
      "env": {
        "YOUTUBE_CLIENT_ID": "your_client_id.apps.googleusercontent.com",
        "YOUTUBE_CLIENT_SECRET": "your_client_secret",
        "YOUTUBE_REFRESH_TOKEN": "1//your_refresh_token"
      }
    }
  }
}
```

Or set `YOUTUBE_ACCOUNTS` to a JSON array for multiple channels (see `.env.example`).

## Architecture

```
src/
  index.ts          # MCP server entry point, tool registration
  accounts.ts       # Multi-account resolution (client_id/secret/refresh_token)
  client.ts         # OAuth token minting + Data/Analytics API HTTP client
  types.ts          # TypeScript interfaces for API responses
  tools/
    channel.ts      # get_channel_info + uploads-playlist resolver
    videos.ts       # get_videos, get_video_details
    analytics.ts    # get_channel_analytics, get_video_analytics
```

- **Zero external HTTP dependencies** — native `fetch` (Node 18+)
- **Auto-refreshing auth** — access tokens minted from the refresh token, cached per process
- **Multi-account support** — monitor multiple channels from one server

## License

MIT

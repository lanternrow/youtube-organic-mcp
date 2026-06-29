#!/usr/bin/env node

/**
 * YouTube Organic MCP Server
 *
 * Provides organic analytics for YouTube channels:
 *   - Channel profile and lifetime stats
 *   - Video listing with engagement metrics
 *   - Per-video details
 *   - Channel-level analytics (views, watch time, subscribers, engagement)
 *   - Per-video analytics over a date range
 *   - Multi-account support
 *
 * Auth: Google OAuth 2.0 refresh token (access tokens minted on demand).
 * APIs: YouTube Data API v3 + YouTube Analytics API v2.
 *
 * Part of The SEO Engine toolkit by Lantern Row.
 * https://lanternrow.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { resolveAccount, listAccountNames } from "./accounts.js";
import { getChannelInfo } from "./tools/channel.js";
import { getVideos, getVideoDetails } from "./tools/videos.js";
import { getChannelAnalytics, getVideoAnalytics } from "./tools/analytics.js";

const server = new McpServer({
  name: "youtube-organic-mcp",
  version: "1.0.0",
});

// ─── Helpers ──────────────────────────────────────────────────────

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

const accountArg = z
  .string()
  .optional()
  .describe(
    "Account name to query. Use list_accounts to see available options. Defaults to the first configured account."
  );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Tools ────────────────────────────────────────────────────────

// 1. list_accounts
server.tool(
  "list_accounts",
  "List all configured YouTube accounts available for querying.",
  {},
  async () => {
    try {
      const names = listAccountNames();
      const text = JSON.stringify(
        { accounts: names, default: names[0], count: names.length },
        null,
        2
      );
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// 2. get_channel_info
server.tool(
  "get_channel_info",
  "Get the authorized YouTube channel's profile and lifetime stats: title, description, custom URL, subscriber count, total views, and video count.",
  { account: accountArg },
  async (args) => {
    try {
      const acct = resolveAccount(args.account);
      const text = await getChannelInfo(acct);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// 3. get_videos
server.tool(
  "get_videos",
  "Get a paginated list of the channel's uploaded videos with engagement metrics (views, likes, comments, duration). Returns up to 50 per page.",
  {
    account: accountArg,
    max_results: z
      .number()
      .min(1)
      .max(50)
      .default(25)
      .describe("Number of videos to return (1-50, default 25)"),
    page_token: z
      .string()
      .optional()
      .describe("Pagination token from a previous response's next_page_token."),
  },
  async (args) => {
    try {
      const acct = resolveAccount(args.account);
      const text = await getVideos(acct, args.max_results, args.page_token);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// 4. get_video_details
server.tool(
  "get_video_details",
  "Get details (views, likes, comments, duration, tags) for specific YouTube video IDs. Max 50 IDs per request.",
  {
    account: accountArg,
    video_ids: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("Array of YouTube video IDs to query (max 50)."),
  },
  async (args) => {
    try {
      const acct = resolveAccount(args.account);
      const text = await getVideoDetails(acct, args.video_ids);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// 5. get_channel_analytics
server.tool(
  "get_channel_analytics",
  "Get channel-level organic analytics over a date range: views, estimated minutes watched, average view duration/percentage, subscribers gained/lost, likes, comments, shares. Optionally break down by a dimension (e.g. 'day' for a daily time series). Requires the yt-analytics.readonly scope.",
  {
    account: accountArg,
    start_date: z.string().regex(DATE_RE).describe("Start date, YYYY-MM-DD."),
    end_date: z.string().regex(DATE_RE).describe("End date, YYYY-MM-DD."),
    metrics: z
      .string()
      .optional()
      .describe(
        "Comma-separated metric list. Defaults to a standard organic set. See YouTube Analytics API metric names."
      ),
    dimensions: z
      .string()
      .optional()
      .describe("Optional dimension(s), e.g. 'day', 'month', 'country'."),
  },
  async (args) => {
    try {
      const acct = resolveAccount(args.account);
      const text = await getChannelAnalytics(
        acct,
        args.start_date,
        args.end_date,
        args.metrics,
        args.dimensions
      );
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// 6. get_video_analytics
server.tool(
  "get_video_analytics",
  "Get analytics for a single video over a date range (views, watch time, average view duration/percentage, subscribers gained, likes, comments, shares). Requires the yt-analytics.readonly scope.",
  {
    account: accountArg,
    video_id: z.string().describe("The YouTube video ID."),
    start_date: z.string().regex(DATE_RE).describe("Start date, YYYY-MM-DD."),
    end_date: z.string().regex(DATE_RE).describe("End date, YYYY-MM-DD."),
    metrics: z
      .string()
      .optional()
      .describe("Comma-separated metric list. Defaults to a standard organic set."),
  },
  async (args) => {
    try {
      const acct = resolveAccount(args.account);
      const text = await getVideoAnalytics(
        acct,
        args.video_id,
        args.start_date,
        args.end_date,
        args.metrics
      );
      return { content: [{ type: "text" as const, text }] };
    } catch (err: unknown) {
      return errorResponse(err);
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YouTube Organic MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

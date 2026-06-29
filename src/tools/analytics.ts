/**
 * YouTube Analytics tools — the organic-insights payoff.
 *
 * Endpoint:
 *   GET /reports?ids=channel==MINE&metrics=...&startDate=...&endDate=...
 *
 * Scope required: yt-analytics.readonly
 *
 * Docs: https://developers.google.com/youtube/analytics/reference/reports/query
 */

import { analyticsGet } from "../client.js";
import type { AccountConfig } from "../accounts.js";
import type { AnalyticsResponse } from "../types.js";

// Sensible default metric set for organic channel performance.
const DEFAULT_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
].join(",");

/**
 * Turn the columnHeaders + rows shape into an array of objects (or a single
 * object when there are no dimensions / a single aggregate row).
 */
function shape(resp: AnalyticsResponse) {
  const headers = (resp.columnHeaders || []).map((h) => h.name);
  const rows = resp.rows || [];
  if (rows.length === 0) {
    return { columns: headers, rows: [], note: "No data returned for this range." };
  }
  const objects = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
  return objects.length === 1 && !headers.includes("day")
    ? objects[0]
    : objects;
}

/**
 * Channel-level analytics over a date range, optionally broken down by a
 * dimension (e.g. "day" for a daily time series).
 */
export async function getChannelAnalytics(
  account: AccountConfig,
  startDate: string,
  endDate: string,
  metrics?: string,
  dimensions?: string
): Promise<string> {
  const params: Record<string, string> = {
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: metrics || DEFAULT_METRICS,
  };
  if (dimensions) {
    params.dimensions = dimensions;
    params.sort = dimensions.split(",")[0];
  }

  const resp = await analyticsGet<AnalyticsResponse>(account, "/reports", params);

  return JSON.stringify(
    { period: { startDate, endDate }, dimensions: dimensions || null, data: shape(resp) },
    null,
    2
  );
}

/**
 * Per-video analytics over a date range. Pass a single video id.
 */
export async function getVideoAnalytics(
  account: AccountConfig,
  videoId: string,
  startDate: string,
  endDate: string,
  metrics?: string
): Promise<string> {
  const resp = await analyticsGet<AnalyticsResponse>(account, "/reports", {
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: metrics || DEFAULT_METRICS,
    filters: `video==${videoId}`,
  });

  return JSON.stringify(
    { video_id: videoId, period: { startDate, endDate }, data: shape(resp) },
    null,
    2
  );
}

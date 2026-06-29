/**
 * YouTube video tools.
 *
 * Endpoints:
 *   GET /playlistItems  — walk the channel's uploads playlist for video IDs
 *   GET /videos         — snippet + statistics + contentDetails for IDs
 *
 * Scope required: youtube.readonly
 */

import { dataGet } from "../client.js";
import { getUploadsPlaylistId } from "./channel.js";
import type { AccountConfig } from "../accounts.js";
import type {
  PlaylistItemListResponse,
  VideoListResponse,
  VideoItem,
} from "../types.js";

const VIDEO_PARTS = "snippet,statistics,contentDetails";

function formatVideo(v: VideoItem) {
  return {
    id: v.id,
    title: v.snippet?.title,
    published_at: v.snippet?.publishedAt,
    duration_seconds: parseDuration(v.contentDetails?.duration),
    views: toNum(v.statistics?.viewCount),
    likes: toNum(v.statistics?.likeCount),
    comments: toNum(v.statistics?.commentCount),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    tags: v.snippet?.tags,
  };
}

/**
 * Get a paginated list of the channel's uploaded videos with engagement
 * metrics (views, likes, comments). Returns up to 50 per page.
 */
export async function getVideos(
  account: AccountConfig,
  maxResults: number = 25,
  pageToken?: string
): Promise<string> {
  const uploads = await getUploadsPlaylistId(account);

  const playlist = await dataGet<PlaylistItemListResponse>(
    account,
    "/playlistItems",
    {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: String(Math.min(maxResults, 50)),
      ...(pageToken ? { pageToken } : {}),
    }
  );

  const ids = (playlist.items || [])
    .map((it) => it.contentDetails?.videoId)
    .filter((x): x is string => Boolean(x));

  let videos: ReturnType<typeof formatVideo>[] = [];
  if (ids.length > 0) {
    const details = await dataGet<VideoListResponse>(account, "/videos", {
      part: VIDEO_PARTS,
      id: ids.join(","),
    });
    videos = (details.items || []).map(formatVideo);
  }

  return JSON.stringify(
    {
      videos,
      count: videos.length,
      next_page_token: playlist.nextPageToken,
      has_more: Boolean(playlist.nextPageToken),
    },
    null,
    2
  );
}

/**
 * Get detailed info for specific video IDs (up to 50 at a time).
 */
export async function getVideoDetails(
  account: AccountConfig,
  videoIds: string[]
): Promise<string> {
  if (videoIds.length === 0) {
    throw new Error("At least one video ID is required.");
  }
  if (videoIds.length > 50) {
    throw new Error("Maximum 50 video IDs per request.");
  }

  const details = await dataGet<VideoListResponse>(account, "/videos", {
    part: VIDEO_PARTS,
    id: videoIds.join(","),
  });

  const videos = (details.items || []).map(formatVideo);

  return JSON.stringify({ videos, count: videos.length }, null, 2);
}

/**
 * Parse an ISO 8601 duration (e.g. PT1M30S) into seconds.
 */
function parseDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

function toNum(v?: string): number | undefined {
  return v === undefined ? undefined : Number(v);
}

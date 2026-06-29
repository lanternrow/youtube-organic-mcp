/**
 * YouTube channel tools.
 *
 * Endpoint:
 *   GET /channels?part=snippet,statistics,contentDetails&mine=true
 *
 * Scope required: youtube.readonly
 */

import { dataGet } from "../client.js";
import type { AccountConfig } from "../accounts.js";
import type { ChannelListResponse } from "../types.js";

/**
 * Get the authenticated channel's profile info and lifetime stats.
 */
export async function getChannelInfo(account: AccountConfig): Promise<string> {
  const data = await dataGet<ChannelListResponse>(account, "/channels", {
    part: "snippet,statistics,contentDetails",
    mine: "true",
  });

  const channel = data.items?.[0];
  if (!channel) {
    throw new Error(
      "No channel found for the authorized account. Make sure the OAuth token " +
        "belongs to a Google account that owns a YouTube channel."
    );
  }

  return JSON.stringify(
    {
      channel_id: channel.id,
      title: channel.snippet?.title,
      description: channel.snippet?.description,
      custom_url: channel.snippet?.customUrl,
      country: channel.snippet?.country,
      published_at: channel.snippet?.publishedAt,
      subscriber_count: toNum(channel.statistics?.subscriberCount),
      hidden_subscriber_count: channel.statistics?.hiddenSubscriberCount,
      total_views: toNum(channel.statistics?.viewCount),
      video_count: toNum(channel.statistics?.videoCount),
      uploads_playlist: channel.contentDetails?.relatedPlaylists?.uploads,
    },
    null,
    2
  );
}

/**
 * Resolve the uploads playlist id for the authorized channel.
 * Shared by the video tools.
 */
export async function getUploadsPlaylistId(account: AccountConfig): Promise<string> {
  const data = await dataGet<ChannelListResponse>(account, "/channels", {
    part: "contentDetails",
    mine: "true",
  });
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new Error("Could not resolve the channel's uploads playlist.");
  }
  return uploads;
}

function toNum(v?: string): number | undefined {
  return v === undefined ? undefined : Number(v);
}

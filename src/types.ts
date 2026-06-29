/**
 * TypeScript types for YouTube Data API v3 and YouTube Analytics API v2
 * responses used by the YouTube Organic MCP server.
 *
 * Docs:
 *   https://developers.google.com/youtube/v3/docs
 *   https://developers.google.com/youtube/analytics/reference/reports/query
 */

// ─── Channel (Data API) ───────────────────────────────────────────

export interface ChannelSnippet {
  title?: string;
  description?: string;
  customUrl?: string;
  publishedAt?: string;
  country?: string;
  thumbnails?: Record<string, { url: string }>;
}

export interface ChannelStatistics {
  viewCount?: string;
  subscriberCount?: string;
  hiddenSubscriberCount?: boolean;
  videoCount?: string;
}

export interface ChannelContentDetails {
  relatedPlaylists?: {
    uploads?: string;
  };
}

export interface Channel {
  id: string;
  snippet?: ChannelSnippet;
  statistics?: ChannelStatistics;
  contentDetails?: ChannelContentDetails;
}

export interface ChannelListResponse {
  items?: Channel[];
}

// ─── Playlist items (uploads) ─────────────────────────────────────

export interface PlaylistItem {
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
}

export interface PlaylistItemListResponse {
  items?: PlaylistItem[];
  nextPageToken?: string;
}

// ─── Video (Data API) ─────────────────────────────────────────────

export interface VideoSnippet {
  title?: string;
  description?: string;
  publishedAt?: string;
  tags?: string[];
  thumbnails?: Record<string, { url: string }>;
}

export interface VideoStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  favoriteCount?: string;
}

export interface VideoContentDetails {
  duration?: string; // ISO 8601, e.g. PT1M30S
}

export interface VideoItem {
  id: string;
  snippet?: VideoSnippet;
  statistics?: VideoStatistics;
  contentDetails?: VideoContentDetails;
}

export interface VideoListResponse {
  items?: VideoItem[];
}

// ─── Analytics API ────────────────────────────────────────────────

export interface AnalyticsColumnHeader {
  name: string;
  columnType: string;
  dataType: string;
}

export interface AnalyticsResponse {
  columnHeaders?: AnalyticsColumnHeader[];
  rows?: Array<Array<string | number>>;
}

// ─── OAuth ────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

import { describe } from "node:test";
import assert from "node:assert/strict";
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
  test,
  textResponse,
} from "./support.js";

blockLiveFetch();

const { getChannelInfo, getUploadsPlaylistId } = await import("../dist/tools/channel.js");
const { getVideoDetails, getVideos } = await import("../dist/tools/videos.js");
const { getChannelAnalytics, getVideoAnalytics } = await import("../dist/tools/analytics.js");

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

describe("tool behavior over fake YouTube responses", { concurrency: false }, () => {
  installOfflineGuards();

  test("getChannelInfo maps a fixture channel and converts count strings to numbers", async () => {
    const account = fakeAccount("channel-ok");
    const calls = script(account, {
      [`${DATA_API}/channels`](url) {
        assert.equal(url.searchParams.get("part"), "snippet,statistics,contentDetails");
        assert.equal(url.searchParams.get("mine"), "true");
        return jsonResponse(200, {
          items: [
            {
              id: "UC_FIXTURE",
              snippet: {
                title: "Fixture Channel",
                description: "Fixture description",
                customUrl: "@fixture",
                country: "US",
                publishedAt: "2020-01-02T00:00:00Z",
              },
              statistics: {
                subscriberCount: "12",
                hiddenSubscriberCount: false,
                viewCount: "34",
                videoCount: "2",
              },
              contentDetails: { relatedPlaylists: { uploads: "UU_FIXTURE" } },
            },
          ],
        });
      },
    });

    const parsed = JSON.parse(await getChannelInfo(account));
    assert.deepEqual(parsed, {
      channel_id: "UC_FIXTURE",
      title: "Fixture Channel",
      description: "Fixture description",
      custom_url: "@fixture",
      country: "US",
      published_at: "2020-01-02T00:00:00Z",
      subscriber_count: 12,
      hidden_subscriber_count: false,
      total_views: 34,
      video_count: 2,
      uploads_playlist: "UU_FIXTURE",
    });
    assertSecretsAbsent(JSON.stringify(parsed), account);
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  });

  test("getChannelInfo omits fields the fixture does not include", async () => {
    const account = fakeAccount("channel-minimal");
    script(account, {
      [`${DATA_API}/channels`]() {
        return jsonResponse(200, { items: [{ id: "UC_MIN", snippet: { title: "Minimal" } }] });
      },
    });

    assert.deepEqual(JSON.parse(await getChannelInfo(account)), {
      channel_id: "UC_MIN",
      title: "Minimal",
    });
  });

  test("getChannelInfo reports an empty channel list without fetching further", async () => {
    const account = fakeAccount("channel-empty");
    const calls = script(account, {
      [`${DATA_API}/channels`]() {
        return jsonResponse(200, { items: [] });
      },
    });

    const message =
      "No channel found for the authorized account. Make sure the OAuth token " +
      "belongs to a Google account that owns a YouTube channel.";
    await assert.rejects(
      () => getChannelInfo(account),
      (err) => {
        assert.equal(err.message, message);
        assertSecretsAbsent(err.message, account);
        return true;
      }
    );
    assert.equal(calls.length, 2);
  });

  test("getChannelInfo propagates an API error unchanged", async () => {
    const account = fakeAccount("channel-api-error");
    script(account, {
      [`${DATA_API}/channels`]() {
        return textResponse(403, "fixture-denied");
      },
    });
    await assert.rejects(() => getChannelInfo(account), {
      message: "YouTube API error 403: fixture-denied",
    });
  });

  test("getUploadsPlaylistId returns the fixture playlist and errors when it is missing", async () => {
    const account = fakeAccount("uploads");
    let items = [
      { contentDetails: { relatedPlaylists: { uploads: "UU_FIXTURE" } } },
    ];
    script(account, {
      [`${DATA_API}/channels`](url) {
        assert.equal(url.searchParams.get("part"), "contentDetails");
        assert.equal(url.searchParams.get("mine"), "true");
        return jsonResponse(200, { items });
      },
    });

    assert.equal(await getUploadsPlaylistId(account), "UU_FIXTURE");
    items = [{ id: "UC_FIXTURE" }];
    await assert.rejects(() => getUploadsPlaylistId(account), {
      message: "Could not resolve the channel's uploads playlist.",
    });
  });

  test("getVideos walks uploads, formats metrics, and keeps a page token", async () => {
    const account = fakeAccount("videos");
    const calls = script(account, {
      [`${DATA_API}/channels`]() {
        return jsonResponse(200, {
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_FIXTURE" } } }],
        });
      },
      [`${DATA_API}/playlistItems`](url) {
        assert.equal(url.searchParams.get("part"), "contentDetails");
        assert.equal(url.searchParams.get("playlistId"), "UU_FIXTURE");
        assert.equal(url.searchParams.get("maxResults"), "25");
        assert.equal(url.searchParams.has("pageToken"), false);
        return jsonResponse(200, {
          nextPageToken: "NEXT_FIXTURE",
          items: [
            { contentDetails: { videoId: "vidA" } },
            { contentDetails: {} },
            { contentDetails: { videoId: "vidB" } },
          ],
        });
      },
      [`${DATA_API}/videos`](url) {
        assert.equal(url.searchParams.get("part"), "snippet,statistics,contentDetails");
        assert.equal(url.searchParams.get("id"), "vidA,vidB");
        return jsonResponse(200, {
          items: [
            {
              id: "vidA",
              snippet: {
                title: "Fixture Video",
                publishedAt: "2024-05-01T00:00:00Z",
                tags: ["fixture-tag"],
              },
              contentDetails: { duration: "PT1H2M3S" },
              statistics: { viewCount: "0", likeCount: "7", commentCount: "1" },
            },
          ],
        });
      },
    });

    const parsed = JSON.parse(await getVideos(account));
    assert.deepEqual(parsed, {
      videos: [
        {
          id: "vidA",
          title: "Fixture Video",
          published_at: "2024-05-01T00:00:00Z",
          duration_seconds: 3723,
          views: 0,
          likes: 7,
          comments: 1,
          url: "https://www.youtube.com/watch?v=vidA",
          tags: ["fixture-tag"],
        },
      ],
      count: 1,
      next_page_token: "NEXT_FIXTURE",
      has_more: true,
    });
    assert.equal(calls.filter((call) => call.method === "GET").length, 3);
    assertSecretsAbsent(JSON.stringify(parsed), account);
  });

  test("getVideos forwards a page token and caps maxResults at 50", async () => {
    const account = fakeAccount("videos-page");
    script(account, {
      [`${DATA_API}/channels`]() {
        return jsonResponse(200, {
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_FIXTURE" } } }],
        });
      },
      [`${DATA_API}/playlistItems`](url) {
        assert.equal(url.searchParams.get("maxResults"), "50");
        assert.equal(url.searchParams.get("pageToken"), "PAGE_FIXTURE");
        return jsonResponse(200, { items: [] });
      },
    });

    const parsed = JSON.parse(await getVideos(account, 80, "PAGE_FIXTURE"));
    assert.deepEqual(parsed, { videos: [], count: 0, has_more: false });
  });

  test("getVideos does not call the videos endpoint when the playlist has no ids", async () => {
    const account = fakeAccount("videos-empty");
    const calls = script(account, {
      [`${DATA_API}/channels`]() {
        return jsonResponse(200, {
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_FIXTURE" } } }],
        });
      },
      [`${DATA_API}/playlistItems`]() {
        return jsonResponse(200, { items: [{ contentDetails: {} }] });
      },
    });

    const parsed = JSON.parse(await getVideos(account, 10));
    assert.deepEqual(parsed, { videos: [], count: 0, has_more: false });
    assert.equal(
      calls.some((call) => call.url.startsWith(`${DATA_API}/videos`)),
      false
    );
  });

  test("getVideoDetails rejects empty and over-50 id lists before any fetch", async () => {
    const account = fakeAccount("details-bounds");
    await assert.rejects(() => getVideoDetails(account, []), {
      message: "At least one video ID is required.",
    });
    await assert.rejects(
      () => getVideoDetails(account, Array.from({ length: 51 }, (_, i) => `vid${i}`)),
      { message: "Maximum 50 video IDs per request." }
    );
    assert.equal(blockedFetchCount(), 0);
  });

  test("getVideoDetails requests 50 ids and formats a short duration", async () => {
    const account = fakeAccount("details-ok");
    const ids = Array.from({ length: 50 }, (_, i) => `v${i}`);
    script(account, {
      [`${DATA_API}/videos`](url) {
        assert.equal(url.searchParams.get("id"), ids.join(","));
        return jsonResponse(200, {
          items: [
            {
              id: "v0",
              snippet: { title: "Short" },
              contentDetails: { duration: "PT1M30S" },
              statistics: { viewCount: "3" },
            },
          ],
        });
      },
    });

    const parsed = JSON.parse(await getVideoDetails(account, ids));
    assert.equal(parsed.count, 1);
    assert.equal(parsed.videos[0].duration_seconds, 90);
    assert.equal(parsed.videos[0].views, 3);
    assert.equal(parsed.videos[0].url, "https://www.youtube.com/watch?v=v0");
    assert.equal(Object.hasOwn(parsed.videos[0], "likes"), false);
  });

  test("getChannelAnalytics sends the default metrics and collapses one aggregate row", async () => {
    const account = fakeAccount("analytics-aggregate");
    script(account, {
      [`${ANALYTICS_API}/reports`](url) {
        assert.equal(url.searchParams.get("ids"), "channel==MINE");
        assert.equal(url.searchParams.get("startDate"), "2024-01-01");
        assert.equal(url.searchParams.get("endDate"), "2024-01-31");
        assert.equal(url.searchParams.get("metrics"), DEFAULT_METRICS);
        assert.equal(url.searchParams.has("dimensions"), false);
        assert.equal(url.searchParams.has("sort"), false);
        assert.equal(url.searchParams.has("filters"), false);
        return jsonResponse(200, {
          columnHeaders: [
            { name: "views", columnType: "METRIC", dataType: "INTEGER" },
            { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
          ],
          rows: [[10, 2]],
        });
      },
    });

    const parsed = JSON.parse(
      await getChannelAnalytics(account, "2024-01-01", "2024-01-31")
    );
    assert.deepEqual(parsed, {
      period: { startDate: "2024-01-01", endDate: "2024-01-31" },
      dimensions: null,
      data: { views: 10, likes: 2 },
    });
    assertSecretsAbsent(JSON.stringify(parsed), account);
  });

  test("a day dimension stays an array and sorts by the first dimension", async () => {
    const account = fakeAccount("analytics-day");
    script(account, {
      [`${ANALYTICS_API}/reports`](url) {
        assert.equal(url.searchParams.get("dimensions"), "day,country");
        assert.equal(url.searchParams.get("sort"), "day");
        assert.equal(url.searchParams.get("metrics"), "views");
        return jsonResponse(200, {
          columnHeaders: [
            { name: "day", columnType: "DIMENSION", dataType: "STRING" },
            { name: "views", columnType: "METRIC", dataType: "INTEGER" },
          ],
          rows: [["2024-01-01", 4]],
        });
      },
    });

    const parsed = JSON.parse(
      await getChannelAnalytics(account, "2024-01-01", "2024-01-02", "views", "day,country")
    );
    assert.deepEqual(parsed.data, [{ day: "2024-01-01", views: 4 }]);
    assert.equal(parsed.dimensions, "day,country");
  });

  test("multiple rows are an array and an empty range returns the no-data note", async () => {
    const account = fakeAccount("analytics-rows");
    let rows = [
      [1, 2],
      [3, 4],
    ];
    script(account, {
      [`${ANALYTICS_API}/reports`]() {
        return jsonResponse(200, {
          columnHeaders: [
            { name: "views", columnType: "METRIC", dataType: "INTEGER" },
            { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
          ],
          rows,
        });
      },
    });

    const many = JSON.parse(
      await getChannelAnalytics(account, "2024-02-01", "2024-02-02", "views,likes")
    );
    assert.deepEqual(many.data, [
      { views: 1, likes: 2 },
      { views: 3, likes: 4 },
    ]);

    rows = [];
    const empty = JSON.parse(
      await getChannelAnalytics(account, "2024-02-01", "2024-02-02", "views,likes")
    );
    assert.deepEqual(empty.data, {
      columns: ["views", "likes"],
      rows: [],
      note: "No data returned for this range.",
    });
  });

  test("a single non-day dimension row is collapsed to an object", async () => {
    const account = fakeAccount("analytics-month");
    script(account, {
      [`${ANALYTICS_API}/reports`](url) {
        assert.equal(url.searchParams.get("dimensions"), "month");
        assert.equal(url.searchParams.get("sort"), "month");
        return jsonResponse(200, {
          columnHeaders: [
            { name: "month", columnType: "DIMENSION", dataType: "STRING" },
            { name: "views", columnType: "METRIC", dataType: "INTEGER" },
          ],
          rows: [["2024-01", 9]],
        });
      },
    });

    const parsed = JSON.parse(
      await getChannelAnalytics(account, "2024-01-01", "2024-01-31", "views", "month")
    );
    assert.deepEqual(parsed.data, { month: "2024-01", views: 9 });
  });

  test("getVideoAnalytics filters to one video and encodes the id as a single param", async () => {
    const account = fakeAccount("video-analytics");
    script(account, {
      [`${ANALYTICS_API}/reports`](url) {
        assert.equal(url.searchParams.get("filters"), "video==ab&c");
        assert.equal(url.searchParams.get("metrics"), DEFAULT_METRICS);
        assert.equal(url.searchParams.has("dimensions"), false);
        return jsonResponse(200, {
          columnHeaders: [{ name: "views", columnType: "METRIC", dataType: "INTEGER" }],
          rows: [[6]],
        });
      },
    });

    const parsed = JSON.parse(
      await getVideoAnalytics(account, "ab&c", "2024-03-01", "2024-03-02")
    );
    assert.deepEqual(parsed, {
      video_id: "ab&c",
      period: { startDate: "2024-03-01", endDate: "2024-03-02" },
      data: { views: 6 },
    });
    assertSecretsAbsent(JSON.stringify(parsed), account);
  });
});

function script(account, handlers) {
  return installFetch((call) => {
    if (call.method === "POST" && call.url === TOKEN_URL) {
      assert.ok(call.body instanceof URLSearchParams);
      assert.equal(call.body.get("client_id"), account.client_id);
      assert.equal(call.body.get("client_secret"), account.client_secret);
      assert.equal(call.body.get("refresh_token"), account.refresh_token);
      assert.equal(call.body.get("grant_type"), "refresh_token");
      assert.equal(call.url.includes(account.client_secret), false);
      return jsonResponse(200, {
        access_token: `fake-access-token-for-${account.name}`,
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    const url = new URL(call.url);
    const key = `${url.origin}${url.pathname}`;
    if (!Object.hasOwn(handlers, key)) return null;
    assert.equal(call.method, "GET");
    assert.equal(call.headers.Authorization, `Bearer fake-access-token-for-${account.name}`);
    assert.equal(call.url.includes(account.client_secret), false);
    assert.equal(call.url.includes(account.refresh_token), false);
    return handlers[key](url, call);
  });
}

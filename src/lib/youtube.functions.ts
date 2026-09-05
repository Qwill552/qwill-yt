import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { channelUrl, extractVideoId, thumbnailUrl, watchUrl } from "./youtube";

export type YoutubeMeta = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  channelUrl: string | null;
  thumbnail: string;
  durationSeconds: number | null;
  publishedAt: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(year: number, monthIndex: number, day: number): string | null {
  if (year < 2005 || year > 2100) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseLooseDate(raw: string): string | null {
  const cleaned = raw
    .replace(/^Premiered\s+/i, "")
    .replace(/^Published\s+on\s+/i, "")
    .replace(/^Streamed\s+live\s+on\s+/i, "")
    .replace(/^Uploaded\s+on\s+/i, "")
    .trim();
  if (!cleaned || /ago$/i.test(cleaned)) return null;

  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return ymd(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const mdy = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    if (month != null) return ymd(Number(mdy[3]), month, Number(mdy[2]));
  }

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase()];
    if (month != null) return ymd(Number(dmy[3]), month, Number(dmy[1]));
  }

  const native = new Date(cleaned);
  if (Number.isNaN(native.getTime())) return null;
  return ymd(native.getFullYear(), native.getMonth(), native.getDate());
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return parseLooseDate(String(raw).trim());
}

function firstDate(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }
  return null;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type InnertubeClient = {
  clientName: string;
  clientVersion: string;
  androidSdkVersion?: number;
};

async function fetchInnertubePlayer(
  videoId: string,
  client: InnertubeClient,
): Promise<{
  title: string | null;
  channel: string | null;
  channelId: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
} | null> {
  const data = await fetchJson(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...FETCH_HEADERS },
      body: JSON.stringify({
        context: { client: { hl: "en", gl: "US", ...client } },
        videoId,
      }),
    },
    5000,
  );
  if (!data || typeof data !== "object") return null;
  const rec = data as {
    videoDetails?: {
      title?: string;
      author?: string;
      channelId?: string;
      lengthSeconds?: string | number;
    };
    microformat?: {
      playerMicroformatRenderer?: {
        publishDate?: string;
        uploadDate?: string;
        lengthSeconds?: string | number;
        title?: { simpleText?: string };
        ownerChannelName?: string;
        externalChannelId?: string;
      };
    };
  };
  const details = rec.videoDetails;
  const micro = rec.microformat?.playerMicroformatRenderer;
  const durationRaw = details?.lengthSeconds ?? micro?.lengthSeconds;
  const durationSeconds =
    durationRaw != null && Number.isFinite(Number(durationRaw))
      ? Number(durationRaw)
      : null;
  return {
    title: details?.title || micro?.title?.simpleText || null,
    channel: details?.author || micro?.ownerChannelName || null,
    channelId: details?.channelId || micro?.externalChannelId || null,
    durationSeconds,
    publishedAt: firstDate(micro?.publishDate, micro?.uploadDate),
  };
}

function extractDateFromNextPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const json = JSON.stringify(data);
  const iso =
    json.match(/"publishDate":"(\d{4}-\d{2}-\d{2}[^"]*)"/)?.[1] ??
    json.match(/"uploadDate":"(\d{4}-\d{2}-\d{2}[^"]*)"/)?.[1];
  const simple =
    json.match(/"publishDate":\{"simpleText":"([^"]+)"\}/)?.[1] ??
    json.match(/"dateText":\{"simpleText":"([^"]+)"\}/)?.[1];
  return firstDate(iso, simple);
}

async function fetchInnertubeNext(videoId: string): Promise<{
  publishedAt: string | null;
  title: string | null;
} | null> {
  const data = await fetchJson(
    "https://www.youtube.com/youtubei/v1/next?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...FETCH_HEADERS },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.00.00",
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
    },
    5000,
  );
  if (!data) return null;
  const json = JSON.stringify(data);
  const title =
    json.match(
      /"videoPrimaryInfoRenderer":\{"title":\{"runs":\[\{"text":"([^"]+)"/,
    )?.[1] ?? null;
  return {
    publishedAt: extractDateFromNextPayload(data),
    title,
  };
}

async function fetchOembed(videoId: string): Promise<{
  title: string;
  author_name: string;
  author_url?: string;
  thumbnail_url?: string;
} | null> {
  const data = await fetchJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(videoId))}&format=json`,
    { headers: { ...FETCH_HEADERS, Accept: "application/json" } },
    5000,
  );
  if (!data || typeof data !== "object") return null;
  const rec = data as {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  };
  if (!rec.title && !rec.author_name) return null;
  return {
    title: rec.title || "Видео YouTube",
    author_name: rec.author_name || "YouTube",
    author_url: rec.author_url,
    thumbnail_url: rec.thumbnail_url,
  };
}

function extractPublishedFromHtml(html: string): string | null {
  const patterns = [
    /"publishDate":"(\d{4}-\d{2}-\d{2}[^"]*)"/,
    /"uploadDate":"(\d{4}-\d{2}-\d{2}[^"]*)"/,
    /itemprop="datePublished" content="([^"]+)"/,
    /itemprop="uploadDate" content="([^"]+)"/,
    /"publishDate":\{"simpleText":"([^"]+)"\}/,
    /"dateText":\{"simpleText":"([^"]+)"\}/,
    /"uploadDate":\{"simpleText":"([^"]+)"\}/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const normalized = normalizeDate(match?.[1]);
    if (normalized) return normalized;
  }
  return null;
}

function extractDurationFromHtml(html: string): number | null {
  const match =
    html.match(/"lengthSeconds":"(\d+)"/) ?? html.match(/"lengthSeconds":(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function scrapeWatchPage(videoId: string): Promise<{
  durationSeconds: number | null;
  publishedAt: string | null;
}> {
  try {
    const res = await fetch(watchUrl(videoId), {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { durationSeconds: null, publishedAt: null };
    const html = await res.text();
    return {
      durationSeconds: extractDurationFromHtml(html),
      publishedAt: extractPublishedFromHtml(html),
    };
  } catch {
    return { durationSeconds: null, publishedAt: null };
  }
}

async function resolvePublishedAt(videoId: string): Promise<string | null> {
  const [next, mweb, scraped] = await Promise.all([
    fetchInnertubeNext(videoId),
    fetchInnertubePlayer(videoId, {
      clientName: "MWEB",
      clientVersion: "2.20241201.00.00",
    }),
    scrapeWatchPage(videoId),
  ]);
  return firstDate(
    next?.publishedAt,
    mweb?.publishedAt,
    scraped.publishedAt,
  );
}

export async function resolveYoutubeMeta(url: string): Promise<YoutubeMeta> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("Не похоже на ссылку YouTube");
  }

  const [oembed, next, android, mweb] = await Promise.all([
    fetchOembed(videoId),
    fetchInnertubeNext(videoId),
    fetchInnertubePlayer(videoId, {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 30,
    }),
    fetchInnertubePlayer(videoId, {
      clientName: "MWEB",
      clientVersion: "2.20241201.00.00",
    }),
  ]);

  let durationSeconds =
    android?.durationSeconds ?? mweb?.durationSeconds ?? null;
  let publishedAt = firstDate(next?.publishedAt, mweb?.publishedAt, android?.publishedAt);

  if (durationSeconds == null || publishedAt == null) {
    const scraped = await scrapeWatchPage(videoId);
    durationSeconds = durationSeconds ?? scraped.durationSeconds;
    publishedAt = publishedAt ?? scraped.publishedAt;
  }

  const title =
    oembed?.title || android?.title || mweb?.title || next?.title || "Видео YouTube";
  const channel =
    oembed?.author_name || android?.channel || mweb?.channel || "YouTube";
  const channelId = android?.channelId || mweb?.channelId || null;
  const resolvedChannelUrl = oembed?.author_url || (channelId ? channelUrl(channelId) : null);
  const thumbnail = oembed?.thumbnail_url || thumbnailUrl(videoId, "hq");

  if (!oembed && !android && !mweb && !next) {
    throw new Error("Видео не найдено или недоступно");
  }

  return {
    videoId,
    url: watchUrl(videoId),
    title,
    channel,
    channelUrl: resolvedChannelUrl,
    thumbnail,
    durationSeconds,
    publishedAt,
  };
}

export const fetchYoutubeMeta = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(1) }))
  .handler(async ({ data }): Promise<YoutubeMeta> => {
    return resolveYoutubeMeta(data.url);
  });

export const fetchYoutubePublishedAt = createServerFn({ method: "POST" })
  .validator(z.object({ videoId: z.string().min(1) }))
  .handler(async ({ data }): Promise<string | null> => {
    return resolvePublishedAt(data.videoId);
  });

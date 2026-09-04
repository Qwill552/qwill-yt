import { defineHandler } from "nitro";
import { z } from "zod";
import {
  animegoQueueId,
  animegoUrl,
  availableEpisodes,
  extractAnimegoSlug,
  isUpcomingAnime,
} from "../../src/lib/animego";
import { parseAnimegoDate } from "../../src/lib/animego.functions";
import { extractVideoId, thumbnailUrl, watchUrl } from "../../src/lib/youtube";
import { addToWishlist } from "../lib/anime-tracking-store";
import { kickAnimeCheck } from "../lib/anime-checker";
import { resolveYoutubeMeta } from "../../src/lib/youtube.functions";
import { enqueuePendingItem } from "../lib/pending-store";
import { publish } from "../lib/live-bus";
import { publishWishlist } from "../lib/wishlist-events";

const priority = z.enum(["high", "medium", "low"]);

const youtubeBody = z.object({
  url: z.string().min(1),
  priority,
});

/**
 * Часть тайтлов AnimeGO не отдаёт анонимным запросам — серверу прилетает 404.
 * Поэтому карточку собирает юзерскрипт прямо в браузере, где есть сессия,
 * и присылает сюда уже готовой.
 */
const animegoBody = z.object({
  source: z.literal("animego"),
  url: z.string().min(1),
  priority,
  title: z.string().min(1),
  studio: z.string().optional(),
  thumbnail: z.string().optional(),
  episodes: z.string().nullish(),
  publishedAt: z.string().nullish(),
  // Присылаются свежими версиями скрипта; без них анонс просто станет обычной
  // карточкой, как было до вишлиста.
  status: z.string().nullish(),
  latestEpisodeNumber: z.number().nullish(),
});

export default defineHandler(async (event) => {
  const token = process.env.INGEST_TOKEN;
  const auth = event.req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await event.req.json().catch(() => null);

  const anime = animegoBody.safeParse(payload);
  if (anime.success) {
    const slug = extractAnimegoSlug(anime.data.url);
    if (!slug) {
      return new Response("Не похоже на ссылку AnimeGO", { status: 422 });
    }

    const title = anime.data.title.replace(/\s+/g, " ").trim();
    const episodes = anime.data.episodes?.replace(/\s+/g, " ").trim() || null;
    const publishedAt = parseAnimegoDate(anime.data.publishedAt);

    // Ещё не вышло — тайтл ждёт в вишлисте, карточка родится сама в день
    // старта. Ровно то же решение, что и при вставке ссылки на сайте.
    if (
      isUpcomingAnime({
        status: anime.data.status ?? null,
        episodesAvailable: availableEpisodes(episodes),
        latestEpisodeNumber: anime.data.latestEpisodeNumber ?? null,
      })
    ) {
      await addToWishlist({
        id: animegoQueueId(slug),
        slug,
        url: animegoUrl(slug),
        title,
        studio: anime.data.studio?.trim() || null,
        thumbnail: anime.data.thumbnail?.trim() || null,
        status: anime.data.status ?? null,
        episodesRaw: episodes,
        episodesAvailable: availableEpisodes(episodes),
        priority: anime.data.priority,
        releaseDate: publishedAt,
        releaseRaw: anime.data.publishedAt?.replace(/\s+/g, " ").trim() || null,
      });
      await publishWishlist();
      kickAnimeCheck();
      return Response.json({ ok: true, title, wishlist: true });
    }

    await enqueuePendingItem({
      videoId: animegoQueueId(slug),
      url: animegoUrl(slug),
      title,
      channel: anime.data.studio?.trim() || "AnimeGO",
      thumbnail: anime.data.thumbnail?.trim() || "",
      durationSeconds: null,
      episodes,
      source: "animego",
      publishedAt,
      priority: anime.data.priority,
      addedAt: Date.now(),
    });

    publish({ type: "queue-item" });
    return Response.json({ ok: true, title });
  }

  const parsed = youtubeBody.safeParse(payload);
  if (!parsed.success) {
    return new Response("Bad Request", { status: 400 });
  }

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return new Response("Не похоже на ссылку YouTube", { status: 422 });
  }

  const meta = await resolveYoutubeMeta(parsed.data.url).catch(() => ({
    videoId,
    url: watchUrl(videoId),
    title: "Видео YouTube",
    channel: "YouTube",
    channelUrl: null,
    thumbnail: thumbnailUrl(videoId, "hq"),
    durationSeconds: null,
    publishedAt: null,
  }));

  await enqueuePendingItem({
    ...meta,
    episodes: null,
    source: "youtube",
    priority: parsed.data.priority,
    addedAt: Date.now(),
  });

  publish({ type: "queue-item" });
  return Response.json({ ok: true, title: meta.title });
});

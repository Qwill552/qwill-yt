import { defineHandler } from "nitro";
import { z } from "zod";
import { trackAnime } from "../lib/anime-tracking-store";
import { kickAnimeCheck } from "../lib/anime-checker";

/** Очередь редко бывает длиннее пары десятков карточек — потолок от опечаток. */
const MAX_ITEMS = 200;

const itemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  studio: z.string().nullish(),
  thumbnail: z.string().nullish(),
  episodesRaw: z.string().nullish(),
  episodesAvailable: z.number().nullish(),
});

const bodySchema = z.object({ items: z.array(itemSchema).max(MAX_ITEMS) });

/**
 * Очередь живёт в localStorage браузера, поэтому список аниме-карточек сайт
 * присылает сам: при каждом открытии целиком и по одной штуке в момент
 * добавления. Сервер заводит только неизвестные ему строки и ничего не
 * перезаписывает — присланный снимок из браузера заведомо старее того, что
 * уже начитал чекер.
 */
export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  const added = await trackAnime(
    parsed.data.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      url: item.url,
      title: item.title,
      studio: item.studio ?? null,
      thumbnail: item.thumbnail ?? null,
      episodesRaw: item.episodesRaw ?? null,
      episodesAvailable: item.episodesAvailable ?? null,
    })),
  );

  // Только если что-то реально добавилось: заход на сайт с уже известным
  // списком не должен дёргать AnimeGO.
  if (added.length > 0) kickAnimeCheck();

  return Response.json({ added: added.length });
});

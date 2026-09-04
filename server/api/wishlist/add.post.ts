import { defineHandler } from "nitro";
import { z } from "zod";
import { addToWishlist } from "../../lib/anime-tracking-store";
import { kickAnimeCheck } from "../../lib/anime-checker";
import { publishWishlist } from "../../lib/wishlist-events";

const bodySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  studio: z.string().nullish(),
  thumbnail: z.string().nullish(),
  status: z.string().nullish(),
  episodesRaw: z.string().nullish(),
  episodesAvailable: z.number().nullish(),
  priority: z.enum(["high", "medium", "low"]),
  releaseDate: z.string().nullish(),
  releaseRaw: z.string().nullish(),
});

/**
 * Аниме, которого ещё нет: карточка не создаётся, тайтл ждёт выхода в
 * вишлисте с запомненным приоритетом. Отслеживается ровно так же, как
 * онгоинги, — той же строкой `anime_tracking`.
 */
export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await addToWishlist({
    id: parsed.data.id,
    slug: parsed.data.slug,
    url: parsed.data.url,
    title: parsed.data.title,
    studio: parsed.data.studio ?? null,
    thumbnail: parsed.data.thumbnail ?? null,
    status: parsed.data.status ?? null,
    episodesRaw: parsed.data.episodesRaw ?? null,
    episodesAvailable: parsed.data.episodesAvailable ?? null,
    priority: parsed.data.priority,
    releaseDate: parsed.data.releaseDate ?? null,
    releaseRaw: parsed.data.releaseRaw ?? null,
  });

  await publishWishlist();
  // Первая проверка — сразу: строка добавлена с `next_check_at = now()`.
  kickAnimeCheck();

  return Response.json({ ok: true });
});

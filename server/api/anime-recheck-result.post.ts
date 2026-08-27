import { defineHandler } from "nitro";
import { z } from "zod";
import { getBySlug } from "../lib/anime-tracking-store";
import { recordCheckResult } from "../lib/anime-checker";

const bodySchema = z.object({
  slug: z.string().min(1),
  title: z.string().nullish(),
  studio: z.string().nullish(),
  thumbnail: z.string().nullish(),
  status: z.string().nullish(),
  episodesRaw: z.string().nullish(),
  episodesAvailable: z.number().nullish(),
  latestEpisodeNumber: z.number().nullish(),
  latestEpisodeTitle: z.string().nullish(),
});

/**
 * Результат подстраховки Tampermonkey-скрипта: тайтлы, которые сервер не
 * читает анонимно (см. GET /api/anime-recheck-queue), скрипт перепроверяет
 * в залогиненном браузере и присылает уже разобранные поля сюда.
 */
export default defineHandler(async (event) => {
  const token = process.env.INGEST_TOKEN;
  const auth = event.req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  const row = await getBySlug(parsed.data.slug);
  if (!row) return new Response("Unknown anime", { status: 404 });

  await recordCheckResult(row, {
    status: parsed.data.status ?? null,
    episodesRaw: parsed.data.episodesRaw ?? null,
    episodesAvailable: parsed.data.episodesAvailable ?? null,
    latestEpisodeNumber: parsed.data.latestEpisodeNumber ?? null,
    latestEpisodeTitle: parsed.data.latestEpisodeTitle ?? null,
    title: parsed.data.title ?? undefined,
    thumbnail: parsed.data.thumbnail ?? undefined,
  });

  return Response.json({ ok: true });
});

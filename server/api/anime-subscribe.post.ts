import { defineHandler } from "nitro";
import { z } from "zod";
import { upsertSubscription } from "../lib/anime-tracking-store";

const bodySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  studio: z.string().nullish(),
  thumbnail: z.string().nullish(),
  episodesRaw: z.string().nullish(),
  episodesAvailable: z.number().nullish(),
  subscribed: z.boolean(),
});

export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await upsertSubscription({
    id: parsed.data.id,
    slug: parsed.data.slug,
    url: parsed.data.url,
    title: parsed.data.title,
    studio: parsed.data.studio ?? null,
    thumbnail: parsed.data.thumbnail ?? null,
    episodesRaw: parsed.data.episodesRaw ?? null,
    episodesAvailable: parsed.data.episodesAvailable ?? null,
    subscribed: parsed.data.subscribed,
  });

  return Response.json({ ok: true });
});

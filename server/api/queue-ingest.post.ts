import { defineHandler } from "nitro";
import { z } from "zod";
import { extractVideoId, thumbnailUrl, watchUrl } from "../../src/lib/youtube";
import { resolveYoutubeMeta } from "../../src/lib/youtube.functions";
import { enqueuePendingItem } from "../lib/pending-store";

const bodySchema = z.object({
  url: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
});

export default defineHandler(async (event) => {
  const token = process.env.INGEST_TOKEN;
  const auth = event.req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
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
    thumbnail: thumbnailUrl(videoId, "hq"),
    durationSeconds: null,
    publishedAt: null,
  }));

  await enqueuePendingItem({
    ...meta,
    priority: parsed.data.priority,
    addedAt: Date.now(),
  });

  return Response.json({ ok: true, title: meta.title });
});

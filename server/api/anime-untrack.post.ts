import { defineHandler } from "nitro";
import { z } from "zod";
import { untrackAnime } from "../lib/anime-tracking-store";

const bodySchema = z.object({ id: z.string().min(1) });

/**
 * Карточку удалили из очереди — снимаем тайтл с отслеживания (уведомления
 * уходят каскадом). Именно явным вызовом, а не вычитанием из присланного
 * списка: очередь у каждого браузера своя, и заход с телефона не должен
 * стирать трекинг карточек, добавленных с компьютера.
 */
export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await untrackAnime(parsed.data.id);
  return Response.json({ ok: true });
});
